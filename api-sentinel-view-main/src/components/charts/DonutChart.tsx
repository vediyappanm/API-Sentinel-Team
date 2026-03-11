import React from 'react';
import { PieChart, Pie, Cell, Tooltip } from 'recharts';

interface DonutChartProps {
  data: { name: string; value: number; color: string }[];
  centerValue?: number | string;
  size?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
}

const DonutChart: React.FC<DonutChartProps> = ({
  data,
  centerValue,
  size = 120,
  innerRadius = 38,
  outerRadius = 55,
  showLegend = false
}) => {
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
          >
            {total === 0
              ? <Cell fill="#1F2D3D" />
              : data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))
            }
          </Pie>
        </PieChart>
        {/* Center value */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-text-primary font-mono leading-none">
            {displayValue}
          </span>
        </div>
      </div>
      {/* Legend */}
      {showLegend && (
        <div className="mt-2 space-y-1 w-full flex flex-col items-center">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-xs w-full max-w-[120px]">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
                <span className="text-text-secondary">{d.name}</span>
              </div>
              <span className="text-text-primary font-mono">{d.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DonutChart;
