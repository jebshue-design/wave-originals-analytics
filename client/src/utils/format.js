export function formatCompactNumber(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(
    n
  );
}

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
    d
  );
}

export function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function formatRawPercent(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

// For expressing a relative deviation (e.g. from compositeCtrScore) as a
// multiple of "typical" instead of a raw percent — a raw CTR percent sitting
// on a "needs attention" badge reads as if that number itself is bad, when
// it's really only bad relative to this show's own baseline. "1.4x typical"
// can't be misread that way.
export function formatMultiplier(deviation) {
  if (deviation === null || deviation === undefined) return '—';
  const n = Number(deviation);
  if (Number.isNaN(n)) return '—';
  return `${(1 + n).toFixed(1)}×`;
}

export function formatDuration(totalSeconds) {
  if (totalSeconds === null || totalSeconds === undefined) return null;
  const n = Number(totalSeconds);
  if (Number.isNaN(n) || n < 0) return null;
  const rounded = Math.round(n);
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// avg_watch_pct is a 0-1 fraction of the episode's runtime — multiplying it
// by episode_length_seconds gives how much of the episode people actually
// watched, in real time, which reads more concretely than a bare percentage.
export function formatWatchDuration(avgWatchPct, episodeLengthSeconds) {
  if (
    avgWatchPct === null ||
    avgWatchPct === undefined ||
    episodeLengthSeconds === null ||
    episodeLengthSeconds === undefined
  ) {
    return null;
  }
  const pct = Number(avgWatchPct);
  const length = Number(episodeLengthSeconds);
  if (Number.isNaN(pct) || Number.isNaN(length)) return null;
  return formatDuration(pct * length);
}

export function formatSignedPercent(value) {
  if (value === null || value === undefined) return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)}%`;
}
