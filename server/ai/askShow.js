import Anthropic from '@anthropic-ai/sdk';
import { computeTrailingBaselines, computeCurrentBaselines, trendStatus, combineStatus } from '../utils/stats.js';
import { getThumbnailPatterns } from './thumbnailPatterns.js';

const TREND_KEYS = [
  'ctr_1hr',
  'ctr_24hr',
  'first_dropoff_pct',
  'avg_watch_pct',
  'youtube_views_total',
  'total_performance_combined',
];

// Same candidate list as client/src/utils/correlation.js, minus the two
// targets themselves — kept in sync manually, same pattern already used for
// utils/stats.js between client and server.
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

const HIGH_PHRASES = {
  ctr_1hr: 'a higher click rate in the first hour',
  ctr_24hr: 'a higher click rate over the first 24 hours',
  avg_watch_pct: 'a higher average watch-through',
  num_upward_spikes: 'more attention spikes',
  max_spike_pct: 'a bigger biggest attention spike',
  retention_at_first_dropoff: 'stronger retention about 1 minute in',
  retention_at_second_dropoff: 'stronger retention about 2 minutes in',
  episode_length_seconds: 'a longer runtime',
};

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

function correlationsWithTarget(episodes, targetKey, { minSampleSize = 8 } = {}) {
  const results = [];
  for (const key of CORRELATABLE_KEYS) {
    if (key === targetKey) continue;
    const xs = [];
    const ys = [];
    for (const ep of episodes) {
      const x = ep[key];
      const y = ep[targetKey];
      if (x === null || x === undefined || y === null || y === undefined) continue;
      xs.push(Number(x));
      ys.push(Number(y));
    }
    if (xs.length < minSampleSize) continue;
    const r = pearson(xs, ys);
    if (r === null || Number.isNaN(r)) continue;
    results.push({ key, r, n: xs.length });
  }
  results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return results;
}

function formatCorrelations(episodes, targetKey, targetLabel) {
  const results = correlationsWithTarget(episodes, targetKey);
  if (results.length === 0) return `Not enough data yet to compute correlations with ${targetLabel}.`;
  return results
    .slice(0, 5)
    .map((c) => `${HIGH_PHRASES[c.key] || c.key}: r=${c.r.toFixed(2)} (n=${c.n})`)
    .join('; ');
}

// Same shape as the note summary in ai/generateMeetingDeck.js and
// ai/generateInsights.js — duplicated locally rather than shared since each
// caller only needs this one line of formatting.
function noteSummary(note) {
  const parts = [];
  if (note.thumbnail_tried) parts.push(`Thumbnail: ${note.thumbnail_tried}`);
  if (note.hook_tried) parts.push(`Hook: ${note.hook_tried}`);
  const outcome = note.outcome ? ` (${note.outcome.replace(/_/g, ' ')})` : '';
  const extra = note.notes ? ` — ${note.notes}` : '';
  return `${parts.join('; ')}${outcome}${extra}`;
}

function relDeviation(value, baseline) {
  if (value === null || value === undefined || baseline === null || baseline === undefined || baseline === 0) {
    return null;
  }
  const v = Number(value);
  if (Number.isNaN(v)) return null;
  return (v - baseline) / Math.abs(baseline);
}

// Same composite formula as client/src/components/ThumbnailLeaderboard.jsx —
// weighted 1hr/24hr deviation from typical, with a current-baseline fallback
// for episodes too early in the show's run to have their own trailing one.
function compositeCtrScores(episodes, trailingBaselines, currentBaseline) {
  return episodes
    .filter((ep) => ep.youtube_video_id)
    .map((ep) => {
      const tb = trailingBaselines.get(ep.episode_id) || {};
      const resolve = (key) => (tb[key] !== null && tb[key] !== undefined ? tb[key] : currentBaseline[key]);
      const dev1hr = relDeviation(ep.ctr_1hr, resolve('ctr_1hr'));
      const dev24hr = relDeviation(ep.ctr_24hr, resolve('ctr_24hr'));
      let score = null;
      if (dev1hr !== null && dev24hr !== null) score = 0.6 * dev1hr + 0.4 * dev24hr;
      else if (dev24hr !== null) score = dev24hr;
      else if (dev1hr !== null) score = dev1hr;
      return { title: ep.episode_title, score };
    })
    .filter((x) => x.score !== null)
    .sort((a, b) => b.score - a.score);
}

// Same "elbow" method as the /retention-stickiness route — the point on a
// retention curve where a steep early drop-off bends into a much slower,
// longer decline — averaged across each episode's own curve.
function findElbow(curve) {
  const start = curve[0];
  const end = curve[curve.length - 1];
  const denom = Math.sqrt((end.retention - start.retention) ** 2 + (end.percentile - start.percentile) ** 2);
  let elbow = curve[0];
  let maxDist = -Infinity;
  for (const point of curve) {
    const num =
      (end.retention - start.retention) * point.percentile -
      (end.percentile - start.percentile) * point.retention +
      end.percentile * start.retention -
      end.retention * start.percentile;
    const dist = denom === 0 ? 0 : Math.abs(num) / denom;
    if (dist > maxDist) {
      maxDist = dist;
      elbow = point;
    }
  }
  return elbow;
}

async function retentionStickinessSummary(pool, showName) {
  const { rows: curveRows } = await pool.query(
    `SELECT c.episode_id, c.percentile, c.retention
     FROM episode_retention_curve c
     JOIN episodes e ON e.episode_id = c.episode_id
     WHERE e.show_name = $1
     ORDER BY c.episode_id, c.percentile`,
    [showName]
  );
  const curvesByEpisode = new Map();
  for (const row of curveRows) {
    if (!curvesByEpisode.has(row.episode_id)) curvesByEpisode.set(row.episode_id, []);
    curvesByEpisode.get(row.episode_id).push({ percentile: row.percentile, retention: Number(row.retention) });
  }
  const elbows = [];
  for (const curve of curvesByEpisode.values()) {
    if (curve.length < 2) continue;
    elbows.push(findElbow(curve));
  }
  if (elbows.length === 0) return null;
  const avgPercentile = Math.round(elbows.reduce((sum, e) => sum + e.percentile, 0) / elbows.length);
  const avgRetention = elbows.reduce((sum, e) => sum + e.retention, 0) / elbows.length;
  return `On average, this show's steepest drop-off eases up around the ${avgPercentile}% mark, where about ${(avgRetention * 100).toFixed(0)}% of viewers are still watching.`;
}

// Builds the full text context for one show — everything already computed
// elsewhere in the app (baselines, correlations, thumbnail ranking and
// patterns, retention stickiness) plus a compact per-episode table, so the
// model answers from real numbers instead of guessing. Full AI-insight text
// is only included for a handful of standout episodes (not all of them) to
// keep the prompt a reasonable size on shows with 100+ episodes.
async function buildShowContext(pool, showName) {
  const { rows: episodes } = await pool.query(
    `SELECT e.*,
      (SELECT AVG(c.retention) FROM episode_retention_curve c WHERE c.episode_id = e.episode_id) AS avg_watch_pct
     FROM episodes e WHERE e.show_name = $1 ORDER BY e.published_at ASC`,
    [showName]
  );
  if (episodes.length === 0) return null;

  // Fetched for every episode (not just ones the model asks about) since a
  // question like "have we changed anything about hooks lately" needs to
  // scan across episodes to answer at all.
  const { rows: noteRows } = await pool.query(
    `SELECT episode_id, author_name, thumbnail_tried, hook_tried, outcome, notes
     FROM episode_notes
     WHERE episode_id = ANY($1)
     ORDER BY created_at ASC`,
    [episodes.map((ep) => ep.episode_id)]
  );
  const notesByEpisode = new Map();
  for (const note of noteRows) {
    if (!notesByEpisode.has(note.episode_id)) notesByEpisode.set(note.episode_id, []);
    notesByEpisode.get(note.episode_id).push(note);
  }

  const trailingBaselines = computeTrailingBaselines(episodes, TREND_KEYS);
  const currentBaseline = computeCurrentBaselines(episodes, TREND_KEYS);

  const lines = [`Show: ${showName}`, `Total episodes: ${episodes.length}`, ''];

  lines.push('Current typical (median of last 90 days):');
  for (const key of TREND_KEYS) {
    if (currentBaseline[key] !== null) lines.push(`- ${key}: ${currentBaseline[key]}`);
  }
  lines.push('');

  lines.push(`Correlations with The Hook (total YouTube views): ${formatCorrelations(episodes, 'youtube_views_total', 'The Hook')}`);
  lines.push(`Correlations with The Payoff (average watch-through): ${formatCorrelations(episodes, 'avg_watch_pct', 'The Payoff')}`);
  lines.push('');

  const thumbnailPatterns = await getThumbnailPatterns(pool, showName);
  if (thumbnailPatterns) {
    lines.push("Known visual thumbnail patterns (from comparing high- vs low-CTR thumbnails):", thumbnailPatterns, '');
  }

  const ctrScores = compositeCtrScores(episodes, trailingBaselines, currentBaseline);
  if (ctrScores.length > 0) {
    const half = Math.min(5, Math.floor(ctrScores.length / 2));
    if (half > 0) {
      lines.push('Best-performing thumbnails (by click-through vs. typical): ' + ctrScores.slice(0, half).map((s) => `"${s.title}"`).join(', '));
      lines.push('Worst-performing thumbnails (by click-through vs. typical): ' + ctrScores.slice(-half).reverse().map((s) => `"${s.title}"`).join(', '));
      lines.push('');
    }
  }

  const stickiness = await retentionStickinessSummary(pool, showName);
  if (stickiness) {
    lines.push(stickiness, '');
  }

  lines.push('Every episode (title, date, status vs. typical, key numbers):');
  for (const ep of episodes) {
    const baseline = trailingBaselines.get(ep.episode_id) || {};
    const hookStatus = combineStatus([
      trendStatus(ep.ctr_24hr, baseline.ctr_24hr),
      trendStatus(ep.first_dropoff_pct, baseline.first_dropoff_pct),
    ]);
    const payoffStatus = trendStatus(ep.avg_watch_pct, baseline.avg_watch_pct);
    const date = ep.published_at ? new Date(ep.published_at).toISOString().slice(0, 10) : 'unknown date';
    let line =
      `- "${ep.episode_title}" (${date}): Hook ${hookStatus || 'n/a'}, Payoff ${payoffStatus || 'n/a'}, ` +
      `total performance ${ep.total_performance_combined ?? 'n/a'}, ctr_1hr ${ep.ctr_1hr ?? 'n/a'}, ctr_24hr ${ep.ctr_24hr ?? 'n/a'}`;

    const episodeNotes = notesByEpisode.get(ep.episode_id);
    if (episodeNotes && episodeNotes.length > 0) {
      const noteText = episodeNotes.map((n) => `${n.author_name} tried ${noteSummary(n)}`).join('; ');
      line += ` — producer notes: ${noteText}`;
    }

    lines.push(line);
  }
  lines.push('');

  const withPerf = episodes.filter((ep) => ep.total_performance_combined !== null && ep.ai_insight);
  if (withPerf.length > 0) {
    const sorted = [...withPerf].sort((a, b) => b.total_performance_combined - a.total_performance_combined);
    const standouts = [...sorted.slice(0, 5), ...sorted.slice(-5)];
    const seen = new Set();
    lines.push("Full AI analysis for this show's standout episodes (best and worst performers):");
    for (const ep of standouts) {
      if (seen.has(ep.episode_id)) continue;
      seen.add(ep.episode_id);
      lines.push(`"${ep.episode_title}": ${ep.ai_insight}`);
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT_PREFIX = `You are a podcast/YouTube analytics assistant helping a producer understand ONE specific show. Answer only using the data provided below — if something isn't covered by it, say you don't have that data rather than guessing. Keep answers conversational and to the point (a few sentences, occasionally a short list) — this is a chat, not a report. Cite specific episode titles or numbers when they support your answer. "The Hook" means click-through + early drop-off (did people click and stay past the open); "The Payoff" means average watch-through (did they keep watching once in). Some episodes have producer notes attached (what a producer tried — a thumbnail or hook change — and whether it worked); pull these in whenever they're relevant to the question (e.g. "did that change help," "what have we tried," a request for what to do differently), but don't force them into answers that aren't about what was tried or changed.

DATA FOR THIS SHOW:
`;

// Answers a producer's freeform question about a show, grounded in a fresh
// text dump of everything already computed elsewhere in the app. Stateless —
// `history` (prior {role, content} turns) is passed in by the client on
// every call rather than persisted server-side.
export async function askAboutShow(pool, showName, question, history = []) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not set — the assistant is unavailable.');
    err.status = 503;
    throw err;
  }

  const context = await buildShowContext(pool, showName);
  if (!context) {
    const err = new Error('No data found for this show.');
    err.status = 404;
    throw err;
  }

  const client = new Anthropic();
  const messages = [
    ...history.slice(-20).filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant')),
    { role: 'user', content: question },
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1500,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: SYSTEM_PROMPT_PREFIX + context,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : null;
}
