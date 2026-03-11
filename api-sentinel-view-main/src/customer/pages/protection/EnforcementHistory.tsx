import React, { useState, useMemo } from 'react';
import { RefreshCw, Calendar } from 'lucide-react';
import { SeverityBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useSecurityEvents } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapSev(s: string): 'critical' | 'major' | 'medium' | 'low' | 'info' {
  const l = (s || '').toLowerCase();
  if (l === 'critical' || l === 'high') return 'critical';
  if (l === 'major' || l === 'medium') return 'major';
  if (l === 'minor' || l === 'low') return 'low';
  return 'info';
}

const EnforcementHistory: React.FC = () => {
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const startTs = useMemo(() => Math.floor((Date.now() - 90 * 86400_000) / 1000), []);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { data, isLoading, isError, refetch } = useSecurityEvents(page, pageSize, 'timestamp', -1, undefined, startTs, endTs);
  const rows = data?.maliciousEvents ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider flex items-center gap-2">
          Enforcement History
          <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-1"><Calendar size={10} /> Last 90 days</span>
        </h2>
        <div className="flex items-center gap-3">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['protection'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{total > 0 ? `${page * pageSize + 1}-${Math.min((page + 1) * pageSize, total)}` : '0'} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">←</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">→</button>
            </div>
          </div>
        </div>
      </div>

      {isError && <QueryError message="Failed to load enforcement history" onRetry={() => refetch()} />}

      <div className="bg-bg-base border border-border-subtle rounded-lg flex flex-col min-h-[400px]">
        {isLoading ? <TableSkeleton columns={6} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Severity</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Action</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3"><SeverityBadge severity={mapSev(row.severity)} /></td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded text-[#EF4444] bg-[#EF4444]/10 border border-[#EF4444]/20">Blocked</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MethodBadge method={row.method || 'GET'} />
                        <span className="text-[13px] font-mono text-text-primary truncate">{row.url}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-primary">{row.category || row.filterId || '-'}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-muted-foreground">{formatTs(row.timestamp)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[200px]">{'-'}</td>
                  </tr>
                ))}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-xs text-muted-foreground">No enforcement actions found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnforcementHistory;
