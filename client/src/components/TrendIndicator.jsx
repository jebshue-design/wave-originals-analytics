import { trendStatus } from '../utils/stats';

const ICONS = { good: '▲', average: '●', bad: '▼' };
const PHRASES = {
  good: "better than what's typical for this show over the trailing 3 months",
  average: "in line with what's typical for this show over the trailing 3 months",
  bad: "below what's typical for this show over the trailing 3 months",
};

export function TrendIndicator({ value, baseline }) {
  const status = trendStatus(value, baseline);
  if (!status) return null;

  return (
    <span className={`trend-indicator ${status}`} title={PHRASES[status]}>
      {ICONS[status]}
    </span>
  );
}
