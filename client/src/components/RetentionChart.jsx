import { useRef, useState } from 'react';
import { formatPercent, formatDuration } from '../utils/format';

const WIDTH = 720;
const HEIGHT = 360;
const PAD_LEFT = 52;
const PAD_RIGHT = 20;
const PAD_TOP = 20;
const PAD_BOTTOM = 40;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;
const Y_TICKS = [1, 0.75, 0.5, 0.25, 0];

const STAGES = [
  { key: 'retention_at_point_1', label: 'Start' },
  { key: 'retention_at_first_dropoff', label: '1st dropoff' },
  { key: 'retention_at_second_dropoff', label: '2nd dropoff' },
];

function yFor(v) {
  return PAD_TOP + (1 - v) * PLOT_H;
}

function Gridlines() {
  return Y_TICKS.map((t) => (
    <g key={t}>
      <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={yFor(t)} y2={yFor(t)} stroke="var(--line)" strokeWidth="1" />
      <text x={PAD_LEFT - 8} y={yFor(t) + 3} textAnchor="end" className="chart-tick">
        {Math.round(t * 100)}%
      </text>
    </g>
  ));
}

function FullCurveChart({ curve, episodeLengthSeconds }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const maxPercentile = curve[curve.length - 1].percentile;
  const xFor = (percentile) => PAD_LEFT + ((percentile - 1) / (maxPercentile - 1)) * PLOT_W;

  const episodePath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.percentile).toFixed(1)},${yFor(p.retention).toFixed(1)}`)
    .join(' ');
  const hasBaseline = curve.some((p) => p.baseline_curve !== null && p.baseline_curve !== undefined);
  const baselinePath = hasBaseline
    ? curve
        .filter((p) => p.baseline_curve !== null && p.baseline_curve !== undefined)
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(p.percentile).toFixed(1)},${yFor(p.baseline_curve).toFixed(1)}`)
        .join(' ')
    : null;

  function handleMove(e) {
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const percentile = Math.round(1 + ((relX - PAD_LEFT) / PLOT_W) * (maxPercentile - 1));
    const clamped = Math.min(maxPercentile, Math.max(1, percentile));
    setHoverIndex(clamped - 1);
  }

  const hovered = hoverIndex !== null ? curve[hoverIndex] : null;
  const hoverX = hovered ? xFor(hovered.percentile) : null;

  return (
    <div className="retention-chart">
      <div className="chart-legend">
        <span className="legend-item">
          <span className="legend-line legend-line-solid" />
          This episode
        </span>
        {hasBaseline && (
          <span className="legend-item">
            <span className="legend-line legend-line-dashed" />
            Show baseline
          </span>
        )}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Full retention curve vs show baseline"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <Gridlines />
        <text x={PAD_LEFT} y={HEIGHT - 8} textAnchor="start" className="chart-tick">
          0%
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 8} textAnchor="end" className="chart-tick">
          100% watched
        </text>

        {baselinePath && (
          <path d={baselinePath} fill="none" stroke="var(--fg-dim)" strokeWidth="2" strokeDasharray="4 3" />
        )}
        <path d={episodePath} fill="none" stroke="var(--intent-info)" strokeWidth="2" strokeLinejoin="round" />

        {hovered && (
          <g>
            <line x1={hoverX} x2={hoverX} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke="var(--line-strong)" strokeWidth="1" />
            <circle cx={hoverX} cy={yFor(hovered.retention)} r="4" fill="var(--intent-info)" stroke="var(--bg-elev-1)" strokeWidth="2" />
            {hovered.baseline_curve !== null && hovered.baseline_curve !== undefined && (
              <circle cx={hoverX} cy={yFor(hovered.baseline_curve)} r="4" fill="var(--fg-dim)" stroke="var(--bg-elev-1)" strokeWidth="2" />
            )}
            <TooltipBox x={hoverX} point={hovered} hasBaseline={hasBaseline} episodeLengthSeconds={episodeLengthSeconds} />
          </g>
        )}
      </svg>
    </div>
  );
}

function TooltipBox({ x, point, hasBaseline, episodeLengthSeconds }) {
  const timestamp =
    episodeLengthSeconds !== null && episodeLengthSeconds !== undefined
      ? formatDuration((point.percentile / 100) * episodeLengthSeconds)
      : null;
  const lines = [timestamp || `${point.percentile}% watched`, `This episode: ${formatPercent(point.retention)}`];
  if (hasBaseline && point.baseline_curve !== null && point.baseline_curve !== undefined) {
    lines.push(`Baseline: ${formatPercent(point.baseline_curve)}`);
  }
  const boxWidth = 130;
  const boxHeight = lines.length * 14 + 10;
  const clampedX = Math.min(WIDTH - PAD_RIGHT - boxWidth, Math.max(PAD_LEFT, x - boxWidth / 2));

  return (
    <g>
      <rect x={clampedX} y={PAD_TOP} width={boxWidth} height={boxHeight} fill="var(--bg-elev-2)" stroke="var(--line-strong)" />
      {lines.map((line, i) => (
        <text key={line} x={clampedX + 8} y={PAD_TOP + 14 + i * 14} className="chart-tooltip-text">
          {line}
        </text>
      ))}
    </g>
  );
}

function SummaryChart({ episode }) {
  const [hover, setHover] = useState(null);

  const values = STAGES.map((s) => episode[s.key]);
  if (values.some((v) => v === null || v === undefined)) {
    return <p className="empty-state spec">No retention data for this episode.</p>;
  }

  const nums = values.map(Number);
  const xFor = (i) => PAD_LEFT + (i / (STAGES.length - 1)) * PLOT_W;
  const coords = nums.map((v, i) => [xFor(i), yFor(v)]);
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <div className="retention-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Retention across the episode">
        <Gridlines />
        <path d={path} fill="none" stroke="var(--intent-info)" strokeWidth="2" strokeLinejoin="round" />
        {coords.map(([x, y], i) => (
          <g key={i}>
            <circle
              cx={x}
              cy={y}
              r="14"
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            />
            <circle cx={x} cy={y} r="4" fill="var(--intent-info)" stroke="var(--bg-elev-1)" strokeWidth="2" />
            <text
              x={x}
              y={HEIGHT - 8}
              textAnchor={i === 0 ? 'start' : i === STAGES.length - 1 ? 'end' : 'middle'}
              className="chart-tick"
            >
              {STAGES[i].label}
            </text>
            {hover === i && (
              <g>
                <rect x={x - 28} y={y - 30} width="56" height="20" fill="var(--bg-elev-2)" stroke="var(--line-strong)" />
                <text x={x} y={y - 16} textAnchor="middle" className="chart-tooltip-text">
                  {formatPercent(nums[i])}
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function RetentionChart({ episode }) {
  const curve = episode.retention_curve;
  if (curve && curve.length > 0) {
    return <FullCurveChart curve={curve} episodeLengthSeconds={episode.episode_length_seconds} />;
  }
  return <SummaryChart episode={episode} />;
}
