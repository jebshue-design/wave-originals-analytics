import dns from 'node:dns';
import pg from 'pg';
import 'dotenv/config';

// Some serverless platforms resolve a dual-stack host's IPv6 address first,
// but can't actually route to it — the connection then hangs (instead of
// failing fast) until something else times out. Preferring IPv4 avoids that
// silent hang entirely.
dns.setDefaultResultOrder('ipv4first');

const { Pool } = pg;

// Supabase (and most hosted Postgres) requires SSL; local Postgres doesn't
// speak it at all, so only turn it on when the connection string points
// somewhere other than localhost.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  // Without these, a network hiccup between the server and Postgres hangs
  // silently until whatever calls the pool gives up (e.g. a serverless
  // function's own execution limit) instead of failing fast with a real
  // error.
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
});
