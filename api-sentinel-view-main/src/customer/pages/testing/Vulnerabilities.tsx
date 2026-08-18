import React, { useState, useMemo } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, Activity } from 'lucide-react';
import TimeFilter from '@/components/shared/TimeFilter';
import { Toggle } from '@/components/shared/Toggle';
import DonutChart from '@/components/charts/DonutChart';
import { SeverityBadge, StatusBadge, MethodBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import PageHeader from '@/components/shared/PageHeader';
import EvidencePanel from '@/components/ui/EvidencePanel';
import EvidenceSectionHead from '@/components/ui/EvidenceSectionHead';
import EvidenceLedgerItem from '@/components/ui/EvidenceLedger';
import { EvidenceStatLine } from '@/components/ui/EvidenceStatLine';
import EvidenceTrace from '@/components/ui/EvidenceTrace';
import { useVulnerabilities, useIssueSummary, useIssuesTrend } from '@/hooks/use-testing';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

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
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();
  const navigate = useNavigate();

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
  const windowLabel = timeRange === '24h' ? 'Last 24 hours' : 'Last 7 days';

  const severityData = useMemo(() => {
    const sev = sm?.severityBreakdown ?? {};
    return [
      { name: 'Critical', value: sev.CRITICAL ?? 0, color: 'var(--evd-critical)' },
      { name: 'High', value: sev.HIGH ?? 0, color: 'var(--evd-high)' },
      { name: 'Medium', value: sev.MEDIUM ?? 0, color: 'var(--evd-medium)' },
      { name: 'Low', value: sev.LOW ?? 0, color: 'var(--evd-low)' },
    ];
  }, [sm]);

  const timelineData = useMemo(() => {
    const t = trend.data?.issuesTrend;
    if (t && t.length > 0) {
      return t.map(d => ({
        date: new Date(d.ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value: d.count,
      }));
    }
    return [];
  }, [trend.data]);

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="w-full min-w-0 space-y-5 pb-8">
      <PageHeader
        eyebrow="Testing"
        title="Findings"
        description="Open vulnerabilities from template runs and runtime detections. Click a row for evidence."
        actions={
          <>
            <Toggle checked={showResolved} onChange={setShowResolved} label="Show resolved" />
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ['testing'] })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-muted-foreground transition-colors hover:text-brand"
              aria-label="Refresh findings"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <TimeFilter value={timeRange} onChange={setTimeRange} />
          </>
        }
      />

      <div className="evd-ledger min-w-0">
        <EvidenceLedgerItem icon={AlertTriangle} color="var(--evd-signal)" label="Total" value={totalIssues} />
        <EvidenceLedgerItem icon={XCircle} color="var(--evd-critical)" label="Critical" value={sm?.severityBreakdown?.CRITICAL ?? 0} />
        <EvidenceLedgerItem icon={Activity} color="var(--evd-medium)" label="Open" value={openIssues} />
        <EvidenceLedgerItem icon={CheckCircle2} color="var(--evd-low)" label="Resolved" value={fixedIssues} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <EvidencePanel className="min-w-0 lg:col-span-2">
          <EvidenceSectionHead code="TREND" title="Findings over time" desc={windowLabel} />
          <EvidenceTrace data={timelineData} color="var(--evd-signal)" height={180} />
        </EvidencePanel>
        <EvidencePanel className="min-w-0">
          <EvidenceSectionHead code="SEV" title="Severity" desc={`${openIssues} open`} />
          <div className="flex min-w-0 items-center gap-4">
            <DonutChart
              data={severityData}
              centerValue={openIssues}
              centerLabel="Open"
              size={112}
              innerRadius={34}
              outerRadius={50}
            />
            <div className="min-w-0 flex-1">
              {severityData.map((d) => (
                <EvidenceStatLine key={d.name} label={d.name} value={d.value} dot={d.color} />
              ))}
            </div>
          </div>
        </EvidencePanel>
      </div>

      {isError && <QueryError message="Failed to load vulnerabilities" onRetry={() => refetch()} />}

      <EvidencePanel className="min-w-0">
        <EvidenceSectionHead
          code="LIST"
          title="Findings"
          desc={`${from}–${to} of ${total}`}
          action={
            <div className="flex gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-[11px] disabled:opacity-30"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={(page + 1) * pageSize >= total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-[11px] disabled:opacity-30"
              >
                Next
              </button>
            </div>
          }
        />
        {isLoading ? (
          <TableSkeleton columns={7} rows={pageSize} />
        ) : (
          <div className="evd-table-wrap">
            <table className="evd-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>Endpoint</th>
                  <th>Opened</th>
                  <th>Category</th>
                  <th>Summary</th>
                  <th>Status</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const s = mapSev(row.severity);
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/app/findings/${row.id}`)}
                    >
                      <td><SeverityBadge severity={s} /></td>
                      <td>
                        <div className="flex min-w-0 items-center gap-2">
                          <MethodBadge method={row.method || 'GET'} />
                          <span className="truncate font-mono text-xs">{row.url}</span>
                        </div>
                      </td>
                      <td className="font-mono text-xs tabular-nums text-text-muted">{formatTs(row.creationTime)}</td>
                      <td className="text-xs text-text-secondary">{row.testCategory}</td>
                      <td className="max-w-[220px] truncate text-xs text-text-muted">{row.testSubType}</td>
                      <td><StatusBadge status={mapStatus(row.issueStatus)} /></td>
                      <td className="font-mono text-xs tabular-nums text-text-muted">{formatTs(row.lastSeen)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-text-muted">
                      No vulnerabilities found. Run a confirmatory test or wait for runtime detections — an empty list is not a verified-clean estate.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </EvidencePanel>
    </div>
  );
};

export default Vulnerabilities;
