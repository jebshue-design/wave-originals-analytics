import path from 'node:path';
import { pathToFileURL } from 'node:url';
import 'dotenv/config';
import { pool } from './db/pool.js';
import { findYoutubeVideoId } from './youtube.js';
import { SHOW_CHANNEL_IDS } from './config/showChannels.js';

const DEFAULT_BATCH_SIZE = Number(process.env.YOUTUBE_LOOKUP_BATCH_SIZE) || 90;
const DELAY_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isQuotaError(message) {
  return (
    message.includes('403') ||
    message.includes('429') ||
    message.includes('quotaExceeded') ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('rateLimitExceeded')
  );
}

// Looks up a YouTube video ID for episodes that don't have one yet. Does NOT
// close the shared pool — that's only appropriate for the standalone CLI run
// at the bottom of this file, not when called from a long-lived server
// (e.g. the daily cron route).
export async function runThumbnailBackfill({ batchSize = DEFAULT_BATCH_SIZE } = {}) {
  const { rows } = await pool.query(
    `SELECT episode_id, episode_title, show_name, published_at
     FROM episodes
     WHERE youtube_video_id IS NULL
       AND youtube_views_total IS NOT NULL
     ORDER BY youtube_lookup_attempted_at IS NOT NULL, youtube_lookup_attempted_at ASC
     LIMIT $1`,
    [batchSize]
  );

  let found = 0;
  let quotaExceeded = false;
  const results = [];

  for (const row of rows) {
    const channelId = SHOW_CHANNEL_IDS[row.show_name];
    try {
      const videoId = await findYoutubeVideoId(row.episode_title, channelId, row.published_at);
      await pool.query(
        `UPDATE episodes SET youtube_video_id = $1, youtube_lookup_attempted_at = now() WHERE episode_id = $2`,
        [videoId, row.episode_id]
      );
      if (videoId) found += 1;
      results.push({ title: row.episode_title, found: Boolean(videoId) });
    } catch (err) {
      results.push({ title: row.episode_title, error: err.message });
      if (isQuotaError(err.message)) {
        quotaExceeded = true;
        break;
      }
    }
    await sleep(DELAY_MS);
  }

  return { attempted: results.length, found, quotaExceeded, results };
}

// Allow running directly: `node server/backfillThumbnails.js`.
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const batchSize = DEFAULT_BATCH_SIZE;
  console.log(`Looking up up to ${batchSize} episode(s)`);
  runThumbnailBackfill({ batchSize })
    .then(({ attempted, found, quotaExceeded, results }) => {
      for (const r of results) {
        if (r.error) console.error(`  error on "${r.title}": ${r.error}`);
        else console.log(`  ${r.found ? 'found' : 'no exact match'}: ${r.title}`);
      }
      if (quotaExceeded) console.error('Quota likely exceeded — stopping early. Re-run later to resume.');
      console.log(`Done. Matched ${found} of ${attempted}.`);
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
