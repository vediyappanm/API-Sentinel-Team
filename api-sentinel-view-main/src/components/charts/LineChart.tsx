import React from 'react';
import {
    LineChart as RechartsLineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

interface LineChartProps {
    data: any[];
    lines: { key: string; color: string; label: string }[];
    xKey: string;
    height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-bg-elevated border border-border-subtle p-3 rounded shadow-xl backdrop-blur-md">
                <p className="text-text-primary text-xs mb-2 font-medium">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex gap-2 items-center text-[10px] mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
                        <span className="text-text-secondary">{entry.name}:</span>
                        <span className="text-text-primary font-mono">{entry.value}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

const LineChart: React.FC<LineChartProps> = ({ data, lines, xKey, height = 240 }) => {
    return (
        <div className="w-full" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1F2D3D" vertical={false} />
                    <XAxis
                        dataKey={xKey}
                        stroke="#4B5563"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        dy={10}
                    />
                    <YAxis
                        stroke="#4B5563"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value}`}
                    />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#2D3D50', strokeWidth: 1, strokeDasharray: '3 3' }} />
                    {lines.map((line, i) => (
                        <Line
                            key={i}
                            type="monotone"
                            dataKey={line.key}
                            name={line.label}
                            stroke={line.color}
                            strokeWidth={2.5}
                            dot={{ r: 3, fill: '#0A0F1E', stroke: line.color, strokeWidth: 2 }}
                            activeDot={{ r: 5, fill: line.color, strokeWidth: 0 }}
                        />
                    ))}
                </RechartsLineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default LineChart;
