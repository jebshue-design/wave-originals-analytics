import { Router } from 'express';
import { pool } from '../db/pool.js';

export const activityRouter = Router();

// Fire-and-forget page-view logging from the authenticated app — mounted
// behind the normal requireAuth, so req.session.userName is always the name
// captured at login.
activityRouter.post('/activity/pageview', async (req, res, next) => {
  try {
    const { path } = req.body || {};
    await pool.query('INSERT INTO activity_log (user_name, event_type, path) VALUES ($1, $2, $3)', [
      req.session.userName || 'Unknown',
      'page_view',
      typeof path === 'string' ? path.slice(0, 500) : null,
    ]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
