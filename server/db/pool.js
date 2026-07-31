import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

// Supabase (and most hosted Postgres) requires SSL; local Postgres doesn't
// speak it at all, so only turn it on when the connection string points
// somewhere other than localhost.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});
