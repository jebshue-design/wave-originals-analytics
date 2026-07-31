import Anthropic from '@anthropic-ai/sdk';
import { computeCurrentBaselines, trendStatus } from '../utils/stats.js';
import { EXCLUDED_SHOWS } from '../config/excludedShows.js';
import { accentForShow } from '../config/showArtColor.js';

const AGGREGATE_KEYS = ['total_performance_combined', 'audio_downloads_total', 'youtube_views_total', 'ctr_1hr', 'ctr_24hr', 'avg_watch_pct'];
const TAKEAWAY_CONCURRENCY = 3;

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCompact(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

function formatRawPct(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function formatPct(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

const STATUS_LABEL = { good: 'Above typical', average: 'Typical', bad: 'Below typical' };
const STATUS_CLASS = { good: 'status-good', average: 'status-average', bad: 'status-bad' };

function average(values) {
  const nums = values.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function noteSummary(note) {
  const parts = [];
  if (note.thumbnail_tried) parts.push(`Thumbnail: ${note.thumbnail_tried}`);
  if (note.hook_tried) parts.push(`Hook: ${note.hook_tried}`);
  const outcome = note.outcome ? ` (${note.outcome.replace(/_/g, ' ')})` : '';
  return `${parts.join('; ')}${outcome}`;
}

async function generateShowTakeaway(client, showName, windowLabel, aggregate, episodeSummaries) {
  const lines = [
    `Show: ${showName}`,
    `Period: ${windowLabel}`,
    `Average total performance this period: ${formatCompact(aggregate.avgTotal)} (typical: ${formatCompact(aggregate.baseline.total_performance_combined)}) — ${STATUS_LABEL[aggregate.totalStatus] || 'not enough history yet'}`,
    `Average 24hr CTR: ${formatRawPct(aggregate.avgCtr24hr)} (typical: ${formatRawPct(aggregate.baseline.ctr_24hr)}) — ${STATUS_LABEL[aggregate.ctrStatus] || 'not enough history yet'}`,
    '',
    'Episodes this period:',
    ...episodeSummaries,
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 500,
    output_config: { effort: 'medium' },
    system:
      "You write a short discussion-starter takeaway for a podcast production team's biweekly review meeting, summarizing one show's performance over the period given. You're given aggregate stats vs. the show's own 90-day typical, plus a one-line status and brief note for each episode published in that period. Write 2-4 plain-prose sentences: what went well, what needs attention or should change — framed to prompt discussion, not dictate conclusions. No headers, no bullet list, no restating the raw numbers already shown elsewhere. Under 80 words.",
    messages: [{ role: 'user', content: lines.join('\n') }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  return textBlock ? textBlock.text.trim() : null;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next;
      next += 1;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function renderEpisodeCard(ep, notes) {
  const totalStatus = trendStatus(ep.total_performance_combined, ep.baseline.total_performance_combined);
  const ctrStatus = trendStatus(ep.ctr_24hr, ep.baseline.ctr_24hr);
  const watchStatus = trendStatus(ep.avg_watch_pct, ep.baseline.avg_watch_pct);

  return `
    <article class="episode-card">
      <div class="episode-card-head">
        <h3>${escapeHtml(ep.episode_title)}</h3>
        <span class="episode-date">${formatDate(ep.published_at)}</span>
      </div>
      <div class="episode-stats">
        <div class="stat-chip">
          <span class="stat-label">Total performance</span>
          <span class="stat-value ${STATUS_CLASS[totalStatus] || ''}">${formatCompact(ep.total_performance_combined)}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Audio</span>
          <span class="stat-value">${formatCompact(ep.audio_downloads_total)}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">YouTube</span>
          <span class="stat-value">${formatCompact(ep.youtube_views_total)}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">24hr CTR</span>
          <span class="stat-value ${STATUS_CLASS[ctrStatus] || ''}">${formatRawPct(ep.ctr_24hr)}</span>
        </div>
        <div class="stat-chip">
          <span class="stat-label">Watch-through</span>
          <span class="stat-value ${STATUS_CLASS[watchStatus] || ''}">${formatPct(ep.avg_watch_pct)}</span>
        </div>
      </div>
      ${
        ep.ai_insight
          ? `<div class="episode-insight">${escapeHtml(ep.ai_insight).replace(/\n\n/g, '</p><p>').replace(/\n- /g, '</p><p>• ')}</div>`
          : '<p class="muted">No AI insight generated for this episode yet.</p>'
      }
      ${
        notes && notes.length
          ? `<div class="episode-notes">
              <span class="episode-notes-label">Producer notes</span>
              <ul>
                ${notes.map((n) => `<li>${escapeHtml(n.author_name)}: ${escapeHtml(noteSummary(n))}</li>`).join('')}
              </ul>
            </div>`
          : ''
      }
    </article>`;
}

function renderShowSection(show, index) {
  const accent = accentForShow(show.showName, index);
  return `
    <section class="show-block" style="--accent: ${accent}">
      <div class="show-block-head">
        <h2 id="${show.anchorId}">${escapeHtml(show.showName)}</h2>
        <span class="spec">${show.episodes.length} episode${show.episodes.length === 1 ? '' : 's'} this period</span>
      </div>
      <div class="stat-tile-row">
        <div class="stat-tile">
          <span class="spec">Avg. total performance</span>
          <span class="stat-tile-value ${STATUS_CLASS[show.aggregate.totalStatus] || ''}">${formatCompact(show.aggregate.avgTotal)}</span>
          <span class="stat-tile-sub">typical: ${formatCompact(show.aggregate.baseline.total_performance_combined)}</span>
        </div>
        <div class="stat-tile">
          <span class="spec">Avg. 24hr CTR</span>
          <span class="stat-tile-value ${STATUS_CLASS[show.aggregate.ctrStatus] || ''}">${formatRawPct(show.aggregate.avgCtr24hr)}</span>
          <span class="stat-tile-sub">typical: ${formatRawPct(show.aggregate.baseline.ctr_24hr)}</span>
        </div>
        <div class="stat-tile">
          <span class="spec">Avg. watch-through</span>
          <span class="stat-tile-value ${STATUS_CLASS[show.aggregate.watchStatus] || ''}">${formatPct(show.aggregate.avgWatch)}</span>
          <span class="stat-tile-sub">typical: ${formatPct(show.aggregate.baseline.avg_watch_pct)}</span>
        </div>
      </div>
      ${show.takeaway ? `<p class="show-takeaway">${escapeHtml(show.takeaway)}</p>` : ''}
      <div class="episode-list">
        ${show.episodes.map((ep) => renderEpisodeCard(ep, show.notesByEpisode.get(ep.episode_id))).join('')}
      </div>
    </section>`;
}

const PAGE_STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #0b0909;
    color: #f2efe9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.5;
  }
  .deck-header {
    padding: 48px 32px 32px;
    border-bottom: 1px solid rgba(255,255,255,0.1);
    max-width: 900px;
    margin: 0 auto;
  }
  .deck-header h1 { margin: 0 0 8px; font-size: 28px; }
  .deck-header p { margin: 0; color: #a8a29a; font-size: 14px; }
  .deck-toc {
    max-width: 900px;
    margin: 24px auto 0;
    padding: 0 32px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .deck-toc a {
    color: #a8a29a;
    text-decoration: none;
    font: 500 11px/1.4 ui-monospace, monospace;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 999px;
    padding: 6px 12px;
  }
  .deck-toc a:hover { color: #f2efe9; border-color: rgba(255,255,255,0.3); }
  .show-block {
    max-width: 900px;
    margin: 0 auto;
    padding: 40px 32px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    border-left: 4px solid var(--accent);
  }
  .show-block-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .show-block-head h2 { margin: 0; font-size: 22px; }
  .spec { font: 500 10px/1.4 ui-monospace, monospace; letter-spacing: 0.06em; text-transform: uppercase; color: #a8a29a; }
  .stat-tile-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-bottom: 20px; }
  .stat-tile { display: flex; flex-direction: column; gap: 4px; background: rgba(255,255,255,0.04); border-radius: 10px; padding: 14px 16px; }
  .stat-tile-value { font-size: 20px; font-family: ui-monospace, monospace; }
  .stat-tile-sub { font-size: 11px; color: #a8a29a; }
  .status-good { color: #0bdd65; }
  .status-average { color: #ffc421; }
  .status-bad { color: #fa3842; }
  .show-takeaway {
    background: rgba(255,255,255,0.04);
    border-left: 2px solid var(--accent);
    border-radius: 0 8px 8px 0;
    padding: 14px 18px;
    font-size: 14px;
    color: #f2efe9;
    margin: 0 0 24px;
  }
  .episode-list { display: flex; flex-direction: column; gap: 16px; }
  .episode-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 18px 20px; }
  .episode-card-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .episode-card-head h3 { margin: 0; font-size: 15px; }
  .episode-date { font: 500 11px/1.4 ui-monospace, monospace; color: #a8a29a; flex-shrink: 0; }
  .episode-stats { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-bottom: 14px; }
  .stat-chip { display: flex; flex-direction: column; gap: 2px; }
  .stat-label { font: 500 10px/1.4 ui-monospace, monospace; letter-spacing: 0.04em; text-transform: uppercase; color: #a8a29a; }
  .stat-value { font: 600 14px/1.4 ui-monospace, monospace; }
  .episode-insight { font-size: 13px; color: #d8d3ca; margin-bottom: 10px; }
  .episode-insight p { margin: 0 0 8px; }
  .episode-insight p:last-child { margin-bottom: 0; }
  .muted { color: #75706a; font-size: 13px; margin: 0 0 10px; }
  .episode-notes { font-size: 12px; border-top: 1px dashed rgba(255,255,255,0.12); padding-top: 10px; }
  .episode-notes-label { font: 500 10px/1.4 ui-monospace, monospace; letter-spacing: 0.04em; text-transform: uppercase; color: #a8a29a; }
  .episode-notes ul { margin: 6px 0 0; padding-left: 18px; }
  @media print {
    body { background: #fff; color: #111; }
    .deck-toc { display: none; }
    .show-block { break-inside: avoid; }
    .episode-card { break-inside: avoid; }
  }
`;

// Builds the full standalone HTML document for a biweekly meeting deck:
// per-show aggregate stats + an AI-written discussion takeaway, then every
// episode published in the window with its stats, existing AI insight (not
// regenerated — reuses whatever was written at sync time), and any producer
// notes. Rendered server-side and returned as text/html directly (not JSON)
// so hitting the route opens/prints like a real document.
export async function generateMeetingDeckHtml(pool, { days = 14 } = {}) {
  const windowStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const windowLabel = `${formatDate(windowStart)} – ${formatDate(new Date())}`;

  const { rows: episodes } = await pool.query(
    `SELECT e.episode_id, e.show_name, e.episode_title, e.published_at, e.ai_insight,
            e.total_performance_combined, e.audio_downloads_total, e.youtube_views_total,
            e.ctr_1hr, e.ctr_24hr,
            (SELECT AVG(c.retention) FROM episode_retention_curve c WHERE c.episode_id = e.episode_id) AS avg_watch_pct
     FROM episodes e
     WHERE e.show_name != ALL($1)
     ORDER BY e.published_at DESC NULLS LAST`,
    [EXCLUDED_SHOWS]
  );

  const byShow = new Map();
  for (const ep of episodes) {
    if (!byShow.has(ep.show_name)) byShow.set(ep.show_name, []);
    byShow.get(ep.show_name).push(ep);
  }

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

  const shows = [];
  for (const [showName, showEpisodes] of byShow) {
    const windowEpisodes = showEpisodes.filter((ep) => ep.published_at && new Date(ep.published_at) >= windowStart);
    if (windowEpisodes.length === 0) continue;

    const baseline = computeCurrentBaselines(showEpisodes, AGGREGATE_KEYS) || {};

    const withBaseline = windowEpisodes.map((ep) => ({ ...ep, baseline }));

    const avgTotal = average(windowEpisodes.map((ep) => ep.total_performance_combined));
    const avgCtr24hr = average(windowEpisodes.map((ep) => ep.ctr_24hr));
    const avgWatch = average(windowEpisodes.map((ep) => ep.avg_watch_pct));

    const aggregate = {
      avgTotal,
      avgCtr24hr,
      avgWatch,
      baseline,
      totalStatus: trendStatus(avgTotal, baseline.total_performance_combined),
      ctrStatus: trendStatus(avgCtr24hr, baseline.ctr_24hr),
      watchStatus: trendStatus(avgWatch, baseline.avg_watch_pct),
    };

    shows.push({
      showName,
      anchorId: showName.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
      episodes: withBaseline.sort((a, b) => new Date(b.published_at) - new Date(a.published_at)),
      aggregate,
      notesByEpisode,
      takeaway: null,
    });
  }

  shows.sort((a, b) => a.showName.localeCompare(b.showName));

  if (process.env.ANTHROPIC_API_KEY && shows.length > 0) {
    const client = new Anthropic();
    const takeaways = await mapWithConcurrency(shows, TAKEAWAY_CONCURRENCY, async (show) => {
      const episodeSummaries = show.episodes.map((ep) => {
        const totalStatus = trendStatus(ep.total_performance_combined, ep.baseline.total_performance_combined);
        const snippet = ep.ai_insight ? ep.ai_insight.split('\n')[0].slice(0, 140) : 'no AI insight yet';
        return `- "${ep.episode_title}" (${formatDate(ep.published_at)}): total performance ${STATUS_LABEL[totalStatus] || 'n/a'} — ${snippet}`;
      });
      try {
        return await generateShowTakeaway(client, show.showName, windowLabel, show.aggregate, episodeSummaries);
      } catch (err) {
        console.error(`Meeting-deck takeaway failed for ${show.showName}:`, err.message);
        return null;
      }
    });
    shows.forEach((show, i) => {
      show.takeaway = takeaways[i];
    });
  }

  const totalEpisodeCount = shows.reduce((sum, s) => sum + s.episodes.length, 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Biweekly Review — ${escapeHtml(windowLabel)}</title>
<style>${PAGE_STYLE}</style>
</head>
<body>
  <header class="deck-header">
    <h1>Biweekly Review</h1>
    <p>${escapeHtml(windowLabel)} · ${totalEpisodeCount} episode${totalEpisodeCount === 1 ? '' : 's'} across ${shows.length} show${shows.length === 1 ? '' : 's'}</p>
  </header>
  <nav class="deck-toc">
    ${shows.map((s) => `<a href="#${s.anchorId}">${escapeHtml(s.showName)}</a>`).join('')}
  </nav>
  ${shows.map((show, i) => renderShowSection(show, i)).join('')}
</body>
</html>`;
}
