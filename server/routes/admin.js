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

// Both page views and note-added events are logged with the same
// '/shows/<encodeURIComponent(show_name)>' path prefix (see Layout.jsx and
// episodes.js's note-creation route), so a single extractor recovers which
// show an event was about regardless of event type.
function showNameFromPath(path) {
  const match = typeof path === 'string' ? path.match(/^\/shows\/([^/]+)/) : null;
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

adminRouter.get('/activity', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT user_name, event_type, path, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 5000
    `);

    const byUser = new Map();
    for (const row of rows) {
      if (!byUser.has(row.user_name)) {
        byUser.set(row.user_name, {
          user_name: row.user_name,
          last_active: row.created_at, // rows are newest-first, so the first hit per user is their most recent event
          first_login: null,
          login_count: 0,
          page_view_count: 0,
          note_count: 0,
          showViews: new Map(),
        });
      }
      const u = byUser.get(row.user_name);
      const showName = showNameFromPath(row.path);

      if (row.event_type === 'login') {
        u.login_count += 1;
        u.first_login = row.created_at; // overwritten every hit; rows are newest-first so the last write left standing is the oldest login
      } else if (row.event_type === 'page_view') {
        u.page_view_count += 1;
        if (showName) u.showViews.set(showName, (u.showViews.get(showName) || 0) + 1);
      } else if (row.event_type === 'note_added') {
        u.note_count += 1;
      }
    }

    const users = Array.from(byUser.values())
      .map((u) => ({
        user_name: u.user_name,
        last_active: u.last_active,
        first_login: u.first_login,
        login_count: u.login_count,
        page_view_count: u.page_view_count,
        note_count: u.note_count,
        total_events: u.login_count + u.page_view_count + u.note_count,
        top_shows: Array.from(u.showViews.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([show_name, views]) => ({ show_name, views })),
      }))
      .sort((a, b) => b.total_events - a.total_events);

    const recent = rows.slice(0, 200).map((row) => ({
      ...row,
      show_name: showNameFromPath(row.path),
    }));

    res.json({ users, recent });
  } catch (err) {
    next(err);
  }
});
