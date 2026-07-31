import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { passwordMatches } from '../utils/password.js';

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
    const userName = typeof name === 'string' ? name.trim() : '';
    if (!userName) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (typeof password !== 'string') {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    // A name matching an admin-created account checks that account's own
    // password; any other name falls back to the shared APP_PASSWORD, same
    // as before this feature existed.
    const { rows } = await pool.query('SELECT * FROM user_accounts WHERE lower(name) = lower($1)', [userName]);
    const account = rows[0];
    const ok = account
      ? passwordMatches(password, account.password_encrypted)
      : passwordsMatch(password, process.env.APP_PASSWORD || '');
    if (!ok) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    req.session.authenticated = true;
    req.session.userName = account ? account.name : userName;
    if (account) {
      await pool.query('UPDATE user_accounts SET last_login_at = now() WHERE id = $1', [account.id]);
    }
    await pool.query('INSERT INTO activity_log (user_name, event_type) VALUES ($1, $2)', [req.session.userName, 'login']);
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
