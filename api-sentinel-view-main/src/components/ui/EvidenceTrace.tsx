import React, { useMemo } from 'react';

const TRACE_WIDTH = 600;
const TRACE_PADDING = { top: 12, right: 8, bottom: 20, left: 8 } as const;

/** Bespoke SVG trace — a terminal-readout line chart, replacing the rounded
 * gradient-fill area chart: a thin traced line with tick marks and a
 * data-point readout, closer to an oscilloscope trace than a SaaS chart. */
export const EvidenceTrace: React.FC<{
  data: { date: string; value: number }[];
  color: string;
  height?: number;
}> = ({ data, color, height = 180 }) => {
  const { path, points } = useMemo(() => {
    if (data.length === 0) return { path: '', points: [] as Array<{ x: number; y: number; date: string; value: number }> };
    const max = Math.max(...data.map((d) => d.value), 1);
    const innerW = TRACE_WIDTH - TRACE_PADDING.left - TRACE_PADDING.right;
    const innerH = height - TRACE_PADDING.top - TRACE_PADDING.bottom;
    const step = data.length > 1 ? innerW / (data.length - 1) : 0;
    const pts = data.map((d, i) => ({
      x: TRACE_PADDING.left + i * step,
      y: TRACE_PADDING.top + innerH - (d.value / max) * innerH,
      ...d,
    }));
    const p = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    return { path: p, points: pts };
  }, [data, height]);

  if (data.length === 0) {
    return (
      <div
        className="evd-mono flex items-center justify-center text-xs"
        style={{ height, color: 'var(--evd-ink-muted)', border: '1px dashed var(--evd-line)' }}
      >
        NO SIGNAL — awaiting traffic
      </div>
    );
  }

  return (
    <svg viewBox={`0 0 ${TRACE_WIDTH} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Trend">
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={TRACE_PADDING.left}
          x2={TRACE_WIDTH - TRACE_PADDING.right}
          y1={TRACE_PADDING.top + (height - TRACE_PADDING.top - TRACE_PADDING.bottom) * f}
          y2={TRACE_PADDING.top + (height - TRACE_PADDING.top - TRACE_PADDING.bottom) * f}
          stroke="var(--evd-line)"
          strokeWidth={1}
        />
      ))}
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {points.map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r={2} fill={color} />
      ))}
      {points.map(
        (pt, i) =>
          (i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)) && (
            <text
              key={`label-${i}`}
              x={pt.x}
              y={height - 4}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize={9}
              fontFamily="'IBM Plex Mono', monospace"
              fill="var(--evd-ink-muted)"
            >
              {pt.date}
            </text>
          ),
      )}
    </svg>
  );
};

export default EvidenceTrace;
