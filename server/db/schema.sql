CREATE TABLE IF NOT EXISTS episodes (
  episode_id BIGINT PRIMARY KEY,
  episode_title TEXT NOT NULL,
  show_name TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  as_of_date DATE,
  total_performance_combined NUMERIC,
  audio_downloads_total NUMERIC,
  audio_downloads_7day NUMERIC,
  audio_downloads_30day NUMERIC,
  youtube_views_total NUMERIC,
  youtube_views_7day NUMERIC,
  youtube_views_30day NUMERIC,
  is_full_length BOOLEAN,
  starting_percentile NUMERIC,
  retention_at_point_1 NUMERIC,
  first_dropoff_percentile NUMERIC,
  retention_at_first_dropoff NUMERIC,
  first_dropoff_pct NUMERIC,
  second_dropoff_percentile NUMERIC,
  retention_at_second_dropoff NUMERIC,
  second_dropoff_pct NUMERIC,
  num_upward_spikes NUMERIC,
  max_spike_pct NUMERIC,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  youtube_video_id TEXT,
  youtube_lookup_attempted_at TIMESTAMPTZ,
  avg_retention_vs_show_baseline NUMERIC,
  biggest_spike_point_pct NUMERIC,
  episode_length_seconds NUMERIC,
  biggest_spike_time_seconds NUMERIC,
  biggest_spike_timestamp TEXT,
  transcript_at_biggest_spike TEXT,
  ctr_1hr NUMERIC,
  ctr_24hr NUMERIC,
  ai_insight TEXT,
  ai_insight_generated_at TIMESTAMPTZ
);

ALTER TABLE episodes ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS youtube_lookup_attempted_at TIMESTAMPTZ;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS avg_retention_vs_show_baseline NUMERIC;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS biggest_spike_point_pct NUMERIC;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS episode_length_seconds NUMERIC;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS biggest_spike_time_seconds NUMERIC;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS biggest_spike_timestamp TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS transcript_at_biggest_spike TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS ctr_1hr NUMERIC;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS ctr_24hr NUMERIC;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS ai_insight TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS ai_insight_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_episodes_show_name ON episodes (show_name);
CREATE INDEX IF NOT EXISTS idx_episodes_published_at ON episodes (published_at DESC);

CREATE TABLE IF NOT EXISTS episode_retention_curve (
  episode_id BIGINT NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  percentile SMALLINT NOT NULL,
  retention NUMERIC,
  baseline_curve NUMERIC,
  delta_vs_baseline NUMERIC,
  PRIMARY KEY (episode_id, percentile)
);

CREATE TABLE IF NOT EXISTS episode_notes (
  id SERIAL PRIMARY KEY,
  episode_id BIGINT NOT NULL REFERENCES episodes(episode_id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  what_tried TEXT NOT NULL,
  outcome TEXT CHECK (outcome IN ('worked', 'did_not_work', 'inconclusive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_episode_notes_episode_id ON episode_notes (episode_id);

ALTER TABLE episode_notes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Split the old single "what_tried" field into one per lever producers
-- actually adjust — thumbnail and hook — so notes tie directly to the same
-- two dimensions the rest of the app measures (Thumbnail leaderboard, Hook
-- status). what_tried is kept (nullable, no longer written to) so any
-- pre-existing rows aren't silently dropped.
ALTER TABLE episode_notes ALTER COLUMN what_tried DROP NOT NULL;
ALTER TABLE episode_notes ADD COLUMN IF NOT EXISTS thumbnail_tried TEXT;
ALTER TABLE episode_notes ADD COLUMN IF NOT EXISTS hook_tried TEXT;
UPDATE episode_notes SET hook_tried = what_tried WHERE hook_tried IS NULL AND what_tried IS NOT NULL;

-- A per-show summary of visual patterns observed across that show's own
-- thumbnails (from a one-time batch vision comparison of high- vs low-CTR
-- episodes), refreshed occasionally as new thumbnails come in. Referenced as
-- plain text on every per-episode AI insight call so thumbnail "memory"
-- doesn't require re-sending images every time.
CREATE TABLE IF NOT EXISTS show_thumbnail_patterns (
  show_name TEXT PRIMARY KEY,
  notes TEXT NOT NULL,
  episode_count INTEGER NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lightweight per-user activity trail: who logged in (name is free-text,
-- captured at the shared login screen — there's no real per-user auth) and
-- what pages they visited afterward. Viewed only from the separate,
-- independently-password-protected /admin page.
CREATE TABLE IF NOT EXISTS activity_log (
  id SERIAL PRIMARY KEY,
  user_name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('login', 'page_view', 'note_added')),
  path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user_name ON activity_log (user_name);

-- Widen the event_type check for pre-existing databases (CREATE TABLE IF NOT
-- EXISTS above only applies to a fresh install) — note_added logs when a
-- producer leaves a thumbnail/hook note, keyed by the same '/shows/<show>'
-- path convention page views use, so both aggregate off one `path` column.
ALTER TABLE activity_log DROP CONSTRAINT IF EXISTS activity_log_event_type_check;
ALTER TABLE activity_log ADD CONSTRAINT activity_log_event_type_check CHECK (event_type IN ('login', 'page_view', 'note_added'));

-- Named accounts an admin creates for individual producers, each with their
-- own password. These sit alongside the shared APP_PASSWORD, not instead of
-- it: at login, a name matching a row here is checked against its own
-- password; any other name falls back to the shared password, same as
-- before. password_hash is one-way (scrypt, see server/utils/password.js) —
-- deliberately not recoverable, including by the admin, so a freshly
-- generated/reset password is shown once in the response and never again.
CREATE TABLE IF NOT EXISTS user_accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);

-- Retrofit: switched back from reversible encryption (which let the admin
-- view a password at any time) to one-way hashing. A one-time script
-- (server/db/migrate-passwords-once.js, since deleted) carried existing
-- accounts' actual (decrypted) passwords over to password_hash before this
-- ran, so nobody's password changed as part of the switch.
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE user_accounts DROP COLUMN IF EXISTS password_encrypted;

-- Every account starts with an admin-assigned password (auto-generated at
-- creation or reset) — this flags that it hasn't been replaced with one the
-- person chose themselves yet, so the app can prompt for that on first login.
ALTER TABLE user_accounts ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;
