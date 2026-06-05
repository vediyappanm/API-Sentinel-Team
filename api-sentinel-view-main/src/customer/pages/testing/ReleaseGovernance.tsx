import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  Download,
  FileDown,
  FileCheck2,
  GitBranch,
  KeyRound,
  ListChecks,
  RotateCcw,
  ShieldCheck,
  ShieldX,
  Ticket,
  TriangleAlert,
} from 'lucide-react';

import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import {
  useCicdGateDecision,
  useCicdTriggers,
  useGovernanceDashboard,
  useRecordVulnerabilityRetestOutcome,
  useSyncVulnerabilityTicket,
  useTestRuns,
  useVulnerabilityLifecycle,
} from '@/hooks/use-security-ops';
import {
  buildCicdGateExportUrl,
  getNorthStarNextAction,
  getNorthStarOwnerFallback,
  sanitizeGovernanceText,
  type GatePolicyPack,
  type GateResultSummary,
  type GovernanceDashboard,
  type GovernanceEnginePlanItem,
  type VulnerabilityLifecycleRecord,
} from '@/services/security-ops.service';

type Tone = 'good' | 'warn' | 'danger' | 'info' | 'neutral';

const policyPacks: Array<{ key: GatePolicyPack; label: string; detail: string }> = [
  { key: 'strict', label: 'Strict', detail: 'Blocks weak evidence and missing retests' },
  { key: 'llm-strict', label: 'LLM strict', detail: 'Requires deterministic judge proof for LLM findings' },
  { key: 'advisory', label: 'Advisory', detail: 'Reports risk without weakening production defaults' },
  { key: 'evidence-only', label: 'Evidence only', detail: 'Checks proof quality without severity blocking' },
];

const toneClasses: Record<Tone, string> = {
  good: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
  warn: 'border-amber-500/20 bg-amber-500/10 text-amber-700',
  danger: 'border-red-500/20 bg-red-500/10 text-red-600',
  info: 'border-blue-500/20 bg-blue-500/10 text-blue-600',
  neutral: 'border-border-subtle bg-bg-elevated text-text-secondary',
};

const decisionTone = (status?: string): Tone => {
  switch ((status || '').toUpperCase()) {
    case 'PASSED':
      return 'good';
    case 'FAILED':
      return 'danger';
    case 'PENDING':
      return 'warn';
    default:
      return 'neutral';
  }
};

const slaTone = (status?: string | null): Tone => {
  switch ((status || '').toUpperCase()) {
    case 'OVERDUE':
      return 'danger';
    case 'DUE_SOON':
      return 'warn';
    case 'ON_TRACK':
      return 'good';
    default:
      return 'neutral';
  }
};

const safeText = (value?: string | null, fallback = '-') => sanitizeGovernanceText(value || fallback);

const pretty = (value?: string | null) => safeText(value, 'unknown').replace(/_/g, ' ').toLowerCase();

const titleCase = (value?: string | null) =>
  pretty(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');

const formatDate = (value?: string | null) => {
  if (!value || value === 'None') return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const shortId = (value?: string | null, length = 10) => {
  if (!value) return '-';
  return value.length > length ? `${value.slice(0, length)}...` : value;
};

const formatDashboardDate = (value?: string | null) => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
};

const engineTone = (status?: string | null): Tone => {
  switch ((status || '').toUpperCase()) {
    case 'READY':
    case 'AVAILABLE':
    case 'ENABLED':
      return 'good';
    case 'BLOCKED':
    case 'FAILED':
      return 'danger';
    case 'DISABLED':
    case 'PENDING':
      return 'warn';
    default:
      return 'neutral';
  }
};

const workstreamTone = (status?: string | null): Tone => {
  switch ((status || '').toUpperCase()) {
    case 'READY':
    case 'REPORT-READY':
    case 'REPORT_READY':
      return 'good';
    case 'PARTIAL':
    case 'PENDING':
      return 'warn';
    case 'BLOCKED':
    case 'GAP':
    case 'MISSING':
      return 'danger';
    default:
      return 'neutral';
  }
};

const evidenceTone = (status?: string | null): Tone => {
  switch ((status || '').toUpperCase()) {
    case 'DETERMINISTIC':
    case 'VERIFIED':
    case 'REPORT-READY':
    case 'REPORT_READY':
      return 'good';
    case 'PARTIAL':
    case 'PENDING':
      return 'warn';
    case 'MISSING':
    case 'BLOCKED':
      return 'danger';
    default:
      return 'neutral';
  }
};

const ticketKeyFromUrl = (url?: string | null) => {
  if (!url) return null;
  const clean = url.split('?')[0].replace(/\/$/, '');
  const key = clean.split('/').pop();
  return key || null;
};

function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

type ReportRow = { label: string; value?: string | null };

const reportRowsToText = (title: string, rows: ReportRow[]) =>
  [title, ...rows.map((row) => `${row.label}: ${safeText(row.value, 'Not reported')}`)].join('\n');

function Metric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: Tone;
}) {
  return (
    <GlassCard variant="elevated" className="p-4">
      <div className="text-xs font-semibold text-text-muted">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-2xl font-bold text-text-primary tabular-nums">{value}</div>
        <span className={`h-2.5 w-2.5 rounded-full ${tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'danger' ? 'bg-red-500' : 'bg-blue-500'}`} />
      </div>
      <p className="mt-3 text-xs leading-5 text-text-muted">{detail}</p>
    </GlassCard>
  );
}

function GovernanceMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: Tone;
}) {
  return (
    <div className={`rounded-lg border p-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
      <div className="mt-2 text-xs leading-5 opacity-80">{detail}</div>
    </div>
  );
}

function TrendPanel({ trend }: { trend: GovernanceDashboard['vulnerability_trend'] }) {
  const visible = trend ?? [];
  const maxOpenFindings = Math.max(1, ...visible.map((item) => item.open_findings ?? 0));

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 text-xs font-semibold text-text-secondary">
        <BarChart3 size={14} /> Finding trend
      </div>
      {visible.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-text-muted">No trend samples</div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          {visible.slice(-7).map((item) => (
            <div key={item.date} className="grid grid-cols-[96px_1fr_32px] items-center gap-3 text-xs">
              <span className="font-mono text-text-muted">{item.date}</span>
              <div className="h-2 rounded-full bg-bg-elevated">
                <div
                  className="h-2 rounded-full bg-brand"
                  style={{ width: `${Math.max(8, ((item.open_findings ?? 0) / maxOpenFindings) * 100)}%` }}
                />
              </div>
              <span className="text-right font-semibold tabular-nums text-text-primary">{item.open_findings ?? 0}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlaDashboardPanel({ sla }: { sla?: GovernanceDashboard['sla'] }) {
  const rows = [
    { label: 'Overdue', value: sla?.overdue ?? 0, tone: 'danger' as Tone },
    { label: 'Due soon', value: sla?.due_soon ?? 0, tone: 'warn' as Tone },
    { label: 'On track', value: sla?.on_track ?? 0, tone: 'good' as Tone },
    { label: 'No SLA', value: sla?.no_sla ?? 0, tone: 'neutral' as Tone },
  ];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="border-b border-border-subtle px-4 py-3 text-xs font-semibold text-text-secondary">SLA dashboard</div>
      <div className="grid grid-cols-2 gap-2 px-4 py-4">
        {rows.map((row) => (
          <div key={row.label} className="rounded-md border border-border-subtle bg-bg-base px-3 py-2">
            <div className="text-[11px] font-semibold text-text-muted">{row.label}</div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-lg font-bold tabular-nums text-text-primary">{row.value}</span>
              <Badge tone={row.tone}>{row.value} {row.label.toLowerCase()}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EngineAccountabilityPanel({ engines }: { engines?: GovernanceEnginePlanItem[] }) {
  const visible = engines ?? [];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="border-b border-border-subtle px-4 py-3 text-xs font-semibold text-text-secondary">Engine accountability</div>
      {visible.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-text-muted">No engine plan recorded</div>
      ) : (
        <div className="divide-y divide-border-subtle">
          {visible.slice(0, 6).map((engine) => (
            <div key={engine.engine} className="grid gap-3 px-4 py-3 text-xs sm:grid-cols-[1fr_88px] sm:items-center">
              <div className="min-w-0">
                <div className="font-semibold text-text-primary">{engine.display_name ?? titleCase(engine.engine)}</div>
                <div className="mt-1 truncate text-text-muted">
                  {pretty(engine.reason)}{engine.artifact_type ? ` / ${pretty(engine.artifact_type)}` : ''}
                </div>
              </div>
              <Badge tone={engineTone(engine.status)}>{pretty(engine.status)}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TenantGovernancePanel({ dashboard }: { dashboard?: GovernanceDashboard }) {
  const targets = dashboard?.coverage.coverage_targets ?? {};
  const targetEntries = Object.entries(targets).slice(0, 3);

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 text-xs font-semibold text-text-secondary">
        <Building2 size={14} /> Tenant governance
      </div>
      <div className="space-y-3 px-4 py-4 text-xs">
        <div className="grid grid-cols-[112px_1fr] gap-3">
          <span className="text-text-muted">Tenant</span>
          <span className="font-semibold text-text-primary">Tenant {dashboard?.account_id ?? '-'}</span>
        </div>
        <div className="grid grid-cols-[112px_1fr] gap-3">
          <span className="text-text-muted">Generated</span>
          <span className="font-mono text-text-primary">{formatDashboardDate(dashboard?.generated_at)}</span>
        </div>
        <div className="grid grid-cols-[112px_1fr] gap-3">
          <span className="text-text-muted">Policy</span>
          <span className="font-semibold text-text-primary">{dashboard?.governance.latest_policy_pack ?? 'strict'}</span>
        </div>
        <div className="grid grid-cols-[112px_1fr] gap-3">
          <span className="text-text-muted">Latest violation</span>
          <span className="text-text-primary">{dashboard?.governance.latest_policy_violation ?? 'None'}</span>
        </div>
        {targetEntries.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {targetEntries.map(([key, value]) => (
              <Badge key={key} tone="info">
                {titleCase(key)} {String(value)}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NorthStarReadinessPanel({ readiness }: { readiness?: GovernanceDashboard['north_star_readiness'] }) {
  const blockers = readiness?.production_blockers ?? [];
  const workstreams = readiness?.p1_workstreams ?? [];
  const score = readiness?.readiness_score ?? 0;
  const readyControls = readiness?.control_counts?.ready ?? 0;
  const missingControls = readiness?.control_counts?.missing ?? 0;
  const totalControls = readiness?.control_counts?.total ?? readyControls + missingControls;

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <ShieldCheck size={14} /> North Star readiness
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm font-bold text-text-primary">
            <ListChecks size={15} /> North Star command board
          </div>
        </div>
        <Badge tone={score >= 80 ? 'good' : score >= 50 ? 'warn' : 'danger'}>{score}% ready</Badge>
      </div>
      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">Ready</div>
              <div className="mt-1 text-base font-bold text-text-primary">{readyControls}</div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">Missing</div>
              <div className="mt-1 text-base font-bold text-red-600">{missingControls}</div>
            </div>
            <div className="rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">Total</div>
              <div className="mt-1 text-base font-bold text-text-primary">{totalControls}</div>
            </div>
          </div>
          <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">Production blockers</div>
          {blockers.length === 0 ? (
            <div className="rounded-md border border-border-subtle bg-bg-base px-3 py-4 text-xs text-text-muted">
              No North Star blockers reported
            </div>
          ) : (
            <div className="space-y-2">
              {blockers.slice(0, 4).map((blocker) => (
                <div key={blocker.id} className="rounded-md border border-border-subtle bg-bg-base px-3 py-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="danger">{pretty(blocker.check)}</Badge>
                    <Badge tone="neutral">Owner {safeText(blocker.owner ?? getNorthStarOwnerFallback(blocker.capability_id, blocker.check))}</Badge>
                    <Badge tone={evidenceTone(blocker.evidence_status ?? 'missing')}>
                      Evidence {pretty(blocker.evidence_status ?? 'missing')}
                    </Badge>
                    {blocker.sla_status && <Badge tone={slaTone(blocker.sla_status)}>SLA {pretty(blocker.sla_status)}</Badge>}
                  </div>
                  <div className="mt-2 font-semibold text-text-primary">{safeText(blocker.capability_name, 'Production readiness')}</div>
                  <div className="mt-1 leading-5 text-text-muted">
                    <span className="font-semibold text-text-secondary">Next action </span>
                    {safeText(blocker.next_action, getNorthStarNextAction(blocker.check, blocker.capability_name))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">P1 workstream owners</div>
          {workstreams.length === 0 ? (
            <div className="rounded-md border border-border-subtle bg-bg-base px-3 py-4 text-xs text-text-muted">
              No P1 owner data reported
            </div>
          ) : (
            <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-bg-base">
              {workstreams.slice(0, 5).map((workstream) => (
                <div key={workstream.id} className="grid gap-3 px-3 py-3 text-xs lg:grid-cols-[1fr_120px_112px] lg:items-start">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-text-primary">{safeText(workstream.name)}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-text-muted">
                      <span>{safeText(workstream.owner, 'Unassigned')}</span>
                      <span className="font-mono text-[11px]">
                        {workstream.blockers.length > 0 ? workstream.blockers.map((blocker) => safeText(blocker)).join(', ') : 'no_blockers'}
                      </span>
                    </div>
                    <div className="mt-2 leading-5 text-text-secondary">
                      {safeText(
                        workstream.next_action,
                        getNorthStarNextAction(workstream.missing_checks[0] ?? workstream.blockers[0] ?? workstream.id, workstream.name),
                      )}
                    </div>
                  </div>
                  <Badge tone={workstreamTone(workstream.status)}>{pretty(workstream.status)}</Badge>
                  <Badge tone={evidenceTone(workstream.evidence_status)}>{pretty(workstream.evidence_status)}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReleaseReportsPanel({ reports }: { reports?: GovernanceDashboard['reports'] }) {
  const executive = reports?.executive_summary;
  const technical = reports?.technical_report;
  const executiveRows = [
    { label: 'Readiness', value: executive?.readiness_statement },
    { label: 'Blockers', value: executive?.blocker_summary },
    { label: 'Owners', value: executive?.owner_summary },
    { label: 'Evidence', value: executive?.evidence_status },
    { label: 'SLA health', value: executive?.sla_health },
  ];
  const technicalRows = [
    { label: 'Evidence status', value: technical?.evidence_status },
    { label: 'SLA health', value: technical?.sla_health },
    { label: 'Endpoint risk', value: technical?.endpoint_risk },
    { label: 'Trend', value: technical?.trend_summary },
    { label: 'Artifacts', value: technical?.artifact_status },
  ];
  const hasReports = Boolean(executive || technical);

  const copyReport = (title: string, rows: ReportRow[]) => {
    void navigator.clipboard?.writeText(reportRowsToText(title, rows));
  };

  const downloadReportJson = () => {
    const payload = {
      executive_summary: Object.fromEntries(executiveRows.map((row) => [row.label, safeText(row.value, 'Not reported')])),
      technical_report: Object.fromEntries(technicalRows.map((row) => [row.label, safeText(row.value, 'Not reported')])),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'api-sentinel-release-governance-report.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
          <FileCheck2 size={14} /> Release reports
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!executive}
            onClick={() => copyReport('Executive summary', executiveRows)}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand disabled:opacity-50"
          >
            <ClipboardCopy size={13} /> Copy executive report
          </button>
          <button
            type="button"
            disabled={!technical}
            onClick={() => copyReport('Technical report', technicalRows)}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand disabled:opacity-50"
          >
            <ClipboardCopy size={13} /> Copy technical report
          </button>
          <button
            type="button"
            disabled={!hasReports}
            onClick={downloadReportJson}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand disabled:opacity-50"
          >
            <FileDown size={13} /> Download report JSON
          </button>
        </div>
      </div>
      <div className="grid gap-4 px-4 py-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="text-xs font-semibold text-text-primary">Executive summary</div>
          <div className="space-y-2">
            {executiveRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[88px_1fr] gap-3 text-xs">
                <span className="text-text-muted">{row.label}</span>
                <span className="leading-5 text-text-primary">{safeText(row.value, 'Not reported')}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <div className="text-xs font-semibold text-text-primary">Technical report</div>
          <div className="space-y-2">
            {technicalRows.map((row) => (
              <div key={row.label} className="grid grid-cols-[96px_1fr] gap-3 text-xs">
                <span className="text-text-muted">{row.label}</span>
                <span className="leading-5 text-text-primary">{safeText(row.value, 'Not reported')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GovernanceSnapshot({
  dashboard,
  loading,
}: {
  dashboard?: GovernanceDashboard;
  loading: boolean;
}) {
  if (loading) {
    return (
      <GlassCard variant="default" className="p-5">
        <SkeletonLoader variant="card" />
      </GlassCard>
    );
  }

  const executive = dashboard?.executive;
  const sla = dashboard?.sla;
  const coverage = dashboard?.coverage;
  const governance = dashboard?.governance;
  const topEndpoints = dashboard?.top_endpoint_risk ?? [];

  return (
    <GlassCard variant="default" className="p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-bold text-text-primary">Executive risk</div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-text-muted">
            Open findings, SLA pressure, active LLM/business-logic evidence, and policy violations are rolled up from tenant-scoped records.
          </p>
        </div>
        <Badge tone={(executive?.risk_score ?? 0) >= 70 ? 'danger' : (executive?.risk_score ?? 0) >= 35 ? 'warn' : 'good'}>
          Risk {executive?.risk_score ?? 0}
        </Badge>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <GovernanceMetric
          label="Open findings"
          value={executive?.open_findings ?? 0}
          detail={`${executive?.critical_open_findings ?? 0} critical, ${executive?.high_open_findings ?? 0} high.`}
          tone={(executive?.critical_open_findings ?? 0) > 0 ? 'danger' : (executive?.high_open_findings ?? 0) > 0 ? 'warn' : 'good'}
        />
        <GovernanceMetric
          label="SLA pressure"
          value={sla?.overdue ?? 0}
          detail={`${sla?.due_soon ?? 0} due soon, ${sla?.on_track ?? 0} on track.`}
          tone={(sla?.overdue ?? 0) > 0 ? 'danger' : (sla?.due_soon ?? 0) > 0 ? 'warn' : 'good'}
        />
        <GovernanceMetric
          label="LLM active"
          value={coverage?.llm_active_findings ?? 0}
          detail={`Latest run ${pretty(coverage?.latest_run_status)}; policy ${governance?.latest_policy_pack ?? 'strict'}.`}
          tone={(coverage?.llm_active_findings ?? 0) > 0 ? 'warn' : 'good'}
        />
        <GovernanceMetric
          label="Business logic active"
          value={coverage?.business_logic_active_findings ?? 0}
          detail={`${governance?.open_policy_violations ?? 0} open governance violations.`}
          tone={(coverage?.business_logic_active_findings ?? 0) > 0 || (governance?.open_policy_violations ?? 0) > 0 ? 'warn' : 'good'}
        />
      </div>

      <div className="mt-5 rounded-lg border border-border-subtle bg-bg-surface">
        <div className="border-b border-border-subtle px-4 py-3 text-xs font-semibold text-text-secondary">Top endpoint risk</div>
        {topEndpoints.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-text-muted">No active endpoint risk</div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {topEndpoints.slice(0, 4).map((endpoint) => (
              <div key={endpoint.endpoint_id} className="grid gap-3 px-4 py-3 text-xs md:grid-cols-[72px_1fr_90px_90px] md:items-center">
                <Badge tone={endpoint.risk_score >= 70 ? 'danger' : endpoint.risk_score >= 35 ? 'warn' : 'info'}>{endpoint.method}</Badge>
                <div className="break-all font-mono text-text-primary">{endpoint.path}</div>
                <div className="font-semibold text-text-secondary">{endpoint.open_findings} findings</div>
                <div className="font-semibold text-text-primary">Risk {endpoint.risk_score}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        <NorthStarReadinessPanel readiness={dashboard?.north_star_readiness} />
        <ReleaseReportsPanel reports={dashboard?.reports} />
        <TrendPanel trend={dashboard?.vulnerability_trend ?? []} />
        <SlaDashboardPanel sla={sla} />
        <EngineAccountabilityPanel engines={coverage?.engine_plan} />
        <TenantGovernancePanel dashboard={dashboard} />
      </div>
    </GlassCard>
  );
}

function ResultList({ title, results }: { title: string; results?: GateResultSummary[] }) {
  const visible = results ?? [];
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-surface">
      <div className="border-b border-border-subtle px-3 py-2 text-xs font-semibold text-text-secondary">{title}</div>
      <div className="divide-y divide-border-subtle">
        {visible.length === 0 ? (
          <div className="px-3 py-3 text-xs text-text-muted">No entries</div>
        ) : (
          visible.slice(0, 5).map((result, index) => (
            <div key={result.id ?? `${result.template_id}-${index}`} className="grid grid-cols-[90px_1fr] gap-3 px-3 py-2 text-xs">
              <Badge tone={result.severity === 'CRITICAL' ? 'danger' : result.severity === 'HIGH' ? 'warn' : 'info'}>
                {result.severity ?? 'UNKNOWN'}
              </Badge>
              <div className="min-w-0">
                <div className="truncate font-semibold text-text-primary">{result.template_id ?? result.id ?? 'result'}</div>
                <div className="truncate font-mono text-[11px] text-text-muted">{result.endpoint_id ?? 'endpoint unavailable'}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LifecycleActions({
  vulnerability,
  onSyncTicket,
  onRetest,
  busy,
  align = 'end',
}: {
  vulnerability: VulnerabilityLifecycleRecord;
  onSyncTicket: (vulnerability: VulnerabilityLifecycleRecord) => void;
  onRetest: (vulnerability: VulnerabilityLifecycleRecord, outcome: 'clean' | 'still_vulnerable') => void;
  busy: boolean;
  align?: 'start' | 'end';
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      <button
        type="button"
        disabled={busy}
        onClick={() => onSyncTicket(vulnerability)}
        className="inline-flex h-8 min-w-[104px] flex-1 items-center justify-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand disabled:opacity-50 sm:flex-none"
      >
        <Ticket size={13} /> Sync ticket
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRetest(vulnerability, 'clean')}
        className="inline-flex h-8 min-w-[104px] flex-1 items-center justify-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/15 disabled:opacity-50 sm:flex-none"
      >
        <CheckCircle2 size={13} /> Mark clean
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => onRetest(vulnerability, 'still_vulnerable')}
        className="inline-flex h-8 min-w-[128px] flex-1 items-center justify-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-500/15 disabled:opacity-50 sm:flex-none"
      >
        <ShieldX size={13} /> Still vulnerable
      </button>
    </div>
  );
}

function LifecycleRow({
  vulnerability,
  onSyncTicket,
  onRetest,
  busy,
}: {
  vulnerability: VulnerabilityLifecycleRecord;
  onSyncTicket: (vulnerability: VulnerabilityLifecycleRecord) => void;
  onRetest: (vulnerability: VulnerabilityLifecycleRecord, outcome: 'clean' | 'still_vulnerable') => void;
  busy: boolean;
}) {
  const integrityVerified = vulnerability.evidence_integrity?.verified === true;
  return (
    <tr className="border-b border-border-subtle last:border-0">
      <td className="px-4 py-3 align-top">
        <div className="flex items-center gap-2">
          <Badge tone={vulnerability.severity === 'CRITICAL' ? 'danger' : vulnerability.severity === 'HIGH' ? 'warn' : 'info'}>
            {vulnerability.severity ?? 'INFO'}
          </Badge>
          <span className="font-mono text-[11px] text-text-muted">{vulnerability.method ?? 'GET'}</span>
        </div>
        <div className="mt-2 max-w-[360px] truncate font-mono text-xs text-text-primary">{vulnerability.url ?? '/'}</div>
        <div className="mt-1 text-xs text-text-muted">{vulnerability.type ?? 'Security finding'}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex flex-wrap gap-2">
          <Badge tone={slaTone(vulnerability.sla_status)}>SLA {pretty(vulnerability.sla_status)}</Badge>
          <Badge tone={integrityVerified ? 'good' : 'danger'}>{integrityVerified ? 'Evidence verified' : 'Evidence gap'}</Badge>
          <Badge tone={vulnerability.confirmation_status === 'CONFIRMED' ? 'good' : 'warn'}>
            {pretty(vulnerability.confirmation_status)}
          </Badge>
        </div>
        <div className="mt-2 text-xs text-text-muted">Due {formatDate(vulnerability.sla_due_at)}</div>
      </td>
      <td className="px-4 py-3 align-top">
        <div className="text-xs font-semibold text-text-primary">{pretty(vulnerability.status)}</div>
        <div className="mt-1 text-xs text-text-muted">
          {vulnerability.ticket_url ? ticketKeyFromUrl(vulnerability.ticket_url) : 'No ticket linked'}
        </div>
        <div className="mt-1 text-xs text-text-muted">
          Retest {vulnerability.retest_support?.queued_scan_supported ? 'queued scan ready' : 'manual outcome ready'}
        </div>
      </td>
      <td className="px-4 py-3 align-top">
        <LifecycleActions
          vulnerability={vulnerability}
          onSyncTicket={onSyncTicket}
          onRetest={onRetest}
          busy={busy}
        />
      </td>
    </tr>
  );
}

function LifecycleMobileItem({
  vulnerability,
  onSyncTicket,
  onRetest,
  busy,
}: {
  vulnerability: VulnerabilityLifecycleRecord;
  onSyncTicket: (vulnerability: VulnerabilityLifecycleRecord) => void;
  onRetest: (vulnerability: VulnerabilityLifecycleRecord, outcome: 'clean' | 'still_vulnerable') => void;
  busy: boolean;
}) {
  const integrityVerified = vulnerability.evidence_integrity?.verified === true;
  return (
    <div className="space-y-4 px-4 py-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={vulnerability.severity === 'CRITICAL' ? 'danger' : vulnerability.severity === 'HIGH' ? 'warn' : 'info'}>
            {vulnerability.severity ?? 'INFO'}
          </Badge>
          <span className="font-mono text-[11px] text-text-muted">{vulnerability.method ?? 'GET'}</span>
          <span className="text-xs text-text-muted">{vulnerability.type ?? 'Security finding'}</span>
        </div>
        <div className="mt-2 break-all font-mono text-xs leading-5 text-text-primary">{vulnerability.url ?? '/'}</div>
      </div>

      <div className="space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">Evidence and SLA</div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={slaTone(vulnerability.sla_status)}>SLA {pretty(vulnerability.sla_status)}</Badge>
          <Badge tone={integrityVerified ? 'good' : 'danger'}>{integrityVerified ? 'Evidence verified' : 'Evidence gap'}</Badge>
          <Badge tone={vulnerability.confirmation_status === 'CONFIRMED' ? 'good' : 'warn'}>
            {pretty(vulnerability.confirmation_status)}
          </Badge>
        </div>
        <div className="text-xs text-text-muted">Due {formatDate(vulnerability.sla_due_at)}</div>
      </div>

      <div className="space-y-1 text-xs">
        <div className="text-[11px] font-semibold uppercase tracking-normal text-text-muted">Lifecycle</div>
        <div className="font-semibold text-text-primary">{pretty(vulnerability.status)}</div>
        <div className="text-text-muted">
          {vulnerability.ticket_url ? ticketKeyFromUrl(vulnerability.ticket_url) : 'No ticket linked'}
        </div>
        <div className="text-text-muted">
          Retest {vulnerability.retest_support?.queued_scan_supported ? 'queued scan ready' : 'manual outcome ready'}
        </div>
      </div>

      <LifecycleActions
        vulnerability={vulnerability}
        onSyncTicket={onSyncTicket}
        onRetest={onRetest}
        busy={busy}
        align="start"
      />
    </div>
  );
}

const ReleaseGovernance: React.FC = () => {
  const [policyPack, setPolicyPack] = useState<GatePolicyPack>('strict');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runs = useTestRuns(20);
  const triggers = useCicdTriggers(20);
  const governanceDashboard = useGovernanceDashboard();
  const lifecycle = useVulnerabilityLifecycle({ limit: 40 });
  const gate = useCicdGateDecision(selectedRunId, policyPack);
  const syncTicket = useSyncVulnerabilityTicket();
  const recordRetest = useRecordVulnerabilityRetestOutcome();

  const runOptions = useMemo(() => runs.data?.runs ?? [], [runs.data?.runs]);
  useEffect(() => {
    if (!selectedRunId && runOptions.length > 0) {
      setSelectedRunId(runOptions[0].id);
    }
  }, [runOptions, selectedRunId]);

  const selectedRun = runOptions.find((run) => run.id === selectedRunId) ?? runOptions[0];
  const decision = gate.data;
  const counts = decision?.counts ?? {};
  const vulnerabilities = useMemo(
    () => (lifecycle.data?.vulnerabilities ?? []).filter((item) => (item.status ?? '').toUpperCase() !== 'CLOSED'),
    [lifecycle.data],
  );
  const busy = syncTicket.isPending || recordRetest.isPending;

  const handleSyncTicket = (vulnerability: VulnerabilityLifecycleRecord) => {
    syncTicket.mutateAsync({
      vulnerabilityId: vulnerability.id,
      payload: {
        external_status: 'Done',
        external_key: ticketKeyFromUrl(vulnerability.ticket_url) ?? vulnerability.id.slice(0, 8),
        ticket_url: vulnerability.ticket_url ?? undefined,
        source: 'release_governance_ui',
      },
    });
  };

  const handleRetest = (vulnerability: VulnerabilityLifecycleRecord, outcome: 'clean' | 'still_vulnerable') => {
    recordRetest.mutateAsync({
      vulnerabilityId: vulnerability.id,
      payload: {
        outcome,
        executed: 1,
        vulnerable: outcome === 'still_vulnerable' ? 1 : 0,
        errors: 0,
        skipped: 0,
        reason: `Recorded from release governance UI for ${selectedRunId ?? 'manual review'}`,
      },
    });
  };

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-brand">
            <ShieldCheck size={16} /> Evidence-grade release control
          </div>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">Release Governance</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Evaluate signed CI gate decisions, inspect evidence blockers, export machine-readable reports, and close findings only after ticket sync and confirmatory retest evidence.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedRunId ?? ''}
            onChange={(event) => setSelectedRunId(event.target.value || null)}
            className="h-10 min-w-[240px] rounded-lg border border-border-subtle bg-bg-surface px-3 text-sm font-semibold text-text-primary outline-none focus:border-brand/40"
          >
            {runOptions.length === 0 ? (
              <option value="">No test runs</option>
            ) : (
              runOptions.map((run) => (
                <option key={run.id} value={run.id}>
                  {shortId(run.id, 12)} - {run.status}
                </option>
              ))
            )}
          </select>
          <button
            type="button"
            onClick={() => {
              gate.refetch();
              governanceDashboard.refetch();
            }}
            disabled={!selectedRunId || gate.isLoading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-surface px-4 text-sm font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand disabled:opacity-50"
          >
            <RotateCcw size={15} className={gate.isLoading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {policyPacks.map((pack) => (
          <button
            key={pack.key}
            type="button"
            onClick={() => setPolicyPack(pack.key)}
            className={`rounded-lg border p-4 text-left transition-colors ${
              policyPack === pack.key
                ? 'border-brand/30 bg-brand/10 text-text-primary'
                : 'border-border-subtle bg-bg-surface text-text-secondary hover:border-brand/20'
            }`}
          >
            <div className="text-sm font-bold">{pack.label}</div>
            <div className="mt-1 text-xs leading-5 text-text-muted">{pack.detail}</div>
          </button>
        ))}
      </div>

      {governanceDashboard.isError && (
        <QueryError message="Failed to load governance dashboard" onRetry={() => governanceDashboard.refetch()} />
      )}
      <GovernanceSnapshot dashboard={governanceDashboard.data} loading={governanceDashboard.isLoading} />

      {gate.isError && <QueryError message="Failed to evaluate CI gate" onRetry={() => gate.refetch()} />}

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <GlassCard variant="default" className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                {decision?.passed ? <BadgeCheck size={17} className="text-emerald-600" /> : <TriangleAlert size={17} className="text-red-500" />}
                CI gate decision
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={decisionTone(decision?.status)}>{decision?.status ?? 'No run selected'}</Badge>
                <span className="text-sm text-text-secondary">{pretty(decision?.reason)}</span>
              </div>
            </div>
            {selectedRunId && (
              <div className="flex flex-wrap gap-2">
                <a
                  href={buildCicdGateExportUrl(selectedRunId, 'sarif')}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand"
                >
                  <Download size={14} /> SARIF
                </a>
                <a
                  href={buildCicdGateExportUrl(selectedRunId, 'junit')}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border-subtle bg-bg-elevated px-3 text-xs font-semibold text-text-secondary transition-colors hover:border-brand/30 hover:text-brand"
                >
                  <FileCheck2 size={14} /> JUnit
                </a>
              </div>
            )}
          </div>

          {gate.isLoading ? (
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <SkeletonLoader variant="card" />
              <SkeletonLoader variant="card" />
              <SkeletonLoader variant="card" />
            </div>
          ) : (
            <>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <Metric
                  label="Blocking findings"
                  value={counts.failing_results ?? 0}
                  detail={`${counts.unconfirmed_blocking_results ?? 0} require confirmatory retest evidence.`}
                  tone={(counts.failing_results ?? 0) > 0 ? 'danger' : 'good'}
                />
                <Metric
                  label="Evidence gaps"
                  value={(counts.unverified_evidence_results ?? 0) + (counts.incomplete_evidence_results ?? 0)}
                  detail={`${counts.missing_safety_policy_results ?? 0} results are missing safety-policy proof.`}
                  tone={(counts.unverified_evidence_results ?? 0) > 0 || (counts.incomplete_evidence_results ?? 0) > 0 ? 'warn' : 'good'}
                />
                <Metric
                  label="Quota remaining"
                  value={decision?.quota?.remaining ?? '-'}
                  detail={`Policy pack ${decision?.policy?.policy_pack ?? policyPack}; exit code ${decision?.exit_code ?? '-'}.`}
                  tone={decision?.quota?.allowed === false ? 'danger' : 'info'}
                />
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-2">
                <ResultList title="Failing results" results={decision?.failing_results} />
                <ResultList title="Retest blockers" results={decision?.unconfirmed_results} />
              </div>
            </>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard variant="default" className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                <KeyRound size={16} />
              </div>
              <div>
                <div className="text-sm font-bold text-text-primary">Decision integrity</div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  Signed gate evidence is safe to preserve in CI logs and audit records.
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Signature</span>
                <span className="font-mono text-text-primary">{decision?.decision_integrity?.signature_algorithm ?? 'none'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Hash</span>
                <span className="font-mono text-text-primary">{shortId(decision?.decision_integrity?.decision_hash, 16)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-text-muted">Authenticated</span>
                <span className="font-semibold text-text-primary">{decision?.scan_context?.authenticated ? 'yes' : 'no'}</span>
              </div>
            </div>
          </GlassCard>

          <GlassCard variant="default" className="p-5">
            <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <GitBranch size={16} /> Recent CI triggers
            </div>
            <div className="mt-4 divide-y divide-border-subtle">
              {triggers.isLoading ? (
                <SkeletonLoader variant="list" rows={3} />
              ) : (triggers.data?.triggers ?? []).length === 0 ? (
                <div className="py-6 text-center text-xs text-text-muted">No CI triggers yet</div>
              ) : (
                (triggers.data?.triggers ?? []).slice(0, 4).map((trigger) => (
                  <div key={trigger.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text-primary">{trigger.source}</div>
                      <div className="truncate text-[11px] text-text-muted">
                        {trigger.branch ?? 'branch'} / {shortId(trigger.commit_sha, 8)}
                      </div>
                    </div>
                    <Badge tone={trigger.test_run_id ? 'good' : 'warn'}>{trigger.test_run_id ? 'linked' : pretty(trigger.status)}</Badge>
                  </div>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      </div>

      <GlassCard variant="default" className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border-subtle p-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
              <Clock size={16} /> Lifecycle queue
            </div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              Findings stay visible until SLA, ticket sync, and confirmatory retest evidence agree.
            </p>
          </div>
          <Badge tone="neutral">{vulnerabilities.length} active findings</Badge>
        </div>

        {lifecycle.isError && <div className="p-5"><QueryError message="Failed to load vulnerability lifecycle" onRetry={() => lifecycle.refetch()} /></div>}
        {lifecycle.isLoading ? (
          <div className="p-5">
            <SkeletonLoader variant="table" rows={5} />
          </div>
        ) : vulnerabilities.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-text-muted">
            No active lifecycle work. New findings will appear here after a scan or ticket sync.
          </div>
        ) : (
          <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[980px] text-left">
              <thead className="bg-bg-base/60">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-text-muted">Finding</th>
                  <th className="px-4 py-3 text-xs font-semibold text-text-muted">Evidence and SLA</th>
                  <th className="px-4 py-3 text-xs font-semibold text-text-muted">Lifecycle</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vulnerabilities.map((vulnerability) => (
                  <LifecycleRow
                    key={vulnerability.id}
                    vulnerability={vulnerability}
                    onSyncTicket={handleSyncTicket}
                    onRetest={handleRetest}
                    busy={busy}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="divide-y divide-border-subtle md:hidden">
            {vulnerabilities.map((vulnerability) => (
              <LifecycleMobileItem
                key={vulnerability.id}
                vulnerability={vulnerability}
                onSyncTicket={handleSyncTicket}
                onRetest={handleRetest}
                busy={busy}
              />
            ))}
          </div>
          </>
        )}
      </GlassCard>
    </div>
  );
};

export default ReleaseGovernance;
