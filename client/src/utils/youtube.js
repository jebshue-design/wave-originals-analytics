export function youtubeThumbnailUrl(videoId, quality = 'hqdefault') {
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}
