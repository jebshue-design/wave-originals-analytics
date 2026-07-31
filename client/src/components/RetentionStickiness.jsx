import { formatDuration } from '../utils/format';
import { InfoTip } from './InfoTip';

const EXPLANATION =
  "Computed from each of this show's episodes' own retention curve — the point where the steep early drop-off bends into a much slower, longer decline (the curve's \"elbow\") — then averaged across episodes.";

export function RetentionStickiness({ showName, data }) {
  if (!data) return null;

  const retentionPct = (data.retention * 100).toFixed(0);
  const minuteMark = formatDuration(data.estimatedSeconds);

  return (
    <div className="insight-tip">
      <span className="spec insight-tip-label">
        Stickiest point
        <InfoTip text={EXPLANATION} />
      </span>
      <p>
        On average, this show's steepest drop-off happens in the first <strong>{data.percentile}%</strong> of an
        episode{minuteMark && (
          <>
            {' '}
            (around <strong>{minuteMark}</strong> in for a typical <strong className="stickiness-show-name">{showName}</strong>{' '}
            episode)
          </>
        )}
        . By then, only about <strong>{retentionPct}%</strong> of viewers are still watching — but from that point
        on, the drop-off eases up considerably, so most of the loss for the episode has already happened.
      </p>
    </div>
  );
}
