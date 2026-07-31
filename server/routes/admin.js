import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

export const adminRouter = Router();

// Deliberately separate from the shared producer password (APP_PASSWORD) and
// its session flag (req.session.authenticated) — this gate is its own
// credential so viewing activity data isn't available to everyone who has
// the regular app password.
function passwordsMatch(candidate, actual) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

adminRouter.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !passwordsMatch(password, process.env.ADMIN_PASSWORD || '')) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  req.session.isAdmin = true;
  res.json({ ok: true });
});

adminRouter.post('/logout', (req, res) => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

adminRouter.get('/session', (req, res) => {
  res.json({ isAdmin: Boolean(req.session.isAdmin) });
});

function requireAdmin(req, res, next) {
  if (req.session.isAdmin) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

adminRouter.get('/activity', requireAdmin, async (req, res, next) => {
  try {
    const { rows: users } = await pool.query(`
      SELECT
        user_name,
        MAX(created_at) AS last_active,
        COUNT(*) FILTER (WHERE event_type = 'login') AS login_count,
        COUNT(*) FILTER (WHERE event_type = 'page_view') AS page_view_count,
        MIN(created_at) FILTER (WHERE event_type = 'login') AS first_login
      FROM activity_log
      GROUP BY user_name
      ORDER BY last_active DESC
    `);
    const { rows: recent } = await pool.query(`
      SELECT user_name, event_type, path, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.json({ users, recent });
  } catch (err) {
    next(err);
  }
});
