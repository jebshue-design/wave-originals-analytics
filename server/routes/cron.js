import { Router } from 'express';
import { syncFromBigQuery } from '../sync.js';
import { runThumbnailBackfill } from '../backfillThumbnails.js';

export const cronRouter = Router();

// A scheduled job has no browser session, so this can't use the app's normal
// login-based requireAuth — instead it checks a shared secret. Vercel
// automatically sends this as a Bearer token on its own cron-triggered
// requests when CRON_SECRET is set as an env var (see vercel.json's "crons").
function requireCronSecret(req, res, next) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.authorization !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

cronRouter.get('/cron/daily-update', requireCronSecret, async (req, res, next) => {
  try {
    const sync = await syncFromBigQuery();
    // Capped well under the function's time limit — YouTube's own daily
    // search quota is only 100 lookups total anyway, so a bigger batch
    // wouldn't help even with more time budget. Whatever's left over picks
    // up automatically on the next day's run.
    const thumbnails = await runThumbnailBackfill({ batchSize: 30 });
    res.json({ ok: true, sync, thumbnails });
  } catch (err) {
    next(err);
  }
});
