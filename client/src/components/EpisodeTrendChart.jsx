import { useRef, useState } from 'react';
import { formatCompactNumber, formatDate } from '../utils/format';
import { trendStatus } from '../utils/stats';
import { metricLabel } from '../config/metrics';

const WIDTH = 720;
const HEIGHT = 280;
const PAD_LEFT = 56;
const PAD_RIGHT = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 36;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const MAX_EPISODES = 10;
const Y_TICK_COUNT = 4;

// Same good/average/bad vocabulary and colors as TrendIndicator elsewhere in
// the app — paired with a distinct shape per status (not color alone), same
// reasoning as the ▲/●/▼ glyphs used there.
const STATUS_COLOR_VAR = {
  good: 'var(--intent-success)',
  average: 'var(--intent-warning)',
  bad: 'var(--intent-danger)',
};
const STATUS_ICON = { good: '▲', average: '●', bad: '▼' };

export function EpisodeTrendChart({ episodes, trailingBaselines, currentBaseline, metricKey = 'total_performance_combined' }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const recent = [...episodes]
    .filter((ep) => ep.published_at && ep[metricKey] !== null && ep[metricKey] !== undefined)
    .sort((a, b) => new Date(a.published_at) - new Date(b.published_at))
    .slice(-MAX_EPISODES);

  if (recent.length < 2) {
    return <p className="empty-state spec">Not enough recent episodes yet to chart a trend.</p>;
  }

  const baselineValue =
    currentBaseline?.[metricKey] !== null && currentBaseline?.[metricKey] !== undefined
      ? Number(currentBaseline[metricKey])
      : null;
  const values = recent.map((ep) => Number(ep[metricKey]));
  const maxValue = Math.max(...values, baselineValue || 0);
  const yMax = maxValue * 1.15 || 1; // headroom so the top point/line isn't clipped

  function yFor(v) {
    return PAD_TOP + (1 - v / yMax) * PLOT_H;
  }
  function xFor(i) {
    return recent.length === 1 ? PAD_LEFT + PLOT_W / 2 : PAD_LEFT + (i / (recent.length - 1)) * PLOT_W;
  }

  const yTicks = Array.from({ length: Y_TICK_COUNT + 1 }, (_, i) => (yMax / Y_TICK_COUNT) * i);

  const linePath = recent
    .map((ep, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(Number(ep[metricKey])).toFixed(1)}`)
    .join(' ');

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let minDist = Infinity;
    recent.forEach((_, i) => {
      const dist = Math.abs(xFor(i) - relX);
      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  const hovered = hoverIndex !== null ? recent[hoverIndex] : null;
  const hoverBaseline = hovered ? trailingBaselines?.get(hovered.episode_id)?.[metricKey] : null;
  const hoverStatus = hovered ? trendStatus(hovered[metricKey], hoverBaseline) : null;

  return (
    <div className="retention-chart">
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-line legend-line-solid" />
          {metricLabel(metricKey)}
        </span>
        {baselineValue !== null && (
          <span className="legend-item">
            <span className="legend-line legend-line-dashed" />
            Current baseline
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`${metricLabel(metricKey)} across the last ${recent.length} episodes`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
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

        {baselineValue !== null && (
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={yFor(baselineValue)}
            y2={yFor(baselineValue)}
            stroke="var(--fg-dim)"
            strokeWidth="2"
            strokeDasharray="4 3"
          />
        )}

        <path d={linePath} fill="none" stroke="var(--intent-info)" strokeWidth="2" strokeLinejoin="round" />

        {recent.map((ep, i) => {
          const baseline = trailingBaselines?.get(ep.episode_id)?.[metricKey];
          const status = trendStatus(ep[metricKey], baseline);
          const color = status ? STATUS_COLOR_VAR[status] : 'var(--intent-info)';
          return (
            <circle
              key={ep.episode_id}
              cx={xFor(i)}
              cy={yFor(Number(ep[metricKey]))}
              r={i === hoverIndex ? 6 : 4}
              fill={color}
              stroke="var(--bg-elev-1)"
              strokeWidth="2"
            />
          );
        })}

        {hovered && (
          <g>
            <line
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            <EpisodeTooltip
              x={xFor(hoverIndex)}
              episode={hovered}
              metricKey={metricKey}
              status={hoverStatus}
            />
          </g>
        )}
      </svg>
    </div>
  );
}

function EpisodeTooltip({ x, episode, metricKey, status }) {
  const title =
    episode.episode_title.length > 44 ? `${episode.episode_title.slice(0, 44)}…` : episode.episode_title;
  const lines = [formatDate(episode.published_at), title, `${metricLabel(metricKey)}: ${formatCompactNumber(episode[metricKey])}`];
  if (status) lines.push(`${STATUS_ICON[status]} ${status} vs. typical`);

  const boxWidth = 210;
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
