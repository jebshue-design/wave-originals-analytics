import Anthropic from '@anthropic-ai/sdk';

const MIN_THUMBNAILS_FOR_PATTERN = 4;
const MAX_PER_GROUP = 5;
// Only worth refreshing once enough new thumbnails have accumulated since
// the last pass — otherwise every sync would re-spend on a near-identical
// image set.
const REFRESH_THRESHOLD = 5;

function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

const SYSTEM_PROMPT = `You are comparing two groups of YouTube thumbnails from the same show: episodes with an above-typical click-through rate ("high CTR") vs. below-typical ("low CTR"). Look at composition, faces/expressions, text, and color across each group, but report only the ONE or TWO clearest differences — skip minor or inconsistent ones.

Write exactly two short sentences: one stating the high-CTR tendency, one stating the low-CTR tendency. Together, under 40 words total. Use at most one quoted title/text example in the whole response, and only if it sharpens the point — do not list several. Phrase it as a tendency ("tends to," "often"), not a rule, since this is a small, informal sample. If nothing clear distinguishes the groups, say so in one short sentence instead. No headline, no disclaimer — just the note.`;

// Generates (or refreshes) a per-show note on what visually distinguishes
// its high- vs low-CTR thumbnails, via one batch vision call, and persists
// it so future single-episode insight calls can reference it as plain text
// instead of re-attaching a pile of images every time.
export async function refreshThumbnailPatterns(pool, showName) {
  const { rows: episodes } = await pool.query(
    `SELECT episode_id, youtube_video_id, ctr_24hr
     FROM episodes
     WHERE show_name = $1 AND youtube_video_id IS NOT NULL AND ctr_24hr IS NOT NULL`,
    [showName]
  );

  if (episodes.length < MIN_THUMBNAILS_FOR_PATTERN) return null;

  const sorted = [...episodes].sort((a, b) => Number(b.ctr_24hr) - Number(a.ctr_24hr));
  const half = Math.min(MAX_PER_GROUP, Math.floor(sorted.length / 2));
  const high = sorted.slice(0, half);
  const low = sorted.slice(-half).reverse();

  const content = [
    { type: 'text', text: `HIGH CTR GROUP (${high.length} thumbnails):` },
    ...high.map((ep) => ({ type: 'image', source: { type: 'url', url: thumbnailUrl(ep.youtube_video_id) } })),
    { type: 'text', text: `LOW CTR GROUP (${low.length} thumbnails):` },
    ...low.map((ep) => ({ type: 'image', source: { type: 'url', url: thumbnailUrl(ep.youtube_video_id) } })),
    { type: 'text', text: `Show: ${showName}. Compare the two groups above and describe the visual patterns that distinguish them.` },
  ];

  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const notes = textBlock ? textBlock.text.trim() : null;
  if (!notes) return null;

  await pool.query(
    `INSERT INTO show_thumbnail_patterns (show_name, notes, episode_count, generated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (show_name) DO UPDATE SET notes = EXCLUDED.notes, episode_count = EXCLUDED.episode_count, generated_at = now()`,
    [showName, notes, episodes.length]
  );

  return notes;
}

// Returns the show's stored thumbnail-pattern note, refreshing it first if
// it's missing or stale (enough new thumbnails have come in since it was
// last generated). Returns null if there aren't enough thumbnails yet.
export async function getThumbnailPatterns(pool, showName) {
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS count FROM episodes WHERE show_name = $1 AND youtube_video_id IS NOT NULL AND ctr_24hr IS NOT NULL`,
    [showName]
  );
  const currentCount = Number(countRows[0].count);
  if (currentCount < MIN_THUMBNAILS_FOR_PATTERN) return null;

  const { rows } = await pool.query(
    `SELECT notes, episode_count FROM show_thumbnail_patterns WHERE show_name = $1`,
    [showName]
  );
  const existing = rows[0];

  if (!existing || currentCount - existing.episode_count >= REFRESH_THRESHOLD) {
    const refreshed = await refreshThumbnailPatterns(pool, showName);
    if (refreshed) return refreshed;
  }

  return existing?.notes || null;
}
