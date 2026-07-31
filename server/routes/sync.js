import { Router } from 'express';
import { syncFromBigQuery } from '../sync.js';

export const syncRouter = Router();

syncRouter.post('/sync', async (req, res, next) => {
  try {
    const count = await syncFromBigQuery();
    res.json({ ok: true, synced: count });
  } catch (err) {
    next(err);
  }
});
