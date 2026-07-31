const TRAILING_WINDOW_DAYS = 90;
const AVERAGE_BAND = 0.1; // within +/-10% of baseline counts as "average"
const MIN_SAMPLE_SIZE = 3; // fewer prior episodes than this isn't a real baseline yet

// Every metric shown with a trend indicator, across the episode card and the
// episode detail view — one shared list so both stay in sync.
export const TREND_METRIC_KEYS = [
  'total_performance_combined',
  'audio_downloads_total',
  'youtube_views_total',
  'avg_watch_pct',
  'num_upward_spikes',
  'max_spike_pct',
  'ctr_1hr',
  'ctr_24hr',
  'first_dropoff_pct',
];

// Median, not mean — a single viral outlier (a mega-episode that massively
// over-performs) would otherwise drag a mean baseline way up and make
// perfectly good neighboring episodes look bad by comparison. The median is
// far more resistant to that kind of one-off skew.
function median(values) {
  const nums = values
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

// For each episode, finds the typical (median) value of the given fields
// across only that show's OTHER episodes published in the trailing 90 days
// before it — a baseline that only uses data available "up to that point,"
// not the show's full history, and isn't skewed by any single outlier episode.
// Returns a Map keyed by episode_id -> { [key]: trailingBaseline | null }.
export function computeTrailingBaselines(episodes, keys) {
  const sorted = [...episodes]
    .filter((ep) => ep.published_at)
    .sort((a, b) => new Date(a.published_at) - new Date(b.published_at));

  const result = new Map();
  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    const currentDate = new Date(current.published_at);
    const windowStart = new Date(currentDate.getTime() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const priorEpisodes = sorted
      .slice(0, i)
      .filter((ep) => new Date(ep.published_at) >= windowStart);

    const baselines = {};
    for (const key of keys) {
      const values = priorEpisodes.map((ep) => ep[key]).filter((v) => v !== null && v !== undefined);
      // With only 1-2 prior episodes, "median" and "mean" are the same thing
      // as whichever value happens to be there — not a real baseline. Wait
      // for enough episodes before comparing against one at all.
      baselines[key] = values.length >= MIN_SAMPLE_SIZE ? median(values) : null;
    }
    result.set(current.episode_id, baselines);
  }
  return result;
}

// The baseline that applies to a new episode of this show published right
// now — median of the given fields across episodes from the last 90 days.
// Same statistic as computeTrailingBaselines, just anchored at "today"
// instead of at each historical episode's own publish date.
export function computeCurrentBaselines(episodes, keys, referenceDate = new Date()) {
  const windowStart = new Date(referenceDate.getTime() - TRAILING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recentEpisodes = episodes.filter((ep) => {
    if (!ep.published_at) return false;
    const published = new Date(ep.published_at);
    return published >= windowStart && published <= referenceDate;
  });

  const baselines = {};
  for (const key of keys) {
    const values = recentEpisodes.map((ep) => ep[key]).filter((v) => v !== null && v !== undefined);
    baselines[key] = values.length >= MIN_SAMPLE_SIZE ? median(values) : null;
  }
  return { baselines, sampleSize: recentEpisodes.length };
}

// Classifies a value against its trailing baseline: good (well above), bad
// (well below), or average (within the +/-10% band) — the good/bad/average
// vocabulary producers asked for, not just above/below.
export function trendStatus(value, baseline) {
  if (value === null || value === undefined || baseline === null || baseline === undefined) return null;
  const v = Number(value);
  if (Number.isNaN(v) || baseline === 0) return null;
  const diff = (v - baseline) / Math.abs(baseline);
  if (diff > AVERAGE_BAND) return 'good';
  if (diff < -AVERAGE_BAND) return 'bad';
  return 'average';
}
