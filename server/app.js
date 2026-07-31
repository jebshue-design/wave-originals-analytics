import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import cors from 'cors';
import 'dotenv/config';
import { pool } from './db/pool.js';
import { authRouter, requireAuth } from './routes/auth.js';
import { episodesRouter } from './routes/episodes.js';
import { syncRouter } from './routes/sync.js';

// Just the API — no static file serving or app.listen() here, so this same
// app can be wrapped for a serverless deploy (Vercel) or run directly for
// local dev (see index.js, which adds both of those).
export const app = express();

// Vercel terminates TLS at its edge and forwards to the function over an
// internal connection — without this, Express doesn't recognize the
// original request as HTTPS, and the session cookie's `secure: true` flag
// then gets silently dropped (never set at all).
app.set('trust proxy', 1);

const PgSession = connectPgSimple(session);

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true,
  })
);
app.use(
  session({
    // Sessions are stored in Postgres (not the default in-memory store)
    // because a serverless deploy has no single long-lived process to hold
    // them in memory — each request can hit a different, short-lived
    // instance. createTableIfMissing means no separate migration step.
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  })
);

app.use('/api/auth', authRouter);
app.use('/api', requireAuth, episodesRouter);
app.use('/api', requireAuth, syncRouter);

// Deliberately no error-handling middleware here — it needs to be the LAST
// middleware in whichever stack actually runs, and each entry point
// (index.js for local dev, api/index.js for the Vercel deploy) adds its own
// extra routes after importing this app, so each one appends its own.
export function attachErrorHandler(expressApp) {
  expressApp.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
}
