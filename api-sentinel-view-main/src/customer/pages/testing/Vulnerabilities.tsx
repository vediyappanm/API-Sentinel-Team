import React, { useState, useMemo } from 'react';
import { RefreshCw, Download, Zap, Filter } from 'lucide-react';
import SummaryPanel from '@/components/shared/SummaryPanel';
import TimeFilter from '@/components/shared/TimeFilter';
import { Toggle } from '@/components/shared/Toggle';
import LineChart from '@/components/charts/LineChart';
import DonutChart from '@/components/charts/DonutChart';
import CarouselCard from '@/components/shared/CarouselCard';
import { SeverityBadge, StatusBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useVulnerabilities, useIssueSummary, useIssuesTrend } from '@/hooks/use-testing';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapSev(s: string): 'critical' | 'high' | 'medium' | 'low' | 'info' {
  const l = (s || '').toLowerCase();
  if (l === 'critical') return 'critical';
  if (l === 'high') return 'high';
  if (l === 'medium') return 'medium';
  if (l === 'low') return 'low';
  return 'info';
}

function mapStatus(s: string): string {
  switch ((s || '').toUpperCase()) {
    case 'OPEN': return 'Open';
    case 'FIXED': return 'Resolved';
    case 'FALSE_POSITIVE': return 'FP';
    case 'IGNORED': return 'Ignored';
    default: return s || 'Open';
  }
}

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const Vulnerabilities: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [showResolved, setShowResolved] = useState(false);
  const [showAgg, setShowAgg] = useState(true);
  const [chartTab, setChartTab] = useState<'total' | 'open' | 'resolved'>('total');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const filters = useMemo(() => {
    const f: Record<string, unknown> = {};
    if (!showResolved) f.issueStatus = ['OPEN', 'FALSE_POSITIVE'];
    return f;
  }, [showResolved]);

  const { data, isLoading, isError, refetch } = useVulnerabilities(page, pageSize, filters, 'creationTime', -1);
  const summary = useIssueSummary();
  const trend = useIssuesTrend(startTs, endTs);

  const rows = data?.issues ?? [];
  const total = data?.totalIssuesCount ?? 0;
  const sm = summary.data;

  const totalIssues = sm?.totalIssues ?? 0;
  const openIssues = sm?.openIssues ?? 0;
  const fixedIssues = sm?.fixedIssues ?? 0;

  const severityData = useMemo(() => {
    const b = sm?.severityBreakdown || {};
    return [
      { name: 'Critical', value: b['CRITICAL'] ?? 0, color: '#EF4444' },
      { name: 'Major', value: b['HIGH'] ?? 0, color: '#F97316' },
      { name: 'Minor', value: b['MEDIUM'] ?? 0, color: '#EAB308' },
      { name: 'Info', value: b['LOW'] ?? 0, color: '#22C55E' },
    ];
  }, [sm]);

  const timelineData = useMemo(() => {
    const t = trend.data?.issuesTrend;
    if (t && t.length > 0) {
      return t.map(d => ({
        date: new Date(d.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: d.count,
        open: Math.round(d.count * 0.6),
        resolved: Math.round(d.count * 0.4),
      }));
    }
    return [];

  }, [trend.data]);

  const enginesData = [
    <div key="1" className="flex flex-col gap-2 font-mono mt-4 text-[10px]">
      <div className="flex justify-between items-center"><span className="text-text-primary">Passive Scan</span><span className="text-[#F97316] font-bold">-</span></div>
      <div className="flex justify-between items-center"><span className="text-text-primary">Active Scan</span><span className="text-[#F97316] font-bold">-</span></div>
      <div className="flex justify-between items-center"><span className="text-text-primary">Runtime Scan</span><span className="text-muted-foreground font-bold">-</span></div>
    </div>
  ];

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10 text-sm">
      <div className="flex items-center justify-end gap-3 mb-2">
        <button onClick={() => qc.invalidateQueries({ queryKey: ['testing'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <Toggle checked={showResolved} onChange={setShowResolved} label="Show Resolved Events" />
        <Toggle checked={showAgg} onChange={setShowAgg} label="Show Aggregation" />
        <TimeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      <SummaryPanel>
        <div className="rounded-xl border border-border-subtle bg-bg-surface p-4 min-w-[180px] flex flex-col justify-center gap-4">
          <div className="flex justify-between items-center border-b border-border-subtle pb-2">
            <span className="text-muted-foreground text-xs font-medium">Total</span>
            <span className="text-xl font-bold font-display text-text-primary">{totalIssues}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs font-medium">Open/Analyzed</span>
            <span className="text-xl font-bold font-display text-[#EF4444]">{openIssues}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs font-medium">Resolved</span>
            <span className="text-xl font-bold font-display text-[#22C55E]">{fixedIssues}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-bg-surface p-4 min-w-[380px] flex flex-col">
          <div className="flex gap-4 mb-4 border-b border-border-subtle pb-2 text-[11px]">
            {[
              { key: 'total' as const, label: `Total: ${totalIssues}`, activeColor: '#F97316' },
              { key: 'open' as const, label: `Open/In Progress: ${openIssues}`, activeColor: '#EF4444' },
              { key: 'resolved' as const, label: `Resolved: ${fixedIssues}`, activeColor: '#22C55E' },
            ].map(({ key, label, activeColor }) => (
              <button key={key} onClick={() => setChartTab(key)}
                className={twMerge(clsx("font-semibold outline-none transition-colors",
                  chartTab !== key && "text-muted-foreground hover:text-text-primary"))}
                style={chartTab === key ? { color: activeColor } : {}}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 mt-2">
            <LineChart height={140} data={timelineData} xKey="date"
              lines={[{ key: chartTab, label: chartTab, color: chartTab === 'total' ? '#F97316' : chartTab === 'open' ? '#EF4444' : '#22C55E' }]} />
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle bg-bg-surface p-4 min-w-[150px] flex flex-col items-center">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold w-full mb-2">Severity</span>
          <DonutChart data={severityData} centerValue={openIssues} size={110} innerRadius={34} outerRadius={50} />
        </div>

        <div className="min-w-[180px]">
          <CarouselCard title="Vulnerability Engines" items={enginesData} />
        </div>
      </SummaryPanel>

      {isError && <QueryError message="Failed to load vulnerabilities" onRetry={() => refetch()} />}

      <div className="flex items-center justify-between mt-2 mb-1 px-1">
        <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Vulnerability List</span>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer outline-none text-[#EAB308] bg-[#EAB308]/10 border border-[#EAB308]/20 hover:bg-[#EAB308]/20">
            <Zap size={14} /> Revalidate
          </button>
          <div className="w-[1px] h-4 bg-border-subtle mx-1" />
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} of {total}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">←</button>
              <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">→</button>
            </div>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-bg-surface px-3 py-1.5 text-xs text-muted-foreground hover:text-text-primary ml-2 cursor-pointer outline-none transition-colors">
            <Filter size={14} /> Filter
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-border-subtle overflow-hidden flex flex-col min-h-[400px] bg-bg-surface">
        {isLoading ? <TableSkeleton columns={10} rows={pageSize} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-bg-elevated border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">☐</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Severity</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Timestamp↕</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Event ID</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sub Category</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Summary</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Last Observed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-bg-hover transition-colors cursor-pointer">
                    <td className="px-4 py-3"><input type="checkbox" className="accent-brand" /></td>
                    <td className="px-4 py-3"><SeverityBadge severity={mapSev(row.severity)} /></td>
                    <td className="px-4 py-3 flex gap-2 items-center min-w-[200px]">
                      <MethodBadge method={row.method || 'GET'} />
                      <span className="text-[13px] font-mono text-text-primary">{row.url}</span>
                    </td>
                    <td className="px-4 py-3 text-[11px] font-mono text-text-muted">{formatTs(row.creationTime)}</td>
                    <td className="px-4 py-3 text-[11px] font-mono text-text-muted">{row.id?.substring(0, 8)}</td>
                    <td className="px-4 py-3 text-xs text-text-primary">{row.testCategory}</td>
                    <td className="px-4 py-3 text-xs text-text-primary">{row.testSubType}</td>
                    <td className="px-4 py-3 text-xs text-text-secondary truncate max-w-[150px]">{row.testSubType}</td>
                    <td className="px-4 py-3"><StatusBadge status={mapStatus(row.issueStatus)} /></td>
                    <td className="px-4 py-3 text-[11px] font-mono text-text-muted">{formatTs(row.lastSeen)}</td>
                  </tr>
                ))}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-muted-foreground">No vulnerabilities found. Run a test to start scanning.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vulnerabilities;
