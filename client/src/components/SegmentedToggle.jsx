import { useLayoutEffect, useRef, useState } from 'react';

export function SegmentedToggle({ options, value, onChange }) {
  const containerRef = useRef(null);
  const [thumbStyle, setThumbStyle] = useState(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const activeButton = container.querySelector(`[data-value="${value}"]`);
    if (!activeButton) return;
    setThumbStyle({ left: activeButton.offsetLeft, width: activeButton.offsetWidth });
  }, [value, options]);

  return (
    <div className="segmented-toggle" ref={containerRef}>
      {thumbStyle && <div className="segmented-toggle-thumb" style={thumbStyle} />}
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          data-value={option.value}
          className={value === option.value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
