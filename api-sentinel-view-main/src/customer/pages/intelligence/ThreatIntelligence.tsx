import React, { useMemo } from 'react';
import { RefreshCw, Zap, Eye, Shield, TrendingUp, AlertTriangle, Activity, Target } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useThreatCategoryCount, useSeverityCount, useThreatTopN, useActorsGeoCount } from '@/hooks/use-protection';
import { centroidForCountryCode } from '@/lib/country-centroids';
import GeoMap from '@/components/charts/GeoMap';
import DonutChart from '@/components/charts/DonutChart';
import GlassCard from '@/components/ui/GlassCard';
import MetricWidget from '@/components/ui/MetricWidget';
import ProgressRing from '@/components/ui/ProgressRing';
import AnimatedCounter from '@/components/ui/AnimatedCounter';

function computeRiskScore(crit: number, high: number, med: number): number {
  return Math.min(100, crit * 20 + high * 10 + med * 3);
}

const ThreatIntelligence: React.FC = () => {
  const qc = useQueryClient();

  const catCount = useThreatCategoryCount();
  const sevCount = useSeverityCount();
  const topN = useThreatTopN();
  const geo = useActorsGeoCount();

  const cats: Record<string, number> = catCount.data?.categoryCount ?? {};
  const sev: Record<string, number> = sevCount.data?.severityCount ?? {};
  const crit = sev['CRITICAL'] ?? 0;
  const high = sev['HIGH'] ?? 0;
  const med = sev['MEDIUM'] ?? 0;
  const riskScore = computeRiskScore(crit, high, med);

  const totalEvents = Object.values(cats).reduce((a, b) => a + b, 0);
  const topAttack = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
  const activeCategories = Object.entries(cats).filter(([, count]) => Number(count) > 0).length;

  const agenticSignals = useMemo(() => {
    const catLower = Object.fromEntries(Object.entries(cats).map(([k, v]) => [k.toLowerCase(), v as number]));
    const lookup = (keys: string[]) => keys.reduce((s, k) => s + (catLower[k] ?? 0), 0);
    return {
      promptInjection: lookup(['prompt injection', 'prompt_injection', 'context overflow']),
      toolMisuse: lookup(['tool misuse', 'tool_misuse']),
      trustChain: lookup(['a2a trust', 'trust chain', 'delegation abuse']),
      mcp: lookup(['mcp', 'mcp server', 'mcp tool']),
    };
  }, [cats]);

  const geoThreats = useMemo(() => {
    return Object.entries(geo.data?.countPerCountry ?? {})
      .map(([code, count]) => {
        const coords = centroidForCountryCode(code);
        if (!coords) return null;
        return {
          lat: coords.lat,
          lng: coords.lng,
          severity: count > 100 ? ('critical' as const) : count > 50 ? ('high' as const) : ('medium' as const),
          country: code,
          count,
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null);
  }, [geo.data]);

  const severityData = [
    { name: 'Critical', value: sev['CRITICAL'] ?? 0, color: '#EF4444' },
    { name: 'High', value: sev['HIGH'] ?? 0, color: '#F97316' },
    { name: 'Medium', value: sev['MEDIUM'] ?? 0, color: '#EAB308' },
    { name: 'Low', value: sev['LOW'] ?? 0, color: '#22C55E' },
  ];

  const isLoading = catCount.isLoading || sevCount.isLoading;

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Shield size={18} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Threat Intelligence</h2>
            <p className="text-[11px] text-text-muted">Detection category mix from live API traffic and scans</p>
          </div>
        </div>
        <button onClick={() => { qc.invalidateQueries({ queryKey: ['protection'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); }}
          className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <GlassCard variant="default" className="p-4 flex items-center gap-3">
          <ProgressRing value={riskScore} max={100} size={64} strokeWidth={6} label="Risk" />
          <div>
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Risk Score</span>
            <p className="text-2xl font-bold text-text-primary tabular-nums"><AnimatedCounter value={riskScore} /></p>
            <span className="text-[11px] text-text-muted">from severity mix</span>
          </div>
        </GlassCard>

        <MetricWidget label="Events Detected" value={totalEvents} icon={Activity} iconColor="#3B82F6" iconBg="rgba(59,130,246,0.1)" />

        <GlassCard variant="default" className="p-4 flex flex-col gap-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5"><AlertTriangle size={10} /> Top Attack Vector</span>
          <span className="text-base font-bold text-brand truncate">{topAttack?.[0] ?? 'None'}</span>
          <span className="text-[11px] text-text-muted">{topAttack?.[1] ?? 0} events</span>
        </GlassCard>

        <GlassCard variant="default" className="p-4 flex flex-col gap-2">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold flex items-center gap-1.5"><Zap size={10} /> Active Categories</span>
          <span className="text-2xl font-bold text-brand tabular-nums"><AnimatedCounter value={activeCategories} /></span>
          <span className="text-[11px] text-text-muted">with detections</span>
        </GlassCard>
      </div>

      <GlassCard variant="elevated" className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={16} className="text-brand" />
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Attack Category Mix</span>
        </div>
        {(Object.keys(cats).length === 0 || !Object.entries(cats).some(e => Number(e[1]) > 0)) ? (
          <div className="flex flex-col items-center justify-center h-48 text-text-muted">
            <Eye size={32} className="mb-3 opacity-30" />
            <p className="text-xs">No attack patterns detected yet.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {Object.entries(cats).sort((a, b) => b[1] - a[1]).filter(([, cnt]) => cnt > 0).slice(0, 10).map(([cat, cnt], idx) => {
              const pct = totalEvents > 0 ? (cnt / totalEvents) * 100 : 0;
              const colors = ['#EF4444', '#632CA6', '#EAB308', '#3B82F6', '#7C3AED', '#22C55E', '#632CA6', '#EF4444'];
              const col = colors[idx % colors.length];
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-text-secondary truncate max-w-[220px]">{cat}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-muted">{pct.toFixed(1)}%</span>
                      <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color: col }}>{cnt}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-black/[0.04] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: col }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      {/* Agentic / MCP category counts (honest: from category labels only) */}
      <GlassCard variant="default" className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield size={14} className="text-brand" />
          <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Agentic & MCP Categories</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Prompt Injection', value: agenticSignals.promptInjection, color: '#EF4444' },
            { label: 'Tool Misuse', value: agenticSignals.toolMisuse, color: '#F97316' },
            { label: 'Trust Chain', value: agenticSignals.trustChain, color: '#632CA6' },
            { label: 'MCP Traffic', value: agenticSignals.mcp, color: '#EAB308' },
          ].map((item) => (
            <div key={item.label} className="metric-card p-3">
              <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">{item.label}</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-text-muted mt-3">
          Counts are summed from matching detection category labels — not a separate ML ensemble.
        </p>
      </GlassCard>

      {/* Geo + Severity */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <GlassCard variant="default" className="lg:col-span-2 p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-sev-low" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Global Threat Origin</span>
          </div>
          <GeoMap threats={geoThreats} />
        </GlassCard>

        <GlassCard variant="default" className="p-4 flex flex-col items-center">
          <div className="flex items-center gap-2 mb-3 w-full">
            <Shield size={14} className="text-[#3B82F6]" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Severity Mix</span>
          </div>
          <DonutChart data={severityData} centerValue={totalEvents} size={140} innerRadius={44} outerRadius={64} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 w-full">
            {severityData.map(({ name, value, color }) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
                  <span className="text-[11px] text-text-secondary">{name}</span>
                </div>
                <span className="text-[11px] font-bold font-mono tabular-nums" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* Top Attacked Endpoints */}
      {topN.data?.topApis?.length > 0 && (
        <GlassCard variant="default" className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target size={14} className="text-sev-critical" />
            <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Most Targeted Attack Patterns</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {topN.data.topApis.slice(0, 5).map((item, idx) => (
              <div key={idx} className="metric-card p-3">
                <span className="text-[9px] text-text-muted uppercase">#{idx + 1}</span>
                <p className="text-xs font-semibold text-text-primary mt-1 truncate">{item.name}</p>
                <p className="text-xl font-bold text-sev-critical mt-1 tabular-nums">{item.count}</p>
                <p className="text-[9px] text-text-muted">events</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
};

export default ThreatIntelligence;
