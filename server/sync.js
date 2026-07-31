import { BigQuery } from '@google-cloud/bigquery';
import 'dotenv/config';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from './db/pool.js';

function bigQueryClient() {
  const opts = { projectId: process.env.BIGQUERY_PROJECT_ID };
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    opts.credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS file path or ambient credentials otherwise.
  return new BigQuery(opts);
}

// Maps our internal episodes column name -> the source table's column name.
// NOTE: unverified against the live table — the source names below are
// inferred from the Sheets export's flattened dot-notation
// (e.g. `full_retention_curve.percentile`). Adjust if the first real sync
// reports an unknown-column error.
const SCALAR_COLUMN_MAP = {
  episode_id: 'episode_id',
  episode_title: 'episode_title',
  show_name: 'show_name',
  published_at: 'published_at',
  as_of_date: 'data_as_of_date',
  total_performance_combined: 'total_views_and_downloads',
  audio_downloads_total: 'audio_downloads_all_time',
  audio_downloads_7day: 'audio_downloads_last_7_days',
  audio_downloads_30day: 'audio_downloads_last_30_days',
  youtube_views_total: 'youtube_views_all_time',
  youtube_views_7day: 'youtube_views_last_7_days',
  youtube_views_30day: 'youtube_views_last_30_days',
  is_full_length: 'is_full_episode',
  starting_percentile: 'retention_start_point_pct',
  retention_at_point_1: 'retention_pct_at_start',
  first_dropoff_percentile: 'first_dropoff_point_pct',
  retention_at_first_dropoff: 'retention_pct_at_first_dropoff',
  first_dropoff_pct: 'first_dropoff_change_pct',
  second_dropoff_percentile: 'second_dropoff_point_pct',
  retention_at_second_dropoff: 'retention_pct_at_second_dropoff',
  second_dropoff_pct: 'second_dropoff_change_pct',
  num_upward_spikes: 'count_of_retention_spikes',
  max_spike_pct: 'biggest_spike_change_pct',
  avg_retention_vs_show_baseline: 'avg_retention_vs_show_baseline',
  biggest_spike_point_pct: 'biggest_spike_point_pct',
  episode_length_seconds: 'episode_length_seconds',
  biggest_spike_time_seconds: 'biggest_spike_time_seconds',
  biggest_spike_timestamp: 'biggest_spike_timestamp',
  transcript_at_biggest_spike: 'transcript_at_biggest_spike',
  ctr_1hr: '`1 HR CTR`',
  ctr_24hr: '`24 HR CTR`',
};

const INTERNAL_COLUMNS = Object.keys(SCALAR_COLUMN_MAP);

// The CTR data (originally from a Google Sheet) only goes back to this date,
// so the sync scopes to the same window rather than pulling years of
// historical episodes the app was never designed to browse.
const PUBLISHED_AFTER = process.env.BIGQUERY_PUBLISHED_AFTER || '2026-01-01';

function latestSnapshotCte(table) {
  const selectList = Object.entries(SCALAR_COLUMN_MAP)
    .map(([internal, source]) => `${source} AS ${internal}`)
    .join(', ');
  return `
    SELECT ${selectList}, full_retention_curve, retention_curve_vs_show_baseline
    FROM (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY episode_id ORDER BY data_as_of_date DESC) AS rn
      FROM \`${table}\`
      WHERE published_at >= TIMESTAMP('${PUBLISHED_AFTER}')
    )
    WHERE rn = 1
  `;
}

function scalarQuery(table) {
  const cols = INTERNAL_COLUMNS.join(', ');
  return `SELECT ${cols} FROM (${latestSnapshotCte(table)})`;
}

// Zips the two parallel per-episode arrays by array offset (both are built
// from the same ordered 100-point retention curve, so position 0 in one
// corresponds to position 0 in the other).
function curveQuery(table) {
  return `
    SELECT
      t.episode_id,
      c.percentile,
      c.retention,
      b.baseline_curve,
      b.delta_vs_baseline
    FROM (${latestSnapshotCte(table)}) AS t,
    UNNEST(t.full_retention_curve) AS c WITH OFFSET pos1,
    UNNEST(t.retention_curve_vs_show_baseline) AS b WITH OFFSET pos2
    WHERE pos1 = pos2
  `;
}

function unwrapValue(v) {
  if (v && typeof v === 'object' && 'value' in v) return v.value; // BigQuery date/timestamp wrapper
  return v ?? null;
}

export async function syncFromBigQuery() {
  const { BIGQUERY_DATASET, BIGQUERY_TABLE } = process.env;
  if (!BIGQUERY_DATASET || !BIGQUERY_TABLE) {
    throw new Error('BIGQUERY_DATASET and BIGQUERY_TABLE must be set to run a sync.');
  }
  const table = `${BIGQUERY_DATASET}.${BIGQUERY_TABLE}`;

  const bigquery = bigQueryClient();
  const [episodeRows] = await bigquery.query({ query: scalarQuery(table) });
  const [curveRows] = await bigquery.query({ query: curveQuery(table) });

  const client = await pool.connect();
  let episodeCount = 0;
  let curvePointCount = 0;
  try {
    await client.query('BEGIN');

    for (const row of episodeRows) {
      const values = INTERNAL_COLUMNS.map((col) => unwrapValue(row[col]));
      const placeholders = INTERNAL_COLUMNS.map((_, i) => `$${i + 1}`);
      const updateSet = INTERNAL_COLUMNS.filter((c) => c !== 'episode_id')
        .map((c) => `${c} = EXCLUDED.${c}`)
        .join(', ');

      await client.query(
        `INSERT INTO episodes (${INTERNAL_COLUMNS.join(', ')}, synced_at)
         VALUES (${placeholders.join(', ')}, now())
         ON CONFLICT (episode_id) DO UPDATE SET ${updateSet}, synced_at = now()`,
        values
      );
      episodeCount += 1;
    }

    const syncedEpisodeIds = new Set(episodeRows.map((r) => String(unwrapValue(r.episode_id))));
    for (const episodeId of syncedEpisodeIds) {
      await client.query('DELETE FROM episode_retention_curve WHERE episode_id = $1', [episodeId]);
    }

    const CURVE_BATCH_SIZE = 1000;
    for (let i = 0; i < curveRows.length; i += CURVE_BATCH_SIZE) {
      const batch = curveRows.slice(i, i + CURVE_BATCH_SIZE);
      const values = [];
      const placeholderRows = batch.map((row, idx) => {
        const base = idx * 5;
        values.push(
          unwrapValue(row.episode_id),
          unwrapValue(row.percentile),
          unwrapValue(row.retention),
          unwrapValue(row.baseline_curve),
          unwrapValue(row.delta_vs_baseline)
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      });

      await client.query(
        `INSERT INTO episode_retention_curve (episode_id, percentile, retention, baseline_curve, delta_vs_baseline)
         VALUES ${placeholderRows.join(', ')}`,
        values
      );
      curvePointCount += batch.length;
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { episodeCount, curvePointCount };
}

// Allow running directly: `node server/sync.js` (argv[1] may be relative,
// so resolve both sides to comparable file:// URLs rather than string-pasting).
// Deliberately data-only — does NOT touch AI insights. Generating those costs
// real Anthropic credits, so it's a separate, explicitly-scoped step (see
// server/ai/generateInsights.js) rather than something every data refresh
// triggers automatically.
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  syncFromBigQuery()
    .then(({ episodeCount, curvePointCount }) => {
      console.log(`Synced ${episodeCount} episodes and ${curvePointCount} retention curve points from BigQuery.`);
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
