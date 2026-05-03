import React, { useMemo } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import GlassCard from '@/components/ui/GlassCard';
import { get } from '@/lib/api-client';

interface SensitiveDataSummary {
  total: number;
  by_type: Record<string, number>;
  by_severity: { HIGH: number; MEDIUM: number; LOW: number };
}

interface SensitiveDataFinding {
  data_type: string;
  severity: string;
}

interface SensitiveDataFeed {
  total: number;
  findings: SensitiveDataFinding[];
}

async function fetchSensitiveDataSummary(): Promise<SensitiveDataSummary> {
  const feed = await get<SensitiveDataFeed>('/pii/findings?limit=100');
  const summary: SensitiveDataSummary = {
    total: 0,
    by_type: {},
    by_severity: { HIGH: 0, MEDIUM: 0, LOW: 0 },
  };

  for (const finding of feed.findings ?? []) {
    const type = (finding.data_type || 'UNKNOWN').toLowerCase();
    const severity = (finding.severity || 'LOW').toUpperCase() as keyof SensitiveDataSummary['by_severity'];
    summary.total += 1;
    summary.by_type[type] = (summary.by_type[type] ?? 0) + 1;
    if (severity in summary.by_severity) {
      summary.by_severity[severity] += 1;
    }
  }

  return summary;
}

const MOCK_DATA: SensitiveDataSummary = {
  total: 14,
  by_type: { email: 6, credit_card: 3, ssn: 2, bearer_token: 2, aws_key: 1 },
  by_severity: { HIGH: 5, MEDIUM: 7, LOW: 2 },
};

const TYPE_COLORS: Record<string, string> = {
  email: '#3B82F6',
  credit_card: '#EF4444',
  ssn: '#F97316',
  bearer_token: '#632CA6',
  aws_key: '#EAB308',
  phone: '#22C55E',
  private_key: '#EC4899',
};

const SEV_COLORS = { HIGH: '#EF4444', MEDIUM: '#F97316', LOW: '#EAB308' };

interface Props {
  accountId?: string | number;
}

const SensitiveDataWidget: React.FC<Props> = () => {
  const { data, isLoading, isError, refetch } = useQuery<SensitiveDataSummary>({
    queryKey: ['sensitive-data-summary'],
    queryFn: fetchSensitiveDataSummary,
    retry: 1,
  });

  const summary = isError || !data ? MOCK_DATA : data;

  const typeEntries = useMemo(
    () => Object.entries(summary.by_type).sort((a, b) => b[1] - a[1]),
    [summary],
  );
  const maxType = typeEntries[0]?.[1] ?? 1;

  const sevEntries = Object.entries(summary.by_severity) as [keyof typeof SEV_COLORS, number][];

  return (
    <GlassCard variant="default" className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sev-critical/10 flex items-center justify-center">
            <Shield size={14} className="text-sev-critical" />
          </div>
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
            Sensitive Data Exposures
          </span>
        </div>
        <button
          onClick={() => refetch()}
          className="w-6 h-6 rounded-md border border-border-subtle flex items-center justify-center text-text-muted hover:text-brand transition-all"
        >
          <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Total + Severity */}
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-2xl font-black text-sev-critical tabular-nums">{summary.total}</p>
          <p className="text-[10px] text-text-muted uppercase tracking-wider">Total</p>
        </div>
        <div className="flex-1 space-y-1.5">
          {sevEntries.map(([sev, count]) => (
            <div key={sev} className="flex items-center gap-2">
              <span className="text-[10px] font-bold w-12" style={{ color: SEV_COLORS[sev] }}>
                {sev}
              </span>
              <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${summary.total > 0 ? (count / summary.total) * 100 : 0}%`,
                    background: SEV_COLORS[sev],
                  }}
                />
              </div>
              <span className="text-[10px] font-bold text-text-primary tabular-nums w-4 text-right">
                {count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* By type */}
      <div>
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
          By Type
        </p>
        <div className="space-y-1.5">
          {typeEntries.map(([type, count]) => {
            const color = TYPE_COLORS[type] ?? '#6B7280';
            return (
              <div key={type} className="flex items-center gap-2">
                <div
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ background: color }}
                />
                <span className="text-[11px] text-text-secondary flex-1 capitalize">
                  {type.replace('_', ' ')}
                </span>
                <div className="w-20 h-1 bg-bg-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${(count / maxType) * 100}%`, background: color }}
                  />
                </div>
                <span className="text-[11px] font-bold text-text-primary tabular-nums w-4 text-right">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {isError && (
        <p className="text-[10px] text-text-muted text-center">
          Showing sample data — backend endpoint not yet available.
        </p>
      )}
    </GlassCard>
  );
};

export default SensitiveDataWidget;
