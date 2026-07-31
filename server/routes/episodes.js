import { Router } from 'express';
import { pool } from '../db/pool.js';
import { EXCLUDED_SHOWS } from '../config/excludedShows.js';
import { regenerateInsight } from '../ai/generateInsights.js';
import { askAboutShow } from '../ai/askShow.js';

export const episodesRouter = Router();

episodesRouter.get('/shows', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT show_name, COUNT(*) AS episode_count, MAX(published_at) AS latest_published_at
       FROM episodes
       WHERE show_name != ALL($1)
       GROUP BY show_name
       ORDER BY show_name`,
      [EXCLUDED_SHOWS]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Finds the point on a single episode's retention curve where it bends from
// a steep early drop-off into a much slower, longer decline — the classic
// "elbow" of a decay curve: the point on the curve farthest from the
// straight line connecting its start and end.
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

// Finds each episode's own elbow point, then averages those across the
// show — not one elbow computed from an already-averaged curve. Averaging
// the curves first would smear over real per-episode timing differences
// (one show's episodes ranged from a 6% to an 18% elbow); this way the
// result is literally "the average of where each episode's own main
// drop-off levels off."
episodesRouter.get('/retention-stickiness', async (req, res, next) => {
  try {
    const { show } = req.query;
    if (!show) {
      return res.status(400).json({ error: 'show query param is required' });
    }

    const { rows: episodeRows } = await pool.query(
      `SELECT episode_id, episode_length_seconds FROM episodes WHERE show_name = $1`,
      [show]
    );
    if (episodeRows.length === 0) {
      return res.json(null);
    }
    const lengthByEpisode = new Map(episodeRows.map((r) => [r.episode_id, r.episode_length_seconds]));

    const { rows: curveRows } = await pool.query(
      `SELECT c.episode_id, c.percentile, c.retention, c.baseline_curve
       FROM episode_retention_curve c
       JOIN episodes e ON e.episode_id = c.episode_id
       WHERE e.show_name = $1
       ORDER BY c.episode_id, c.percentile`,
      [show]
    );

    const curvesByEpisode = new Map();
    for (const row of curveRows) {
      if (!curvesByEpisode.has(row.episode_id)) curvesByEpisode.set(row.episode_id, []);
      curvesByEpisode.get(row.episode_id).push({
        percentile: row.percentile,
        retention: Number(row.retention),
        baseline: row.baseline_curve !== null ? Number(row.baseline_curve) : null,
      });
    }

    const elbows = [];
    for (const [episodeId, curve] of curvesByEpisode) {
      if (curve.length < 2) continue;
      const elbow = findElbow(curve);
      const lengthSeconds = lengthByEpisode.get(episodeId);
      elbows.push({
        episodeId,
        percentile: elbow.percentile,
        retention: elbow.retention,
        seconds: lengthSeconds !== null && lengthSeconds !== undefined ? (elbow.percentile / 100) * lengthSeconds : null,
      });
    }
    if (elbows.length === 0) {
      return res.json(null);
    }

    const avgPercentile = elbows.reduce((sum, e) => sum + e.percentile, 0) / elbows.length;
    const avgRetention = elbows.reduce((sum, e) => sum + e.retention, 0) / elbows.length;
    const withSeconds = elbows.filter((e) => e.seconds !== null);
    const avgSeconds = withSeconds.length
      ? withSeconds.reduce((sum, e) => sum + e.seconds, 0) / withSeconds.length
      : null;
    const roundedAvgPercentile = Math.round(avgPercentile);

    // For flagging a standout episode, comparing each episode's own noisily-
    // detected elbow *position* against the average elbow position turned
    // out too unstable — plenty of ordinary episodes land far from the
    // average purely from curve noise, with no real difference in shape from
    // the baseline. Comparing actual retention against the show's baseline
    // curve at one fixed point (the show's typical stickiest point) is a
    // much steadier signal: did this episode hold onto meaningfully more of
    // its audience than usual, right where the show typically starts to level
    // off?
    const perEpisode = [];
    for (const [episodeId, curve] of curvesByEpisode) {
      const atPoint = curve.find((p) => p.percentile === roundedAvgPercentile);
      if (!atPoint || atPoint.baseline === null || atPoint.baseline === 0) continue;
      perEpisode.push({
        episodeId,
        retention: atPoint.retention,
        baseline: atPoint.baseline,
        relDelta: (atPoint.retention - atPoint.baseline) / atPoint.baseline,
      });
    }

    res.json({
      percentile: roundedAvgPercentile,
      retention: avgRetention,
      episodeCount: elbows.length,
      estimatedSeconds: avgSeconds,
      perEpisode,
    });
  } catch (err) {
    next(err);
  }
});

episodesRouter.post('/ask', async (req, res, next) => {
  try {
    const { show } = req.query;
    if (!show) {
      return res.status(400).json({ error: 'show query param is required' });
    }
    const { question, history } = req.body || {};
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'question is required' });
    }

    const answer = await askAboutShow(pool, show, question.trim(), Array.isArray(history) ? history : []);
    res.json({ answer });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

episodesRouter.get('/thumbnail-patterns', async (req, res, next) => {
  try {
    const { show } = req.query;
    if (!show) {
      return res.status(400).json({ error: 'show query param is required' });
    }
    const { rows } = await pool.query(
      `SELECT notes, episode_count, generated_at FROM show_thumbnail_patterns WHERE show_name = $1`,
      [show]
    );
    res.json(rows[0] || null);
  } catch (err) {
    next(err);
  }
});

episodesRouter.get('/episodes', async (req, res, next) => {
  try {
    const { show } = req.query;
    const params = [EXCLUDED_SHOWS];
    let where = 'WHERE show_name != ALL($1)';
    if (show) {
      params.push(show);
      where += ` AND show_name = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT *,
        (SELECT COUNT(*) FROM episode_notes n WHERE n.episode_id = episodes.episode_id) AS note_count,
        (SELECT AVG(c.retention) FROM episode_retention_curve c WHERE c.episode_id = episodes.episode_id) AS avg_watch_pct
       FROM episodes
       ${where}
       ORDER BY published_at DESC NULLS LAST`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

episodesRouter.get('/episodes/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const episodeResult = await pool.query('SELECT * FROM episodes WHERE episode_id = $1', [id]);
    if (episodeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Episode not found' });
    }
    const notesResult = await pool.query(
      'SELECT * FROM episode_notes WHERE episode_id = $1 ORDER BY created_at DESC',
      [id]
    );
    const curveResult = await pool.query(
      'SELECT percentile, retention, baseline_curve, delta_vs_baseline FROM episode_retention_curve WHERE episode_id = $1 ORDER BY percentile',
      [id]
    );
    const retentionValues = curveResult.rows.map((r) => Number(r.retention)).filter((n) => !Number.isNaN(n));
    const avgWatchPct = retentionValues.length
      ? retentionValues.reduce((a, b) => a + b, 0) / retentionValues.length
      : null;
    res.json({
      ...episodeResult.rows[0],
      avg_watch_pct: avgWatchPct,
      notes: notesResult.rows,
      retention_curve: curveResult.rows,
    });
  } catch (err) {
    next(err);
  }
});

episodesRouter.post('/episodes/:id/regenerate-insight', async (req, res, next) => {
  try {
    const { id } = req.params;
    const ai_insight = await regenerateInsight(pool, id);
    res.json({ ai_insight });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

episodesRouter.post('/episodes/:id/notes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { author_name, thumbnail_tried, hook_tried, outcome, notes } = req.body || {};

    if (!author_name?.trim() || (!thumbnail_tried?.trim() && !hook_tried?.trim())) {
      return res.status(400).json({ error: 'author_name and at least one of thumbnail_tried/hook_tried are required' });
    }
    const validOutcomes = ['worked', 'did_not_work', 'inconclusive', null, undefined];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome value' });
    }

    const { rows } = await pool.query(
      `INSERT INTO episode_notes (episode_id, author_name, thumbnail_tried, hook_tried, outcome, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, author_name.trim(), thumbnail_tried?.trim() || null, hook_tried?.trim() || null, outcome || null, notes?.trim() || null]
    );

    // A new note changes what the AI analysis should say about this episode
    // (it hasn't seen this producer input yet) — clear the cached insight so
    // the next sync regenerates it with the note included.
    await pool.query(
      `UPDATE episodes SET ai_insight = NULL, ai_insight_generated_at = NULL WHERE episode_id = $1`,
      [id]
    );

    // Logged against req.session.userName (the logged-in producer) rather
    // than the free-text author_name on the note form itself, so the admin
    // dashboard's per-user note counts reflect who's actually using the
    // tool, not whatever name someone typed into that field.
    const { rows: showRows } = await pool.query('SELECT show_name FROM episodes WHERE episode_id = $1', [id]);
    const showName = showRows[0]?.show_name;
    await pool.query('INSERT INTO activity_log (user_name, event_type, path) VALUES ($1, $2, $3)', [
      req.session.userName || 'Unknown',
      'note_added',
      showName ? `/shows/${encodeURIComponent(showName)}` : null,
    ]);

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(404).json({ error: 'Episode not found' });
    }
    next(err);
  }
});

episodesRouter.put('/episodes/:id/notes/:noteId', async (req, res, next) => {
  try {
    const { id, noteId } = req.params;
    const { author_name, thumbnail_tried, hook_tried, outcome, notes } = req.body || {};

    if (!author_name?.trim() || (!thumbnail_tried?.trim() && !hook_tried?.trim())) {
      return res.status(400).json({ error: 'author_name and at least one of thumbnail_tried/hook_tried are required' });
    }
    const validOutcomes = ['worked', 'did_not_work', 'inconclusive', null, undefined];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome value' });
    }

    const { rows } = await pool.query(
      `UPDATE episode_notes
       SET author_name = $1, thumbnail_tried = $2, hook_tried = $3, outcome = $4, notes = $5, updated_at = now()
       WHERE id = $6 AND episode_id = $7
       RETURNING *`,
      [author_name.trim(), thumbnail_tried?.trim() || null, hook_tried?.trim() || null, outcome || null, notes?.trim() || null, noteId, id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    // Same reasoning as adding a new note — an edited note is producer input
    // the AI hasn't seen yet, so clear the cached insight.
    await pool.query(
      `UPDATE episodes SET ai_insight = NULL, ai_insight_generated_at = NULL WHERE episode_id = $1`,
      [id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});
