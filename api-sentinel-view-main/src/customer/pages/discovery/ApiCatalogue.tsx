import React, { useState, useMemo, useRef } from 'react';
import { RefreshCw, Download, Globe, Users, Eye, ShieldOff, Calendar, Filter, Upload } from 'lucide-react';
import DonutChart from '@/components/charts/DonutChart';
import TimeFilter from '@/components/shared/TimeFilter';
import SummaryPanel from '@/components/shared/SummaryPanel';
import LineChart from '@/components/charts/LineChart';
import { MethodBadge, AuthBadge } from '@/components/shared/Badges';
import TableSkeleton from '@/components/shared/TableSkeleton';
import QueryError from '@/components/shared/QueryError';
import { useApiCollections, useApiInfos, useSeverityCounts } from '@/hooks/use-discovery';
import { useQueryClient } from '@tanstack/react-query';

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

const ApiCatalogue: React.FC = () => {
  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h');
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const qc = useQueryClient();

  // Nginx log upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ endpoints_discovered: number; threats_detected: number; lines: number } | null>(null);

  async function handleNginxUpload(file: File) {
    setUploading(true);
    setUploadResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const BASE = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000');
      const token = localStorage.getItem('sentinel_token');
      const res = await fetch(`${BASE}/api/traffic/import/nginx-log`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setUploadResult(data);
      qc.invalidateQueries({ queryKey: ['discovery'] });
    } catch (e) {
      alert(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
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
  const hasError = collections.isError || apiInfos.isError;

  // Summary stats from API
  const totalApis = collections.data?.apiCollections?.reduce((s, c) => s + (c.urlsCount || 0), 0) ?? 0;
  const rows = apiInfos.data?.apiInfoList ?? [];
  const total = apiInfos.data?.total ?? 0;

  // Severity aggregation
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
    rows.forEach(r => { c[r.id.method] = (c[r.id.method] || 0) + 1; });
    return c;
  }, [rows]);

  const methodData = [
    { name: 'GET', value: methodDist['GET'] || 0, color: '#22C55E' },
    { name: 'POST', value: methodDist['POST'] || 0, color: '#F97316' },
    { name: 'DELETE', value: methodDist['DELETE'] || 0, color: '#EF4444' },
    { name: 'Others', value: Object.entries(methodDist).filter(([k]) => !['GET', 'POST', 'DELETE'].includes(k)).reduce((s, [, v]) => s + v, 0), color: '#4B5563' },
  ];

  // Auth aggregation
  const authCounts = useMemo(() => {
    let unauth = 0;
    rows.forEach(r => {
      if (!r.allAuthTypesFound?.length || r.allAuthTypesFound.includes('UNAUTHENTICATED')) unauth++;
    });
    return { unauth, auth: rows.length - unauth };
  }, [rows]);

  return (
    <div className="space-y-4 animate-fade-in w-full pb-10">
      <div className="flex items-center justify-end gap-3 mb-2">
        <button onClick={() => qc.invalidateQueries({ queryKey: ['discovery'] })} className="text-muted-foreground hover:text-brand transition-colors outline-none cursor-pointer p-1">
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
        <TimeFilter value={timeRange} onChange={setTimeRange} />

        {/* Nginx log upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".log,.txt"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleNginxUpload(f); }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-lg bg-bg-surface border border-brand/40 px-3 py-1.5 text-xs text-brand hover:bg-brand/10 transition-all outline-none disabled:opacity-50"
          title="Import nginx/apache access log to discover APIs and detect threats"
        >
          <Upload size={14} /> {uploading ? 'Importing…' : 'Import Log'}
        </button>

        <button className="flex items-center gap-1.5 rounded-lg bg-bg-surface border border-border-subtle px-3 py-1.5 text-xs text-text-primary hover:bg-bg-hover transition-all outline-none">
          <Download size={14} /> Download
        </button>
      </div>

      {/* Upload result banner */}
      {uploadResult && (
        <div className="flex items-center gap-4 bg-bg-surface border border-green-500/30 rounded-lg px-4 py-2.5 text-xs text-green-500">
          <span className="font-bold">Log imported successfully.</span>
          <span className="text-text-secondary">Lines: <strong className="text-text-primary">{uploadResult.lines}</strong></span>
          <span className="text-text-secondary">Endpoints: <strong className="text-text-primary">{uploadResult.endpoints_discovered}</strong></span>
          <span className="text-text-secondary">Threats: <strong className="text-destructive">{uploadResult.threats_detected}</strong></span>
          <button onClick={() => setUploadResult(null)} className="ml-auto text-muted-foreground hover:text-text-primary">✕</button>
        </div>
      )}

      <SummaryPanel>
        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[260px]">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">APIs Discovered</span>
          <div className="flex items-baseline gap-2 mt-2 mb-4">
            <span className="text-3xl font-bold font-display text-text-primary">{totalApis || '-'}</span>
            <span className="text-xs text-muted-foreground font-medium flex items-center gap-0.5">↑0</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-auto">
            {[['Shadow', '0', '#EF4444'], ['Non Conforming', '0', '#EAB308'], ['Sensitive', '-', '#EF4444'], ['Privilege', '-', '#EAB308'], ['New', '-', '#22C55E'], ['Unused', '0', '#EF4444'], ['Public', String(totalApis), '#22C55E'], ['UnAuth', String(authCounts.unauth || '-'), '#EF4444'], ['Blocked', '0', '#EF4444']].map(([k, v, c]) => (
              <div key={k} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">{k}</span>
                </div>
                <span className="text-[11px] font-mono font-bold text-text-primary">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[150px] flex flex-col items-center">
          <div className="flex justify-between items-center w-full mb-1">
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">API Risk Distribution</span>
            <span className="text-[9px] text-muted-foreground">Last Updated: {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <DonutChart data={riskData} size={110} innerRadius={34} outerRadius={50} centerValue={totalApis} />
          <div className="grid grid-cols-4 w-full gap-1 mt-3">
            {[['Low', sevAgg.LOW, '#22C55E'], ['Medium', sevAgg.MEDIUM, '#EAB308'], ['High', sevAgg.HIGH, '#F97316'], ['Critical', sevAgg.CRITICAL, '#EF4444']].map(([k, v, c]) => (
              <div key={k as string} className="flex flex-col items-center">
                <span className="text-[9px] text-muted-foreground">{k}</span>
                <span className="text-[11px] font-bold" style={{ color: c as string }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-bg-surface border border-border-subtle p-4 rounded min-w-[140px] flex flex-col items-center">
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold w-full mb-3">Method Distribution</span>
          <DonutChart data={methodData} size={100} innerRadius={30} outerRadius={44} />
          <div className="flex flex-col w-full gap-1 mt-3">
            {methodData.map(({ name, value, color }) => (
              <div key={name} className="flex justify-between items-center">
                <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded bg-current" style={{ color }} /> <span className="text-[9px] text-muted-foreground">{name}</span></div>
                <span className="text-[10px] font-bold text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </SummaryPanel>

      {hasError && (
        <QueryError message="Failed to load API catalogue" onRetry={() => qc.invalidateQueries({ queryKey: ['discovery'] })} />
      )}

      {!isLoading && !hasError && total === 0 && (
        <div className="flex items-start gap-4 bg-bg-surface border border-brand/20 rounded-xl px-5 py-4">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center shrink-0 mt-0.5">
            <Eye size={18} className="text-brand" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Awaiting Traffic Analysis</p>
            <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
              No API endpoints have been discovered yet. This means zero has not been checked — it means no traffic has been observed.
              Import an nginx/apache access log using <strong className="text-brand">Import Log</strong> above, or connect a live traffic sensor to begin automatic API discovery.
            </p>
          </div>
        </div>
      )}

      <div className="bg-bg-base border border-border-subtle rounded-lg overflow-hidden flex flex-col min-h-[400px]">
        <div className="p-3 border-b border-border-subtle flex items-center justify-between bg-bg-surface">
          <span className="text-sm font-bold text-text-primary uppercase tracking-tight flex items-center gap-2">APIs Catalogue <span className="text-[10px] bg-bg-elevated border border-border-subtle px-1.5 py-0.5 rounded text-text-muted flex items-center gap-1"><Calendar size={10} /> Last 90 days</span></span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span>Items <select className="bg-bg-elevated border border-border-subtle rounded px-1 outline-none text-text-primary"><option>{pageSize}</option></select></span>
              <span>{page * pageSize + 1} – {Math.min((page + 1) * pageSize, total)} of {total}</span>
              <div className="flex gap-1">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)} className="px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30">←</button>
                <button disabled={(page + 1) * pageSize >= total} onClick={() => setPage(p => p + 1)} className="px-2 py-0.5 rounded bg-bg-elevated border border-border-subtle text-[10px] disabled:opacity-30">→</button>
              </div>
            </div>
            <button className="p-1 text-muted-foreground hover:text-text-primary outline-none cursor-pointer"><Filter size={14} /></button>
          </div>
        </div>

        {isLoading ? (
          <TableSkeleton columns={9} rows={pageSize} />
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
              <thead className="bg-bg-surface border-b border-border-subtle">
                <tr>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-12 text-center">☐</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32">Characteristics</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-[30%]">Endpoint</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-[20%]">Host</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32 text-center">First Discovered↕</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32 text-center">Last Observed</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-24 text-center">Auth</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-24 text-center">Risk Score</th>
                  <th className="px-4 py-3 text-[11px] font-medium uppercase tracking-wider text-text-secondary w-32">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {rows.map((row) => {
                  const risk = mapRiskScore(row.riskScore);
                  const isUnauth = !row.allAuthTypesFound?.length || row.allAuthTypesFound.includes('UNAUTHENTICATED');
                  const hostCollection = collections.data?.apiCollections?.find(c => c.id === row.id.apiCollectionId);
                  return (
                    <tr key={`${row.id.apiCollectionId}-${row.id.method}-${row.id.url}`} className="hover:bg-bg-hover transition-colors cursor-pointer">
                      <td className="px-4 py-4 text-center"><input type="checkbox" className="accent-brand" /></td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1.5 items-center justify-center">
                          <Globe size={13} className="text-[#3B82F6]" />
                          {isUnauth && <ShieldOff size={13} className="text-[#EF4444]" />}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <MethodBadge method={row.id.method} />
                          <span className="text-[13px] font-mono text-text-primary truncate">{row.id.url}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-[13px] text-text-secondary truncate">{hostCollection?.hostName || hostCollection?.displayName || '-'}</td>
                      <td className="px-4 py-4 text-[11px] font-mono text-text-muted text-center">{formatTs(row.discoveredAt ?? 0)}</td>
                      <td className="px-4 py-4 text-[11px] font-mono text-text-muted text-center">{formatTs(row.lastSeen)}</td>
                      <td className="px-4 py-4 text-center"><AuthBadge auth={isUnauth ? 'Unauth' : 'Authenticated'} /></td>
                      <td className="px-4 py-4 text-center"><span className="text-[11px] font-bold" style={{ color: riskColor(risk) }}>{risk}</span></td>
                      <td className="px-4 py-4 text-[11px] text-text-secondary"></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && !isLoading && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-xs text-muted-foreground">No APIs found. Connect a traffic source to start discovering APIs.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiCatalogue;
