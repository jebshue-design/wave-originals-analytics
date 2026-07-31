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

async function searchYoutube(query, channelId, apiKey) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    maxResults: '5',
    q: query,
    key: apiKey,
  });
  if (channelId) params.set('channelId', channelId);

  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function findYoutubeVideoId(title, channelId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is not set.');
  }

  const target = normalizeTitle(title);
  // Try the full title first (most precise when it still matches verbatim),
  // then fall back to shorter, simplified queries only if that comes back
  // empty.
  const queries = [title, simplifyTitle(title, 8), simplifyTitle(title, 4)];

  for (const query of queries) {
    if (!query) continue;
    const items = await searchYoutube(query, channelId, apiKey);
    if (items.length === 0) continue;

    const exact = items.find((item) => normalizeTitle(item.snippet.title) === target);
    if (exact) return exact.id.videoId;

    // No normalized-exact match. Within a known channel, trust search
    // relevance rather than leaving genuine title-wording drift unmatched —
    // worst case is a mismatched thumbnail from the same show.
    if (channelId) return items[0].id.videoId;
  }

  return null;
}
