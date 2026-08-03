const HTML_ENTITIES = {
  '&amp;': '&',
  '&#39;': "'",
  '&quot;': '"',
  '&lt;': '<',
  '&gt;': '>',
  '&#x27;': "'",
};

function decodeEntities(str) {
  return str.replace(/&(amp|#39|quot|lt|gt|#x27);/g, (m) => HTML_ENTITIES[m] || m);
}

function normalizeTitle(str) {
  return decodeEntities(str)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Word-overlap similarity (Jaccard) between two titles — used to score a
// search result against our stored title rather than trusting whichever
// result YouTube's relevance ranking put first.
function wordSet(str) {
  return new Set(normalizeTitle(str).split(' ').filter(Boolean));
}

function titleSimilarity(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

// Strips a trailing " | Ep. 62" / " | 07.07" style suffix, punctuation, and
// keeps only the first N words — a much less brittle query than the full
// title. YouTube's search can return zero results for a long query that
// doesn't match verbatim, even when a shorter subset of the same words finds
// the video instantly (titles are sometimes edited after publish, so the
// version we have on file drifts from what's actually live).
function simplifyTitle(title, wordCount) {
  return title
    .replace(/\|.*$/, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, wordCount)
    .join(' ');
}

async function searchYoutube(params, apiKey) {
  const query = new URLSearchParams({ part: 'snippet', type: 'video', maxResults: '5', key: apiKey, ...params });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${query}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.items || [];
}

// Minimum word-overlap score required to accept a search result as a match.
// Below this, a wrong-but-plausible-looking video is worse than no
// thumbnail at all — it silently misrepresents the episode.
const MIN_SIMILARITY = 0.35;
// A date-scoped search already did most of the disambiguation (very few
// videos post to a channel in a few-day window), so a looser bar is safe —
// and necessary, since real title wording often drifts from what's on file.
const MIN_SIMILARITY_DATE_SCOPED = 0.25;
const DATE_WINDOW_DAYS = 3;

function bestMatch(items, title, minSimilarity) {
  let best = null;
  for (const item of items) {
    const score = titleSimilarity(title, item.snippet.title);
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= minSimilarity ? best.item.id.videoId : null;
}

export async function findYoutubeVideoId(title, channelId, publishedAt) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not set.');
  }

  const target = normalizeTitle(title);

  // Try a date-scoped search first when we know both the channel and the
  // episode's publish date — narrows candidates from "anything ever posted"
  // down to a handful of videos from that week, which is a far stronger
  // disambiguator than title wording alone (see server/db's thumbnail audit:
  // an unscoped search had picked a video from five months later).
  if (channelId && publishedAt) {
    const published = new Date(publishedAt);
    if (!Number.isNaN(published.getTime())) {
      const windowMs = DATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
      const items = await searchYoutube(
        {
          q: simplifyTitle(title, 8) || title,
          channelId,
          publishedAfter: new Date(published.getTime() - windowMs).toISOString(),
          publishedBefore: new Date(published.getTime() + windowMs).toISOString(),
        },
        apiKey
      );
      if (items.length > 0) {
        const exact = items.find((item) => normalizeTitle(item.snippet.title) === target);
        if (exact) return exact.id.videoId;
        const matched = bestMatch(items, title, MIN_SIMILARITY_DATE_SCOPED);
        if (matched) return matched;
      }
    }
  }

  // Fall back to a plain title search (no date filter) only if the
  // date-scoped attempt above found nothing — e.g. publishedAt is missing,
  // wrong, or the video was posted well outside the window. Every candidate
  // still has to clear MIN_SIMILARITY; unlike before, we no longer trust
  // whichever result happens to rank first.
  const queries = [title, simplifyTitle(title, 8), simplifyTitle(title, 4)];
  for (const query of queries) {
    if (!query) continue;
    const items = await searchYoutube(channelId ? { q: query, channelId } : { q: query }, apiKey);
    if (items.length === 0) continue;

    const exact = items.find((item) => normalizeTitle(item.snippet.title) === target);
    if (exact) return exact.id.videoId;

    const matched = bestMatch(items, title, MIN_SIMILARITY);
    if (matched) return matched;
  }

  return null;
}
