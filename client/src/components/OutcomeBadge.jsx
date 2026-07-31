const OUTCOME_META = {
  worked: { label: 'Worked', color: 'var(--intent-success)', icon: '▲' },
  did_not_work: { label: "Didn't work", color: 'var(--intent-danger)', icon: '▼' },
  inconclusive: { label: 'Inconclusive', color: 'var(--intent-warning)', icon: '●' },
};

export function OutcomeBadge({ outcome }) {
  const meta = OUTCOME_META[outcome];
  if (!meta) return null;
  return (
    <span className="outcome-badge" style={{ color: meta.color, borderColor: meta.color }}>
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
