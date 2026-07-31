import { Router } from 'express';
import crypto from 'node:crypto';

export const authRouter = Router();

function passwordsMatch(candidate, actual) {
  const a = Buffer.from(candidate);
  const b = Buffer.from(actual);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

authRouter.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== 'string' || !passwordsMatch(password, process.env.APP_PASSWORD || '')) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  req.session.authenticated = true;
  res.json({ ok: true });
});

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

authRouter.get('/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session.authenticated) });
});

export function requireAuth(req, res, next) {
  if (req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}
