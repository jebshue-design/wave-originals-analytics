import { useState } from 'react';
import {
  computeCorrelationsWithTarget,
  correlationStrength,
  correlationExplanation,
  topCorrelatesSummary,
  topCorrelatesExamples,
  TARGET_METRIC_OPTIONS,
} from '../utils/correlation';
import { metricDescription } from '../config/metrics';
import { InfoTip } from './InfoTip';
import { SegmentedToggle } from './SegmentedToggle';
import { RetentionStickiness } from './RetentionStickiness';

export function CorrelationPanel({ episodes, showName, retentionStickiness }) {
  const [targetKey, setTargetKey] = useState(TARGET_METRIC_OPTIONS[0].key);
  const correlations = computeCorrelationsWithTarget(episodes, targetKey);
  const targetOption = TARGET_METRIC_OPTIONS.find((o) => o.key === targetKey);
  const quickSummary = topCorrelatesSummary(correlations, targetOption.label);
  const examples = topCorrelatesExamples(episodes, correlations, targetKey);

  return (
    <div className="correlation-panel">
      <div className="correlation-header">
        <p className="spec correlation-target">What correlates with</p>
        <SegmentedToggle options={TARGET_METRIC_OPTIONS.map((o) => ({ value: o.key, label: o.label }))} value={targetKey} onChange={setTargetKey} />
      </div>

      <p className="correlation-explainer">
        <strong>{targetOption.label}</strong> measures {targetOption.framing}.
      </p>

      {targetKey === 'avg_watch_pct' && <RetentionStickiness showName={showName} data={retentionStickiness} />}

      <div className="insight-tip">
        <span className="spec insight-tip-label">Reading the two together</span>
        <p>
          <strong>The Payoff</strong> is high but <strong>The Hook</strong> is low: the content worked — people who
          found it stayed. The miss is likely the thumbnail, title, or posting time, not the episode itself.
        </p>
        <p>
          The reverse — strong clicks but people don't stick around — means the hook worked but the episode didn't
          deliver on it. Worth a look at pacing, the guest, or the format.
        </p>
      </div>

      <p className="correlation-explainer">
        The rows below rank every other metric by how closely it moves together with{' '}
        <strong>{targetOption.label}</strong> across this show's episodes. Longer bars mean a clearer relationship;
        blue = moves in the same direction, red = moves in the opposite direction. With a small number of episodes,
        treat these as directional hints, not proof.
      </p>

      {quickSummary && (
        <div className="correlation-summary-tip">
          <span className="spec insight-tip-label">Quick summary</span>
          <p>
            {quickSummary}
            {examples.length > 0 && (
              <>
                {' '}
                <span
                  className="correlation-summary-examples-trigger"
                  tabIndex={0}
                  data-tooltip={examples.join(' · ')}
                >
                  for example
                </span>
                .
              </>
            )}
          </p>
        </div>
      )}

      {correlations.length === 0 ? (
        <p className="empty-state spec">Not enough data yet to compute correlations for this show.</p>
      ) : (
        <ul className="correlation-list" key={targetKey}>
          {correlations.map((c, index) => (
            <li key={c.metric.key} className="correlation-row">
              <div className="correlation-labels">
                <span className="correlation-pair">
                  {c.metric.label}
                  <InfoTip text={metricDescription(c.metric.key)} />
                </span>
                <span
                  className="spec correlation-meta"
                  tabIndex={0}
                  data-tooltip={`${correlationExplanation(c.metric.key, c.r, targetOption.label)} (Pearson r = ${c.r.toFixed(2)})`}
                >
                  {correlationStrength(c.r)} {c.r >= 0 ? 'positive' : 'negative'} · {c.n} episodes
                </span>
              </div>
              <div className="correlation-bar-track">
                <div className="correlation-bar-zero" />
                <div
                  className={`correlation-bar ${c.r >= 0 ? 'positive' : 'negative'} bar-grow`}
                  style={{
                    ...(c.r >= 0 ? { left: '50%' } : { right: '50%' }),
                    '--bar-width': `${Math.abs(c.r) * 50}%`,
                    animationDelay: `${Math.min(index * 40, 320)}ms`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
