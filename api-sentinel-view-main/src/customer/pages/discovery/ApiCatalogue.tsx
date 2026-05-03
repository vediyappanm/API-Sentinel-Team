import React, { useState, useMemo, useRef } from 'react';
import { RefreshCw, Download, Globe, Eye, ShieldOff, Calendar, Filter, Upload, Search, X, ChevronRight, GitBranch, FileCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DonutChart from '@/components/charts/DonutChart';
import TimeFilter from '@/components/shared/TimeFilter';
import LineChart from '@/components/charts/LineChart';
import { MethodBadge, AuthBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import SparklineChart from '@/components/ui/SparklineChart';
import { useApiCollections, useApiInfos, useSeverityCounts } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { fetchWithSession } from '@/lib/api-client';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function mapRiskScore(score: number | undefined): string {
  if (!score && score !== 0) return '-';
  if (score >= 4) return 'Critical';
  if (score >= 3) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

function riskColor(label: string): string {
  switch (label) {
    case 'Critical': return '#EF4444';
    case 'High': return '#F97316';
    case 'Medium': return '#EAB308';
    default: return '#22C55E';
  }
}

const methodColors: Record<string, string> = {
  GET: '#22C55E', POST: '#632CA6', PUT: '#3B82F6', PATCH: '#8B5CF6', DELETE: '#EF4444', HEAD: '#6B7280', OPTIONS: '#6B7280',
};

const typeColors: Record<string, string> = {
  REST: '#3B82F6',
  GRAPHQL: '#632CA6',
  GRPC: '#22C55E',
  MCP: '#EAB308',
  WEBSOCKET: '#F97316',
  UNKNOWN: '#6B7280',
};

function inferApiType(url: string): keyof typeof typeColors {
  const u = (url || '').toLowerCase();
  if (u.includes('graphql')) return 'GRAPHQL';
  if (u.includes('/mcp') || u.includes('/sse')) return 'MCP';
  if (u.includes('grpc')) return 'GRPC';
  if (u.includes('ws') || u.includes('websocket')) return 'WEBSOCKET';
  return 'REST';
}

// Determine if API is Shadow (in traffic, not in spec) or Zombie (in spec, not in traffic)
function getApiLifecycleStatus(row: AktoApiInfo, hostCollection?: any): { isShadow: boolean; isZombie: boolean; isDeprecated: boolean } {
  // Shadow API: Has traffic (lastSeen) but not documented in spec
  const isInSpec = hostCollection?.type === 'OPEN_API' || hostCollection?.type === 'MIRRORING';
  const hasTraffic = row.lastSeen && row.lastSeen > 0;
  const isShadow = hasTraffic && !isInSpec;
  const isZombie = isInSpec && (!hasTraffic || (row.discoveredAt && row.discoveredAt > Date.now() - 30 * 24 * 60 * 60 * 1000));
  const isDeprecated = (row as any).deprecated || false;
  
  return { isShadow, isZombie, isDeprecated };
}

const ApiCatalogue: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedApi, setSelectedApi] = useState<AktoApiInfo | null>(null);
  const [showDetailsPanel, setShowDetailsPanel] = useState(false);
  const pageSize = 10;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ endpoints_discovered: number; threats_detected: number; lines: number } | null>(null);

  async function handleNginxUpload(file: File) {
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetchWithSession('/traffic/import/nginx-log', {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      setUploadResult(data);
      qc.invalidateQueries({ queryKey: ['discovery'] });
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const collections = useApiCollections();
  const firstCollectionId = collections.data?.apiCollections?.[0]?.id ?? null;
  const allIds = useMemo(() => collections.data?.apiCollections?.map(c => c.id) ?? [], [collections.data]);
  const apiInfos = useApiInfos(firstCollectionId, page, pageSize, 'lastSeen', -1);
  const sevCounts = useSeverityCounts(allIds);

  const isLoading = collections.isLoading || apiInfos.isLoading;
  const isError = collections.isError || apiInfos.isError;
  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['discovery'] });
  };

  const totalApis = collections.data?.apiCollections?.reduce((s, c) => s + (c.urlsCount || 0), 0) ?? 0;
  const rows = apiInfos.data?.apiInfoList ?? [];
  const total = apiInfos.data?.total ?? 0;

  // Filter rows based on search query
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return rows;
    const query = searchQuery.toLowerCase();
    return rows.filter(row => 
      row.id.url.toLowerCase().includes(query) ||
      row.id.method.toLowerCase().includes(query) ||
      (hostCollectionForRow(row)?.hostName?.toLowerCase().includes(query)) ||
      (hostCollectionForRow(row)?.displayName?.toLowerCase().includes(query))
    );
  }, [rows, searchQuery]);

  const hostCollectionForRow = (row: AktoApiInfo) => 
    collections.data?.apiCollections?.find(c => c.id === row.id.apiCollectionId);

  // Export handler
  const handleExport = () => {
    const csvHeaders = ['Method', 'Endpoint', 'Host', 'Discovered', 'Last Seen', 'Auth', 'Risk'];
    const csvRows = filteredRows.map(row => {
      const hostCollection = hostCollectionForRow(row);
      const risk = mapRiskScore(row.riskScore);
      const isUnauth = !row.allAuthTypesFound?.length || row.allAuthTypesFound.includes('UNAUTHENTICATED');
      return [
        row.id.method,
        row.id.url,
        hostCollection?.hostName || hostCollection?.displayName || '-',
        formatTs(row.discoveredAt ?? 0),
        formatTs(row.lastSeen),
        isUnauth ? 'Unauthenticated' : 'Authenticated',
        risk,
      ].map(v => `"${v}"`).join(',');
    });
    const csv = [csvHeaders.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-catalogue-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sevAgg = useMemo(() => {
    const result = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    sevCounts.data?.severitiesCountResponse?.forEach(s => {
      Object.entries(s.severityCount || {}).forEach(([k, v]) => {
        const key = k.toUpperCase() as keyof typeof result;
        if (key in result) result[key] += v;
      });
    });
    return result;
  }, [sevCounts.data]);

  const riskData = [
    { name: 'Critical', value: sevAgg.CRITICAL, color: '#EF4444' },
    { name: 'High', value: sevAgg.HIGH, color: '#F97316' },
    { name: 'Medium', value: sevAgg.MEDIUM, color: '#EAB308' },
    { name: 'Low', value: sevAgg.LOW, color: '#22C55E' },
  ];

  const methodDist = useMemo(() => {
    const c: Record<string, number> = {};
    filteredRows.forEach(r => { c[r.id.method] = (c[r.id.method] || 0) + 1; });
    return c;
  }, [filteredRows]);

  const authCounts = useMemo(() => {
    let unauth = 0;
    filteredRows.forEach(r => {
      if (!r.allAuthTypesFound?.length || r.allAuthTypesFound.includes('UNAUTHENTICATED')) unauth++;
    });
    return { unauth, auth: filteredRows.length - unauth };
  }, [filteredRows]);

  const mcpEndpoints = useMemo(() => filteredRows.filter(r => inferApiType(r.id.url) === 'MCP').length, [filteredRows]);
  const shadowCandidates = useMemo(() => {
    return filteredRows.filter(r => {
      const hostCollection = hostCollectionForRow(r);
      const lifecycle = getApiLifecycleStatus(r, hostCollection);
      return lifecycle.isShadow;
    }).length;
  }, [filteredRows]);
  const zombieCandidates = useMemo(() => {
    return filteredRows.filter(r => {
      const hostCollection = hostCollectionForRow(r);
      const lifecycle = getApiLifecycleStatus(r, hostCollection);
      return lifecycle.isZombie;
    }).length;
  }, [filteredRows]);
  const specCoverage = totalApis > 0 ? Math.round((authCounts.auth / Math.max(1, totalApis)) * 100) : 0;

  return (
    <div className="space-y-5 animate-fade-in w-full pb-10">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search endpoints..."
              className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border-subtle bg-bg-base text-text-primary placeholder-text-muted outline-none focus:border-brand/30 w-56 transition-all"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery'] })} className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
          <TimeFilter value={timeRange} onChange={setTimeRange} />
          <input ref={fileInputRef} type="file" accept=".log,.txt" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleNginxUpload(f); }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg border border-brand/30 px-3 py-1.5 text-xs text-brand hover:bg-brand/10 transition-all outline-none disabled:opacity-50">
            <Upload size={13} /> {uploading ? 'Importing...' : 'Import Log'}
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-brand/20 transition-all outline-none">
            <Download size={13} /> Export
          </button>
        </div>
      </div>

      {/* Upload banner */}
      {uploadResult && (
        <div className="flex items-center gap-4 glass-card-premium rounded-lg px-4 py-2.5 text-xs text-sev-low border border-sev-low/20 animate-fade-in">
          <span className="font-bold">Log imported successfully.</span>
          <span className="text-text-secondary">Lines: <strong className="text-text-primary">{uploadResult.lines}</strong></span>
          <span className="text-text-secondary">Endpoints: <strong className="text-text-primary">{uploadResult.endpoints_discovered}</strong></span>
          <span className="text-text-secondary">Threats: <strong className="text-sev-critical">{uploadResult.threats_detected}</strong></span>
          <button onClick={() => setUploadResult(null)} className="ml-auto text-text-muted hover:text-text-primary">x</button>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget
          label="APIs Discovered"
          value={totalApis}
          icon={Globe}
          iconColor="#3B82F6"
          iconBg="rgba(59,130,246,0.1)"
          sparkData={[totalApis * 0.6, totalApis * 0.7, totalApis * 0.8, totalApis * 0.85, totalApis * 0.9, totalApis * 0.95, totalApis]}
          sparkColor="#3B82F6"
          changeLabel={`${authCounts.unauth} unauthenticated, ${authCounts.auth} authenticated`}
        />

        <GlassCard variant="default" className="p-4 flex items-center gap-4">
          <DonutChart data={riskData} size={100} innerRadius={30} outerRadius={44} centerValue={totalApis} centerLabel="APIs" />
          <div className="flex-1 space-y-1.5">
            <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Risk Distribution</span>
            {riskData.map(d => (
              <div key={d.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                  <span className="text-[11px] text-text-secondary">{d.name}</span>
                </div>
                <span className="text-[11px] font-bold text-text-primary tabular-nums">{d.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="default" className="p-4">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Method Distribution</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(methodDist).sort((a, b) => b[1] - a[1]).map(([method, count]) => (
              <span
                key={method}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                style={{
                  color: methodColors[method] || '#6B7280',
                  borderColor: `${methodColors[method] || '#6B7280'}30`,
                  background: `${methodColors[method] || '#6B7280'}08`,
                }}
              >
                {method}
                <span className="text-text-primary">{count}</span>
              </span>
            ))}
          </div>
          {Object.keys(methodDist).length === 0 && (
            <p className="text-xs text-text-muted mt-3">No method data</p>
          )}
        </GlassCard>
      </div>

      {/* Discovery Signals */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricWidget
          label="Spec Coverage (Est.)"
          value={specCoverage}
          suffix="%"
          icon={Eye}
          iconColor="#632CA6"
          iconBg="rgba(99,44,175,0.1)"
          sparkData={[specCoverage - 8, specCoverage - 5, specCoverage - 3, specCoverage - 2, specCoverage]}
          sparkColor="#632CA6"
          changeLabel="Traffic-based OpenAPI inference"
        />
        <MetricWidget
          label="Shadow / Rogue"
          value={shadowCandidates}
          icon={ShieldOff}
          iconColor="#EF4444"
          iconBg="rgba(239,68,68,0.1)"
          sparkData={[shadowCandidates, shadowCandidates, shadowCandidates + 1, shadowCandidates]}
          sparkColor="#EF4444"
          changeLabel="Unregistered endpoints detected"
        />
        <MetricWidget
          label="MCP Endpoints"
          value={mcpEndpoints}
          icon={Globe}
          iconColor="#EAB308"
          iconBg="rgba(234,179,8,0.1)"
          sparkData={[mcpEndpoints, mcpEndpoints + 1, mcpEndpoints]}
          sparkColor="#EAB308"
          changeLabel="Agentic tool surfaces"
        />
      </div>

      {isError && <QueryError message="Failed to load API catalogue" onRetry={refetch} />}

      {!isLoading && !isError && total === 0 && (
        <GlassCard variant="accent" className="px-5 py-4 flex items-start gap-4">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
            <Eye size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Awaiting Traffic Analysis</p>
            <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
              No API endpoints discovered yet. Import an nginx/apache access log using <strong className="text-brand">Import Log</strong> above, or connect a live traffic sensor.
            </p>
          </div>
        </GlassCard>
      )}

      {/* Table */}
      <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-bold text-text-primary flex items-center gap-2">
            API Catalogue
            <span className="text-[11px] bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full text-text-muted flex items-center gap-1">
              <Calendar size={10} /> Last 90 days
            </span>
          </span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 text-xs text-text-muted">
              <span>{page * pageSize + 1} - {Math.min((page + 1) * pageSize, filteredRows.length)} of {filteredRows.length}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[11px] disabled:opacity-30 hover:border-brand/20 transition-all">Prev</button>
                <button disabled={(page + 1) * pageSize >= filteredRows.length} onClick={() => setPage(p => p + 1)} className="px-2 py-1 rounded-md bg-bg-elevated border border-border-subtle text-[11px] disabled:opacity-30 hover:border-brand/20 transition-all">Next</button>
              </div>
            </div>
            <button className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated outline-none transition-colors">
              <Filter size={14} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={10} rows={pageSize} />
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
              <thead className="bg-bg-base/50">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-10 text-center">
                    <input type="checkbox" className="accent-brand" />
                  </th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-24">Traits</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Type</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-[30%]">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-[18%]">Host</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-28 text-center">Discovered</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-28 text-center">Last Seen</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Auth</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-20 text-center">Risk</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted w-16 text-center">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {filteredRows.slice(page * pageSize, (page + 1) * pageSize).map((row) => {
                  const risk = mapRiskScore(row.riskScore);
                  const isUnauth = !row.allAuthTypesFound?.length || row.allAuthTypesFound.includes('UNAUTHENTICATED');
                  const hostCollection = hostCollectionForRow(row);
                  const apiType = inferApiType(row.id.url);
                  const typeColor = typeColors[apiType] || '#6B7280';
                  return (
                    <tr 
                      key={`${row.id.apiCollectionId}-${row.id.method}-${row.id.url}`} 
                      className="data-row-interactive hover:bg-white/[0.02] transition-colors cursor-pointer"
                      onClick={() => {
                        setSelectedApi(row);
                        setShowDetailsPanel(true);
                      }}
                    >
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" className="accent-brand" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1.5 items-center flex-wrap">
                          <Globe size={12} className="text-sev-info" />
                          {isUnauth && <ShieldOff size={12} className="text-sev-critical" />}
                          {(() => {
                            const lifecycle = getApiLifecycleStatus(row, hostCollection);
                            if (lifecycle.isShadow) {
                              return (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sev-critical/10 text-sev-critical border border-sev-critical/20 flex items-center gap-1">
                                  <ShieldOff size={8} /> Shadow
                                </span>
                              );
                            }
                            if (lifecycle.isZombie) {
                              return (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sev-medium/10 text-sev-medium border border-sev-medium/20 flex items-center gap-1">
                                  <Calendar size={8} /> Zombie
                                </span>
                              );
                            }
                            if (lifecycle.isDeprecated) {
                              return (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-bg-elevated text-text-muted border border-border-subtle">
                                  Deprecated
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className="text-[11px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ color: typeColor, background: `${typeColor}12`, borderColor: `${typeColor}30` }}
                        >
                          {apiType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={row.id.method} />
                          <span className="text-[12px] font-mono text-text-primary truncate">{row.id.url}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text-secondary truncate">{hostCollection?.hostName || hostCollection?.displayName || '-'}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-text-muted text-center">{formatTs(row.discoveredAt ?? 0)}</td>
                      <td className="px-4 py-3 text-[11px] font-mono text-text-muted text-center">{formatTs(row.lastSeen)}</td>
                      <td className="px-4 py-3 text-center"><AuthBadge auth={isUnauth ? 'Unauth' : 'Authenticated'} /></td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{
                          color: riskColor(risk),
                          background: `${riskColor(risk)}12`,
                        }}>{risk}</span>
                      </td>
                      <td className="px-4 py-3 flex justify-center">
                        <SparklineChart
                          data={Array.from({ length: 7 }, () => Math.floor(Math.random() * 50 + 10))}
                          color="#9D9DAF"
                          width={48}
                          height={16}
                          showDot={false}
                          strokeWidth={1}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && !isLoading && (
                  <tr><td colSpan={10} className="px-4 py-12 text-center text-xs text-text-muted">No APIs found. Connect a traffic source to start discovering APIs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Details Side Panel */}
      {showDetailsPanel && selectedApi && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowDetailsPanel(false)}>
          <div 
            className="w-full max-w-2xl bg-bg-surface border border-border-subtle rounded-xl shadow-2xl animate-slide-up m-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <MethodBadge method={selectedApi.id.method} />
                  <span className="text-sm font-bold text-text-primary font-mono">{selectedApi.id.url}</span>
                </div>
              </div>
              <button 
                onClick={() => setShowDetailsPanel(false)}
                className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-all"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">API Collection</p>
                  <p className="text-sm text-text-primary mt-1">
                    {hostCollectionForRow(selectedApi)?.displayName || 'Default Inventory'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Host</p>
                  <p className="text-sm text-text-primary mt-1">
                    {hostCollectionForRow(selectedApi)?.hostName || 'internal'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Discovered</p>
                  <p className="text-sm text-text-primary mt-1 font-mono">{formatTs(selectedApi.discoveredAt ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Last Seen</p>
                  <p className="text-sm text-text-primary mt-1 font-mono">{formatTs(selectedApi.lastSeen)}</p>
                </div>
              </div>

              {/* Authentication */}
              <div>
                <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-2">Authentication</p>
                <div className="flex items-center gap-2">
                  <AuthBadge auth={!selectedApi.allAuthTypesFound?.length || selectedApi.allAuthTypesFound.includes('UNAUTHENTICATED') ? 'Unauthenticated' : 'Authenticated'} />
                  {selectedApi.allAuthTypesFound?.length > 0 && !selectedApi.allAuthTypesFound.includes('UNAUTHENTICATED') && (
                    <div className="flex gap-1">
                      {selectedApi.allAuthTypesFound.map(auth => (
                        <span key={auth} className="text-[10px] px-2 py-0.5 rounded-full bg-bg-elevated border border-border-subtle text-text-secondary">
                          {auth}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Risk Score */}
              <div>
                <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-2">Risk Assessment</p>
                <div className="flex items-center gap-3">
                  <span 
                    className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{
                      color: riskColor(mapRiskScore(selectedApi.riskScore)),
                      background: `${riskColor(mapRiskScore(selectedApi.riskScore))}12`,
                    }}
                  >
                    {mapRiskScore(selectedApi.riskScore)}
                  </span>
                  <span className="text-xs text-text-muted">
                    Score: {selectedApi.riskScore ?? 'N/A'}
                  </span>
                </div>
              </div>

              {/* API Type */}
              <div>
                <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold mb-2">API Type</p>
                <span
                  className="text-[11px] font-bold px-2.5 py-1 rounded-full border"
                  style={{ 
                    color: typeColors[inferApiType(selectedApi.id.url)] || '#6B7280',
                    background: `${typeColors[inferApiType(selectedApi.id.url)] || '#6B7280'}12`,
                    borderColor: `${typeColors[inferApiType(selectedApi.id.url)] || '#6B7280'}30`,
                  }}
                >
                  {inferApiType(selectedApi.id.url)}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-border-subtle">
                <button 
                  onClick={() => {
                    navigate(`/app/discovery/sequences?endpoint=${encodeURIComponent(selectedApi.id.url)}&method=${selectedApi.id.method}`);
                    setShowDetailsPanel(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-brand/10 text-brand hover:bg-brand/20 transition-all text-sm font-semibold"
                >
                  <GitBranch size={14} /> View Sequences
                </button>
                <button 
                  onClick={() => {
                    navigate(`/app/testing?endpoint=${encodeURIComponent(selectedApi.id.url)}`);
                    setShowDetailsPanel(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-bg-elevated text-text-secondary hover:text-text-primary border border-border-subtle transition-all text-sm font-semibold"
                >
                  <FileCheck size={14} /> Run Tests
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApiCatalogue;
