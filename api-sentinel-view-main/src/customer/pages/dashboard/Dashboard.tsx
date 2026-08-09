import React, { useState, useMemo } from 'react';
import {
  RefreshCw, Shield, Activity, Users, TrendingUp, Lock, ShieldAlert,
  Eye, Database, FileCheck, Globe, Bot, Clock,
} from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import GeoMap from '@/components/charts/GeoMap';
import TimeFilter from '@/components/shared/TimeFilter';
import QueryError from '@/components/shared/QueryError';
import { useDashboardKPIs, useIssuesTrend, useThreatTrend, useSeverityBreakdown } from '@/hooks/use-dashboard';
import { useThreatCategoryCount, useActorsGeoCount } from '@/hooks/use-protection';
import { useTestRuns } from '@/hooks/use-security-ops';
import { centroidForCountryCode } from '@/lib/country-centroids';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import type { DashboardThreatData } from '@/services/dashboard.service';
import EvidencePanel from '@/components/ui/EvidencePanel';
import EvidenceSectionHead from '@/components/ui/EvidenceSectionHead';
import EvidenceStamp from '@/components/ui/EvidenceStamp';
import EvidenceLedgerItem from '@/components/ui/EvidenceLedger';
import { EvidenceStatLine, EvidenceBarLine } from '@/components/ui/EvidenceStatLine';
import EvidenceTrace from '@/components/ui/EvidenceTrace';
import { useRealtimeStatus } from '@/lib/realtime';

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

function nowStamp(): string {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const Dashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [activeTab, setActiveTab] = useState<'total' | 'blocked' | 'successful'>('total');
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const realtime = useRealtimeStatus();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { issues, endpoints, historical, threats, isLoading } = useDashboardKPIs();
  const issuesTrend = useIssuesTrend(startTs, endTs);
  const threatTrend = useThreatTrend(daysAgoTs(30), endTs);
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

  // Posture score from open vs resolved issues only — no invented defaults.
  const totalIssues = (issueKpis?.criticalIssues ?? 0) + (issueKpis?.highIssues ?? 0) + (issueKpis?.mediumIssues ?? 0) + (issueKpis?.lowIssues ?? 0);
  const postureDenom = totalIssues + kpi.resolved;
  const postureScore = postureDenom > 0 ? Math.min(100, Math.round((kpi.resolved / postureDenom) * 100)) : 0;
  const endpointCount = Number(endpoints.data?.endpointsCount ?? 0);
  const evidencePackages = historicalData?.totalThreats ?? 0;
  const mcpSessions = threatDataResult.mcpSessions ?? 0;

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

  // Real geo coordinates from threat actor IPs (using country data). Countries
  // with no known centroid are dropped rather than defaulted to the US — a
  // silent fallback would misattribute their attacks to the wrong country.
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
  const displayName = user?.name || user?.login?.split('@')[0] || 'User';

  return (
    <div className="space-y-6 w-full p-4 pb-10">
      {/* Case header */}
      <div className="flex items-center justify-between flex-wrap gap-3 animate-fade-in">
        <div>
          <h1 className="evd-display text-xl" style={{ color: 'var(--evd-paper)' }}>
            {displayName.toUpperCase()} — LIVE POSTURE
          </h1>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <EvidenceStamp tone={realtime.connected ? 'ok' : 'warn'} pulse>
              {realtime.connected ? 'NOMINAL' : 'RECONNECTING'}
            </EvidenceStamp>
            <span className="evd-mono text-[11px]" style={{ color: 'var(--evd-ink-muted)' }}>
              SYNC {nowStamp()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
            className={`evd-btn ${isLoading ? 'animate-spin' : ''}`}
            aria-label="Refresh dashboard data"
          >
            <RefreshCw size={14} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {hasError && (
        <QueryError
          message="Failed to load dashboard data. Backend may be offline."
          onRetry={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
        />
      )}

      {/* KPI ledger — live API counts only (no fabricated period deltas) */}
      <div className="evd-ledger animate-fade-in">
        <EvidenceLedgerItem icon={Users} color="var(--evd-critical)" label="Threat Actors" value={typeof kpi.threatActors === 'number' ? kpi.threatActors : 0} />
        <EvidenceLedgerItem icon={Shield} color="var(--evd-signal)" label="Blocked" value={typeof kpi.blocked === 'number' ? kpi.blocked : 0} />
        <EvidenceLedgerItem icon={Activity} color="var(--evd-info)" label="Security Events" value={typeof kpi.securityEvents === 'number' ? kpi.securityEvents : 0} />
        <EvidenceLedgerItem icon={ShieldAlert} color="var(--evd-critical)" label="Critical" value={typeof kpi.critical === 'number' ? kpi.critical : 0} />
        <EvidenceLedgerItem icon={TrendingUp} color="var(--evd-low)" label="Resolved" value={typeof kpi.resolved === 'number' ? kpi.resolved : 0} />
        <EvidenceLedgerItem icon={Lock} color="var(--evd-medium)" label="Unauthenticated" value={typeof kpi.unauth === 'number' ? kpi.unauth : 0} />
      </div>

      {/* Inventory + runtime signals from live APIs */}
      <div>
        <EvidenceSectionHead code="§01" title="Inventory Signals" desc="LIVE COUNTS FROM DISCOVERY · DETECTION · MCP" />
        <div className="evd-ledger">
          <EvidenceLedgerItem icon={Globe} color="var(--evd-info)" label="Discovered Endpoints" value={endpointCount} />
          <EvidenceLedgerItem icon={FileCheck} color="var(--evd-low)" label="Security Events" value={typeof evidencePackages === 'number' ? evidencePackages : 0} />
          <EvidenceLedgerItem icon={Database} color="var(--evd-medium)" label="Open Issues" value={totalIssues} />
          <EvidenceLedgerItem icon={Bot} color="var(--evd-signal)" label="MCP / Agentic Sessions" value={typeof mcpSessions === 'number' ? mcpSessions : 0} />
        </div>
      </div>

      {/* Detection mix + Testing status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EvidencePanel exhibit="EXH-01">
          <EvidenceSectionHead
            code="§02"
            title="Detection Categories"
            desc={topCategories.length ? `${topCategories.length} ACTIVE` : 'NO DETECTIONS YET'}
          />
          <div className="space-y-0.5">
            {topCategories.length > 0 ? (
              topCategories.map(([name, count]) => (
                <EvidenceBarLine key={String(name)} label={String(name)} value={Number(count)} max={maxCatVal} />
              ))
            ) : (
              <p className="evd-mono text-[11px] py-4" style={{ color: 'var(--evd-ink-muted)' }}>
                No category counts yet. Detections appear here once traffic or scans produce findings.
              </p>
            )}
          </div>
        </EvidencePanel>

        <EvidencePanel exhibit="EXH-02">
          <div className="flex items-start justify-between mb-4">
            <EvidenceSectionHead code="§03" title="Testing Status" desc="FROM /tests/runs" />
            <button onClick={() => navigate('/app/testing')} className="evd-link">
              VIEW TESTS →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-6" style={{ marginTop: -16 }}>
            <StatBlock label="Tests Run" value={testsRun} />
            <StatBlock label="Vulnerabilities" value={vulnsFound} tone="var(--evd-critical)" />
            <StatBlock label="Recent Runs" value={runs.length} />
            <StatBlock label="Last Run" value={lastRunLabel} mono />
          </div>
        </EvidencePanel>
      </div>

      {/* Posture + Threat distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EvidencePanel exhibit="EXH-03">
          <div className="flex items-start justify-between mb-4">
            <EvidenceSectionHead code="§04" title="Security Posture" />
            <button onClick={() => navigate('/app/reports')} className="evd-link">
              REPORT →
            </button>
          </div>
          <div className="flex items-center gap-8" style={{ marginTop: -16 }}>
            <div className="relative inline-flex items-center justify-center shrink-0">
              <svg width={130} height={130} className="-rotate-90">
                <circle cx={65} cy={65} r={57} fill="none" stroke="var(--evd-line)" strokeWidth={8} />
                <circle
                  cx={65} cy={65} r={57} fill="none"
                  stroke="var(--evd-signal)" strokeWidth={8} strokeLinecap="butt"
                  strokeDasharray={2 * Math.PI * 57}
                  strokeDashoffset={2 * Math.PI * 57 * (1 - postureScore / 100)}
                  style={{ transition: 'stroke-dashoffset 1s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="evd-display text-2xl tabular-nums" style={{ color: 'var(--evd-paper)' }}>{postureScore}</span>
                <span className="evd-mono text-[9px]" style={{ color: 'var(--evd-ink-muted)' }}>SCORE</span>
              </div>
            </div>
            <div className="flex-1">
              <EvidenceStatLine label="Critical Issues" value={kpi.critical} dot="var(--evd-critical)" />
              <EvidenceStatLine label="Resolved" value={kpi.resolved} dot="var(--evd-low)" />
              <EvidenceStatLine label="Blocked Actors" value={kpi.blocked} dot="var(--evd-signal)" />
              <EvidenceStatLine label="Unauthenticated APIs" value={kpi.unauth} dot="var(--evd-medium)" />
            </div>
          </div>
        </EvidencePanel>

        <EvidencePanel exhibit="EXH-04">
          <div className="flex items-start justify-between mb-4">
            <EvidenceSectionHead code="§05" title="Threat Distribution" />
            <button onClick={() => navigate('/app/protection')} className="evd-link">
              DETAILS →
            </button>
          </div>
          <div className="flex items-center gap-6" style={{ marginTop: -16 }}>
            <DonutChart
              data={threatData}
              centerValue={typeof kpi.threatActors === 'number' ? kpi.threatActors : 0}
              centerLabel="Total"
              size={130}
              innerRadius={40}
              outerRadius={60}
            />
            <div className="flex-1">
              {threatData.map((d) => (
                <EvidenceStatLine key={d.name} label={d.name} value={d.value} dot={d.color} />
              ))}
              <div className="pt-3 flex items-center gap-4 evd-mono text-[10px]" style={{ color: 'var(--evd-ink-muted)' }}>
                <div className="flex items-center gap-1"><Eye size={10} /> WHITELISTED {kpi.whitelisted}</div>
                <div className="flex items-center gap-1"><Shield size={10} /> BLOCKED {kpi.blocked}</div>
              </div>
            </div>
          </div>
        </EvidencePanel>
      </div>

      {/* Monitored activity */}
      <div>
        <EvidenceSectionHead code="§06" title="Monitored Activity" desc="LAST 30 DAYS" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <EvidencePanel exhibit="EXH-05">
            <p className="evd-mono text-[10px] mb-3" style={{ color: 'var(--evd-ink-muted)' }}>USER SUMMARY</p>
            <EvidenceStatLine label="Total Actors" value={kpi.threatActors} />
            <EvidenceStatLine label="Blocked" value={kpi.blocked} dot="var(--evd-critical)" />
            <EvidenceStatLine label="Whitelisted" value={kpi.whitelisted} dot="var(--evd-low)" />
          </EvidencePanel>

          <EvidencePanel exhibit="EXH-06" className="flex flex-col items-center">
            <p className="evd-mono text-[10px] mb-3 w-full" style={{ color: 'var(--evd-ink-muted)' }}>THREAT LEVEL</p>
            <DonutChart data={threatData} centerValue={typeof kpi.threatActors === 'number' ? kpi.threatActors : 0} size={120} innerRadius={38} outerRadius={56} showLegend />
          </EvidencePanel>

          <EvidencePanel exhibit="EXH-07">
            <p className="evd-mono text-[10px] mb-3" style={{ color: 'var(--evd-ink-muted)' }}>TOP TACTICS</p>
            {topCategories.length > 0 ? topCategories.map(([cat, cnt]) => (
              <EvidenceBarLine key={cat} label={cat} value={cnt as number} max={maxCatVal} />
            )) : (
              <p className="text-xs mt-4" style={{ color: 'var(--evd-ink-muted)' }}>No data available</p>
            )}
          </EvidencePanel>

          <div className="evd-panel" data-exhibit="EXH-08" style={{ padding: 0, overflow: 'hidden' }}>
            <GeoMap threats={geoThreats} height={220} />
          </div>
        </div>
      </div>

      {/* Security events timeline */}
      <div>
        <EvidenceSectionHead code="§07" title="Security Events" desc={timeRange === '24h' ? 'LAST 24 HOURS' : 'LAST 7 DAYS'} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <EvidencePanel exhibit="EXH-09">
            <p className="evd-mono text-[10px] mb-2" style={{ color: 'var(--evd-ink-muted)' }}>TOTAL EVENTS</p>
            <div className="evd-display text-4xl tabular-nums mb-5" style={{ color: 'var(--evd-paper)' }}>
              {typeof kpi.securityEvents === 'number' ? kpi.securityEvents.toLocaleString() : 0}
            </div>
            <div className="grid grid-cols-2 gap-y-4">
              <StatBlock label="Blocked" value={historicalData?.blockedThreats ?? 0} tone="var(--evd-critical)" small />
              <StatBlock label="High" value={sevBreakdown.data?.severityCount?.HIGH ?? 0} tone="var(--evd-high)" small />
              <StatBlock label="Medium" value={sevBreakdown.data?.severityCount?.MEDIUM ?? 0} tone="var(--evd-medium)" small />
              <StatBlock label="Low" value={sevBreakdown.data?.severityCount?.LOW ?? 0} tone="var(--evd-info)" small />
            </div>
          </EvidencePanel>

          <div className="lg:col-span-2 evd-panel">
            <div className="flex gap-1 mb-4">
              {(['total', 'blocked', 'successful'] as const).map((key) => (
                <button key={key} onClick={() => setActiveTab(key)} className="evd-tab" data-active={activeTab === key}>
                  {key}
                </button>
              ))}
            </div>
            <EvidenceTrace
              data={timelineData.map((d) => ({ date: d.date, value: d[activeTab] }))}
              color={activeTab === 'total' ? 'var(--evd-signal)' : activeTab === 'blocked' ? 'var(--evd-critical)' : 'var(--evd-low)'}
              height={190}
            />
          </div>
        </div>
      </div>

      {/* Recent activity log */}
      <EvidencePanel exhibit="EXH-10">
        <div className="flex items-center justify-between mb-3">
          <EvidenceSectionHead code="§08" title="Recent Activity" />
          <button onClick={() => navigate('/app/live')} className="evd-link">
            LIVE FEED →
          </button>
        </div>
        <div style={{ marginTop: -16 }}>
          {timelineData.length > 0 ? timelineData.slice(-5).reverse().map((entry, i) => (
            <div key={i} className="evd-row" style={{ padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--evd-line)' : 'none' }}>
              <div className="flex items-center gap-3">
                <Clock size={11} style={{ color: 'var(--evd-ink-muted)' }} />
                <span className="evd-mono text-[11px] tabular-nums" style={{ color: 'var(--evd-ink-muted)' }}>{entry.date}</span>
                <span className="text-xs" style={{ color: 'var(--evd-ink)' }}>
                  {entry.total} events ({entry.blocked} blocked, {entry.successful} successful)
                </span>
              </div>
              <span className="evd-mono text-[10px]" style={{ color: 'var(--evd-ink-muted)' }}>API TRAFFIC</span>
            </div>
          )) : (
            <p className="text-xs py-4 text-center" style={{ color: 'var(--evd-ink-muted)' }}>No recent activity data</p>
          )}
        </div>
      </EvidencePanel>
    </div>
  );
};

const StatBlock: React.FC<{ label: string; value: React.ReactNode; tone?: string; mono?: boolean; small?: boolean }> = ({
  label,
  value,
  tone,
  mono,
  small,
}) => (
  <div>
    <p className="text-[11px] mb-1" style={{ color: 'var(--evd-ink-muted)' }}>{label}</p>
    <p
      className={`${mono ? 'evd-mono' : 'evd-display'} tabular-nums ${small ? 'text-sm' : 'text-2xl'}`}
      style={{ color: tone || 'var(--evd-paper)' }}
    >
      {value}
    </p>
  </div>
);

export default Dashboard;
