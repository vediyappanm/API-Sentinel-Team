import React, { useState, useMemo } from 'react';
import { RefreshCw, Filter, Download, Calendar } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import { SeverityBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useGovernanceEvents } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapSeverity(s: string): 'critical' | 'major' | 'minor' | 'info' {
  const l = (s || '').toLowerCase();
  if (l === 'critical' || l === 'high') return 'critical';
  if (l === 'major' || l === 'medium') return 'major';
  if (l === 'minor' || l === 'low') return 'minor';
  return 'info';
}

const ApiGovernance: React.FC = () => {
  const [showClosed, setShowClosed] = useState(false);
  const [showAgg, setShowAgg] = useState(true);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (!showClosed) f.status = 'OPEN';
    return f;
  }, [showClosed]);

  const { data, isLoading, isError, refetch } = useGovernanceEvents(page, pageSize, filters);
  const rows = data?.auditDataList ?? [];
  const total = data?.total ?? 0;

  // Severity/status counts
  const counts = useMemo(() => {
    const sev = { critical: 0, major: 0, minor: 0, info: 0 };
    const stat = { Open: 0, 'In Review': 0, Reviewed: 0, Ignored: 0 };
    rows.forEach(r => {
      const s = mapSeverity(r.severity);
      sev[s]++;
      if (r.status === 'OPEN') stat.Open++;
      else if (r.status === 'IN_REVIEW') stat['In Review']++;
      else if (r.status === 'REVIEWED') stat.Reviewed++;
      else if (r.status === 'IGNORED') stat.Ignored++;
    });
    return { sev, stat };
  }, [rows]);

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2 items-center flex-wrap">
          {[['Critical', counts.sev.critical, '#EF4444'], ['Major', counts.sev.major, '#F97316'], ['Minor', counts.sev.minor, '#EAB308'], ['Info', counts.sev.info, '#22C55E']].map(([k, v, c]) => (
            <div key={k as string} className="flex flex-col border-r border-border-subtle pr-4 last:border-0 pl-2">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">{k}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-bold" style={{ color: c as string }}>{k}</span>
                <span className="text-sm font-bold text-text-primary">{v}</span>
              </div>
            </div>
          ))}
          <div className="w-[1px] h-8 bg-border-subtle mx-2" />
          {Object.entries(counts.stat).map(([k, v]) => (
            <div key={k} className="flex flex-col border-r border-border-subtle pr-4 last:border-0 pl-2">
              <span className="text-[10px] text-muted-foreground uppercase font-semibold">{k}</span>
              <div className="flex items-baseline gap-2 text-brand">
                <span className="text-[11px] font-bold">{k}</span>
                <span className="text-sm font-bold text-text-primary">{v}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4">
          <Toggle checked={showClosed} onChange={setShowClosed} label="Show Closed Events" />
          <Toggle checked={showAgg} onChange={setShowAgg} label="Show Aggregation" />
          <button className="flex items-center gap-1.5 rounded-lg bg-bg-surface border border-border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-all outline-none">
            <Filter size={14} /> Filter
          </button>
        </div>
      </div>

      {isError && <QueryError message="Failed to load governance events" onRetry={() => refetch()} />}

      <div className="bg-bg-base border border-border-subtle rounded-lg overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-bg-surface">
          <span className="text-sm font-bold text-text-primary uppercase tracking-tight flex items-center gap-2">API Governance Events <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-1"><Calendar size={10} /> Last 90 days</span></span>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 rounded bg-bg-surface border border-border-subtle px-3 py-1.5 text-xs text-muted-foreground hover:text-text-primary transition-all outline-none">
              <Download size={14} /> Download
            </button>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{page * pageSize + 1} – {Math.min((page + 1) * pageSize, total)} of {total}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">←</button>
                <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">→</button>
              </div>
            </div>
          </div>
        </div>

        {isLoading ? <TableSkeleton columns={9} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-12 text-center">☐</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-24 text-center">Severity</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-[25%]">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-32 text-center">Timestamp↕</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-24 text-center">Event ID</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-28">Sub Category</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-[25%]">Summary</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-24 text-center">Status</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-32">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-4 text-center"><input type="checkbox" className="accent-brand" /></td>
                    <td className="px-4 py-4"><SeverityBadge severity={mapSeverity(row.severity)} /></td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={row.method || 'GET'} />
                        <span className="text-[13px] font-mono text-text-primary truncate">{row.url}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[11px] font-mono text-muted-foreground text-center">{formatTs(row.timestamp)}</td>
                    <td className="px-4 py-4 text-[11px] font-mono text-muted-foreground text-center">{row.eventId}</td>
                    <td className="px-4 py-4 text-xs text-text-primary">{row.subCategory}</td>
                    <td className="px-4 py-4 text-xs text-muted-foreground truncate leading-relaxed" title={row.description}>{row.description}</td>
                    <td className="px-4 py-4 text-center text-xs text-brand font-bold">{row.status === 'OPEN' ? 'Open' : row.status}</td>
                    <td className="px-4 py-4 text-[11px] text-muted-foreground"></td>
                  </tr>
                ))}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-xs text-muted-foreground">No governance events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiGovernance;
