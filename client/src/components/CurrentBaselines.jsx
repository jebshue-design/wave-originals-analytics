import { computeCurrentBaselines } from '../utils/stats';
import { metricLabel, metricDescription } from '../config/metrics';
import { formatCompactNumber, formatPercent, formatRawPercent } from '../utils/format';
import { InfoTip } from './InfoTip';

const KEYS = [
  'total_performance_combined',
  'youtube_views_total',
  'audio_downloads_total',
  'ctr_1hr',
  'ctr_24hr',
  'avg_watch_pct',
];

const FORMATTERS = {
  ctr_1hr: formatRawPercent,
  ctr_24hr: formatRawPercent,
  avg_watch_pct: formatPercent,
};

export function CurrentBaselines({ episodes }) {
  const { baselines, sampleSize } = computeCurrentBaselines(episodes, KEYS);
  const hasAny = KEYS.some((key) => baselines[key] !== null);

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
          {KEYS.map((key, index) => {
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
