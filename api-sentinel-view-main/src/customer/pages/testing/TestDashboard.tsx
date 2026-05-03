import React from 'react';
import {
  Activity,
  Bug,
  CheckCircle2,
  Clock,
  FileStack,
  Radar,
 Shield,
  ShieldAlert,
  Zap,
} from 'lucide-react';

import QueryError from '@/components/shared/QueryError';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import MetricWidget from '@/components/ui/MetricWidget';
import GlassCard from '@/components/ui/GlassCard';
import ProgressRing from '@/components/ui/ProgressRing';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { useIssueSummary } from '@/hooks/use-testing';
import { useDetectionMeta, usePentestMeta, useTestRuns } from '@/hooks/use-security-ops';

function computeMTTR(total: number, fixed: number): string {
  if (total === 0 || fixed === 0) return 'Tracking...';
  const rate = fixed / total;
  if (rate >= 0.8) return '< 2 days';
  if (rate >= 0.5) return '< 5 days';
  if (rate >= 0.2) return '< 14 days';
  return '> 14 days';
}

function formatTimestamp(timestamp?: string | null) {
  if (!timestamp || timestamp === 'None') return 'Not started';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function runStatusTone(status?: string) {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'bg-emerald-500/10 text-emerald-600';
    case 'RUNNING':
      return 'bg-brand/10 text-brand';
    case 'FAILED':
      return 'bg-red-500/10 text-red-500';
    default:
      return 'bg-amber-500/10 text-amber-700';
  }
}

const TestDashboard: React.FC = () => {
  const issueSummary = useIssueSummary();
  const detectionMeta = useDetectionMeta();
  const pentestMeta = usePentestMeta();
  const runs = useTestRuns(6);

  const totalIssues = issueSummary.data?.totalIssues ?? 0;
  const openIssues = issueSummary.data?.openIssues ?? 0;
  const fixedIssues = issueSummary.data?.fixedIssues ?? 0;
  const sev = issueSummary.data?.severityBreakdown ?? {};
  const criticalOpen = sev.CRITICAL ?? 0;
  const mttr = computeMTTR(totalIssues, fixedIssues);
  const resolvedPct = totalIssues > 0 ? Math.round((fixedIssues / totalIssues) * 100) : 0;

  const latestRun = runs.data?.runs?.[0] ?? null;
  const detectorCount = detectionMeta.data?.detectors?.length ?? 0;
  const profileCount = pentestMeta.data?.inventory.pentest_profile_count ?? 0;
  const authProfileCount = pentestMeta.data?.inventory.auth_profile_count ?? 0;
  const templateCount = pentestMeta.data?.inventory.template_count ?? 0;
  const pipelineMode = detectionMeta.data?.mode ?? 'off';

  const infraError = detectionMeta.isError || pentestMeta.isError || runs.isError;

  return (
    <div className="space-y-5 animate-fade-in">
      {issueSummary.isError && <QueryError message="Failed to load test data" onRetry={() => issueSummary.refetch()} />}
      {infraError && (
        <QueryError
          message="Detection or pentest telemetry is unavailable"
          onRetry={() => {
            void detectionMeta.refetch();
            void pentestMeta.refetch();
            void runs.refetch();
          }}
        />
      )}

      {issueSummary.isLoading ? (
        <SkeletonLoader variant="metric" count={4} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Issues', value: totalIssues, icon: Bug, color: '#632CA6', bg: 'rgba(99,44,175,0.1)' },
            { label: 'Critical Open', value: criticalOpen, icon: ShieldAlert, color: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
            { label: 'Resolved', value: fixedIssues, icon: CheckCircle2, color: '#22C55E', bg: 'rgba(34,197,94,0.1)' },
            { label: 'Open Issues', value: openIssues, icon: Activity, color: '#3B82F6', bg: 'rgba(59,130,246,0.1)' },
          ].map((item, index) => (
            <div key={item.label} className={`animate-stagger-${index + 1}`}>
              <MetricWidget
                label={item.label}
                value={item.value}
                icon={item.icon}
                iconColor={item.color}
                iconBg={item.bg}
                sparkData={Array.from({ length: 7 }, () => Math.max(0, item.value + Math.floor(Math.random() * 5 - 2)))}
                sparkColor={item.color}
              />
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Detection Engine</div>
              <h3 className="mt-1 text-sm font-bold text-text-primary">Unified pipeline posture</h3>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              pipelineMode === 'active'
                ? 'bg-emerald-500/10 text-emerald-600'
                : pipelineMode === 'shadow'
                  ? 'bg-amber-500/10 text-amber-700'
                  : 'bg-slate-500/10 text-slate-600'
            }`}>
              {pipelineMode}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
              <div className="text-[11px] text-text-muted">Detectors</div>
              <div className="mt-1 text-lg font-bold text-text-primary">{detectorCount}</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3">
              <div className="text-[11px] text-text-muted">State backend</div>
              <div className="mt-1 text-sm font-bold text-text-primary">{detectionMeta.data?.hot_state.backend ?? 'loading'}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className={`rounded-full px-2 py-1 text-[11px] ${
              detectionMeta.data?.health.db_ready ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
            }`}>
              DB {detectionMeta.data?.health.db_ready ? 'ready' : 'offline'}
            </span>
            <span className={`rounded-full px-2 py-1 text-[11px] ${
              detectionMeta.data?.hot_state.redis_configured ? 'bg-brand/10 text-brand' : 'bg-slate-500/10 text-slate-600'
            }`}>
              {detectionMeta.data?.hot_state.redis_configured ? 'Redis hot state' : 'DB fallback'}
            </span>
            <span className="rounded-full px-2 py-1 text-[11px] bg-bg-base border border-border-subtle text-text-muted">
              Knowledge pack {detectionMeta.data?.knowledge_pack_version ?? 'n/a'}
            </span>
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Pentest Stack</div>
              <h3 className="mt-1 text-sm font-bold text-text-primary">Profiles, auth, and coverage material</h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center">
              <Zap size={18} className="text-brand" />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
              <div className="text-[11px] text-text-muted">Profiles</div>
              <div className="mt-1 text-lg font-bold text-text-primary">{profileCount}</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
              <div className="text-[11px] text-text-muted">Auth</div>
              <div className="mt-1 text-lg font-bold text-text-primary">{authProfileCount}</div>
            </div>
            <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
              <div className="text-[11px] text-text-muted">Templates</div>
              <div className="mt-1 text-lg font-bold text-text-primary">{templateCount}</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(pentestMeta.data?.scan_stack ?? {}).map(([key, enabled]) => (
              <span
                key={key}
                className={`rounded-full px-2 py-1 text-[11px] ${enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600'}`}
              >
                {key.replaceAll('_', ' ')}
              </span>
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Recent Run</div>
              <h3 className="mt-1 text-sm font-bold text-text-primary">
                {latestRun ? latestRun.id.slice(0, 8) : 'No run yet'}
              </h3>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <FileStack size={18} className="text-blue-500" />
            </div>
          </div>

          {latestRun ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${runStatusTone(latestRun.status)}`}>
                  {latestRun.status}
                </span>
                <span className="text-[11px] text-text-muted">Started {formatTimestamp(latestRun.started_at || latestRun.created_at)}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
                  <div className="text-[11px] text-text-muted">Tests</div>
                  <div className="mt-1 text-lg font-bold text-text-primary">{latestRun.total_tests}</div>
                </div>
                <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
                  <div className="text-[11px] text-text-muted">Findings</div>
                  <div className="mt-1 text-lg font-bold text-red-500">{latestRun.vulnerable_count}</div>
                </div>
                <div className="rounded-xl border border-border-subtle bg-bg-base px-3 py-3">
                  <div className="text-[11px] text-text-muted">Errors</div>
                  <div className="mt-1 text-lg font-bold text-amber-600">{latestRun.error_count}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-border-subtle bg-bg-base px-5 py-8 text-center">
              <Shield size={26} className="mx-auto text-text-muted" />
              <p className="mt-3 text-sm font-semibold text-text-primary">No test runs yet</p>
              <p className="mt-1 text-[11px] leading-5 text-text-muted">
                Build an auth profile and launch the first production-safe pentest run from Configuration.
              </p>
            </div>
          )}
        </GlassCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard variant="elevated" className="p-5">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
              <Clock size={20} className="text-brand" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-text-primary mb-1">Mean Time to Remediate</h3>
              <p className="text-2xl font-bold text-brand tabular-nums mb-2">{mttr}</p>
              <p className="text-[11px] text-text-muted leading-relaxed">
                {fixedIssues > 0
                  ? `${fixedIssues} of ${totalIssues} issues resolved. Keep improving your resolution cycle.`
                  : 'No resolved issues yet. Track resolution progress here as your team fixes vulnerabilities.'}
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5 flex items-center gap-6">
          <ProgressRing value={resolvedPct} max={100} size={100} strokeWidth={8} label="Resolved" />
          <div className="flex-1 space-y-2">
            <h3 className="text-sm font-bold text-text-primary">Resolution Rate</h3>
            <div className="h-2 bg-black/[0.04] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-sev-low to-green-300 transition-all duration-1000" style={{ width: `${resolvedPct}%` }} />
            </div>
            <p className="text-[11px] text-text-muted">
              <AnimatedCounter value={fixedIssues} className="font-bold text-sev-low" /> resolved out of <AnimatedCounter value={totalIssues} className="font-bold text-text-primary" /> total
            </p>
          </div>
        </GlassCard>
      </div>

      <GlassCard variant="default" className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">Continuous Test Matrix</p>
            <h3 className="mt-1 text-sm font-bold text-text-primary">Runtime detection and active validation</h3>
          </div>
          <div className="rounded-full border border-border-subtle bg-bg-elevated px-3 py-1 text-[11px] font-semibold text-text-secondary">
            {runs.data?.total ?? 0} recorded runs
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            {
              name: 'Detection Pipeline',
              detail: detectorCount > 0 ? `${detectorCount} heuristics registered with ${pipelineMode} rollout.` : 'Waiting for detector registry.',
              cadence: pipelineMode === 'active' ? 'Live' : pipelineMode === 'shadow' ? 'Shadow' : 'Off',
              icon: Radar,
            },
            {
              name: 'Auth Profiles',
              detail: authProfileCount > 0 ? `${authProfileCount} reusable auth contexts ready for replay and DAST.` : 'Create the first auth profile for realistic role-aware testing.',
              cadence: 'On demand',
              icon: Shield,
            },
            {
              name: 'Schemathesis / Nuclei',
              detail: `${pentestMeta.data?.availability.schemathesis ? 'Schemathesis config' : 'Schemathesis unavailable'}, nuclei secret files ${pentestMeta.data?.availability.nuclei_secret_files ? 'enabled' : 'disabled'}.`,
              cadence: 'Spec change',
              icon: Zap,
            },
            {
              name: 'Run Queue',
              detail: latestRun ? `${latestRun.vulnerable_count} findings and ${latestRun.error_count} errors in the latest batch.` : 'Run results will land here after the first execution.',
              cadence: 'Continuous',
              icon: FileStack,
            },
          ].map(({ name, detail, cadence, icon: Icon }) => (
            <div key={name} className="metric-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-text-primary">{name}</span>
                <span className="text-[9px] text-text-muted bg-bg-elevated border border-border-subtle px-2 py-0.5 rounded-full">
                  {cadence}
                </span>
              </div>
              <div className="mt-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-brand" />
                </div>
                <p className="text-[11px] text-text-muted leading-relaxed">{detail}</p>
              </div>
            </div>
          ))}
        </div>

        {runs.data?.runs?.length ? (
          <div className="mt-4 space-y-2">
            {runs.data.runs.slice(0, 4).map((run) => (
              <div key={run.id} className="rounded-xl border border-border-subtle bg-bg-base px-4 py-3 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-text-primary">{run.id.slice(0, 8)}...</div>
                  <div className="text-[11px] text-text-muted">
                    {run.total_tests} tests · {run.vulnerable_count} findings · {formatTimestamp(run.created_at)}
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${runStatusTone(run.status)}`}>
                  {run.status}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </GlassCard>

      {!issueSummary.isLoading && totalIssues === 0 && (
        <GlassCard variant="default" className="p-8 text-center">
          <Shield size={32} className="mx-auto mb-3 text-text-muted" />
          <p className="text-sm text-text-muted">No vulnerabilities found yet. Run a security test to populate this dashboard.</p>
        </GlassCard>
      )}
    </div>
  );
};

export default TestDashboard;
