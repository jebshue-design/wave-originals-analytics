export function InfoTip({ text }) {
  if (!text) return null;
  return (
    <span className="info-tip" tabIndex={0} data-tooltip={text}>
      ⓘ
    </span>
  );
}
