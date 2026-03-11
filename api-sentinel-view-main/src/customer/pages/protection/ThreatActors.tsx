import React, { useState, useMemo } from 'react';
import { RefreshCw, Download, Filter, Calendar } from 'lucide-react';
import TimeFilter from '@/components/shared/TimeFilter';
import SummaryPanel from '@/components/shared/SummaryPanel';
import DonutChart from '@/components/charts/DonutChart';
import CarouselCard from '@/components/shared/CarouselCard';
import GeoMap from '@/components/charts/GeoMap';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useThreatActors, useActorsGeoCount, useSeverityCount, useModifyActorStatus } from '@/hooks/use-protection';
import { useQueryClient } from '@tanstack/react-query';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function daysAgoTs(days: number) {
  return Math.floor((Date.now() - days * 86400_000) / 1000);
}

const ThreatActors: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  const startTs = useMemo(() => daysAgoTs(30), []);
  const endTs = useMemo(() => Math.floor(Date.now() / 1000), []);

  const { data, isLoading, isError, refetch } = useThreatActors(page, pageSize, 'lastSeenAt', -1, undefined, startTs, endTs);
  const geoCount = useActorsGeoCount();
  const sevCount = useSeverityCount(startTs, endTs);
  const { mutate: modifyStatus } = useModifyActorStatus();

  const rows = data?.threatActors ?? [];
  const total = data?.total ?? 0;

  // State aggregation from rows
  const stateCounts = useMemo(() => {
    const c = { BLOCKED: 0, MONITORED: 0, WHITELISTED: 0 };
    rows.forEach(r => {
      const s = (r.actorStatus || '').toUpperCase();
      if (s in c) c[s as keyof typeof c]++;
    });
    return c;
  }, [rows]);

  // Severity from API
  const sev = sevCount.data?.severityCount ?? {};

  // Geo data for map
  const threatsGeo = useMemo(() => {
    const geo = geoCount.data?.countPerCountry ?? {};
    return Object.entries(geo).slice(0, 10).map(([country]) => ({
      lat: 0, lng: 0, severity: 'critical' as const, country,
    }));
  }, [geoCount.data]);

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-end gap-3 mb-2">
        <button onClick={() => qc.invalidateQueries({ queryKey: ['protection'] })} className="text-muted-foreground hover:text-text-primary transition-colors outline-none cursor-pointer p-1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <TimeFilter value={timeRange} onChange={setTimeRange} />
      </div>

      <SummaryPanel>
        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[200px] flex flex-col justify-center gap-4">
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs font-medium">Total</span>
            <span className="text-2xl font-bold font-display text-text-primary">{total}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs font-medium">Blocked</span>
            <span className="text-2xl font-bold font-display text-[#EF4444]">{stateCounts.BLOCKED}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground text-xs font-medium">Whitelisted</span>
            <span className="text-2xl font-bold font-display text-[#22C55E]">{stateCounts.WHITELISTED}</span>
          </div>
        </div>

        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[150px] flex flex-col items-center">
          <span className="text-xs text-muted-foreground font-medium w-full text-left mb-2">State</span>
          <DonutChart data={[
            { name: 'Blocked', value: stateCounts.BLOCKED, color: '#EF4444' },
            { name: 'Monitor', value: stateCounts.MONITORED, color: '#EAB308' },
            { name: 'Whitelist', value: stateCounts.WHITELISTED, color: '#22C55E' },
          ]} size={110} innerRadius={34} outerRadius={50} />
        </div>

        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[150px] flex flex-col items-center">
          <span className="text-xs text-muted-foreground font-medium w-full text-left mb-2">Threat-Level</span>
          <DonutChart data={[
            { name: 'High', value: sev['HIGH'] ?? sev['CRITICAL'] ?? 0, color: '#EF4444' },
            { name: 'Medium', value: sev['MEDIUM'] ?? 0, color: '#F97316' },
            { name: 'Low', value: sev['LOW'] ?? 0, color: '#EAB308' },
          ]} size={110} innerRadius={34} outerRadius={50} />
        </div>

        <div className="min-w-[180px]">
          <CarouselCard title="Top Attack Techniques" items={[
            <div key="1" className="flex flex-col gap-2 font-mono mt-4 text-[10px]">
              {rows.slice(0, 3).map(r => (
                <div key={r.id} className="flex justify-between items-center">
                  <span className="text-text-primary">{r.latestApiAttackType?.[0] || 'Unknown'}</span>
                  <span className="text-brand font-bold">{r.totalRequests}</span>
                </div>
              ))}
              {rows.length === 0 && <span className="text-muted-foreground">No data</span>}
            </div>
          ]} />
        </div>

        <div className="min-w-[300px]">
          <GeoMap threats={threatsGeo} />
        </div>
      </SummaryPanel>

      {isError && <QueryError message="Failed to load threat actors" onRetry={() => refetch()} />}

      <div className="bg-bg-base border border-border-subtle rounded-lg overflow-hidden mt-6 flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-bg-surface">
          <span className="text-sm font-bold text-text-primary uppercase tracking-tight flex items-center gap-2">Threats <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-muted-foreground flex items-center gap-1"><Calendar size={10} /> Last 30 Days</span></span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{page * pageSize + 1} – {Math.min((page + 1) * pageSize, total)} of {total}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">←</button>
                <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-surface border border-border-subtle text-[10px] disabled:opacity-30">→</button>
              </div>
            </div>
            <button className="p-1 text-muted-foreground hover:text-text-primary"><Filter size={14} /></button>
          </div>
        </div>

        {isLoading ? <TableSkeleton columns={10} rows={pageSize} /> : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-12 text-center">☐</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-[18%]">Monitored User</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-24 text-center">Risk↕</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-24 text-center">Attempts</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-32">Tactics</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-40">Techniques Used</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-28">Geolocation</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-32">State</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-32 text-center">Last State Transition</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground w-32 text-center">First Discovered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map(row => {
                  const riskColor = (row.severity || '').toUpperCase() === 'HIGH' || (row.severity || '').toUpperCase() === 'CRITICAL' ? '#EF4444' : '#EAB308';
                  const stateLabel = row.actorStatus === 'BLOCKED' ? 'Block Threat Actor' : row.actorStatus === 'MONITORED' ? 'Monitor' : 'Whitelist';
                  return (
                    <tr key={row.id} className="hover:bg-bg-hover transition-colors">
                      <td className="px-4 py-4 text-center"><input type="checkbox" className="accent-brand" /></td>
                      <td className="px-4 py-4 text-[13px] font-mono text-text-primary">{row.latestApiIp || row.id}</td>
                      <td className="px-4 py-4 text-center text-[13px] font-bold" style={{ color: riskColor }}>{row.severity || '-'}</td>
                      <td className="px-4 py-4 text-center text-[12px] font-mono text-text-primary">{row.totalRequests}</td>
                      <td className="px-4 py-4 text-xs text-muted-foreground leading-relaxed">{(row.latestApiAttackType || []).join(', ') || '-'}</td>
                      <td className="px-4 py-4 text-xs text-muted-foreground leading-relaxed">{(row.latestApiAttackType || []).join(', ') || '-'}</td>
                      <td className="px-4 py-4 text-xs text-text-primary">{row.country || '-'}</td>
                      <td className="px-4 py-4 text-xs">
                        {row.actorStatus === 'BLOCKED' ? (
                          <button
                            onClick={() => modifyStatus({ actorId: row.id, status: 'MONITORING' })}
                            className="text-[#22C55E] hover:underline"
                          >
                            Unblock
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => modifyStatus({ actorId: row.id, status: 'BLOCKED' })}
                              className="text-[#EF4444] hover:underline font-semibold"
                            >
                              Block
                            </button>
                            <span className="text-muted-foreground">|</span>
                            <button
                              onClick={() => modifyStatus({ actorId: row.id, status: 'WHITELISTED' })}
                              className="text-brand hover:underline"
                            >
                              Whitelist
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-[11px] font-mono text-muted-foreground text-center">{formatTs(row.lastSeenAt)}</td>
                      <td className="px-4 py-4 text-[11px] font-mono text-muted-foreground text-center">{formatTs(row.discoveredAt)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-muted-foreground">No threat actors detected.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ThreatActors;
