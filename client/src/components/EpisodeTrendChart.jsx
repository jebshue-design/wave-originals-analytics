import { useState } from 'react';
import { formatCompactNumber, formatDate } from '../utils/format';
import { trendStatus } from '../utils/stats';

const WIDTH = 760;
const HEIGHT = 150;
const PAD_LEFT = 44;
const PAD_RIGHT = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const MAX_EPISODES = 10;
const BAR_WIDTH_RATIO = 0.4; // fraction of each episode's slot the bar itself occupies
const SEGMENT_GAP = 1; // hairline gap between the stacked audio/youtube segments

// Same good/average/bad vocabulary and colors as TrendIndicator elsewhere,
// shown as a small glyph above each bar rather than recoloring the bar
// itself — the bar's own color already carries the audio/youtube identity,
// and status shouldn't compete with that on the same channel.
const STATUS_COLOR_VAR = {
  good: 'var(--intent-success)',
  average: 'var(--intent-warning)',
  bad: 'var(--intent-danger)',
};
const STATUS_ICON = { good: '▲', average: '●', bad: '▼' };
const STATUS_LABEL = { good: 'good', average: 'average', bad: 'needs attention' };

// Short enough (e.g. "7/22") to sit under every bar without the x-axis
// turning into a wall of text — the full date is still in the tooltip.
function formatShortDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric' }).format(d);
}

export function EpisodeTrendChart({ episodes, trailingBaselines, currentBaseline }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const recent = [...episodes]
    .filter(
      (ep) =>
        ep.published_at &&
        ep.audio_downloads_total !== null &&
        ep.audio_downloads_total !== undefined &&
        ep.youtube_views_total !== null &&
        ep.youtube_views_total !== undefined
    )
    .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
    .slice(-MAX_EPISODES);

  if (recent.length < 2) {
    return <p className="empty-state spec">Not enough recent episodes yet to chart a trend.</p>;
  }

  const bars = recent.map((ep) => ({
    ep,
    audio: Number(ep.audio_downloads_total),
    youtube: Number(ep.youtube_views_total),
    total: Number(ep.audio_downloads_total) + Number(ep.youtube_views_total),
  }));

  // Derived the same way CurrentBaselines now displays it — the sum of the
  // two component baselines, not an independently-computed median — so this
  // reference line lines up with what a "typical" stacked bar would actually
  // look like, not a number that can't be reproduced by any real stack.
  const baselineAudio = currentBaseline?.audio_downloads_total;
  const baselineYoutube = currentBaseline?.youtube_views_total;
  const baselineTotal =
    baselineAudio !== null && baselineAudio !== undefined && baselineYoutube !== null && baselineYoutube !== undefined
      ? Number(baselineAudio) + Number(baselineYoutube)
      : null;

  const maxValue = Math.max(...bars.map((b) => b.total), baselineTotal || 0);
  const yMax = maxValue * 1.15 || 1;

  function yFor(v) {
    return PAD_TOP + (1 - v / yMax) * PLOT_H;
  }
  const slotWidth = PLOT_W / bars.length;
  const barWidth = slotWidth * BAR_WIDTH_RATIO;
  function slotCenter(i) {
    return PAD_LEFT + slotWidth * (i + 0.5);
  }

  return (
    <div className="episode-bar-chart">
      <div className="toolbar episode-bar-chart-header">
        <h2 className="detail-section-title">Performance Over Time</h2>
        <div className="chart-legend">
          <span className="legend-item">
            <span className="channel-swatch" style={{ background: 'var(--fg-dim)' }} />
            Audio
          </span>
          <span className="legend-item">
            <span className="channel-swatch" style={{ background: 'var(--volt)' }} />
            YouTube
          </span>
          {baselineTotal !== null && (
            <span className="legend-item">
              <span className="legend-line legend-line-dashed" />
              Baseline
            </span>
          )}
        </div>
      </div>
      <div className="chart-bar-wrap">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Total performance across the last ${bars.length} episodes, split into audio downloads and YouTube views`}
        >
          <text x={PAD_LEFT - 6} y={yFor(maxValue) + 3} textAnchor="end" className="chart-tick">
            {formatCompactNumber(maxValue)}
          </text>
          <text x={PAD_LEFT - 6} y={HEIGHT - PAD_BOTTOM} textAnchor="end" className="chart-tick">
            0
          </text>

          <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={HEIGHT - PAD_BOTTOM} y2={HEIGHT - PAD_BOTTOM} stroke="var(--line)" strokeWidth="1" />

          {bars.map((b, i) => (
            <text key={b.ep.episode_id} x={slotCenter(i)} y={HEIGHT - 8} textAnchor="middle" className="chart-tick">
              {formatShortDate(b.ep.published_at)}
            </text>
          ))}

          {baselineTotal !== null && (
            <>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={yFor(baselineTotal)}
                y2={yFor(baselineTotal)}
                stroke="var(--fg-muted)"
                strokeWidth="1.5"
                strokeDasharray="5 3"
              />
              <text
                x={PAD_LEFT - 6}
                y={yFor(baselineTotal) - 4}
                textAnchor="end"
                className="chart-tick"
                fill="var(--fg-muted)"
              >
                Baseline {formatCompactNumber(baselineTotal)}
              </text>
            </>
          )}

          {bars.map((b, i) => {
            const cx = slotCenter(i);
            const x = cx - barWidth / 2;
            const audioTop = yFor(b.audio);
            const audioHeight = HEIGHT - PAD_BOTTOM - audioTop;
            const youtubeBottom = audioTop - SEGMENT_GAP;
            const youtubeTop = yFor(b.total);
            const youtubeHeight = Math.max(0, youtubeBottom - youtubeTop);
            const status = trendStatus(b.total, trailingBaselines?.get(b.ep.episode_id)?.total_performance_combined);

            return (
              <g key={b.ep.episode_id}>
                {i === hoverIndex && (
                  <rect x={PAD_LEFT + slotWidth * i} y={PAD_TOP} width={slotWidth} height={PLOT_H} fill="var(--bg-elev-2)" />
                )}
                <rect x={x} y={audioTop} width={barWidth} height={Math.max(0, audioHeight)} fill="var(--fg-dim)" />
                {youtubeHeight > 0 && (
                  <rect x={x} y={youtubeTop} width={barWidth} height={youtubeHeight} fill="var(--volt)" />
                )}
                {status && (
                  <text x={cx} y={yFor(b.total) - 6} textAnchor="middle" fill={STATUS_COLOR_VAR[status]} fontSize="9">
                    {STATUS_ICON[status]}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover targets are plain HTML (not SVG) so the tooltip can reuse
            the same info-tip-style data-tooltip/::after pattern used
            everywhere else in the app, instead of a hand-drawn SVG box. */}
        {bars.map((b, i) => {
          const status = trendStatus(b.total, trailingBaselines?.get(b.ep.episode_id)?.total_performance_combined);
          const title = b.ep.episode_title.length > 60 ? `${b.ep.episode_title.slice(0, 60)}…` : b.ep.episode_title;
          const tooltip = [
            `"${title}" — ${formatDate(b.ep.published_at)}`,
            `• Total: ${formatCompactNumber(b.total)}`,
            `• Audio: ${formatCompactNumber(b.audio)}`,
            `• YouTube: ${formatCompactNumber(b.youtube)}`,
            status ? `• ${STATUS_LABEL[status]} vs. typical` : null,
          ]
            .filter(Boolean)
            .join('\n');
          return (
            <span
              key={b.ep.episode_id}
              className="chart-bar-trigger"
              tabIndex={0}
              data-tooltip={tooltip}
              style={{ left: `${(i / bars.length) * 100}%`, width: `${(1 / bars.length) * 100}%` }}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
            />
          );
        })}
      </div>
    </div>
  );
}
