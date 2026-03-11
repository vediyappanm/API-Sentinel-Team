import React, { useState } from 'react';
import { RefreshCw, ChevronRight, Activity, ShieldAlert, Eye, Lock, Cpu, TrendingUp } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import TimeFilter from '@/components/shared/TimeFilter';
import SummaryPanel from '@/components/shared/SummaryPanel';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useApiCollections, useEndpointsCount } from '@/hooks/use-discovery';
import { useIssueSummary } from '@/hooks/use-testing';
import { useDashboardKPIs } from '@/hooks/use-dashboard';
import { useQueryClient } from '@tanstack/react-query';

const STAT = ({ label, value, color }: { label: string; value: string | number; color?: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
    <span className="text-base font-bold font-mono" style={{ color: color || 'var(--text-primary)' }}>{value}</span>
  </div>
);

const Organization: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const qc = useQueryClient();

  const { data: collectionsData, isLoading, isError, refetch } = useApiCollections();
  const epCount = useEndpointsCount();
  const issueSummary = useIssueSummary();
  const { threats } = useDashboardKPIs();

  const collections = collectionsData?.apiCollections ?? [];
  const totalApis = epCount.data?.endpointsCount ?? 0;

  const sev = issueSummary.data?.severityBreakdown ?? {};
  const criticalCount = (sev as any).CRITICAL ?? 0;
  const highCount = (sev as any).HIGH ?? 0;
  const mediumCount = (sev as any).MEDIUM ?? 0;
  const lowCount = (sev as any).LOW ?? 0;
  const totalVulns = issueSummary.data?.totalIssues ?? 0;
  const blockedActors = (threats.data as any)?.threatData?.blockedActors ?? 0;

  const riskData = [
    { name: 'Critical', value: criticalCount, color: '#EF4444' },
    { name: 'High', value: highCount, color: '#F97316' },
    { name: 'Medium', value: mediumCount, color: '#EAB308' },
    { name: 'Low', value: lowCount, color: '#22C55E' },
  ];
  const riskTotal = riskData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Organization Overview</h1>
          <p className="text-xs text-muted-foreground mt-0.5">All applications and their security posture</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { qc.invalidateQueries({ queryKey: ['discovery'] }); qc.invalidateQueries({ queryKey: ['testing'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }}
            className="w-8 h-8 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand hover:border-brand/30 transition-all outline-none"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {isError && <QueryError message="Failed to load organization data" onRetry={() => refetch()} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total APIs', value: totalApis, icon: Cpu, color: 'var(--text-primary)' },
          { label: 'Critical Risk', value: criticalCount, icon: ShieldAlert, color: '#EF4444' },
          { label: 'High Risk', value: highCount, icon: ShieldAlert, color: '#F97316' },
          { label: 'Applications', value: collections.length, icon: Eye, color: '#3B82F6' },
          { label: 'Total Vulns', value: totalVulns, icon: Activity, color: '#EAB308' },
          { label: 'Blocked Actors', value: blockedActors, icon: Lock, color: '#22C55E' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="rounded-xl p-4 border border-border-subtle bg-bg-surface card-hover flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">{label}</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}18` }}>
                <Icon size={13} style={{ color }} />
              </div>
            </div>
            <span className="text-2xl font-bold font-display" style={{ color }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
          </div>
        ))}
      </div>

      <SummaryPanel>
        <div className="rounded-xl border border-border-subtle p-4 min-w-[300px] flex flex-col gap-3 bg-bg-surface">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">Security Posture</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold font-display text-text-primary">{totalApis.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">APIs monitored</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {[
              ['Collections', String(collections.length), 'var(--text-primary)'],
              ['Critical', String(criticalCount), '#EF4444'],
              ['High', String(highCount), '#F97316'],
              ['Medium', String(mediumCount), '#EAB308'],
              ['Low', String(lowCount), '#22C55E'],
              ['Total Vulns', String(totalVulns), '#EAB308'],
            ].map(([k, v, c]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">{k}</span>
                <span className="text-[11px] font-mono font-bold" style={{ color: c }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border-subtle p-4 min-w-[180px] flex flex-col items-center bg-bg-surface">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold w-full mb-3">Vulnerability Distribution</span>
          <DonutChart data={riskData} centerValue={riskTotal} size={120} innerRadius={38} outerRadius={55} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 w-full">
            {riskData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                  <span className="text-[9px] text-muted-foreground">{name}</span>
                </div>
                <span className="text-[10px] font-bold font-mono" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </SummaryPanel>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-text-primary uppercase tracking-wider">Applications</h2>
          <span className="text-xs text-muted-foreground">{collections.length} applications</span>
        </div>

        {isLoading ? <TableSkeleton columns={6} rows={3} /> : (
          <div className="space-y-3">
            {collections.length === 0 && (
              <div className="rounded-xl border border-border-subtle p-12 text-center bg-bg-surface">
                <p className="text-xs text-muted-foreground">No applications found. Connect a traffic source to start discovering APIs.</p>
              </div>
            )}
            {collections.map((app, idx) => {
              // Single collection gets the real aggregate data
              const isDefault = collections.length === 1 || idx === 0;
              const epValue = isDefault ? totalApis : (app.urlsCount ?? 0);
              const critVal = isDefault ? criticalCount : 0;
              const highVal = isDefault ? highCount : 0;
              const medVal = isDefault ? mediumCount : 0;
              const lowVal = isDefault ? lowCount : 0;
              const vulnCount = isDefault ? totalVulns : 0;

              return (
                <div key={app.id}
                  className="rounded-xl border border-border-subtle p-5 card-hover group cursor-pointer bg-bg-surface">

                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.2)' }}>
                        <Cpu size={14} className="text-brand" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-text-primary">{app.displayName || app.hostName || `Collection ${app.id}`}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-subtle text-muted-foreground"
                            style={{ background: 'rgba(255,255,255,0.04)' }}>{app.type || 'API'}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded text-muted-foreground">{app.hostName}</span>
                        </div>
                      </div>
                    </div>
                    <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-brand transition-all outline-none bg-brand/10 border border-brand/20">
                      Open Dashboard <ChevronRight size={12} />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-4 pt-3 border-t border-border-subtle">
                    <STAT label="Endpoints" value={epValue} color="var(--text-primary)" />
                    <STAT label="Critical" value={critVal} color="#EF4444" />
                    <STAT label="High" value={highVal} color="#F97316" />
                    <STAT label="Medium" value={medVal} color="#EAB308" />
                    <STAT label="Low" value={lowVal} color="#22C55E" />
                    <STAT label="Total Vulns" value={vulnCount} color="#EF4444" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Organization;
