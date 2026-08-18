import React, { useState, useMemo } from 'react';
import {
  RefreshCw, Shield, Activity, Users, TrendingUp, ShieldAlert, Globe, Clock,
} from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import GeoMap from '@/components/charts/GeoMap';
import TimeFilter from '@/components/shared/TimeFilter';
import QueryError from '@/components/shared/QueryError';
import PageHeader from '@/components/shared/PageHeader';
import { useDashboardKPIs, useIssuesTrend, useSeverityBreakdown } from '@/hooks/use-dashboard';
import { useThreatCategoryCount, useActorsGeoCount } from '@/hooks/use-protection';
import { useTestRuns } from '@/hooks/use-security-ops';
import { centroidForCountryCode } from '@/lib/country-centroids';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { DashboardThreatData } from '@/services/dashboard.service';
import EvidencePanel from '@/components/ui/EvidencePanel';
import EvidenceSectionHead from '@/components/ui/EvidenceSectionHead';
import EvidenceLedgerItem from '@/components/ui/EvidenceLedger';
import { EvidenceStatLine, EvidenceBarLine } from '@/components/ui/EvidenceStatLine';
import EvidenceTrace from '@/components/ui/EvidenceTrace';
import { useLiveTraffic, useRealtimeStatus } from '@/lib/realtime';
import { formatClock, formatProtocol, formatRelative, methodTone, statusTone } from '@/lib/format';

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const Dashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [activeTab, setActiveTab] = useState<'total' | 'blocked' | 'successful'>('total');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const realtime = useRealtimeStatus();
  const { recentLogs } = useLiveTraffic();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { issues, endpoints, historical, threats, isLoading } = useDashboardKPIs();
  const issuesTrend = useIssuesTrend(startTs, endTs);
  const sevBreakdown = useSeverityBreakdown();
  const categoryCount = useThreatCategoryCount();
  const geoCount = useActorsGeoCount();
  const testRuns = useTestRuns(25);

  type IssueKpis = NonNullable<typeof issues.data> & {
    highIssues?: number;
    mediumIssues?: number;
    lowIssues?: number;
  };
  type TimelineEntry = { date: string; total: number; blocked: number; successful: number };
  const issueKpis = issues.data as IssueKpis | undefined;
  const threatDataResult: DashboardThreatData = threats.data?.threatData ?? {
    totalActors: 0,
    blockedActors: 0,
    whitelistedActors: 0,
    highActors: 0,
    mediumActors: 0,
    lowActors: 0,
  };
  const historicalData = historical.data;

  const kpi = {
    threatActors: threatDataResult.totalActors,
    blocked: threatDataResult.blockedActors,
    securityEvents: historicalData?.totalThreats ?? 0,
    critical: issues.data?.criticalIssues ?? 0,
    resolved: historicalData?.resolvedIssues ?? 0,
    unauth: historicalData?.unauthApis ?? 0,
    whitelisted: threatDataResult.whitelistedActors,
  };

  const totalIssues =
    (issueKpis?.criticalIssues ?? 0) +
    (issueKpis?.highIssues ?? 0) +
    (issueKpis?.mediumIssues ?? 0) +
    (issueKpis?.lowIssues ?? 0);
  const postureDenom = totalIssues + kpi.resolved;
  const postureScore = postureDenom > 0 ? Math.min(100, Math.round((kpi.resolved / postureDenom) * 100)) : 0;
  const endpointCount = Number(endpoints.data?.endpointsCount ?? 0);

  const postureTone =
    postureScore >= 80 ? 'var(--evd-low)' : postureScore >= 50 ? 'var(--evd-medium)' : 'var(--evd-critical)';
  const postureLabel =
    postureScore >= 80 ? 'Hardened' : postureScore >= 50 ? 'Watch' : postureDenom === 0 ? 'No baseline' : 'Exposed';

  const runs = testRuns.data?.runs ?? [];
  const testsRun = runs.reduce((sum, run) => sum + Number(run.total_tests || 0), 0);
  const vulnsFound = runs.reduce((sum, run) => sum + Number(run.vulnerable_count || 0), 0);
  const lastRunAt = runs
    .map((run) => run.completed_at || run.started_at || run.created_at)
    .filter(Boolean)
    .sort()
    .at(-1);
  const lastRunLabel = lastRunAt
    ? new Date(lastRunAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—';

  const threatData = [
    { name: 'High', value: threatDataResult.highActors, color: 'var(--evd-high)' },
    { name: 'Medium', value: threatDataResult.mediumActors, color: 'var(--evd-medium)' },
    { name: 'Low', value: threatDataResult.lowActors, color: 'var(--evd-low)' },
  ];

  const timelineData = useMemo<TimelineEntry[]>(() => {
    const trend = issuesTrend.data?.issuesTrend;
    if (trend && trend.length > 0) {
      return trend.map((d) => ({
        date: new Date(d.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: d.total ?? d.count ?? 0,
        blocked: d.blocked ?? 0,
        successful: d.successful ?? 0,
      }));
    }
    return [];
  }, [issuesTrend.data]);

  const categories = Object.entries(categoryCount.data?.categoryCount ?? {});
  const topCategories = categories.sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCatVal = topCategories.length > 0 ? (topCategories[0][1] as number) : 1;

  const geoThreats = useMemo(() => {
    const countryCounts = geoCount.data?.countPerCountry || {};
    return Object.entries(countryCounts)
      .map(([country, count]) => {
        const coords = centroidForCountryCode(country);
        if (!coords) return null;
        return {
          lat: coords.lat,
          lng: coords.lng,
          severity: count > 100 ? ('critical' as const) : count > 50 ? ('high' as const) : ('medium' as const),
          count,
          country,
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [geoCount.data]);

  const hasError = issues.isError || endpoints.isError;
  const windowLabel = timeRange === '24h' ? 'Last 24 hours' : 'Last 7 days';
  const ring = 2 * Math.PI * 42;

  return (
    <div className="w-full min-w-0 space-y-5 pb-8">
      <PageHeader
        eyebrow="Operations"
        title="Dashboard"
        description="Posture is resolved findings versus open findings. Counts below are live inventory."
        actions={
          <>
            <button
              type="button"
              onClick={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-subtle bg-bg-surface text-muted-foreground transition-colors hover:text-brand"
              aria-label="Refresh dashboard data"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <TimeFilter value={timeRange} onChange={setTimeRange} />
          </>
        }
      />

      {hasError && (
        <QueryError
          message="Failed to load dashboard data. Backend may be offline."
          onRetry={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
        />
      )}

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
        <EvidencePanel className="flex items-center gap-4 p-4">
          <div className="relative inline-flex h-[96px] w-[96px] shrink-0 items-center justify-center">
            <svg width={96} height={96} className="-rotate-90" aria-hidden>
              <circle cx={48} cy={48} r={42} fill="none" stroke="var(--evd-line)" strokeWidth={7} />
              <circle
                cx={48}
                cy={48}
                r={42}
                fill="none"
                stroke={postureTone}
                strokeWidth={7}
                strokeLinecap="round"
                strokeDasharray={ring}
                strokeDashoffset={ring * (1 - postureScore / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-text-primary">{postureScore}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Score</span>
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">{postureLabel}</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {realtime.connected ? 'Stream live' : 'Reconnecting'} · {windowLabel.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => navigate('/app/reports')}
              className="mt-2 text-xs font-semibold text-brand"
            >
              Open reports
            </button>
          </div>
        </EvidencePanel>

        <div className="evd-ledger min-w-0">
          <EvidenceLedgerItem icon={ShieldAlert} color="var(--evd-critical)" label="Critical" value={Number(kpi.critical) || 0} />
          <EvidenceLedgerItem icon={Activity} color="var(--evd-medium)" label="Open issues" value={totalIssues} />
          <EvidenceLedgerItem icon={TrendingUp} color="var(--evd-low)" label="Resolved" value={Number(kpi.resolved) || 0} />
          <EvidenceLedgerItem icon={Globe} color="var(--evd-info)" label="Endpoints" value={endpointCount} />
          <EvidenceLedgerItem icon={Shield} color="var(--evd-signal)" label="Blocked" value={Number(kpi.blocked) || 0} />
          <EvidenceLedgerItem icon={Users} color="var(--evd-critical)" label="Actors" value={Number(kpi.threatActors) || 0} />
        </div>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <EvidencePanel className="min-w-0">
          <EvidenceSectionHead
            code="MIX"
            title="Detection mix"
            desc={topCategories.length ? `${topCategories.length} active` : 'Waiting on traffic'}
          />
          {topCategories.length > 0 ? (
            topCategories.map(([name, count]) => (
              <EvidenceBarLine key={String(name)} label={String(name)} value={Number(count)} max={maxCatVal} />
            ))
          ) : (
            <p className="py-4 text-sm text-text-muted">
              Categories appear once detections land from traffic or scans.
            </p>
          )}
        </EvidencePanel>

        <EvidencePanel className="min-w-0">
          <EvidenceSectionHead
            code="ACTORS"
            title="Threat actors"
            action={
              <button type="button" onClick={() => navigate('/app/protection')} className="text-xs font-semibold text-brand">
                Details
              </button>
            }
          />
          <div className="flex min-w-0 items-center gap-4">
            <DonutChart
              data={threatData}
              centerValue={Number(kpi.threatActors) || 0}
              centerLabel="Total"
              size={112}
              innerRadius={34}
              outerRadius={50}
            />
            <div className="min-w-0 flex-1">
              {threatData.map((d) => (
                <EvidenceStatLine key={d.name} label={d.name} value={d.value} dot={d.color} />
              ))}
              <p className="mt-2 text-xs text-text-muted">
                Allowlisted {kpi.whitelisted} · Unauthenticated APIs {kpi.unauth}
              </p>
            </div>
          </div>
        </EvidencePanel>

        <EvidencePanel className="min-w-0">
          <EvidenceSectionHead
            code="TESTS"
            title="Testing"
            action={
              <button type="button" onClick={() => navigate('/app/testing')} className="text-xs font-semibold text-brand">
                View
              </button>
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <StatBlock label="Tests run" value={testsRun} />
            <StatBlock label="Vulnerabilities" value={vulnsFound} tone="var(--evd-critical)" />
            <StatBlock label="Recent runs" value={runs.length} />
            <StatBlock label="Last run" value={lastRunLabel} />
          </div>
        </EvidencePanel>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12">
        <EvidencePanel className="min-w-0 overflow-hidden p-0 lg:col-span-7">
          <div className="px-5 pt-4">
            <EvidenceSectionHead code="GEO" title="Actor geography" desc="Country centroids" />
          </div>
          <GeoMap threats={geoThreats} height={240} />
        </EvidencePanel>

        <EvidencePanel className="min-w-0 lg:col-span-5">
          <EvidenceSectionHead
            code="EVENTS"
            title="Security events"
            desc={windowLabel}
          />
          <p className="mb-4 text-3xl font-bold tabular-nums text-text-primary">
            {Number(kpi.securityEvents).toLocaleString()}
          </p>
          <div className="grid grid-cols-2 gap-y-3">
            <StatBlock label="Blocked" value={historicalData?.blockedThreats ?? 0} tone="var(--evd-critical)" small />
            <StatBlock label="High" value={sevBreakdown.data?.severityCount?.HIGH ?? 0} tone="var(--evd-high)" small />
            <StatBlock label="Medium" value={sevBreakdown.data?.severityCount?.MEDIUM ?? 0} tone="var(--evd-medium)" small />
            <StatBlock label="Low" value={sevBreakdown.data?.severityCount?.LOW ?? 0} tone="var(--evd-info)" small />
          </div>
        </EvidencePanel>
      </div>

      <div className="min-w-0">
        <EvidenceSectionHead
          code="TREND"
          title="Event trend"
          desc={windowLabel}
        />
        <EvidencePanel>
          <div className="mb-4 flex flex-wrap gap-1">
            {([
              { key: 'total', label: 'Total' },
              { key: 'blocked', label: 'Blocked' },
              { key: 'successful', label: 'Successful' },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className="evd-tab"
                data-active={activeTab === tab.key}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <EvidenceTrace
            data={timelineData.map((d) => ({ date: d.date, value: d[activeTab] }))}
            color={
              activeTab === 'total'
                ? 'var(--evd-signal)'
                : activeTab === 'blocked'
                  ? 'var(--evd-critical)'
                  : 'var(--evd-low)'
            }
            height={180}
          />
        </EvidencePanel>
      </div>

      <EvidencePanel className="min-w-0">
        <EvidenceSectionHead
          code="LIVE"
          title="Live traffic"
          desc={realtime.connected ? 'Stream open' : 'Reconnecting'}
          action={
            <button type="button" onClick={() => navigate('/app/live')} className="text-xs font-semibold text-brand">
              Full feed
            </button>
          }
        />
        {recentLogs.length > 0 ? (
          <div className="evd-table-wrap">
            <table className="evd-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Method</th>
                  <th>Path</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.slice(0, 8).map((entry) => {
                  const threat = entry.attacks?.[0];
                  const mc = methodTone(entry.method);
                  return (
                    <tr key={entry.id} onClick={() => navigate('/app/live')}>
                      <td className="font-mono text-xs tabular-nums">{formatClock(entry.timestamp)}</td>
                      <td>
                        <span
                          className="inline-block rounded px-1.5 py-0.5 font-mono text-[10px] font-bold"
                          style={{ background: mc.bg, color: mc.text }}
                        >
                          {entry.method}
                        </span>
                      </td>
                      <td className="max-w-[280px] truncate font-mono text-xs">
                        {entry.host ? `${entry.host}${entry.path}` : entry.path}
                        <span className="ml-2 text-text-muted">{formatProtocol(entry.protocol)}</span>
                      </td>
                      <td className="font-mono text-xs" style={{ color: threat ? 'var(--evd-critical)' : statusTone(entry.status) }}>
                        {threat ? threat.category : entry.status}
                      </td>
                      <td className="text-xs text-text-muted">{formatRelative(entry.timestamp)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : timelineData.length > 0 ? (
          <div className="space-y-2">
            {timelineData.slice(-5).reverse().map((entry, i) => (
              <div key={`${entry.date}-${i}`} className="flex min-w-0 items-center justify-between gap-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2 text-sm text-text-secondary">
                  <Clock size={12} className="shrink-0 text-text-muted" />
                  <span className="tabular-nums text-text-muted">{entry.date}</span>
                  <span className="truncate">
                    {entry.total} events ({entry.blocked} blocked)
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-text-muted">
            {realtime.connected
              ? 'Stream open — waiting for traffic frames.'
              : 'No live frames yet. Open Live Feed after sensors ingest traffic.'}
          </p>
        )}
      </EvidencePanel>
    </div>
  );
};

const StatBlock: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: string;
  small?: boolean;
}> = ({ label, value, tone, small }) => (
  <div className="min-w-0">
    <p className="mb-1 text-xs text-text-muted">{label}</p>
    <p
      className={`truncate font-semibold tabular-nums ${small ? 'text-sm' : 'text-xl'}`}
      style={{ color: tone || 'var(--evd-paper)' }}
    >
      {value}
    </p>
  </div>
);

export default Dashboard;
