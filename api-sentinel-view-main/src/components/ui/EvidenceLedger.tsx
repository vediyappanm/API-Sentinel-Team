import React from 'react';
import type { LucideIcon } from 'lucide-react';

/** The KPI ledger strip: a hairline-gridded row of metric cells, replacing
 * the rounded MetricWidget tile grid. Wrap LedgerItems in a div with
 * className="evd-ledger". */
export const EvidenceLedgerItem: React.FC<{
  icon: LucideIcon;
  color: string;
  label: string;
  value: number;
  suffix?: string;
  delta?: number;
}> = ({ icon: Icon, color, label, value, suffix = '', delta }) => (
  <div className="evd-ledger-item">
    <div className="evd-ledger-label">
      <Icon size={12} style={{ color }} />
      {label}
    </div>
    <div className="evd-ledger-value tabular-nums">
      {value.toLocaleString()}
      {suffix}
    </div>
    {delta !== undefined && (
      <div
        className="evd-ledger-delta tabular-nums"
        style={{ color: delta >= 0 ? 'var(--evd-low)' : 'var(--evd-critical)' }}
      >
        {delta >= 0 ? '+' : ''}
        {delta}% / 7d
      </div>
    )}
  </div>
);

export default EvidenceLedgerItem;
