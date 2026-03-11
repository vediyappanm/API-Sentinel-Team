import React, { useState, useMemo } from 'react';
import { RefreshCw, Download, Filter, Calendar } from 'lucide-react';
import { Toggle } from '@/components/shared/Toggle';
import TimeFilter from '@/components/shared/TimeFilter';
import SummaryPanel from '@/components/shared/SummaryPanel';
import DonutChart from '@/components/charts/DonutChart';
import CarouselCard from '@/components/shared/CarouselCard';
import { SeverityBadge, MethodBadge } from '@/components/shared/Badges';
import LineChart from '@/components/charts/LineChart';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useSecurityEvents, useSeverityCount, useThreatCategoryCount } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  // epoch > 1e10 means already in milliseconds, otherwise convert from seconds
  const d = new Date(epoch > 1e10 ? epoch : epoch * 1000);
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

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const SecurityEvents: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [showResolved, setShowResolved] = useState(false);
  const [showAgg, setShowAgg] = useState(true);
  const [activeTab, setActiveTab] = useState<'total' | 'blocked' | 'successful'>('total');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days === 1 ? 90 : 7), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { data, isLoading, isError, refetch } = useSecurityEvents(page, pageSize, 'timestamp', -1, undefined, startTs, endTs);
  const sevCount = useSeverityCount(startTs, endTs);
  const catCount = useThreatCategoryCount(startTs, endTs);

  const rows = data?.maliciousEvents ?? [];
  const total = data?.total ?? 0;

  const sev = sevCount.data?.severityCount ?? {};
  const severityData = [
    { name: 'Critical', value: sev['CRITICAL'] ?? sev['HIGH'] ?? 0, color: '#EF4444' },
    { name: 'Major', value: sev['MEDIUM'] ?? 0, color: '#F97316' },
    { name: 'Minor', value: sev['LOW'] ?? 0, color: '#EAB308' },
    { name: 'Info', value: sev['INFO'] ?? 0, color: '#22C55E' },
  ];
  const sevTotal = severityData.reduce((s, d) => s + d.value, 0);

  const cats = catCount.data?.categoryCount ?? {};
  const categoriesItems = [
    <div key="1" className="flex flex-col gap-2 font-mono mt-4 text-[10px]">
      {Object.entries(cats).slice(0, 5).map(([k, v]) => (
        <div key={k} className="flex justify-between items-center">
          <span className="text-text-primary">{k}</span>
          <span className="text-brand font-bold">{v}</span>
        </div>
      ))}
      {Object.keys(cats).length === 0 && <span className="text-muted-foreground">No data</span>}
    </div>
  ];

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-end gap-3 mb-2">
        <button onClick={() => qc.invalidateQueries({ queryKey: ['protection'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <Toggle checked={showResolved} onChange={setShowResolved} label="Show Resolved Events" />
        <Toggle checked={showAgg} onChange={setShowAgg} label="Show Aggregation" />
        <TimeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      <SummaryPanel>
        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[320px] flex flex-col justify-center">
          <span className="text-muted-foreground text-xs font-medium mb-1">Total Security Events</span>
          <span className="text-3xl font-bold font-display text-text-primary mb-4 mt-1">{total}</span>
          <div className="grid grid-cols-2 gap-y-3 mt-auto">
            <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Blocked</span><span className="text-[#EF4444] font-mono font-bold">-</span></div>
            <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Client (4XX)</span><span className="text-[#F97316] font-mono font-bold">-</span></div>
            <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Successful (200)</span><span className="text-[#22C55E] font-mono font-bold">-</span></div>
            <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Server (5XX)</span><span className="text-[#EF4444] font-mono font-bold">-</span></div>
          </div>
        </div>

        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[150px] flex flex-col items-center">
          <span className="text-xs text-muted-foreground font-medium w-full text-left mb-2">Severity</span>
          <DonutChart data={severityData} centerValue={sevTotal} size={110} innerRadius={34} outerRadius={50} />
        </div>

        <div className="min-w-[180px]">
          <CarouselCard title="Top Event Categories" items={categoriesItems} />
        </div>
      </SummaryPanel>

      {isError && <QueryError message="Failed to load security events" onRetry={() => refetch()} />}

      <div className="bg-bg-base border border-border-subtle rounded-lg flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between text-text-primary">
          <span className="text-xs font-semibold flex items-center gap-2">
            Events List <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-text-muted flex items-center gap-1"><Calendar size={10} /> Last 90 days</span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">←</button>
                <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">→</button>
              </div>
            </div>
            <button className="flex items-center gap-1.5 rounded bg-bg-surface border border-border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover cursor-pointer outline-none transition-colors">
              <Filter size={14} /> Filter
            </button>
          </div>
        </div>

        {isLoading ? <TableSkeleton columns={10} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-10">☐</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-20">Severity</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-24">Action</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-64">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32">Timestamp↕</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-24">Event ID</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32">Category</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32">Sub Category</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-bg-hover transition-colors">
                    <td className="px-4 py-3"><input type="checkbox" className="accent-brand" /></td>
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
                    <td className="px-4 py-3 text-[11px] font-mono text-text-muted">{formatTs(row.timestamp)}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-text-muted">{row.id?.substring(0, 8)}</td>
                    <td className="px-4 py-3 text-xs text-text-primary">{row.category || row.filterId || '-'}</td>
                    <td className="px-4 py-3 text-xs text-text-primary">{row.subCategory || '-'}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary truncate max-w-[200px]">{row.description || '-'}</td>
                  </tr>
                ))}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-xs text-muted-foreground">No security events found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityEvents;
