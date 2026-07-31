import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';

export const authRouter = Router();

function passwordsMatch(candidate, actual) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

authRouter.post('/login', async (req, res, next) => {
  try {
    const { password, name } = req.body || {};
    if (typeof password !== 'string' || !passwordsMatch(password, process.env.APP_PASSWORD || '')) {
      return res.status(401).json({ error: 'Incorrect password' });
    }
    const userName = typeof name === 'string' ? name.trim() : '';
    if (!userName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    req.session.authenticated = true;
    req.session.userName = userName;
    await pool.query('INSERT INTO activity_log (user_name, event_type) VALUES ($1, $2)', [userName, 'login']);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get('/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated), userName: req.session.userName || null });
});

export function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}
