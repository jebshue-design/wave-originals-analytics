import Anthropic from '@anthropic-ai/sdk';
import { computeTrailingBaselines, trendStatus, combineStatus } from '../utils/stats.js';
import { EXCLUDED_SHOWS } from '../config/excludedShows.js';
import { getThumbnailPatterns } from './thumbnailPatterns.js';

const TREND_KEYS = ['ctr_24hr', 'first_dropoff_pct', 'avg_watch_pct', 'youtube_views_total'];
const CONCURRENCY = 3;

function formatPct(value) {
  if (value === null || value === undefined) return null;
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function formatRawPct(value) {
  if (value === null || value === undefined) return null;
  return `${Number(value).toFixed(1)}%`;
}

function formatCompact(value) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value));
}

function formatPublishedContext(publishedAt) {
  if (!publishedAt) return null;
  const d = new Date(publishedAt);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function episodeStatuses(episode, baseline) {
  const ctrStatus = trendStatus(episode.ctr_24hr, baseline.ctr_24hr);
  const dropoffStatus = trendStatus(episode.first_dropoff_pct, baseline.first_dropoff_pct);
  const hookStatus = combineStatus([ctrStatus, dropoffStatus]);
  const payoffStatus = trendStatus(episode.avg_watch_pct, baseline.avg_watch_pct);
  const viewsStatus = trendStatus(episode.youtube_views_total, baseline.youtube_views_total);
  return { ctrStatus, dropoffStatus, hookStatus, payoffStatus, viewsStatus };
}

function thumbnailUrl(episode) {
  if (!episode.youtube_video_id) return null;
  return `https://i.ytimg.com/vi/${episode.youtube_video_id}/hqdefault.jpg`;
}

// Compact one-line verdicts for this show's other episodes, so Claude can
// reason about recurring patterns (a guest type, a format) rather than
// judging this one episode in isolation. Capped to keep the prompt light.
const MAX_SIBLINGS = 15;

// Notes are now logged against the two levers the rest of the app measures
// (Thumbnail, Hook) rather than one generic "what did you try" field —
// include only whichever side a producer actually filled in.
function noteTriedSummary(note) {
  const parts = [];
  if (note.thumbnail_tried) parts.push(`Thumbnail: "${note.thumbnail_tried}"`);
  if (note.hook_tried) parts.push(`Hook: "${note.hook_tried}"`);
  return parts.join('; ');
}

// Notes producers logged on OTHER episodes of this show carry forward as
// "what we already learned" — e.g. a past note saying a schedule change
// worked lets Claude notice whether this episode reflects that change,
// instead of every episode being analyzed as if the show has no history of
// producer experiments. Keyed by episode_id so each sibling shows its own
// note, not a generic pool of the show's producer notes.
function buildSiblingContext(episode, allEpisodes, baselines, notesByEpisode) {
  const siblings = allEpisodes
    .filter((ep) => ep.episode_id !== episode.episode_id)
    .slice(0, MAX_SIBLINGS)
    .map((ep) => {
      const { hookStatus, payoffStatus, viewsStatus } = episodeStatuses(ep, baselines.get(ep.episode_id) || {});
      if (!hookStatus && !payoffStatus && !viewsStatus) return null;
      let line = `- "${ep.episode_title}" (${formatPublishedContext(ep.published_at) || 'date unknown'}): Hook ${hookStatus || 'n/a'}, Payoff ${payoffStatus || 'n/a'}, Views ${viewsStatus || 'n/a'}`;
      const siblingNotes = notesByEpisode?.get(ep.episode_id);
      if (siblingNotes && siblingNotes.length > 0) {
        const latest = siblingNotes[siblingNotes.length - 1];
        const outcome = latest.outcome ? latest.outcome.replace(/_/g, ' ') : 'outcome not recorded';
        line += ` — producer note: tried ${noteTriedSummary(latest)} (${outcome})`;
      }
      return line;
    })
    .filter(Boolean);
  return siblings.length ? siblings.join('\n') : null;
}

function buildNotesContext(notes) {
  if (!notes || notes.length === 0) return null;
  return notes
    .map((n) => {
      const outcome = n.outcome ? ` (outcome: ${n.outcome.replace(/_/g, ' ')})` : ' (outcome not recorded)';
      const extra = n.notes ? ` — ${n.notes}` : '';
      return `- ${n.author_name} tried: ${noteTriedSummary(n)}${outcome}${extra}`;
    })
    .join('\n');
}

function buildPrompt(episode, baseline, allEpisodes, baselines, thumbnailPatterns, producerNotes, notesByEpisode) {
  const { ctrStatus, dropoffStatus, hookStatus, payoffStatus, viewsStatus } = episodeStatuses(episode, baseline);

  if (!hookStatus || !payoffStatus) return null;

  const lines = [
    `Show: ${episode.show_name}`,
    `Episode title: ${episode.episode_title}`,
    `Published: ${formatPublishedContext(episode.published_at) || 'unknown date'}`,
    `24hr click-through rate: ${formatRawPct(episode.ctr_24hr)} (this show's typical: ${formatRawPct(baseline.ctr_24hr)}) — ${ctrStatus || 'n/a'}`,
    `Early drop-off (loss right after the open): ${formatPct(episode.first_dropoff_pct)} (typical: ${formatPct(baseline.first_dropoff_pct)}) — ${dropoffStatus || 'n/a'}`,
    `Average watch-through: ${formatPct(episode.avg_watch_pct)} (typical: ${formatPct(baseline.avg_watch_pct)}) — ${payoffStatus}`,
    `YouTube views: ${formatCompact(episode.youtube_views_total)} (typical: ${formatCompact(baseline.youtube_views_total)}) — ${viewsStatus || 'n/a'}`,
    `Overall Hook verdict (click-through + early drop-off combined): ${hookStatus}`,
    `Overall Payoff verdict (watch-through): ${payoffStatus}`,
  ];

  if (episode.transcript_at_biggest_spike) {
    lines.push(
      `Transcript snippet at the episode's biggest retention spike (${episode.biggest_spike_timestamp || 'timestamp unknown'}): "${episode.transcript_at_biggest_spike}"`
    );
  }

  const siblingContext = buildSiblingContext(episode, allEpisodes, baselines, notesByEpisode);
  if (siblingContext) {
    lines.push('', "This show's other episodes, for pattern comparison:", siblingContext);
  }

  const thumb = thumbnailUrl(episode);
  if (thumb) {
    lines.push('', "This episode's YouTube thumbnail is attached above — factor in what it shows (faces, expressions, text, composition) as a possible driver of the click-through rate.");
  }

  if (thumbnailPatterns) {
    lines.push(
      '',
      "Known visual thumbnail patterns for this show, from comparing its past high- vs low-CTR thumbnails:",
      thumbnailPatterns
    );
  }

  const notesContext = buildNotesContext(producerNotes);
  if (notesContext) {
    lines.push('', 'Producer notes logged for this specific episode (what they tried, and whether it worked):', notesContext);
  }

  return {
    prompt: lines.join('\n'),
    thumbnailUrl: thumb,
    hookStatus,
    payoffStatus,
    viewsStatus,
  };
}

const SYSTEM_PROMPT = `You write skimmable performance notes for podcast producers reviewing episode analytics. You are given an episode's stats compared to the show's own trailing 90-day median; the episode title, publish date, and (when available) a transcript snippet from the episode's biggest retention spike; a one-line verdict summary for the show's other episodes (each with any producer note logged on it) so you can spot recurring patterns and past experiments; sometimes the episode's YouTube thumbnail image; sometimes a short note on visual patterns already observed across this show's other thumbnails; and sometimes producer notes logged directly on this episode.

Think it through before answering — weigh the numbers, the transcript moment, sibling-episode patterns and their producer notes, the thumbnail, the guest/topic, and timing — but write far less than you reasoned through. Output in this exact shape: one short paragraph, a blank line, then a bullet list — each bullet on its own line starting with "- ".

1. **What happened** (1-2 sentences, the paragraph). State the single clearest verdict in plain terms first — don't lead with a hedge or a setup clause. Cite at most one or two numbers, only the ones that actually matter; describe everything else qualitatively ("watch-through was about typical," not its exact percentage). If click-through and watch-through diverge, say so directly.
2. **Why** (2-3 short bullets, one clause each). Each bullet is a distinct possible driver, drawn from whichever of these actually apply: producer notes on THIS episode; a past producer note on an earlier episode that this one either does or doesn't reflect (name the earlier episode only if it adds something); a sibling-episode pattern; the thumbnail; the transcript moment; the guest's fit/relevance or something notable about the timing. Don't force 3 bullets if only 1-2 genuinely apply — a single strong bullet beats padding. Phrase every bullet as an educated guess ("likely," "may have"), never as fact — this goes double for guest/timing claims, since you're reasoning from general knowledge of that period rather than this show's own data, and could be wrong or out of date.

Hard constraints: one idea per sentence or bullet — no stacking clauses with em-dashes or nested parentheses. Whole response under 130 words. No headline, no disclaimers, no "Note: this is speculative" caveat, no restating metric labels like "Hook"/"Payoff".

Example of the target shape (for a different episode, illustrative only):
"Views came in well below usual even though people who clicked stuck around fine.

- The thumbnail's flat, two-person grin shot likely underperformed — this show's high-CTR thumbnails tend to lean on bigger reactions or a recognizable extra face.
- A producer noted the last episode's earlier posting time worked well; this one shipped at the old time again, which may explain the softer reach.
- The guest was a lower-profile return booking, which may have capped how far the episode traveled outside the show's regular audience."`;

async function generateOne(client, episode, baseline, allEpisodes, baselines, thumbnailPatterns, producerNotes, notesByEpisode) {
  const built = buildPrompt(episode, baseline, allEpisodes, baselines, thumbnailPatterns, producerNotes, notesByEpisode);
  if (!built) return null;

  const content = [];
  if (built.thumbnailUrl) {
    content.push({ type: 'image', source: { type: 'url', url: built.thumbnailUrl } });
  }
  content.push({ type: 'text', text: built.prompt });

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
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

// Generates and stores a narrative "AI take" for episodes that don't have
// one yet — called after a BigQuery sync so new episodes get a note without
// re-spending on ones already generated in a prior sync. Pass `limit` to cap
// the total number of Claude calls made in one run (useful for a cheap test
// pass before letting it run against the full catalog), and `showName` to
// scope the run to a single show (useful for staging a backfill show by show).
export async function generateMissingInsights(pool, { limit, showName: onlyShow } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('ANTHROPIC_API_KEY not set — skipping AI insight generation.');
    return { generated: 0, skipped: 0 };
  }

  const shows = onlyShow
    ? [{ show_name: onlyShow }]
    : (
        await pool.query(`SELECT DISTINCT show_name FROM episodes WHERE show_name != ALL($1)`, [EXCLUDED_SHOWS])
      ).rows;

  const client = new Anthropic();
  let generated = 0;
  let skipped = 0;

  for (const { show_name: showName } of shows) {
    if (limit && generated >= limit) break;

    const { rows: episodes } = await pool.query(
      `SELECT e.episode_id, e.show_name, e.episode_title, e.published_at,
              e.ctr_24hr, e.first_dropoff_pct, e.youtube_views_total, e.ai_insight,
              e.transcript_at_biggest_spike, e.biggest_spike_timestamp, e.youtube_video_id,
              (SELECT AVG(c.retention) FROM episode_retention_curve c WHERE c.episode_id = e.episode_id) AS avg_watch_pct
       FROM episodes e
       WHERE e.show_name = $1
       ORDER BY e.published_at DESC NULLS LAST`,
      [showName]
    );

    const baselines = computeTrailingBaselines(episodes, TREND_KEYS);
    let pending = episodes.filter((ep) => !ep.ai_insight);
    skipped += episodes.length - pending.length;
    if (limit) {
      pending = pending.slice(0, limit - generated);
    }
    if (pending.length === 0) continue;

    const thumbnailPatterns = await getThumbnailPatterns(pool, showName);

    // Fetched for every episode in the show, not just the ones pending
    // generation — a sibling that already has an insight can still have a
    // producer note worth surfacing as "what we already learned" context.
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

    const texts = await mapWithConcurrency(pending, CONCURRENCY, async (ep) => {
      try {
        return await generateOne(
          client,
          ep,
          baselines.get(ep.episode_id) || {},
          episodes,
          baselines,
          thumbnailPatterns,
          notesByEpisode.get(ep.episode_id),
          notesByEpisode
        );
      } catch (err) {
        console.error(`AI insight failed for episode ${ep.episode_id}:`, err.message);
        return null;
      }
    });

    for (let i = 0; i < pending.length; i += 1) {
      const text = texts[i];
      if (!text) continue;
      await pool.query(
        `UPDATE episodes SET ai_insight = $1, ai_insight_generated_at = now() WHERE episode_id = $2`,
        [text, pending[i].episode_id]
      );
      generated += 1;
    }
  }

  return { generated, skipped };
}

// Force-regenerates a single episode's insight on demand (e.g. a producer
// clicking "Regenerate" in the UI), regardless of whether one already
// exists. Reuses the same context-gathering as the batch path so a manual
// regenerate is identical in quality to one produced during a sync.
export async function regenerateInsight(pool, episodeId) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const err = new Error('ANTHROPIC_API_KEY not set — AI insights are unavailable.');
    err.status = 503;
    throw err;
  }

  const { rows: targetRows } = await pool.query(`SELECT show_name FROM episodes WHERE episode_id = $1`, [episodeId]);
  const target = targetRows[0];
  if (!target) {
    const err = new Error('Episode not found');
    err.status = 404;
    throw err;
  }

  const { rows: episodes } = await pool.query(
    `SELECT e.episode_id, e.show_name, e.episode_title, e.published_at,
            e.ctr_24hr, e.first_dropoff_pct, e.youtube_views_total, e.ai_insight,
            e.transcript_at_biggest_spike, e.biggest_spike_timestamp, e.youtube_video_id,
            (SELECT AVG(c.retention) FROM episode_retention_curve c WHERE c.episode_id = e.episode_id) AS avg_watch_pct
     FROM episodes e
     WHERE e.show_name = $1
     ORDER BY e.published_at DESC NULLS LAST`,
    [target.show_name]
  );
  const episode = episodes.find((ep) => ep.episode_id === episodeId);

  const baselines = computeTrailingBaselines(episodes, TREND_KEYS);
  const thumbnailPatterns = await getThumbnailPatterns(pool, target.show_name);

  // Fetched for the whole show, not just this episode — so sibling episodes'
  // own producer notes can surface as "what we already learned" context.
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

  const client = new Anthropic();
  const text = await generateOne(
    client,
    episode,
    baselines.get(episode.episode_id) || {},
    episodes,
    baselines,
    thumbnailPatterns,
    notesByEpisode.get(episodeId),
    notesByEpisode
  );

  if (!text) {
    const err = new Error("Not enough of this show's recent episodes yet to compare this one against a baseline.");
    err.status = 422;
    throw err;
  }

  await pool.query(`UPDATE episodes SET ai_insight = $1, ai_insight_generated_at = now() WHERE episode_id = $2`, [
    text,
    episodeId,
  ]);

  return text;
}
