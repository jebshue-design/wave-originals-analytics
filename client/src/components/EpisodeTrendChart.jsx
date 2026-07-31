import { useRef, useState } from 'react';
import { formatCompactNumber, formatDate } from '../utils/format';
import { trendStatus } from '../utils/stats';

const WIDTH = 760;
const HEIGHT = 320;
const PAD_LEFT = 56;
const PAD_RIGHT = 20;
const PAD_TOP = 28;
const PAD_BOTTOM = 36;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const MAX_EPISODES = 10;
const Y_TICK_COUNT = 4;
const BAR_WIDTH_RATIO = 0.56; // fraction of each episode's slot the bar itself occupies
const SEGMENT_GAP = 2; // visual gap between the stacked audio/youtube segments

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

export function EpisodeTrendChart({ episodes, trailingBaselines, currentBaseline }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

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
  const yMax = maxValue * 1.2 || 1;

  function yFor(v) {
    return PAD_TOP + (1 - v / yMax) * PLOT_H;
  }
  const slotWidth = PLOT_W / bars.length;
  const barWidth = slotWidth * BAR_WIDTH_RATIO;
  function slotCenter(i) {
    return PAD_LEFT + slotWidth * (i + 0.5);
  }

  const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => (yMax / Y_TICK_COUNT) * i);

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const index = Math.min(bars.length - 1, Math.max(0, Math.floor((relX - PAD_LEFT) / slotWidth)));
    setHoverIndex(index);
  }

  const hovered = hoverIndex !== null ? bars[hoverIndex] : null;
  const hoverStatus = hovered ? trendStatus(hovered.total, trailingBaselines?.get(hovered.ep.episode_id)?.total_performance_combined) : null;

  return (
    <div className="episode-bar-chart">
      <div className="chart-legend">
        <span className="legend-item">
          <span className="channel-swatch" style={{ background: 'var(--series-downloads)' }} />
          Audio Downloads
        </span>
        <span className="legend-item">
          <span className="channel-swatch" style={{ background: 'var(--series-views)' }} />
          YouTube Views
        </span>
        {baselineTotal !== null && (
          <span className="legend-item">
            <span className="legend-line legend-line-dashed" />
            Current baseline (total)
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Total performance across the last ${bars.length} episodes, split into audio downloads and YouTube views`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="barFillDownloads" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-downloads)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--series-downloads)" stopOpacity="0.72" />
          </linearGradient>
          <linearGradient id="barFillViews" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-views)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--series-views)" stopOpacity="0.72" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={PAD_LEFT - 8} y={yFor(t) + 3} textAnchor="end" className="chart-tick">
              {formatCompactNumber(t)}
            </text>
          </g>
        ))}

        <text x={PAD_LEFT} y={HEIGHT - 8} textAnchor="start" className="chart-tick">
          {formatDate(recent[0].published_at)}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end" className="chart-tick">
          {formatDate(recent[recent.length - 1].published_at)}
        </text>

        {baselineTotal !== null && (
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={yFor(baselineTotal)}
            y2={yFor(baselineTotal)}
            stroke="var(--fg-dim)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
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
          const isHovered = i === hoverIndex;

          return (
            <g key={b.ep.episode_id} opacity={hoverIndex === null || isHovered ? 1 : 0.55}>
              {isHovered && (
                <rect
                  x={PAD_LEFT + slotWidth * i}
                  y={PAD_TOP}
                  width={slotWidth}
                  height={PLOT_H}
                  fill="rgba(255, 255, 255, 0.04)"
                />
              )}
              <rect
                x={x}
                y={audioTop}
                width={barWidth}
                height={Math.max(0, audioHeight)}
                rx={3}
                fill="url(#barFillDownloads)"
              />
              {youtubeHeight > 0 && (
                <rect x={x} y={youtubeTop} width={barWidth} height={youtubeHeight} rx={3} fill="url(#barFillViews)" />
              )}
              {status && (
                <text x={cx} y={yFor(b.total) - 8} textAnchor="middle" fill={STATUS_COLOR_VAR[status]} fontSize="11">
                  {STATUS_ICON[status]}
                </text>
              )}
            </g>
          );
        })}

        {hovered && (
          <EpisodeTooltip x={slotCenter(hoverIndex)} bar={hovered} status={hoverStatus} />
        )}
      </svg>
    </div>
  );
}

function EpisodeTooltip({ x, bar, status }) {
  const title = bar.ep.episode_title.length > 44 ? `${bar.ep.episode_title.slice(0, 44)}…` : bar.ep.episode_title;
  const lines = [
    formatDate(bar.ep.published_at),
    title,
    `Total: ${formatCompactNumber(bar.total)}`,
    `Audio: ${formatCompactNumber(bar.audio)}  ·  YouTube: ${formatCompactNumber(bar.youtube)}`,
  ];
  if (status) lines.push(`${STATUS_ICON[status]} ${status} vs. typical`);

  const boxWidth = 230;
  const boxHeight = lines.length * 14 + 10;
  const clampedX = Math.min(WIDTH - PAD_RIGHT - boxWidth, Math.max(PAD_LEFT, x - boxWidth / 2));

  return (
    <g>
      <rect x={clampedX} y={PAD_TOP} width={boxWidth} height={boxHeight} fill="var(--bg-elev-2)" stroke="var(--line-strong)" />
      {lines.map((line, i) => (
        <text key={i} x={clampedX + 8} y={PAD_TOP + 14 + i * 14} className="chart-tooltip-text">
          {line}
        </text>
      ))}
    </g>
  );
}
