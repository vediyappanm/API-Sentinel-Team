import React, { useState, useMemo } from 'react';
import { RefreshCw, Shield, Activity, Users, TrendingUp, Lock, ShieldAlert, Calendar } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import CarouselCard from '@/components/shared/CarouselCard';
import GeoMap from '@/components/charts/GeoMap';
import LineChart from '@/components/charts/LineChart';
import TimeFilter from '@/components/shared/TimeFilter';
import QueryError from '@/components/shared/QueryError';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useDashboardKPIs, useIssuesTrend, useThreatTrend, useSeverityBreakdown } from '@/hooks/use-dashboard';
import { useThreatCategoryCount, useActorsGeoCount } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const Dashboard: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [activeTab, setActiveTab] = useState<'total' | 'blocked' | 'successful'>('total');
  const qc = useQueryClient();

  const days = timeRange === '24h' ? 1 : 7;
  const startTs = useMemo(() => daysAgoTs(days), [days]);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { issues, endpoints, historical, threats, isLoading } = useDashboardKPIs();
  const issuesTrend = useIssuesTrend(startTs, endTs);
  const threatTrend = useThreatTrend(daysAgoTs(30), endTs);
  const sevBreakdown = useSeverityBreakdown();
  const categoryCount = useThreatCategoryCount();
  const geoCount = useActorsGeoCount();

  // Extract values with fallback
  const kpi = {
    threatActors: (threats.data as any)?.threatData?.totalActors ?? '-',
    blocked: (threats.data as any)?.threatData?.blockedActors ?? '-',
    securityEvents: (historical.data as any)?.totalThreats ?? '-',
    critical: issues.data?.criticalIssues ?? '-',
    resolved: (historical.data as any)?.resolvedIssues ?? '-',
    unauth: (historical.data as any)?.unauthApis ?? '-',
  };

  const threatData = [
    { name: 'High', value: (threats.data as any)?.threatData?.highActors ?? 0, color: '#EF4444' },
    { name: 'Medium', value: (threats.data as any)?.threatData?.mediumActors ?? 0, color: '#F97316' },
    { name: 'Low', value: (threats.data as any)?.threatData?.lowActors ?? 0, color: '#EAB308' },
  ];

  const severityData = [
    { name: 'Critical', value: issues.data?.criticalIssues ?? 0, color: '#EF4444' },
    { name: 'Major', value: (issues.data as any)?.highIssues ?? 0, color: '#F97316' },
    { name: 'Minor', value: (issues.data as any)?.mediumIssues ?? 0, color: '#EAB308' },
    { name: 'Info', value: (issues.data as any)?.lowIssues ?? 0, color: '#22C55E' },
  ];

  // Timeline data from API
  const timelineData = useMemo(() => {
    const trend = issuesTrend.data?.issuesTrend;
    if (trend && trend.length > 0) {
      return trend.map((d: any) => ({
        date: new Date(d.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        total: d.total,
        blocked: d.blocked,
        successful: d.successful,
      }));
    }
    return [];
  }, [issuesTrend.data]);

  const hasError = issues.isError || endpoints.isError;

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Application Dashboard</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Security posture and threat intelligence overview</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['dashboard'] })}
            className={twMerge("w-8 h-8 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-text-primary transition-all outline-none", isLoading && "animate-spin")}
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

      <div className={clsx("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3", isLoading && "animate-pulse")}>
        {[
          { label: 'Threat Actors', value: kpi.threatActors, icon: Users, color: '#EF4444' },
          { label: 'Blocked', value: kpi.blocked, icon: Shield, color: '#F97316' },
          { label: 'Security Events', value: kpi.securityEvents, icon: Activity, color: '#60A5FA' },
          { label: 'Critical Severity', value: kpi.critical, icon: ShieldAlert, color: '#EF4444' },
          { label: 'Resolved', value: kpi.resolved, icon: TrendingUp, color: '#22C55E' },
          { label: 'Unauthenticated', value: kpi.unauth, icon: Lock, color: '#EAB308' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl p-4 border border-border-subtle bg-bg-surface card-hover flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-current/10" style={{ color }}>
                <Icon size={13} />
              </div>
            </div>
            <span className="text-2xl font-bold font-display" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Monitored Users</h2>
          <span className="text-[10px] text-muted-foreground bg-bg-elevated px-2 py-0.5 rounded border border-border-subtle flex items-center gap-1">
            <Calendar size={10} /> Last 30 Days
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border-subtle p-4 bg-bg-surface flex flex-col justify-center gap-4">
            {[['Total', kpi.threatActors, 'var(--text-primary)', 'Total'], ['Blocked', kpi.blocked, '#EF4444', 'Blocked'], ['Whitelisted', (threats.data as any)?.threatData?.whitelistedActors ?? '-', '#22C55E', 'Whitelisted']].map(([label, val, color, key]) => (
              <div key={key as string} className="flex justify-between items-center">
                <span className="text-muted-foreground text-xs font-medium">{label}</span>
                <span className="text-2xl font-bold font-display" style={{ color: color as string }}>{val}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border-subtle p-4 bg-bg-surface flex flex-col items-center">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold w-full mb-2">Threat Level</span>
            <DonutChart data={threatData} centerValue={typeof kpi.threatActors === 'number' ? kpi.threatActors : 0} size={130} innerRadius={40} outerRadius={60} />
          </div>
          <CarouselCard title="Top Tactics (All-Time)" items={[
            <div key="tactics" className="flex flex-col gap-2 font-mono text-[10px] mt-3">
              {Object.entries((categoryCount.data as any)?.categoryCount ?? {}).length > 0
                ? Object.entries((categoryCount.data as any)?.categoryCount ?? {})
                  .sort((a: any, b: any) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([cat, cnt]: any) => (
                    <div key={cat} className="flex justify-between items-center">
                      <span className="text-muted-foreground truncate max-w-[120px]">{cat}</span>
                      <span className="text-[#F97316] font-bold ml-2">{cnt}</span>
                    </div>
                  ))
                : <span className="text-muted-foreground">No data available</span>
              }
              {Object.entries((categoryCount.data as any)?.categoryCount ?? {}).length > 0 && (
                <p className="text-muted-foreground text-[9px] mt-2">Events detected · not filtered by time</p>
              )}
            </div>
          ]} />
          <GeoMap threats={Object.entries(geoCount.data?.countPerCountry || {}).map(([, count]) => ({ lat: (Math.random() * 120 - 60), lng: (Math.random() * 240 - 120), severity: ((count as number) > 100 ? 'critical' : (count as number) > 50 ? 'high' : 'medium') as any }))} />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Security Events</h2>
          <span className="text-[10px] text-muted-foreground bg-bg-elevated px-2 py-0.5 rounded border border-border-subtle flex items-center gap-1">
            <Calendar size={10} /> Last 90 Days
          </span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="rounded-xl border border-border-subtle p-4 bg-bg-surface flex flex-col">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Total Security Events</span>
            <span className="text-4xl font-bold font-display text-text-primary mb-4 mt-2">{typeof kpi.securityEvents === 'number' ? kpi.securityEvents.toLocaleString() : kpi.securityEvents}</span>
            <div className="grid grid-cols-2 gap-y-3 mt-auto">
              <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Blocked</span><span className="text-[#EF4444] font-mono text-lg font-bold">{(historical.data as any)?.blockedThreats ?? '-'}</span></div>
              <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">High Severity</span><span className="text-[#F97316] font-mono text-lg font-bold">{(sevBreakdown.data as any)?.severityCount?.HIGH ?? '-'}</span></div>
              <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Medium Severity</span><span className="text-[#EAB308] font-mono text-lg font-bold">{(sevBreakdown.data as any)?.severityCount?.MEDIUM ?? '-'}</span></div>
              <div className="flex flex-col"><span className="text-muted-foreground text-[10px]">Low Severity</span><span className="text-[#3B82F6] font-mono text-lg font-bold">{(sevBreakdown.data as any)?.severityCount?.LOW ?? '-'}</span></div>
            </div>
          </div>
          <div className="rounded-xl border border-border-subtle p-4 bg-bg-surface flex flex-col col-span-1 lg:col-span-2">
            <div className="flex gap-4 mb-4 border-b border-border-subtle pb-2">
              {[{ key: 'total' as const, label: 'Total', activeColor: '#F97316' }, { key: 'blocked' as const, label: 'Blocked', activeColor: '#EF4444' }, { key: 'successful' as const, label: 'Successful', activeColor: '#22C55E' }].map(({ key, label, activeColor }) => (
                <button key={key} onClick={() => setActiveTab(key)} className={twMerge(clsx("text-xs font-semibold outline-none", activeTab !== key && "text-muted-foreground hover:text-text-primary"))} style={activeTab === key ? { color: activeColor } : {}}>{label}</button>
              ))}
            </div>
            <div className="flex-1 mt-2">
              <LineChart data={timelineData} xKey="date" lines={[{ key: activeTab, label: activeTab, color: activeTab === 'total' ? '#F97316' : activeTab === 'blocked' ? '#EF4444' : '#22C55E' }]} height={180} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
