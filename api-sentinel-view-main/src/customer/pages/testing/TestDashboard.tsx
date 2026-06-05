import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bot,
  Braces,
  Bug,
  CheckCircle2,
  Clock,
  Download,
  FileStack,
  Fingerprint,
  FlaskConical,
  GitBranch,
  KeyRound,
  Layers3,
  LockKeyhole,
  Play,
  Radar,
  RefreshCcw,
  Route,
  ScanLine,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TerminalSquare,
  TimerReset,
  TriangleAlert,
  UserCheck,
  Workflow,
  Zap,
} from 'lucide-react';

import QueryError from '@/components/shared/QueryError';
import GlassCard from '@/components/ui/GlassCard';
import SkeletonLoader from '@/components/ui/SkeletonLoader';
import {
  useAuthProfiles,
  useDetectionMeta,
  useOpenApiHistory,
  usePentestArtifacts,
  usePentestMeta,
  usePentestProfiles,
  useTestRuns,
  useTestingEndpoints,
  useTestingTemplates,
} from '@/hooks/use-security-ops';
import { useIssueSummary } from '@/hooks/use-testing';

type Tone = 'good' | 'warn' | 'danger' | 'info' | 'brand' | 'neutral';
type ModeKey = 'continuous' | 'ci' | 'retest';

interface StatusBadgeProps {
  tone: Tone;
  children: React.ReactNode;
}

interface SectionHeaderProps {
  icon: LucideIcon;
  label: string;
  title: string;
  action?: React.ReactNode;
}

const toneClasses: Record<Tone, string> = {
  good: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700',
  warn: 'border-amber-500/20 bg-amber-500/10 text-amber-700',
  danger: 'border-red-500/20 bg-red-500/10 text-red-600',
  info: 'border-blue-500/20 bg-blue-500/10 text-blue-600',
  brand: 'border-brand/20 bg-brand/10 text-brand',
  neutral: 'border-border-subtle bg-bg-elevated text-text-secondary',
};

const iconToneClasses: Record<Tone, string> = {
  good: 'bg-emerald-500/10 text-emerald-600',
  warn: 'bg-amber-500/10 text-amber-700',
  danger: 'bg-red-500/10 text-red-600',
  info: 'bg-blue-500/10 text-blue-600',
  brand: 'bg-brand/10 text-brand',
  neutral: 'bg-bg-elevated text-text-muted',
};

const modeCopy: Record<ModeKey, { title: string; description: string; cta: string }> = {
  continuous: {
    title: 'Continuous validation',
    description: 'Run authenticated checks as APIs, traffic, specs, and identity mappings change.',
    cta: 'Prepare next run',
  },
  ci: {
    title: 'Release gate',
    description: 'Block deployments when critical evidence, auth coverage, or target safety is missing.',
    cta: 'Inspect exports',
  },
  retest: {
    title: 'Confirmatory retest',
    description: 'Reproduce fixed findings with redacted evidence before closing remediation work.',
    cta: 'Open inspector',
  },
};

function StatusBadge({ tone, children }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

function SectionHeader({ icon: Icon, label, title, action }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-elevated text-brand">
          <Icon size={16} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</div>
          <h2 className="mt-1 text-base font-bold text-text-primary">{title}</h2>
        </div>
      </div>
      {action}
    </div>
  );
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

function runStatusTone(status?: string): Tone {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED':
      return 'good';
    case 'RUNNING':
      return 'brand';
    case 'FAILED':
      return 'danger';
    default:
      return 'warn';
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stackHas(scanStack: Record<string, boolean> | undefined, needle: string) {
  return Object.entries(scanStack ?? {}).some(([key, enabled]) => enabled && key.toLowerCase().includes(needle));
}

function ScoreGauge({ value, label, tone = 'brand' }: { value: number; label: string; tone?: Tone }) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampScore(value) / 100) * circumference;
  const stroke =
    tone === 'good'
      ? 'var(--sev-low)'
      : tone === 'warn'
        ? 'var(--sev-medium)'
        : tone === 'danger'
          ? 'var(--sev-critical)'
          : tone === 'info'
            ? 'var(--sev-info)'
            : 'var(--brand)';

  return (
    <div className="flex items-center gap-4">
      <svg width="112" height="112" viewBox="0 0 112 112" role="img" aria-label={`${label}: ${value}%`}>
        <circle cx="56" cy="56" r={radius} fill="none" stroke="var(--border-subtle)" strokeWidth="10" />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 56 56)"
        />
        <text x="56" y="52" textAnchor="middle" className="fill-text-primary text-2xl font-bold tabular-nums">
          {clampScore(value)}
        </text>
        <text x="56" y="71" textAnchor="middle" className="fill-text-muted text-[10px] font-semibold uppercase">
          score
        </text>
      </svg>
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">{label}</div>
        <p className="mt-1 max-w-[260px] text-sm leading-6 text-text-secondary">
          Readiness across auth, scope, engines, evidence, retests, and CI release gates.
        </p>
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  icon: Icon,
  tone,
  progress,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: LucideIcon;
  tone: Tone;
  progress?: number;
}) {
  return (
    <GlassCard variant="elevated" className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">{label}</div>
          <div className="mt-2 text-2xl font-bold text-text-primary tabular-nums">{value}</div>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconToneClasses[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
      {progress !== undefined && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/[0.05]">
          <div className="h-full rounded-full bg-current transition-all duration-700" style={{ width: `${clampScore(progress)}%`, color: tone === 'good' ? 'var(--sev-low)' : tone === 'warn' ? 'var(--sev-medium)' : tone === 'danger' ? 'var(--sev-critical)' : tone === 'info' ? 'var(--sev-info)' : 'var(--brand)' }} />
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-text-muted">{detail}</p>
    </GlassCard>
  );
}

function PhaseStep({
  index,
  title,
  detail,
  tone,
  icon: Icon,
}: {
  index: number;
  title: string;
  detail: string;
  tone: Tone;
  icon: LucideIcon;
}) {
  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconToneClasses[tone]}`}>
          <Icon size={16} />
        </div>
        {index < 4 && <div className="mt-2 h-full min-h-8 w-px bg-border-subtle" />}
      </div>
      <div className="pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-text-primary">{title}</h3>
          <StatusBadge tone={tone}>{tone === 'good' ? 'ready' : tone === 'danger' ? 'blocked' : tone === 'warn' ? 'needs config' : 'active'}</StatusBadge>
        </div>
        <p className="mt-1 text-xs leading-5 text-text-muted">{detail}</p>
      </div>
    </div>
  );
}

function EngineRow({
  name,
  purpose,
  metric,
  enabled,
  icon: Icon,
}: {
  name: string;
  purpose: string;
  metric: string;
  enabled: boolean;
  icon: LucideIcon;
}) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${enabled ? 'bg-emerald-500/10 text-emerald-600' : 'bg-bg-elevated text-text-muted'}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-text-primary">{name}</div>
        <div className="mt-0.5 text-xs leading-5 text-text-muted">{purpose}</div>
      </div>
      <div className="text-right">
        <StatusBadge tone={enabled ? 'good' : 'neutral'}>{enabled ? 'online' : 'standby'}</StatusBadge>
        <div className="mt-1 text-[11px] text-text-muted">{metric}</div>
      </div>
    </div>
  );
}

function GuardrailRow({
  name,
  detail,
  tone,
  icon: Icon,
}: {
  name: string;
  detail: string;
  tone: Tone;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border-subtle py-3 last:border-b-0">
      <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconToneClasses[tone]}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-text-primary">{name}</h3>
          <StatusBadge tone={tone}>{tone === 'good' ? 'enforced' : tone === 'warn' ? 'review' : tone === 'danger' ? 'blocked' : 'tracked'}</StatusBadge>
        </div>
        <p className="mt-1 text-xs leading-5 text-text-muted">{detail}</p>
      </div>
    </div>
  );
}

function ReadinessCheck({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-2.5 last:border-b-0">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      {ready ? <CheckCircle2 size={15} className="text-emerald-600" /> : <TriangleAlert size={15} className="text-amber-600" />}
    </div>
  );
}

function MiniBar({ label, value, max, tone }: { label: string; value: number; max: number; tone: Tone }) {
  const percent = max > 0 ? clampScore((value / max) * 100) : 0;
  const color =
    tone === 'good'
      ? 'bg-emerald-500'
      : tone === 'warn'
        ? 'bg-amber-500'
        : tone === 'danger'
          ? 'bg-red-500'
          : tone === 'info'
            ? 'bg-blue-500'
            : 'bg-brand';

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-text-secondary">{label}</span>
        <span className="font-bold text-text-primary tabular-nums">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/[0.05]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

const TestDashboard: React.FC = () => {
  const [mode, setMode] = useState<ModeKey>('continuous');

  const issueSummary = useIssueSummary();
  const detectionMeta = useDetectionMeta();
  const pentestMeta = usePentestMeta();
  const authProfiles = useAuthProfiles();
  const pentestProfiles = usePentestProfiles();
  const artifacts = usePentestArtifacts(undefined, 8);
  const templates = useTestingTemplates();
  const endpoints = useTestingEndpoints(24);
  const specs = useOpenApiHistory(8);
  const runs = useTestRuns(8);

  const totalIssues = issueSummary.data?.totalIssues ?? 0;
  const openIssues = issueSummary.data?.openIssues ?? 0;
  const fixedIssues = issueSummary.data?.fixedIssues ?? 0;
  const severityBreakdown = issueSummary.data?.severityBreakdown ?? {};
  const criticalOpen = severityBreakdown.CRITICAL ?? 0;
  const highOpen = severityBreakdown.HIGH ?? 0;
  const resolvedPct = totalIssues > 0 ? clampScore((fixedIssues / totalIssues) * 100) : 0;

  const scanStack = pentestMeta.data?.scan_stack;
  const stackKeyCount = Object.keys(scanStack ?? {}).length;
  const enabledStackCount = Object.values(scanStack ?? {}).filter(Boolean).length;
  const templateCount = pentestMeta.data?.inventory.template_count ?? templates.data?.count ?? templates.data?.templates?.length ?? 0;
  const authProfileCount = authProfiles.data?.total ?? pentestMeta.data?.inventory.auth_profile_count ?? 0;
  const profileCount = pentestProfiles.data?.total ?? pentestMeta.data?.inventory.pentest_profile_count ?? 0;
  const detectorCount = detectionMeta.data?.detectors?.length ?? 0;
  const artifactCount = artifacts.data?.total ?? artifacts.data?.artifacts?.length ?? 0;
  const endpointCount = endpoints.data?.total ?? endpoints.data?.endpoints?.length ?? 0;
  const latestRun = runs.data?.runs?.[0] ?? null;
  const activeProfiles = pentestProfiles.data?.profiles ?? [];
  const activeAuthProfiles = authProfiles.data?.profiles ?? [];
  const allowlistDomains = Array.from(new Set(activeAuthProfiles.flatMap((profile) => profile.scope_domains)));
  const safeProfiles = activeProfiles.filter((profile) => !profile.allow_state_change).length;
  const unsafeProfiles = activeProfiles.filter((profile) => profile.allow_state_change).length;
  const redirectingProfiles = activeProfiles.filter((profile) => profile.follow_redirects).length;
  const hasSecrets = activeAuthProfiles.some((profile) => profile.has_token || profile.has_credentials || profile.has_static_headers || profile.cookie_count > 0);
  const engineDenominator = Math.max(stackKeyCount, 5);
  const engineCoverage = clampScore((enabledStackCount / engineDenominator) * 100);
  const authCoverage = profileCount > 0 ? clampScore((authProfileCount / profileCount) * 100) : authProfileCount > 0 ? 100 : 0;
  const evidenceQuality = clampScore(((latestRun ? 35 : 0) + (artifactCount > 0 ? 35 : 0) + (fixedIssues > 0 ? 15 : 0) + (criticalOpen === 0 ? 15 : 0)));

  const readinessChecks = useMemo(
    () => [
      { label: 'Authenticated testing default', ready: authProfileCount > 0 },
      { label: 'Scoped target allowlist', ready: allowlistDomains.length > 0 },
      { label: 'Destructive methods disabled', ready: profileCount > 0 && unsafeProfiles === 0 },
      { label: 'Context inventory available', ready: endpointCount > 0 || specs.data?.total > 0 },
      { label: 'Template library loaded', ready: templateCount > 0 },
      { label: 'Multi-engine stack enabled', ready: enabledStackCount > 0 || pentestMeta.data?.availability.schemathesis === true },
      { label: 'Passive detectors online', ready: detectorCount > 0 && detectionMeta.data?.health.pipeline_enabled !== false },
      { label: 'Run evidence exists', ready: Boolean(latestRun) },
      { label: 'Replay artifacts retained', ready: artifactCount > 0 },
      { label: 'Critical release gate clear', ready: criticalOpen === 0 },
    ],
    [
      allowlistDomains.length,
      artifactCount,
      authProfileCount,
      criticalOpen,
      detectorCount,
      detectionMeta.data?.health.pipeline_enabled,
      enabledStackCount,
      endpointCount,
      latestRun,
      pentestMeta.data?.availability.schemathesis,
      profileCount,
      specs.data?.total,
      templateCount,
      unsafeProfiles,
    ],
  );

  const readinessScore = clampScore((readinessChecks.filter((check) => check.ready).length / readinessChecks.length) * 100);
  const readinessTone: Tone = readinessScore >= 80 ? 'good' : readinessScore >= 55 ? 'warn' : 'danger';

  const categoryCounts = useMemo(() => {
    const fromMeta = pentestMeta.data?.inventory.template_categories ?? {};
    if (Object.keys(fromMeta).length) return fromMeta;
    return (templates.data?.templates ?? []).reduce<Record<string, number>>((acc, template) => {
      const key = template.category || 'Uncategorized';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
  }, [pentestMeta.data?.inventory.template_categories, templates.data?.templates]);

  const businessLogicTemplates = Object.entries(categoryCounts).reduce((count, [category, value]) => {
    return category.toLowerCase().includes('business') || category.toLowerCase().includes('logic') ? count + value : count;
  }, 0);

  const llmTemplates = Object.entries(categoryCounts).reduce((count, [category, value]) => {
    const key = category.toLowerCase();
    return key.includes('llm') || key.includes('ai') || key.includes('mcp') || key.includes('agent') ? count + value : count;
  }, 0);

  const highRiskEndpoints = (endpoints.data?.endpoints ?? []).filter((endpoint) => (endpoint.risk_score ?? 0) >= 70).length;
  const runMode = modeCopy[mode];
  const latestStatusTone = runStatusTone(latestRun?.status);

  const engineRows = [
    {
      name: 'Template engine',
      purpose: 'Owned API security templates and regression checks.',
      metric: `${templateCount} tests`,
      enabled: templateCount > 0,
      icon: FlaskConical,
    },
    {
      name: 'Schemathesis',
      purpose: 'OpenAPI-driven fuzzing, stateful flows, and contract edge cases.',
      metric: pentestMeta.data?.availability.schemathesis ? 'available' : 'not found',
      enabled: Boolean(pentestMeta.data?.availability.schemathesis || stackHas(scanStack, 'schemathesis')),
      icon: Braces,
    },
    {
      name: 'Nuclei / DAST',
      purpose: 'Nuclei secret-safe packs, DAST probes, and recon-aware checks.',
      metric: pentestMeta.data?.availability.nuclei_secret_files ? 'secret files ready' : 'profile gated',
      enabled: Boolean(stackHas(scanStack, 'nuclei') || activeProfiles.some((profile) => profile.nuclei_enabled)),
      icon: Zap,
    },
    {
      name: 'ZAP worker',
      purpose: 'Isolated active checks for allowed targets and safe methods.',
      metric: activeProfiles.some((profile) => profile.zap_enabled) ? 'profiles enabled' : 'not enabled',
      enabled: Boolean(stackHas(scanStack, 'zap') || activeProfiles.some((profile) => profile.zap_enabled)),
      icon: ShieldAlert,
    },
    {
      name: 'Passive analysis',
      purpose: 'Traffic-derived detections, sensitive data signals, and drift.',
      metric: `${detectorCount} detectors`,
      enabled: detectorCount > 0 && detectionMeta.data?.mode !== 'off',
      icon: Radar,
    },
  ];

  const identityRows = activeAuthProfiles.length
    ? activeAuthProfiles.slice(0, 4).map((profile) => ({
        name: profile.name,
        mode: profile.auth_mode,
        domains: profile.scope_domains.length,
        authReady: profile.is_active && (profile.has_token || profile.has_credentials || profile.has_static_headers || profile.cookie_count > 0),
      }))
    : [
        {
          name: 'No identity configured',
          mode: 'missing auth',
          domains: 0,
          authReady: false,
        },
      ];

  const maxLifecycleValue = Math.max(openIssues, criticalOpen, highOpen, fixedIssues, 1);
  const infraError =
    issueSummary.isError ||
    detectionMeta.isError ||
    pentestMeta.isError ||
    authProfiles.isError ||
    pentestProfiles.isError ||
    artifacts.isError ||
    templates.isError ||
    endpoints.isError ||
    specs.isError ||
    runs.isError;

  return (
    <div className="space-y-5 animate-fade-in">
      {infraError && (
        <QueryError
          message="Red-team telemetry is partially unavailable"
          onRetry={() => {
            void issueSummary.refetch();
            void detectionMeta.refetch();
            void pentestMeta.refetch();
            void authProfiles.refetch();
            void pentestProfiles.refetch();
            void artifacts.refetch();
            void templates.refetch();
            void endpoints.refetch();
            void specs.refetch();
            void runs.refetch();
          }}
        />
      )}

      <GlassCard variant="elevated" className="overflow-hidden">
        <div className="border-b border-border-subtle bg-bg-surface px-5 py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={readinessTone}>{readinessScore >= 80 ? 'production ready' : readinessScore >= 55 ? 'hardening' : 'setup required'}</StatusBadge>
                <StatusBadge tone={latestStatusTone}>latest run {latestRun?.status ?? 'none'}</StatusBadge>
                <StatusBadge tone={detectionMeta.data?.mode === 'active' ? 'good' : detectionMeta.data?.mode === 'shadow' ? 'warn' : 'neutral'}>
                  passive {detectionMeta.data?.mode ?? 'off'}
                </StatusBadge>
              </div>
              <h1 className="mt-4 text-2xl font-bold leading-tight text-text-primary md:text-3xl">
                API Red Team Command Center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                Continuous authenticated validation for owned APIs, with target safety, context-aware test selection, evidence custody, retests, and release gating in one operational surface.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row xl:justify-end">
              <Link
                to="/app/testing/configuration"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
              >
                <SlidersHorizontal size={15} />
                Configure
              </Link>
              <Link
                to="/app/testing/inspector"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-4 py-2.5 text-sm font-bold text-text-primary transition-colors hover:border-brand/25 hover:text-brand"
              >
                <FileStack size={15} />
                Evidence
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="p-5">
            {issueSummary.isLoading || pentestMeta.isLoading || detectionMeta.isLoading ? (
              <SkeletonLoader variant="metric" count={4} />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  label="Auth coverage"
                  value={`${authCoverage}%`}
                  detail={`${authProfileCount} auth context${authProfileCount === 1 ? '' : 's'} mapped across ${profileCount || 0} run profile${profileCount === 1 ? '' : 's'}.`}
                  icon={KeyRound}
                  tone={authCoverage >= 80 ? 'good' : authCoverage > 0 ? 'warn' : 'danger'}
                  progress={authCoverage}
                />
                <MetricTile
                  label="Engine mix"
                  value={`${enabledStackCount}/${engineDenominator}`}
                  detail="Templates, Schemathesis, Nuclei, ZAP, and passive analysis coverage."
                  icon={Workflow}
                  tone={engineCoverage >= 60 ? 'good' : engineCoverage > 0 ? 'warn' : 'danger'}
                  progress={engineCoverage}
                />
                <MetricTile
                  label="Evidence grade"
                  value={`${evidenceQuality}%`}
                  detail={`${artifactCount} replay/export artifact${artifactCount === 1 ? '' : 's'} retained for reproducibility.`}
                  icon={BadgeCheck}
                  tone={evidenceQuality >= 75 ? 'good' : evidenceQuality > 30 ? 'warn' : 'danger'}
                  progress={evidenceQuality}
                />
                <MetricTile
                  label="Open risk"
                  value={openIssues}
                  detail={`${criticalOpen} critical and ${highOpen} high findings currently shape the release gate.`}
                  icon={Bug}
                  tone={criticalOpen > 0 ? 'danger' : openIssues > 0 ? 'warn' : 'good'}
                  progress={openIssues > 0 ? clampScore(((criticalOpen + highOpen) / Math.max(openIssues, 1)) * 100) : 100}
                />
              </div>
            )}

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <GlassCard variant="default" className="p-5">
                <SectionHeader
                  icon={Activity}
                  label="Execution loop"
                  title={runMode.title}
                  action={
                    <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-border-subtle bg-bg-elevated p-1">
                      {(['continuous', 'ci', 'retest'] as ModeKey[]).map((key) => {
                        const isActive = mode === key;
                        return (
                          <button
                            key={key}
                            onClick={() => setMode(key)}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-bold transition-colors ${
                              isActive ? 'bg-bg-surface text-brand shadow-sm' : 'text-text-muted hover:text-text-primary'
                            }`}
                          >
                            {key === 'continuous' ? <Radar size={13} /> : key === 'ci' ? <GitBranch size={13} /> : <RefreshCcw size={13} />}
                            {key === 'continuous' ? 'Live' : key === 'ci' ? 'CI' : 'Retest'}
                          </button>
                        );
                      })}
                    </div>
                  }
                />

                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
                  <div>
                    <p className="max-w-xl text-sm leading-6 text-text-secondary">{runMode.description}</p>
                    <div className="mt-5 space-y-0">
                      <PhaseStep
                        index={0}
                        title="Discover context"
                        detail={`${endpointCount} endpoints, ${specs.data?.total ?? 0} specs, and ${Object.keys(categoryCounts).length} template categories inform test selection.`}
                        tone={endpointCount > 0 || (specs.data?.total ?? 0) > 0 ? 'good' : 'warn'}
                        icon={Route}
                      />
                      <PhaseStep
                        index={1}
                        title="Authenticate by default"
                        detail={authProfileCount > 0 ? `${authProfileCount} reusable identities are available for role-aware replay.` : 'Create scoped auth contexts before promoting runs to release gates.'}
                        tone={authProfileCount > 0 ? 'good' : 'danger'}
                        icon={UserCheck}
                      />
                      <PhaseStep
                        index={2}
                        title="Select engines"
                        detail={`${enabledStackCount} engine signal${enabledStackCount === 1 ? '' : 's'} enabled with templates, fuzzing, DAST, and passive analysis tracked separately.`}
                        tone={enabledStackCount > 0 || templateCount > 0 ? 'good' : 'warn'}
                        icon={Zap}
                      />
                      <PhaseStep
                        index={3}
                        title="Preserve evidence"
                        detail={latestRun ? `Latest run ${latestRun.id.slice(0, 8)} started ${formatTimestamp(latestRun.started_at || latestRun.created_at)}.` : 'Run evidence will populate replay bundles, redacted payloads, and CI exports.'}
                        tone={latestRun ? latestStatusTone : 'warn'}
                        icon={FileStack}
                      />
                      <PhaseStep
                        index={4}
                        title="Retest and gate"
                        detail={`${fixedIssues} fixed finding${fixedIssues === 1 ? '' : 's'} ready for confirmatory validation. Critical gate is ${criticalOpen === 0 ? 'clear' : 'blocking'}.`}
                        tone={criticalOpen === 0 ? 'good' : 'danger'}
                        icon={ShieldCheck}
                      />
                    </div>
                  </div>

                  <div className="rounded-lg border border-border-subtle bg-bg-elevated p-4">
                    <ScoreGauge value={readinessScore} label="Platform readiness" tone={readinessTone} />
                    <div className="mt-4 border-t border-border-subtle pt-3">
                      {readinessChecks.slice(0, 6).map((check) => (
                        <ReadinessCheck key={check.label} label={check.label} ready={check.ready} />
                      ))}
                    </div>
                    <Link
                      to={mode === 'ci' || mode === 'retest' ? '/app/testing/inspector' : '/app/testing/configuration'}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border-subtle bg-bg-surface px-3 py-2.5 text-xs font-bold text-text-primary transition-colors hover:border-brand/25 hover:text-brand"
                    >
                      {mode === 'continuous' ? <Play size={13} /> : mode === 'ci' ? <Download size={13} /> : <RefreshCcw size={13} />}
                      {runMode.cta}
                    </Link>
                  </div>
                </div>
              </GlassCard>

              <GlassCard variant="default" className="p-5">
                <SectionHeader icon={Shield} label="Target safety" title="Owned-scope guardrails" />
                <div className="mt-4">
                  <GuardrailRow
                    name="Target allowlists"
                    detail={allowlistDomains.length ? `${allowlistDomains.length} scoped domain${allowlistDomains.length === 1 ? '' : 's'} bound to auth profiles.` : 'Add scoped domains to keep active tests on owned APIs.'}
                    tone={allowlistDomains.length ? 'good' : 'warn'}
                    icon={ScanLine}
                  />
                  <GuardrailRow
                    name="SSRF and redirect guard"
                    detail={redirectingProfiles > 0 ? `${redirectingProfiles} profile${redirectingProfiles === 1 ? '' : 's'} follow redirects. Review outbound boundaries before active DAST.` : 'Redirect following is constrained by current profiles.'}
                    tone={redirectingProfiles > 0 ? 'warn' : profileCount > 0 ? 'good' : 'neutral'}
                    icon={Route}
                  />
                  <GuardrailRow
                    name="Destructive methods"
                    detail={profileCount > 0 ? `${safeProfiles}/${profileCount} profiles disable state-changing probes by default.` : 'Create a run profile to lock method safety.'}
                    tone={unsafeProfiles > 0 ? 'danger' : profileCount > 0 ? 'good' : 'warn'}
                    icon={LockKeyhole}
                  />
                  <GuardrailRow
                    name="Secret custody"
                    detail={hasSecrets ? 'Secrets are referenced as stored auth material and never rendered in the UI.' : 'No reusable credentials have been stored yet.'}
                    tone={hasSecrets ? 'good' : 'warn'}
                    icon={Fingerprint}
                  />
                  <GuardrailRow
                    name="Worker isolation"
                    detail={engineRows.some((engine) => engine.name.includes('ZAP') && engine.enabled) ? 'Active scanner workers are represented in run profiles.' : 'Track isolated worker enablement before aggressive profiles.'}
                    tone={engineRows.some((engine) => engine.name.includes('ZAP') && engine.enabled) ? 'good' : 'info'}
                    icon={Layers3}
                  />
                </div>
              </GlassCard>
            </div>
          </div>

          <div className="border-t border-border-subtle bg-bg-elevated p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Current run</div>
                <h2 className="mt-1 text-base font-bold text-text-primary">{latestRun ? latestRun.id.slice(0, 8) : 'No run yet'}</h2>
              </div>
              <StatusBadge tone={latestStatusTone}>{latestRun?.status ?? 'waiting'}</StatusBadge>
            </div>

            {latestRun ? (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-3">
                    <div className="text-[11px] text-text-muted">Tests</div>
                    <div className="mt-1 text-xl font-bold text-text-primary tabular-nums">{latestRun.total_tests}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-3">
                    <div className="text-[11px] text-text-muted">Findings</div>
                    <div className="mt-1 text-xl font-bold text-red-500 tabular-nums">{latestRun.vulnerable_count}</div>
                  </div>
                  <div className="rounded-lg border border-border-subtle bg-bg-surface px-3 py-3">
                    <div className="text-[11px] text-text-muted">Errors</div>
                    <div className="mt-1 text-xl font-bold text-amber-600 tabular-nums">{latestRun.error_count}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                    <Clock size={15} className="text-brand" />
                    Run timing
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-text-muted">
                    <div className="flex justify-between gap-3"><span>Started</span><span className="font-semibold text-text-secondary">{formatTimestamp(latestRun.started_at || latestRun.created_at)}</span></div>
                    <div className="flex justify-between gap-3"><span>Completed</span><span className="font-semibold text-text-secondary">{formatTimestamp(latestRun.completed_at)}</span></div>
                    <div className="flex justify-between gap-3"><span>Recorded runs</span><span className="font-semibold text-text-secondary">{runs.data?.total ?? 0}</span></div>
                  </div>
                </div>

                <Link
                  to="/app/testing/inspector"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-dark"
                >
                  <FileStack size={15} />
                  Inspect run evidence
                </Link>
              </div>
            ) : (
              <div className="mt-5 rounded-lg border border-dashed border-border-default bg-bg-surface px-5 py-8 text-center">
                <Shield size={30} className="mx-auto text-text-muted" />
                <p className="mt-3 text-sm font-bold text-text-primary">Awaiting first evidence run</p>
                <p className="mt-2 text-xs leading-5 text-text-muted">
                  Configure auth, target scope, and a safe pentest profile before launching active validation.
                </p>
              </div>
            )}

            <div className="mt-5 rounded-lg border border-border-subtle bg-bg-surface p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-text-primary">
                <TimerReset size={15} className="text-blue-600" />
                SLA posture
              </div>
              <div className="mt-4 space-y-4">
                <MiniBar label="Open" value={openIssues} max={maxLifecycleValue} tone={openIssues > 0 ? 'warn' : 'good'} />
                <MiniBar label="Critical" value={criticalOpen} max={maxLifecycleValue} tone={criticalOpen > 0 ? 'danger' : 'good'} />
                <MiniBar label="High" value={highOpen} max={maxLifecycleValue} tone={highOpen > 0 ? 'warn' : 'good'} />
                <MiniBar label="Fixed" value={fixedIssues} max={maxLifecycleValue} tone="good" />
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_0.85fr]">
        <GlassCard variant="elevated" className="p-5">
          <SectionHeader icon={Workflow} label="Engine orchestration" title="Multi-engine execution plan" />
          <div className="mt-4">
            {engineRows.map((engine) => (
              <EngineRow key={engine.name} {...engine} />
            ))}
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5">
          <SectionHeader icon={Radar} label="Context selection" title="Evidence-driven test targeting" />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary">Selection signals</div>
              <div className="space-y-3">
                <MiniBar label="Endpoints" value={endpointCount} max={Math.max(endpointCount, templateCount, 1)} tone="brand" />
                <MiniBar label="High-risk sample" value={highRiskEndpoints} max={Math.max(endpointCount, 1)} tone={highRiskEndpoints > 0 ? 'warn' : 'good'} />
                <MiniBar label="OpenAPI specs" value={specs.data?.total ?? 0} max={Math.max(specs.data?.total ?? 0, 5)} tone="info" />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-secondary">Coverage intent</div>
              <div className="space-y-3">
                <MiniBar label="Business logic" value={businessLogicTemplates} max={Math.max(templateCount, 1)} tone={businessLogicTemplates > 0 ? 'good' : 'warn'} />
                <MiniBar label="LLM/API agentic" value={llmTemplates} max={Math.max(templateCount, 1)} tone={llmTemplates > 0 ? 'info' : 'neutral'} />
                <MiniBar label="Template library" value={templateCount} max={Math.max(templateCount, endpointCount, 1)} tone={templateCount > 0 ? 'good' : 'warn'} />
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-2">
            {Object.entries(categoryCounts).slice(0, 6).map(([category, count]) => (
              <div key={category} className="flex items-center justify-between gap-3 border-b border-border-subtle py-2 last:border-b-0">
                <span className="text-xs font-semibold text-text-secondary">{category}</span>
                <span className="text-xs font-bold text-text-primary tabular-nums">{count}</span>
              </div>
            ))}
            {!Object.keys(categoryCounts).length && (
              <div className="rounded-lg border border-dashed border-border-default px-4 py-6 text-center text-xs text-text-muted">
                Template categories will appear once the backend catalogue responds.
              </div>
            )}
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[0.95fr_minmax(0,1fr)]">
        <GlassCard variant="elevated" className="p-5">
          <SectionHeader icon={Fingerprint} label="Identity abuse" title="BOLA and BFLA coverage matrix" />
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  <th className="py-3 pr-3 font-bold">Identity</th>
                  <th className="px-3 py-3 font-bold">Auth</th>
                  <th className="px-3 py-3 font-bold">Scope</th>
                  <th className="px-3 py-3 font-bold">BOLA</th>
                  <th className="px-3 py-3 font-bold">BFLA</th>
                  <th className="py-3 pl-3 font-bold">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {identityRows.map((row) => (
                  <tr key={row.name} className="border-b border-border-subtle last:border-b-0">
                    <td className="py-3 pr-3">
                      <div className="text-sm font-bold text-text-primary">{row.name}</div>
                      <div className="mt-0.5 text-[11px] text-text-muted">{row.mode}</div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge tone={row.authReady ? 'good' : 'warn'}>{row.authReady ? 'ready' : 'missing'}</StatusBadge></td>
                    <td className="px-3 py-3"><StatusBadge tone={row.domains > 0 ? 'good' : 'warn'}>{row.domains > 0 ? `${row.domains} domains` : 'unscoped'}</StatusBadge></td>
                    <td className="px-3 py-3"><StatusBadge tone={authProfileCount >= 2 ? 'good' : row.authReady ? 'warn' : 'neutral'}>{authProfileCount >= 2 ? 'paired' : 'needs pair'}</StatusBadge></td>
                    <td className="px-3 py-3"><StatusBadge tone={profileCount > 0 && authProfileCount > 0 ? 'good' : 'warn'}>{profileCount > 0 ? 'role map' : 'profile'}</StatusBadge></td>
                    <td className="py-3 pl-3"><StatusBadge tone={artifactCount > 0 ? 'good' : latestRun ? 'warn' : 'neutral'}>{artifactCount > 0 ? 'retained' : latestRun ? 'pending' : 'none'}</StatusBadge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        <GlassCard variant="elevated" className="p-5">
          <SectionHeader icon={FileStack} label="Evidence custody" title="Reproducible and redacted proof chain" />
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              {
                title: 'Redacted request packet',
                detail: latestRun ? 'Request and response evidence is available from persisted run records.' : 'Launch a run to capture request and response proof.',
                tone: latestRun ? 'good' : 'warn',
                icon: FileStack,
              },
              {
                title: 'Replay bundle',
                detail: artifactCount > 0 ? `${artifactCount} artifact${artifactCount === 1 ? '' : 's'} retained for reproduction.` : 'Prepare profile materials with persistence enabled.',
                tone: artifactCount > 0 ? 'good' : 'warn',
                icon: TerminalSquare,
              },
              {
                title: 'Confirmatory retest',
                detail: fixedIssues > 0 ? `${fixedIssues} fixed finding${fixedIssues === 1 ? '' : 's'} should be retested before closure.` : 'Retest queue will populate as fixes are marked.',
                tone: fixedIssues > 0 ? 'info' : 'neutral',
                icon: RefreshCcw,
              },
              {
                title: 'CI export',
                detail: latestRun ? 'SARIF and JUnit exports are available from the run inspector.' : 'Exports activate after a run is recorded.',
                tone: latestRun ? 'good' : 'neutral',
                icon: Download,
              },
            ].map(({ title, detail, tone, icon: Icon }) => (
              <div key={title} className="rounded-lg border border-border-subtle bg-bg-base p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconToneClasses[tone as Tone]}`}>
                    <Icon size={15} />
                  </div>
                  <StatusBadge tone={tone as Tone}>{tone === 'good' ? 'ready' : tone === 'info' ? 'queued' : 'pending'}</StatusBadge>
                </div>
                <h3 className="mt-3 text-sm font-bold text-text-primary">{title}</h3>
                <p className="mt-2 text-xs leading-5 text-text-muted">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-lg border border-border-subtle bg-bg-base p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">Release gate</div>
                <h3 className="mt-1 text-sm font-bold text-text-primary">
                  {criticalOpen === 0 && evidenceQuality >= 60 ? 'CI gate can pass with evidence' : 'CI gate requires attention'}
                </h3>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={criticalOpen === 0 ? 'good' : 'danger'}>critical {criticalOpen}</StatusBadge>
                <StatusBadge tone={authCoverage >= 80 ? 'good' : 'warn'}>auth {authCoverage}%</StatusBadge>
                <StatusBadge tone={evidenceQuality >= 60 ? 'good' : 'warn'}>evidence {evidenceQuality}%</StatusBadge>
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard variant="elevated" className="p-5">
        <SectionHeader
          icon={Bot}
          label="Enterprise readiness"
          title="Governance, lifecycle, and advanced API coverage"
          action={
            <Link to="/app/intelligence/agentic" className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-elevated px-3 py-2 text-xs font-bold text-text-primary transition-colors hover:border-brand/25 hover:text-brand">
              AI Security
              <ArrowRight size={13} />
            </Link>
          }
        />
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: 'Business logic',
              value: businessLogicTemplates,
              detail: 'Workflow abuse, chained endpoint state, and authorization context.',
              tone: businessLogicTemplates > 0 ? 'good' : 'warn',
              icon: Workflow,
            },
            {
              title: 'LLM API coverage',
              value: llmTemplates,
              detail: 'Prompt injection, tool abuse, MCP exposure, and agentic routes.',
              tone: llmTemplates > 0 ? 'info' : 'neutral',
              icon: Bot,
            },
            {
              title: 'Lifecycle queue',
              value: openIssues + fixedIssues,
              detail: 'Dedup, ownership, SLA, retest, and release status in one queue.',
              tone: openIssues > 0 ? 'warn' : 'good',
              icon: TimerReset,
            },
            {
              title: 'Governance refs',
              value: (detectionMeta.data?.official_references?.length ?? 0) + (pentestMeta.data?.official_references?.length ?? 0),
              detail: 'Official references connected to detection and pentest posture.',
              tone: 'brand',
              icon: ShieldCheck,
            },
          ].map(({ title, value, detail, tone, icon: Icon }) => (
            <div key={title} className="rounded-lg border border-border-subtle bg-bg-base p-4">
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconToneClasses[tone as Tone]}`}>
                  <Icon size={15} />
                </div>
                <span className="text-2xl font-bold text-text-primary tabular-nums">{value}</span>
              </div>
              <h3 className="mt-4 text-sm font-bold text-text-primary">{title}</h3>
              <p className="mt-2 text-xs leading-5 text-text-muted">{detail}</p>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

export default TestDashboard;
