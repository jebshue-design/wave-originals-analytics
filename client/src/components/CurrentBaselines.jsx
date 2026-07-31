import { computeCurrentBaselines } from '../utils/stats';
import { metricLabel, metricDescription } from '../config/metrics';
import { formatCompactNumber, formatPercent, formatRawPercent } from '../utils/format';
import { InfoTip } from './InfoTip';

// total_performance_combined isn't fetched as its own median — it's derived
// below as the sum of the youtube/audio baselines instead, so this tile
// always agrees with the other two rather than being an independent median
// that can land on a different "middle" episode than either component (see
// DISPLAY_KEYS for the render order, which still shows it first).
const FETCH_KEYS = ['youtube_views_total', 'audio_downloads_total', 'ctr_1hr', 'ctr_24hr', 'avg_watch_pct'];
const DISPLAY_KEYS = ['total_performance_combined', ...FETCH_KEYS];

const FORMATTERS = {
  ctr_1hr: formatRawPercent,
  ctr_24hr: formatRawPercent,
  avg_watch_pct: formatPercent,
};

export function CurrentBaselines({ episodes }) {
  const { baselines: fetched, sampleSize } = computeCurrentBaselines(episodes, FETCH_KEYS);
  const { youtube_views_total, audio_downloads_total } = fetched;
  const total =
    youtube_views_total !== null && audio_downloads_total !== null
      ? youtube_views_total + audio_downloads_total
      : null;
  const baselines = { ...fetched, total_performance_combined: total };
  const hasAny = DISPLAY_KEYS.some((key) => baselines[key] !== null);

  return (
    <div className="correlation-panel">
      <p className="correlation-explainer">
        The median of episodes published in the last 90 days ({sampleSize} episode{sampleSize === 1 ? '' : 's'}) —
        the current bar a new episode is measured against.
      </p>
      {!hasAny ? (
        <p className="empty-state spec">Not enough recent episodes yet to set a current baseline.</p>
      ) : (
        <div className="stat-tile-row">
          {DISPLAY_KEYS.map((key, index) => {
            const format = FORMATTERS[key] || formatCompactNumber;
            return (
              <div
                className="stat-tile card-enter"
                key={key}
                style={{ animationDelay: `${Math.min(index * 50, 250)}ms` }}
              >
                <span className="spec">
                  {metricLabel(key)}
                  <InfoTip text={metricDescription(key)} />
                </span>
                <span className="stat-tile-value mono-num">{format(baselines[key])}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
