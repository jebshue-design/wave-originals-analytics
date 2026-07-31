import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parse } from 'csv-parse';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = process.argv[2] || path.join(__dirname, '../../data/episodes_extract_v2.csv');

// Maps this export's column names to our internal DB column names. Existing
// internal names are kept as-is so the API/frontend built against them don't
// need to change — only the ingestion layer needs to know both names.
const NUMERIC_COLUMN_MAP = {
  total_views_and_downloads: 'total_performance_combined',
  audio_downloads_all_time: 'audio_downloads_total',
  audio_downloads_last_7_days: 'audio_downloads_7day',
  audio_downloads_last_30_days: 'audio_downloads_30day',
  youtube_views_all_time: 'youtube_views_total',
  youtube_views_last_7_days: 'youtube_views_7day',
  youtube_views_last_30_days: 'youtube_views_30day',
  retention_start_point_pct: 'starting_percentile',
  retention_pct_at_start: 'retention_at_point_1',
  first_dropoff_point_pct: 'first_dropoff_percentile',
  retention_pct_at_first_dropoff: 'retention_at_first_dropoff',
  first_dropoff_change_pct: 'first_dropoff_pct',
  second_dropoff_point_pct: 'second_dropoff_percentile',
  retention_pct_at_second_dropoff: 'retention_at_second_dropoff',
  second_dropoff_change_pct: 'second_dropoff_pct',
  count_of_retention_spikes: 'num_upward_spikes',
  biggest_spike_change_pct: 'max_spike_pct',
  avg_retention_vs_show_baseline: 'avg_retention_vs_show_baseline',
  biggest_spike_point_pct: 'biggest_spike_point_pct',
  episode_length_seconds: 'episode_length_seconds',
  biggest_spike_time_seconds: 'biggest_spike_time_seconds',
  '1 HR CTR': 'ctr_1hr',
  '24 HR CTR': 'ctr_24hr',
};

const TEXT_COLUMN_MAP = {
  biggest_spike_timestamp: 'biggest_spike_timestamp',
  transcript_at_biggest_spike: 'transcript_at_biggest_spike',
};

function toNumeric(value) {
  if (value === undefined || value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function toBoolean(value) {
  if (value === undefined || value.trim() === '') return null;
  return value.trim().toUpperCase() === 'TRUE';
}

function toTimestamp(value) {
  if (!value || value.trim() === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toText(value) {
  return value && value.trim() !== '' ? value : null;
}

async function readRows() {
  const rows = [];
  const parser = createReadStream(csvPath).pipe(
    parse({ columns: true, skip_empty_lines: true, bom: true })
  );
  for await (const record of parser) {
    rows.push(record);
  }
  return rows;
}

// Each episode is a "header" row (has episode_id) followed by ~99 "continuation"
// rows (blank episode_id) carrying only the per-percentile retention curve —
// a flattened BigQuery ARRAY<STRUCT> field. Group consecutive rows into blocks.
function groupIntoEpisodeBlocks(rows) {
  const blocks = [];
  let current = null;
  for (const row of rows) {
    if (row.episode_id && row.episode_id.trim() !== '') {
      current = { header: row, curveRows: [row] };
      blocks.push(current);
    } else if (current) {
      current.curveRows.push(row);
    }
  }
  return blocks;
}

function extractCurvePoints(curveRows) {
  return curveRows
    .map((row) => ({
      percentile: toNumeric(row['full_retention_curve.percentile']),
      retention: toNumeric(row['full_retention_curve.retention']),
      baseline_curve: toNumeric(row['retention_curve_vs_show_baseline.baseline_curve']),
      delta_vs_baseline: toNumeric(row['retention_curve_vs_show_baseline.delta_vs_baseline']),
    }))
    .filter((point) => point.percentile !== null);
}

async function seed() {
  const rows = await readRows();
  const blocks = groupIntoEpisodeBlocks(rows);

  // Keep only the latest data_as_of_date block per episode_id.
  const latestByEpisode = new Map();
  for (const block of blocks) {
    const id = block.header.episode_id.trim();
    const existing = latestByEpisode.get(id);
    if (!existing || new Date(block.header.data_as_of_date) > new Date(existing.header.data_as_of_date)) {
      latestByEpisode.set(id, block);
    }
  }

  let selectedBlocks = [...latestByEpisode.values()];

  const perShowLimit = Number(process.env.PER_SHOW_LIMIT);
  if (Number.isInteger(perShowLimit) && perShowLimit > 0) {
    const byShow = new Map();
    for (const block of selectedBlocks) {
      const show = block.header.show_name;
      if (!byShow.has(show)) byShow.set(show, []);
      byShow.get(show).push(block);
    }
    selectedBlocks = [];
    for (const showBlocks of byShow.values()) {
      showBlocks.sort((a, b) => new Date(b.header.published_at) - new Date(a.header.published_at));
      selectedBlocks.push(...showBlocks.slice(0, perShowLimit));
    }
    console.log(`PER_SHOW_LIMIT=${perShowLimit} — keeping ${selectedBlocks.length} of ${latestByEpisode.size} episodes`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let episodeCount = 0;
    let curvePointCount = 0;

    for (const block of selectedBlocks) {
      const row = block.header;
      const values = {
        episode_id: Number(row.episode_id),
        episode_title: row.episode_title,
        show_name: row.show_name,
        published_at: toTimestamp(row.published_at),
        as_of_date: row.data_as_of_date || null,
        is_full_length: toBoolean(row.is_full_episode),
      };
      for (const [sourceCol, internalCol] of Object.entries(NUMERIC_COLUMN_MAP)) {
        values[internalCol] = toNumeric(row[sourceCol]);
      }
      for (const [sourceCol, internalCol] of Object.entries(TEXT_COLUMN_MAP)) {
        values[internalCol] = toText(row[sourceCol]);
      }

      const columns = Object.keys(values);
      const placeholders = columns.map((_, i) => `$${i + 1}`);
      const updateSet = columns
        .filter((c) => c !== 'episode_id')
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');

      await client.query(
        `INSERT INTO episodes (${columns.join(', ')}, synced_at)
         VALUES (${placeholders.join(', ')}, now())
         ON CONFLICT (episode_id) DO UPDATE SET ${updateSet}, synced_at = now()`,
        columns.map((c) => values[c])
      );
      episodeCount += 1;

      await client.query('DELETE FROM episode_retention_curve WHERE episode_id = $1', [values.episode_id]);
      const points = extractCurvePoints(block.curveRows);
      for (const point of points) {
        await client.query(
          `INSERT INTO episode_retention_curve (episode_id, percentile, retention, baseline_curve, delta_vs_baseline)
           VALUES ($1, $2, $3, $4, $5)`,
          [values.episode_id, point.percentile, point.retention, point.baseline_curve, point.delta_vs_baseline]
        );
        curvePointCount += 1;
      }
    }

    await client.query('COMMIT');
    console.log(`Seeded ${episodeCount} episodes and ${curvePointCount} retention curve points from ${csvPath}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
