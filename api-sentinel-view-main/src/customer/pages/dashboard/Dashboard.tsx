import React, { useState, useMemo } from 'react';
import {
  RefreshCw, Shield, Activity, Users, TrendingUp, Lock, ShieldAlert,
  Eye, Database, Globe, Bot, Clock, FileCheck,
} from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import GeoMap from '@/components/charts/GeoMap';
import TimeFilter from '@/components/shared/TimeFilter';
import QueryError from '@/components/shared/QueryError';
import { useDashboardKPIs, useIssuesTrend, useSeverityBreakdown } from '@/hooks/use-dashboard';
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
import { useLiveTraffic, useRealtimeStatus } from '@/lib/realtime';
import { formatClock, formatProtocol, formatRelative, methodTone, statusTone } from '@/lib/format';

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
  const mcpSessions = threatDataResult.mcpSessions ?? 0;

  const postureTone =
    postureScore >= 80 ? 'var(--evd-low)' : postureScore >= 50 ? 'var(--evd-medium)' : 'var(--evd-critical)';
  const postureLabel =
    postureScore >= 80 ? 'HARDENED' : postureScore >= 50 ? 'WATCH' : postureDenom === 0 ? 'NO BASELINE' : 'EXPOSED';

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
  const displayName = user?.name || user?.login?.split('@')[0] || 'User';

  return (
    <div className="space-y-5 w-full p-4 pb-10">
      {/* Hero — one composition: identity, posture, live status */}
      <section className="evd-hero animate-fade-in">
        <div className="evd-hero-copy">
          <p className="evd-mono text-[10px] tracking-[0.14em] uppercase mb-2" style={{ color: 'var(--evd-ink-muted)' }}>
            Case file · live posture
          </p>
          <h1 className="evd-display text-2xl md:text-3xl leading-tight" style={{ color: 'var(--evd-paper)' }}>
            {displayName.toUpperCase()}
          </h1>
          <p className="mt-2 text-sm max-w-md" style={{ color: 'var(--evd-ink)' }}>
            Resolved vs open issues form the score. Numbers below are live API counts only.
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <EvidenceStamp tone={realtime.connected ? 'ok' : 'warn'} pulse>
              {realtime.connected ? 'NOMINAL' : 'RECONNECTING'}
            </EvidenceStamp>
            <EvidenceStamp tone={postureScore >= 80 ? 'ok' : postureScore >= 50 ? 'warn' : undefined}>
              {postureLabel}
            </EvidenceStamp>
            <span className="evd-mono text-[11px]" style={{ color: 'var(--evd-ink-muted)' }}>
              SYNC {nowStamp()}
            </span>
          </div>
        </div>

        <div className="evd-hero-score">
          <div className="relative inline-flex items-center justify-center">
            <svg width={148} height={148} className="-rotate-90 evd-score-ring" aria-hidden>
              <circle cx={74} cy={74} r={64} fill="none" stroke="var(--evd-line)" strokeWidth={9} />
              <circle
                cx={74}
                cy={74}
                r={64}
                fill="none"
                stroke={postureTone}
                strokeWidth={9}
                strokeLinecap="butt"
                strokeDasharray={2 * Math.PI * 64}
                strokeDashoffset={2 * Math.PI * 64 * (1 - postureScore / 100)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="evd-display text-4xl tabular-nums" style={{ color: 'var(--evd-paper)' }}>
                {postureScore}
              </span>
              <span className="evd-mono text-[9px] tracking-widest" style={{ color: 'var(--evd-ink-muted)' }}>
                SCORE
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
              className={`evd-btn ${isLoading ? 'animate-spin' : ''}`}
              aria-label="Refresh dashboard data"
            >
              <RefreshCw size={14} />
            </button>
            <TimeFilter value={timeRange} onChange={setTimeRange} />
            <button onClick={() => navigate('/app/reports')} className="evd-link ml-1">
              REPORT →
            </button>
          </div>
        </div>
      </section>

      {hasError && (
        <QueryError
          message="Failed to load dashboard data. Backend may be offline."
          onRetry={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
        />
      )}

      {/* Single KPI ledger — no duplicate inventory strip */}
      <div className="evd-ledger animate-slide-up" style={{ animationDelay: '40ms' }}>
        <EvidenceLedgerItem icon={Users} color="var(--evd-critical)" label="Threat Actors" value={Number(kpi.threatActors) || 0} />
        <EvidenceLedgerItem icon={Shield} color="var(--evd-signal)" label="Blocked" value={Number(kpi.blocked) || 0} />
        <EvidenceLedgerItem icon={ShieldAlert} color="var(--evd-critical)" label="Critical" value={Number(kpi.critical) || 0} />
        <EvidenceLedgerItem icon={TrendingUp} color="var(--evd-low)" label="Resolved" value={Number(kpi.resolved) || 0} />
        <EvidenceLedgerItem icon={Activity} color="var(--evd-info)" label="Events" value={Number(kpi.securityEvents) || 0} />
        <EvidenceLedgerItem icon={Globe} color="var(--evd-info)" label="Endpoints" value={endpointCount} />
        <EvidenceLedgerItem icon={Database} color="var(--evd-medium)" label="Open Issues" value={totalIssues} />
        <EvidenceLedgerItem icon={Bot} color="var(--evd-signal)" label="MCP Sessions" value={Number(mcpSessions) || 0} />
      </div>

      {/* Primary exhibits — one job each, no repeated donuts/categories */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-slide-up" style={{ animationDelay: '80ms' }}>
        <EvidencePanel exhibit="EXH-01" className="lg:col-span-4">
          <EvidenceSectionHead
            code="§01"
            title="Detection Mix"
            desc={topCategories.length ? `${topCategories.length} ACTIVE` : 'WAITING ON TRAFFIC'}
          />
          <div className="space-y-0.5">
            {topCategories.length > 0 ? (
              topCategories.map(([name, count]) => (
                <EvidenceBarLine key={String(name)} label={String(name)} value={Number(count)} max={maxCatVal} />
              ))
            ) : (
              <p className="evd-mono text-[11px] py-4" style={{ color: 'var(--evd-ink-muted)' }}>
                Categories appear once detections land from traffic or scans.
              </p>
            )}
          </div>
        </EvidencePanel>

        <EvidencePanel exhibit="EXH-02" className="lg:col-span-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <EvidenceSectionHead code="§02" title="Threat Actors" />
            <button onClick={() => navigate('/app/protection')} className="evd-link shrink-0">
              DETAILS →
            </button>
          </div>
          <div className="flex items-center gap-5" style={{ marginTop: -8 }}>
            <DonutChart
              data={threatData}
              centerValue={Number(kpi.threatActors) || 0}
              centerLabel="Total"
              size={120}
              innerRadius={36}
              outerRadius={54}
            />
            <div className="flex-1 min-w-0">
              {threatData.map((d) => (
                <EvidenceStatLine key={d.name} label={d.name} value={d.value} dot={d.color} />
              ))}
              <div className="pt-2 flex flex-wrap gap-x-3 gap-y-1 evd-mono text-[10px]" style={{ color: 'var(--evd-ink-muted)' }}>
                <span className="inline-flex items-center gap-1"><Eye size={10} /> WL {kpi.whitelisted}</span>
                <span className="inline-flex items-center gap-1"><Lock size={10} /> UNAUTH {kpi.unauth}</span>
              </div>
            </div>
          </div>
        </EvidencePanel>

        <EvidencePanel exhibit="EXH-03" className="lg:col-span-4">
          <div className="flex items-start justify-between gap-2 mb-1">
            <EvidenceSectionHead code="§03" title="Testing" desc="FROM /tests/runs" />
            <button onClick={() => navigate('/app/testing')} className="evd-link shrink-0">
              VIEW →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-5" style={{ marginTop: -8 }}>
            <StatBlock label="Tests Run" value={testsRun} />
            <StatBlock label="Vulnerabilities" value={vulnsFound} tone="var(--evd-critical)" />
            <StatBlock label="Recent Runs" value={runs.length} />
            <StatBlock label="Last Run" value={lastRunLabel} mono />
          </div>
        </EvidencePanel>
      </div>

      {/* Map + event summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 animate-slide-up" style={{ animationDelay: '120ms' }}>
        <div className="lg:col-span-7 evd-panel overflow-hidden" data-exhibit="EXH-04" style={{ padding: 0 }}>
          <div className="px-5 pt-4 pb-2">
            <EvidenceSectionHead code="§04" title="Actor Geography" desc="COUNTRY CENTROIDS ONLY" />
          </div>
          <GeoMap threats={geoThreats} height={260} />
        </div>

        <EvidencePanel exhibit="EXH-05" className="lg:col-span-5">
          <EvidenceSectionHead
            code="§05"
            title="Security Events"
            desc={timeRange === '24h' ? 'LAST 24 HOURS' : 'LAST 7 DAYS'}
          />
          <div className="evd-display text-4xl tabular-nums mb-5" style={{ color: 'var(--evd-paper)' }}>
            {Number(kpi.securityEvents).toLocaleString()}
          </div>
          <div className="grid grid-cols-2 gap-y-4">
            <StatBlock label="Blocked" value={historicalData?.blockedThreats ?? 0} tone="var(--evd-critical)" small />
            <StatBlock label="High" value={sevBreakdown.data?.severityCount?.HIGH ?? 0} tone="var(--evd-high)" small />
            <StatBlock label="Medium" value={sevBreakdown.data?.severityCount?.MEDIUM ?? 0} tone="var(--evd-medium)" small />
            <StatBlock label="Low" value={sevBreakdown.data?.severityCount?.LOW ?? 0} tone="var(--evd-info)" small />
          </div>
          <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--evd-line)' }}>
            <EvidenceStatLine label="Critical Issues" value={kpi.critical} dot="var(--evd-critical)" />
            <EvidenceStatLine label="Resolved" value={kpi.resolved} dot="var(--evd-low)" />
            <EvidenceStatLine label="Open Issues" value={totalIssues} dot="var(--evd-medium)" />
            <EvidenceStatLine label="Endpoints" value={endpointCount} dot="var(--evd-info)" />
          </div>
        </EvidencePanel>
      </div>

      {/* Timeline */}
      <div className="animate-slide-up" style={{ animationDelay: '160ms' }}>
        <EvidenceSectionHead code="§06" title="Event Trace" desc={timeRange === '24h' ? 'LAST 24 HOURS' : 'LAST 7 DAYS'} />
        <EvidencePanel exhibit="EXH-06">
          <div className="flex gap-1 mb-4">
            {(['total', 'blocked', 'successful'] as const).map((key) => (
              <button key={key} onClick={() => setActiveTab(key)} className="evd-tab" data-active={activeTab === key}>
                {key}
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
            height={200}
          />
        </EvidencePanel>
      </div>

      {/* Live stream — same shared /api/stream/live socket as Live Feed */}
      <EvidencePanel exhibit="EXH-07" className="animate-slide-up" style={{ animationDelay: '200ms' }}>
        <div className="flex items-center justify-between mb-3">
          <EvidenceSectionHead
            code="§07"
            title="Live Traffic"
            desc={realtime.connected ? 'STREAM OPEN' : 'RECONNECTING'}
          />
          <button onClick={() => navigate('/app/live')} className="evd-link">
            FULL FEED →
          </button>
        </div>
        <div style={{ marginTop: -16 }}>
          {recentLogs.length > 0 ? (
            recentLogs.slice(0, 8).map((entry, i) => {
              const threat = entry.attacks?.[0];
              const mc = methodTone(entry.method);
              return (
                <div
                  key={entry.id}
                  className="evd-row"
                  style={{ padding: '8px 0', borderBottom: i < 7 ? '1px solid var(--evd-line)' : 'none' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="evd-mono text-[11px] tabular-nums shrink-0" style={{ color: 'var(--evd-ink-muted)' }}>
                      {formatClock(entry.timestamp)}
                    </span>
                    <span
                      className="evd-mono text-[10px] font-bold px-1.5 py-0.5 shrink-0"
                      style={{ background: mc.bg, color: mc.text }}
                    >
                      {entry.method}
                    </span>
                    <span className="text-xs truncate evd-mono" style={{ color: 'var(--evd-ink)' }}>
                      {entry.host ? `${entry.host}${entry.path}` : entry.path}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="evd-mono text-[10px]" style={{ color: 'var(--evd-ink-muted)' }}>
                      {formatProtocol(entry.protocol)}
                    </span>
                    <span className="evd-mono text-[10px]" style={{ color: threat ? 'var(--evd-critical)' : statusTone(entry.status) }}>
                      {threat ? threat.category : entry.status}
                    </span>
                    <span className="evd-mono text-[10px]" style={{ color: 'var(--evd-ink-muted)' }}>
                      {formatRelative(entry.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          ) : timelineData.length > 0 ? (
            timelineData
              .slice(-5)
              .reverse()
              .map((entry, i) => (
                <div
                  key={`${entry.date}-${i}`}
                  className="evd-row"
                  style={{ padding: '8px 0', borderBottom: i < 4 ? '1px solid var(--evd-line)' : 'none' }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Clock size={11} style={{ color: 'var(--evd-ink-muted)' }} />
                    <span className="evd-mono text-[11px] tabular-nums shrink-0" style={{ color: 'var(--evd-ink-muted)' }}>
                      {entry.date}
                    </span>
                    <span className="text-xs truncate" style={{ color: 'var(--evd-ink)' }}>
                      {entry.total} events ({entry.blocked} blocked, {entry.successful} successful)
                    </span>
                  </div>
                  <span className="evd-mono text-[10px] shrink-0" style={{ color: 'var(--evd-ink-muted)' }}>
                    AGGREGATE
                  </span>
                </div>
              ))
          ) : (
            <p className="text-xs py-4 text-center" style={{ color: 'var(--evd-ink-muted)' }}>
              {realtime.connected
                ? 'Stream open — waiting for traffic frames…'
                : 'No live frames yet. Open Live Feed after sensors ingest traffic.'}
            </p>
          )}
        </div>
      </EvidencePanel>

      {/* Quiet footer cue — inventory still discoverable */}
      <p className="evd-mono text-[10px] text-center pt-1" style={{ color: 'var(--evd-ink-muted)' }}>
        <FileCheck size={10} className="inline mr-1 -mt-0.5" />
        Figures refresh via live feed · query namespace dashboard
      </p>
    </div>
  );
};

const StatBlock: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: string;
  mono?: boolean;
  small?: boolean;
}> = ({ label, value, tone, mono, small }) => (
  <div>
    <p className="text-[11px] mb-1" style={{ color: 'var(--evd-ink-muted)' }}>
      {label}
    </p>
    <p
      className={`${mono ? 'evd-mono' : 'evd-display'} tabular-nums ${small ? 'text-sm' : 'text-2xl'}`}
      style={{ color: tone || 'var(--evd-paper)' }}
    >
      {value}
    </p>
  </div>
);

export default Dashboard;
