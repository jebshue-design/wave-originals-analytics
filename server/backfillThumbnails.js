import 'dotenv/config';
import { pool } from './db/pool.js';
import { findYoutubeVideoId } from './youtube.js';
import { SHOW_CHANNEL_IDS } from './config/showChannels.js';

const BATCH_SIZE = Number(process.env.YOUTUBE_LOOKUP_BATCH_SIZE) || 90;
const DELAY_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function backfill() {
  const { rows } = await pool.query(
    `SELECT episode_id, episode_title, show_name
     FROM episodes
     WHERE youtube_video_id IS NULL
       AND youtube_views_total IS NOT NULL
     ORDER BY youtube_lookup_attempted_at IS NOT NULL, youtube_lookup_attempted_at ASC
     LIMIT $1`,
    [BATCH_SIZE]
  );

  console.log(`Looking up ${rows.length} episode(s) (batch size ${BATCH_SIZE})`);

  let found = 0;
  for (const row of rows) {
    const channelId = SHOW_CHANNEL_IDS[row.show_name];
    try {
      const videoId = await findYoutubeVideoId(row.episode_title, channelId);
      await pool.query(
        `UPDATE episodes SET youtube_video_id = $1, youtube_lookup_attempted_at = now() WHERE episode_id = $2`,
        [videoId, row.episode_id]
      );
      if (videoId) {
        found += 1;
        console.log(`  found: ${row.episode_title}`);
      } else {
        console.log(`  no exact match: ${row.episode_title}`);
      }
    } catch (err) {
      console.error(`  error on "${row.episode_title}": ${err.message}`);
      if (
        err.message.includes('403') ||
        err.message.includes('429') ||
        err.message.includes('quotaExceeded') ||
        err.message.includes('RESOURCE_EXHAUSTED') ||
        err.message.includes('rateLimitExceeded')
      ) {
        console.error('Quota likely exceeded — stopping early. Re-run later to resume.');
        break;
      }
    }
    await sleep(DELAY_MS);
  }

  console.log(`Done. Matched ${found} of ${rows.length}.`);
  await pool.end();
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
