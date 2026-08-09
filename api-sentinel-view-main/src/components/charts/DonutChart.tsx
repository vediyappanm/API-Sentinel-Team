import React from 'react';
import { PieChart, Pie, Cell, Tooltip, Sector } from 'recharts';

interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  centerValue?: number | string;
  centerLabel?: string;
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  animated?: boolean;
}

interface DonutTooltipPayload {
  name?: string;
  value?: number | string;
  payload?: { color?: string };
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: DonutTooltipPayload[];
}

const CustomTooltip = ({ active, payload }: DonutTooltipProps) => {
  if (active && payload && payload.length) {
    const d = payload[0];
    return (
      <div className="glass-card-premium px-3 py-2 rounded-lg shadow-xl">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-full" style={{ background: d.payload.color }} />
          <span style={{ color: 'var(--evd-ink-muted, var(--text-secondary))' }}>{d.name}:</span>
          <span className="font-mono font-bold" style={{ color: 'var(--evd-paper, var(--text-primary))' }}>{d.value}</span>
        </div>
      </div>
    );
  }
  return null;
};

interface ActiveShapeProps {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
}

const renderActiveShape = (props: unknown) => {
  const { cx = 0, cy = 0, innerRadius = 0, outerRadius = 0, startAngle = 0, endAngle = 0, fill = '#E4E4EC' } = props as ActiveShapeProps;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius - 2}
      outerRadius={outerRadius + 3}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      style={{ filter: `drop-shadow(0 0 8px ${fill}60)` }}
    />
  );
};

const DonutChart: React.FC<DonutChartProps> = ({
  data,
  centerValue,
  centerLabel,
  size = 120,
  innerRadius = 38,
  outerRadius = 55,
  showLegend = false,
  animated = true,
}) => {
  const [activeIndex, setActiveIndex] = React.useState<number | undefined>(undefined);
  const total = data.reduce((s, d) => s + d.value, 0);
  const displayValue = centerValue ?? total;

  return (
    <div className="flex flex-col items-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <PieChart width={size} height={size}>
          <Pie
            data={total === 0 ? [{ name: 'empty', value: 1 }] : data}
            cx={size / 2}
            cy={size / 2}
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            dataKey="value"
            strokeWidth={0}
            activeIndex={activeIndex}
            activeShape={renderActiveShape}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(undefined)}
            animationBegin={0}
            animationDuration={animated ? 800 : 0}
            animationEasing="ease-out"
          >
            {total === 0
              ? <Cell fill="#E4E4EC" />
              : data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))
            }
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
        {/* Center value */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="text-xl font-bold font-mono leading-none tabular-nums"
            style={{ color: 'var(--evd-paper, var(--text-primary))' }}
          >
            {displayValue}
          </span>
          {centerLabel && (
            <span className="text-[9px] mt-0.5" style={{ color: 'var(--evd-ink-muted, var(--text-muted))' }}>{centerLabel}</span>
          )}
        </div>
      </div>
      {/* Legend */}
      {showLegend && (
        <div className="mt-3 space-y-1.5 w-full flex flex-col items-center">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs w-full max-w-[140px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                <span style={{ color: 'var(--evd-ink-muted, var(--text-secondary))' }}>{d.name}</span>
              </div>
              <span className="font-mono tabular-nums" style={{ color: 'var(--evd-paper, var(--text-primary))' }}>{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DonutChart;
