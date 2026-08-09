import React from 'react';

/** A quiet key/value line — for lists of stats inside a panel. */
export const EvidenceStatLine: React.FC<{
  label: string;
  value: React.ReactNode;
  dot?: string;
}> = ({ label, value, dot }) => (
  <div className="evd-row" style={{ padding: '6px 0' }}>
    <div className="flex items-center gap-2">
      {dot && (
        <span
          style={{ width: 6, height: 6, borderRadius: 1, background: dot, display: 'inline-block' }}
        />
      )}
      <span className="text-xs" style={{ color: 'var(--evd-ink)' }}>
        {label}
      </span>
    </div>
    <span className="evd-mono text-sm font-bold tabular-nums" style={{ color: 'var(--evd-paper)' }}>
      {value}
    </span>
  </div>
);

/** A horizontal bar reading, like a tactic-frequency line in an incident report. */
export const EvidenceBarLine: React.FC<{ label: string; value: number; max: number }> = ({
  label,
  value,
  max,
}) => (
  <div style={{ marginBottom: 10 }}>
    <div className="evd-row" style={{ marginBottom: 4 }}>
      <span className="text-[11px] truncate" style={{ color: 'var(--evd-ink)', maxWidth: 160 }}>
        {label}
      </span>
      <span className="evd-mono text-[11px] font-bold tabular-nums" style={{ color: 'var(--evd-signal)' }}>
        {value}
      </span>
    </div>
    <div style={{ height: 3, background: 'var(--evd-line)', borderRadius: 1, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%',
          width: `${max > 0 ? (value / max) * 100 : 0}%`,
          background: 'var(--evd-signal)',
          transition: 'width 0.6s ease',
        }}
      />
    </div>
  </div>
);

/** Severity/status chip in the evidence language — pass a CSS color as
 * `style={{ color }}` (it uses currentColor for border/background tint). */
export const EvidenceBadge: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <span className="evd-badge" style={{ color }}>
    {children}
  </span>
);
