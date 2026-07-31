import { METRICS } from '../config/metrics';

export const TARGET_METRIC_OPTIONS = [
  {
    key: 'youtube_views_total',
    label: 'The Hook',
    framing:
      'how many people we got to click into the episode on YouTube — mostly a function of the thumbnail, title, and when we posted, not the content itself',
  },
  {
    key: 'avg_watch_pct',
    label: 'The Payoff',
    framing:
      'how much of the episode people watched once they clicked in — a sign of whether the content itself is compelling, separate from how it was marketed',
  },
];

// Metrics available as correlation candidates. Deliberately excludes
// audio_downloads_total (producers don't want audio treated as a
// correlation factor here) and total_performance_combined (it's just
// downloads + views added together, so it trivially "correlates" with both).
// Also excludes youtube_views_total (it IS the Hook target itself — showing
// it as a "correlate" of Payoff is circular) and avg_retention_vs_show_baseline
// (too redundant with the Payoff target, avg_watch_pct, to be a useful signal).
const CORRELATABLE_KEYS = [
  'ctr_1hr',
  'ctr_24hr',
  'avg_watch_pct',
  'num_upward_spikes',
  'max_spike_pct',
  'retention_at_first_dropoff',
  'retention_at_second_dropoff',
  'episode_length_seconds',
];

export const ALL_METRICS = CORRELATABLE_KEYS.map((key) => ({ key, label: METRICS[key].label }));

// Plain-language phrase for what a HIGH value of this metric looks like,
// fitted to the template "Episodes with {phrase} tend to have a..." — this
// phrasing sidesteps singular/plural subject-verb agreement entirely, since
// "Episodes" (always plural) is the fixed subject regardless of the phrase.
const HIGH_PHRASES = {
  ctr_1hr: 'a higher click rate in the first hour',
  ctr_24hr: 'a higher click rate over the first 24 hours',
  avg_watch_pct: 'a higher average watch-through',
  num_upward_spikes: 'more attention spikes',
  max_spike_pct: 'a bigger biggest attention spike',
  retention_at_first_dropoff: 'stronger retention about 1 minute into the episode',
  retention_at_second_dropoff: 'stronger retention about 2 minutes into the episode',
  episode_length_seconds: 'a longer runtime',
};

// e.g. "Episodes with a longer runtime tend to score higher on The Hook."
export function correlationExplanation(metricKey, r, targetLabel) {
  const phrase = HIGH_PHRASES[metricKey];
  if (!phrase) return null;
  const direction = r >= 0 ? 'higher' : 'lower';
  return `Episodes with ${phrase} tend to score ${direction} on ${targetLabel}.`;
}

function pearson(xs, ys) {
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

// Ranks every other metric by how strongly it correlates with the given
// target metric, across a set of episodes (typically one show, to avoid a
// show-scale confound: a show that's just generally bigger will show every
// metric moving together, which looks like correlation but is really just
// "this show is popular").
//
// Returned in the fixed CORRELATABLE_KEYS order (not sorted by strength) —
// producers compare this list across shows, so the same metric needs to sit
// in the same row every time rather than jumping around based on which one
// happens to correlate strongest for a given show.
export function computeCorrelationsWithTarget(episodes, targetKey, { minSampleSize = 8 } = {}) {
  const results = [];
  for (const metric of ALL_METRICS) {
    if (metric.key === targetKey) continue;
    const xs = [];
    const ys = [];
    for (const ep of episodes) {
      const x = ep[metric.key];
      const y = ep[targetKey];
      if (x === null || x === undefined || y === null || y === undefined) continue;
      const xn = Number(x);
      const yn = Number(y);
      if (Number.isNaN(xn) || Number.isNaN(yn)) continue;
      xs.push(xn);
      ys.push(yn);
    }
    if (xs.length < minSampleSize) continue;
    const r = pearson(xs, ys);
    if (r === null || Number.isNaN(r)) continue;
    results.push({ metric, r, n: xs.length });
  }
  return results;
}

export function correlationStrength(r) {
  const abs = Math.abs(r);
  if (abs >= 0.7) return 'strong';
  if (abs >= 0.4) return 'moderate';
  return 'weak';
}

// A quick one-line summary of whatever correlates most strongly with the
// currently-selected target — the top 1-2 rows of the already-ranked list,
// stated in plain language instead of making producers read the whole list.
// Requires at least a moderate correlation so this doesn't fire on noise.
export function topCorrelatesSummary(correlations, targetLabel, { maxDrivers = 2 } = {}) {
  // `correlations` is in fixed display order, not strength order — sort a
  // copy here so "top" actually means strongest, regardless of row order.
  const byStrength = [...correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const qualifying = byStrength.filter((c) => correlationStrength(c.r) !== 'weak');
  if (qualifying.length === 0) return null;

  const top = qualifying.slice(0, maxDrivers);
  const phrases = top.map((c) => HIGH_PHRASES[c.metric.key]).filter(Boolean);
  if (phrases.length === 0) return null;

  const joined =
    phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
  // Every phrase in a single call shares the sign of its own row, so mixing
  // directions in one sentence would misstate the weaker one — only combine
  // multiple phrases when they all point the same way; otherwise just use
  // the single strongest row.
  const allSameSign = top.every((c) => (c.r >= 0) === (top[0].r >= 0));
  if (!allSameSign) {
    return correlationExplanation(top[0].metric.key, top[0].r, targetLabel);
  }
  const direction = top[0].r >= 0 ? 'higher' : 'lower';
  return `Episodes with ${joined} tend to score ${direction} on ${targetLabel}.`;
}

// Finds real episodes that illustrate the single strongest correlate — not
// just whichever episode has the best target score overall, but episodes
// that are actually strong on the driving metric (in whichever direction
// helps) AND rank well on the target, so the examples genuinely back up the
// stated correlation instead of being an unrelated top performer.
export function topCorrelatesExamples(episodes, correlations, targetKey, { max = 2 } = {}) {
  // Same reasoning as topCorrelatesSummary — re-sort by strength since
  // `correlations` is now in fixed display order.
  const byStrength = [...correlations].sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const qualifying = byStrength.filter((c) => correlationStrength(c.r) !== 'weak');
  if (qualifying.length === 0) return [];

  const { metric, r } = qualifying[0];
  const direction = r >= 0 ? 1 : -1;

  const withValues = episodes
    .map((ep) => ({
      ep,
      metricVal: ep[metric.key] === null || ep[metric.key] === undefined ? null : Number(ep[metric.key]),
      targetVal: ep[targetKey] === null || ep[targetKey] === undefined ? null : Number(ep[targetKey]),
    }))
    .filter(
      (x) => x.metricVal !== null && !Number.isNaN(x.metricVal) && x.targetVal !== null && !Number.isNaN(x.targetVal)
    );
  if (withValues.length === 0) return [];

  const sortedByMetric = [...withValues].sort((a, b) => (b.metricVal - a.metricVal) * direction);
  const metricThreshold = sortedByMetric[Math.floor(sortedByMetric.length / 2)].metricVal;
  const strongOnMetric = withValues.filter((x) => (x.metricVal - metricThreshold) * direction >= 0);

  return strongOnMetric
    .sort((a, b) => b.targetVal - a.targetVal)
    .slice(0, max)
    .map((x) => x.ep.episode_title);
}
