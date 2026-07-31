import { Router } from 'express';
import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { encryptPassword, decryptPassword, generatePasswordFromName } from '../utils/password.js';
import { generateMeetingDeckHtml, STAT_KEYS, DEFAULT_STAT_KEYS } from '../ai/generateMeetingDeck.js';

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

const DAILY_TREND_DAYS = 14;

adminRouter.get('/activity', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT user_name, event_type, path, created_at
      FROM activity_log
      ORDER BY created_at DESC
      LIMIT 5000
    `);

    // Zero-filled so the trend chart shows real gaps (no activity that day)
    // rather than the chart's x-axis silently skipping days with nothing.
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const dailyMap = new Map();
    for (let i = DAILY_TREND_DAYS - 1; i >= 0; i -= 1) {
      const key = new Date(now.getTime() - i * dayMs).toISOString().slice(0, 10);
      dailyMap.set(key, 0);
    }
    const trendCutoff = new Date(now.getTime() - DAILY_TREND_DAYS * dayMs);

    const byUser = new Map();
    const globalShowViews = new Map();
    let totalLogins = 0;
    let totalPageViews = 0;
    let totalNotes = 0;

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
        totalLogins += 1;
      } else if (row.event_type === 'page_view') {
        u.page_view_count += 1;
        totalPageViews += 1;
        if (showName) {
          u.showViews.set(showName, (u.showViews.get(showName) || 0) + 1);
          globalShowViews.set(showName, (globalShowViews.get(showName) || 0) + 1);
        }
      } else if (row.event_type === 'note_added') {
        u.note_count += 1;
        totalNotes += 1;
      }

      const createdAt = new Date(row.created_at);
      if (createdAt >= trendCutoff) {
        const dayKey = createdAt.toISOString().slice(0, 10);
        if (dailyMap.has(dayKey)) dailyMap.set(dayKey, dailyMap.get(dayKey) + 1);
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

    const summary = {
      activeUsers: byUser.size,
      totalLogins,
      totalPageViews,
      totalNotes,
    };

    const daily = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

    const topShows = Array.from(globalShowViews.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([show_name, views]) => ({ show_name, views }));

    res.json({ summary, daily, topShows, users, recent });
  } catch (err) {
    next(err);
  }
});

// Passwords are decrypted for display here — this is the whole point of the
// switch to reversible encryption (see server/utils/password.js) — so the
// admin dashboard can show every account's current password, not just at
// creation time.
adminRouter.get('/accounts', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, password_encrypted, created_at, last_login_at FROM user_accounts ORDER BY created_at DESC`
    );
    res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        password: decryptPassword(row.password_encrypted),
        created_at: row.created_at,
        last_login_at: row.last_login_at,
      }))
    );
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/accounts', requireAdmin, async (req, res, next) => {
  try {
    const { name } = req.body || {};
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const password = generatePasswordFromName(trimmed);
    const passwordEncrypted = encryptPassword(password);

    const { rows } = await pool.query(
      `INSERT INTO user_accounts (name, password_encrypted) VALUES ($1, $2) RETURNING id, name, created_at`,
      [trimmed, passwordEncrypted]
    );
    res.status(201).json({ ...rows[0], password });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with that name already exists' });
    }
    next(err);
  }
});

adminRouter.post('/accounts/:id/reset-password', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query('SELECT name FROM user_accounts WHERE id = $1', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const password = generatePasswordFromName(existing[0].name);
    const passwordEncrypted = encryptPassword(password);
    await pool.query('UPDATE user_accounts SET password_encrypted = $1 WHERE id = $2', [passwordEncrypted, id]);
    res.json({ id: Number(id), name: existing[0].name, password });
  } catch (err) {
    next(err);
  }
});

adminRouter.delete('/accounts/:id', requireAdmin, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM user_accounts WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Returns a standalone HTML document (not JSON) — meant to be opened
// directly in a browser tab for a biweekly producer meeting, not consumed
// by the SPA's own fetch/render cycle. Accepts an explicit start/end date
// range (falls back to the last 14 days), a comma-separated `stats` list
// (falls back to DEFAULT_STAT_KEYS), and an optional comma-separated `shows`
// list (empty/omitted means every show) — all parsed here rather than
// trusted as-is from the query string.
adminRouter.get('/meeting-deck', requireAdmin, async (req, res, next) => {
  try {
    const now = new Date();
    const parsedStart = req.query.start ? new Date(`${req.query.start}T00:00:00`) : null;
    const parsedEnd = req.query.end ? new Date(`${req.query.end}T23:59:59.999`) : null;
    const start = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const end = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : now;

    const requestedStats = typeof req.query.stats === 'string' ? req.query.stats.split(',').map((s) => s.trim()) : [];
    const statKeys = requestedStats.filter((key) => STAT_KEYS.includes(key));

    const showNames = typeof req.query.shows === 'string'
      ? req.query.shows.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

    const html = await generateMeetingDeckHtml(pool, {
      start,
      end,
      statKeys: statKeys.length > 0 ? statKeys : DEFAULT_STAT_KEYS,
      showNames: showNames.length > 0 ? showNames : null,
    });
    res.set('Content-Type', 'text/html; charset=utf-8').send(html);
  } catch (err) {
    next(err);
  }
});
