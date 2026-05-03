import React, { useMemo, useState } from 'react';
import { Activity, BookOpen, Filter, Radar, RefreshCw, Server, ShieldCheck, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

import { TabNav } from '@/components/layout/TabNav';
import QueryError from '@/components/shared/QueryError';
import TableSkeleton from '@/components/shared/TableSkeleton';
import GlassCard from '@/components/ui/GlassCard';
import MetricWidget from '@/components/ui/MetricWidget';
import StatusPulse from '@/components/ui/StatusPulse';
import { useModuleInfo } from '@/hooks/use-admin';
import { useDetectionMeta, usePentestMeta } from '@/hooks/use-security-ops';

function formatTs(epoch: number) {
  if (!epoch) return '-';
  const d = new Date(epoch * 1000);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const OperationsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('system');
  const queryClient = useQueryClient();
  const modules = useModuleInfo();
  const detectionMeta = useDetectionMeta();
  const pentestMeta = usePentestMeta();

  const moduleRows = modules.data?.moduleInfos ?? [];
  const upCount = moduleRows.filter((module) => module.isConnected || module.state === 'RUNNING').length;

  const tabs = [
    { key: 'system', label: 'System' },
    { key: 'detection', label: 'Detection' },
    { key: 'pentest', label: 'Pentest' },
    { key: 'references', label: 'References' },
  ];

  const referenceLinks = useMemo(
    () => [...(detectionMeta.data?.official_references ?? []), ...(pentestMeta.data?.official_references ?? [])],
    [detectionMeta.data, pentestMeta.data],
  );

  return (
    <div className="flex flex-col h-full animate-fade-in w-full pb-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center">
            <Server size={18} className="text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-text-primary">Operations Dashboard</h2>
            <p className="text-[11px] text-text-muted">
              {upCount} of {moduleRows.length} modules online · detection {detectionMeta.data?.mode ?? 'off'}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'modules'] });
            queryClient.invalidateQueries({ queryKey: ['security-ops'] });
          }}
          className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-surface flex items-center justify-center text-muted-foreground hover:text-brand transition-all outline-none"
        >
          <RefreshCw size={13} className={modules.isLoading || detectionMeta.isLoading || pentestMeta.isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {(modules.isError || detectionMeta.isError || pentestMeta.isError) && (
        <QueryError
          message="Failed to load operational telemetry"
          onRetry={() => {
            void modules.refetch();
            void detectionMeta.refetch();
            void pentestMeta.refetch();
          }}
        />
      )}

      <div className="border-b border-border-subtle -mx-6 mb-4">
        <div className="flex items-center justify-between pr-6">
          <TabNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted">{moduleRows.length} modules</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border-subtle bg-bg-surface text-xs text-text-muted hover:text-text-primary hover:border-brand/20 transition-all outline-none">
              Filter <Filter size={12} />
            </button>
          </div>
        </div>
      </div>

      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricWidget label="Modules online" value={upCount} icon={Server} iconColor="#22C55E" iconBg="rgba(34,197,94,0.1)" />
            <MetricWidget label="Detection detectors" value={detectionMeta.data?.detectors.length ?? 0} icon={Radar} iconColor="#632CA6" iconBg="rgba(99,44,175,0.1)" />
            <MetricWidget label="Pentest profiles" value={pentestMeta.data?.inventory.pentest_profile_count ?? 0} icon={Zap} iconColor="#3B82F6" iconBg="rgba(59,130,246,0.1)" />
          </div>

          <div className="bg-bg-surface border border-border-subtle rounded-xl overflow-hidden flex-1 flex flex-col">
            {modules.isLoading ? <TableSkeleton columns={8} rows={4} /> : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse table-fixed min-w-[700px]">
                  <thead className="bg-bg-base/50">
                    <tr>
                      {['Host Name', 'Module', 'Version', 'IP Address', 'Status', 'State', 'Last Heartbeat', 'Policy Ver.'].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {moduleRows.map((row) => {
                      const isUp = row.isConnected || row.state === 'RUNNING';
                      return (
                        <tr key={row.id} className="data-row-interactive hover:bg-white/[0.02] transition-colors">
                          <td className="px-4 py-3 text-[12px] text-brand font-mono font-semibold">{row.hostName || row.id}</td>
                          <td className="px-4 py-3 text-[11px] text-sev-medium font-medium">{row.moduleName}</td>
                          <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{row.currentVersion || '-'}</td>
                          <td className="px-4 py-3 text-[12px] text-text-primary font-mono">{row.ipAddress || '-'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <StatusPulse variant={isUp ? 'online' : 'critical'} size="sm" />
                              <span className="text-[11px] font-bold" style={{ color: isUp ? '#22C55E' : '#EF4444' }}>{isUp ? 'Up' : 'Down'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-text-muted">{row.state || '-'}</td>
                          <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{formatTs(row.lastHeartbeat)}</td>
                          <td className="px-4 py-3 text-[11px] text-text-muted font-mono">{row.policyVersion || '-'}</td>
                        </tr>
                      );
                    })}
                    {moduleRows.length === 0 && !modules.isLoading && (
                      <tr><td colSpan={8} className="px-4 py-12 text-center text-xs text-text-muted">No operational modules registered yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'detection' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetricWidget label="Detectors" value={detectionMeta.data?.detectors.length ?? 0} icon={Radar} iconColor="#632CA6" iconBg="rgba(99,44,175,0.1)" />
            <MetricWidget label="Thresholds" value={Object.keys(detectionMeta.data?.thresholds ?? {}).length} icon={Activity} iconColor="#3B82F6" iconBg="rgba(59,130,246,0.1)" />
            <MetricWidget label="Pipeline enabled" value={detectionMeta.data?.health.pipeline_enabled ? 1 : 0} icon={ShieldCheck} iconColor="#22C55E" iconBg="rgba(34,197,94,0.1)" suffix={detectionMeta.data?.health.pipeline_enabled ? '' : ''} />
            <MetricWidget label="DB ready" value={detectionMeta.data?.health.db_ready ? 1 : 0} icon={Server} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" />
          </div>

          <GlassCard variant="elevated" className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                detectionMeta.data?.mode === 'active'
                  ? 'bg-emerald-500/10 text-emerald-600'
                  : detectionMeta.data?.mode === 'shadow'
                    ? 'bg-amber-500/10 text-amber-700'
                    : 'bg-slate-500/10 text-slate-600'
              }`}>
                {detectionMeta.data?.mode ?? 'off'}
              </span>
              <span className="rounded-full border border-border-subtle bg-bg-base px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary">
                {detectionMeta.data?.hot_state.backend ?? 'unknown'}
              </span>
              <span className="rounded-full border border-border-subtle bg-bg-base px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-text-secondary">
                Pack {detectionMeta.data?.knowledge_pack_version ?? 'n/a'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(detectionMeta.data?.thresholds ?? {}).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
                  <div className="text-[11px] text-text-muted">{key.replaceAll('_', ' ')}</div>
                  <div className="mt-1 text-lg font-bold text-text-primary">{value}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard variant="elevated" className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Detector registry</div>
            <div className="mt-4 space-y-3">
              {(detectionMeta.data?.detectors ?? []).map((detector) => (
                <div key={detector.detector_id} className="rounded-2xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-text-primary">{detector.name}</div>
                      <div className="mt-1 text-[11px] text-text-muted">{detector.description}</div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${detector.enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600'}`}>
                      {detector.enabled ? 'enabled' : 'disabled'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {detector.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-border-subtle bg-bg-elevated px-2 py-1 text-[11px] text-text-secondary">{tag}</span>
                    ))}
                    {detector.threshold_keys.map((key) => (
                      <span key={key} className="rounded-full bg-brand/10 px-2 py-1 text-[11px] text-brand">{key}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === 'pentest' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <MetricWidget label="Templates" value={pentestMeta.data?.inventory.template_count ?? 0} icon={Zap} iconColor="#632CA6" iconBg="rgba(99,44,175,0.1)" />
            <MetricWidget label="Profiles" value={pentestMeta.data?.inventory.pentest_profile_count ?? 0} icon={ShieldCheck} iconColor="#22C55E" iconBg="rgba(34,197,94,0.1)" />
            <MetricWidget label="Auth profiles" value={pentestMeta.data?.inventory.auth_profile_count ?? 0} icon={Activity} iconColor="#3B82F6" iconBg="rgba(59,130,246,0.1)" />
            <MetricWidget label="Engines" value={Object.values(pentestMeta.data?.scan_stack ?? {}).filter(Boolean).length} icon={Server} iconColor="#F97316" iconBg="rgba(249,115,22,0.1)" />
          </div>

          <GlassCard variant="elevated" className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Scan stack readiness</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(pentestMeta.data?.scan_stack ?? {}).map(([key, enabled]) => (
                <div key={key} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-bold text-text-primary">{key.replaceAll('_', ' ')}</div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600'}`}>
                      {enabled ? 'ready' : 'off'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard variant="elevated" className="p-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Template categories</div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(pentestMeta.data?.inventory.template_categories ?? {}).map(([category, count]) => (
                <div key={category} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
                  <div className="text-[11px] text-text-muted">{category}</div>
                  <div className="mt-1 text-lg font-bold text-text-primary">{count}</div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {activeTab === 'references' && (
        <div className="grid gap-4 md:grid-cols-2">
          {referenceLinks.map((reference) => (
            <a
              key={`${reference.name}-${reference.url}`}
              href={reference.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-2xl border border-border-subtle bg-bg-surface px-5 py-4 transition-all hover:border-brand/20 hover:bg-brand/5"
            >
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                <BookOpen size={12} />
                Reference
              </div>
              <div className="mt-2 text-sm font-bold text-text-primary">{reference.name}</div>
              <div className="mt-1 text-[11px] text-text-muted break-all">{reference.url}</div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default OperationsDashboard;
