const TRAILING_WINDOW_DAYS = 90;
const AVERAGE_BAND = 0.1;
const MIN_SAMPLE_SIZE = 3;

// Mirrors client/src/utils/stats.js — kept in sync manually since the client
// computes baselines from data already in the browser, while this copy runs
// server-side (during sync) to feed the AI insight prompt.
function median(values) {
  const nums = values
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

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
      baselines[key] = values.length >= MIN_SAMPLE_SIZE ? median(values) : null;
    }
    result.set(current.episode_id, baselines);
  }
  return result;
}

// The baseline that applies right now — median of the given fields across
// episodes from the last 90 days. Same statistic as computeTrailingBaselines,
// just anchored at "today" instead of at each historical episode's own
// publish date.
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
  return baselines;
}

export function trendStatus(value, baseline) {
  if (value === null || value === undefined || baseline === null || baseline === undefined) return null;
  const v = Number(value);
  if (Number.isNaN(v) || baseline === 0) return null;
  const diff = (v - baseline) / Math.abs(baseline);
  if (diff > AVERAGE_BAND) return 'good';
  if (diff < -AVERAGE_BAND) return 'bad';
  return 'average';
}

export function combineStatus(statuses) {
  const present = statuses.filter(Boolean);
  if (present.length === 0) return null;
  if (present.includes('bad')) return 'bad';
  if (present.includes('good')) return 'good';
  return 'average';
}
