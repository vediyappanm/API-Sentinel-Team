import { buildApiUrl, get, post } from '@/lib/api-client';

export interface OfficialReference {
  name: string;
  url: string;
}

export interface DetectionDetectorMeta {
  detector_id: string;
  name: string;
  description: string;
  tags: string[];
  threshold_keys: string[];
  enabled: boolean;
}

export interface DetectionMeta {
  account_id: number;
  mode: 'off' | 'shadow' | 'active';
  knowledge_pack_version: string;
  detectors: DetectionDetectorMeta[];
  thresholds: Record<string, number>;
  hot_state: {
    backend: string;
    redis_configured: boolean;
  };
  health: {
    db_ready: boolean;
    pipeline_enabled: boolean;
    pipeline_active: boolean;
  };
  official_references: OfficialReference[];
}

export interface PentestMeta {
  account_id: number;
  scan_stack: Record<string, boolean>;
  availability: {
    schemathesis: boolean;
    nuclei_secret_files: boolean;
  };
  inventory: {
    template_count: number;
    template_categories: Record<string, number>;
    pentest_profile_count: number;
    auth_profile_count: number;
  };
  official_references: OfficialReference[];
}

export interface GovernanceDashboard {
  account_id: number;
  generated_at?: string;
  executive: {
    open_findings: number;
    critical_open_findings: number;
    high_open_findings: number;
    medium_open_findings?: number;
    low_open_findings?: number;
    risk_score: number;
  };
  sla: {
    overdue: number;
    due_soon: number;
    on_track: number;
    no_sla?: number;
  };
  coverage: {
    llm_active_findings: number;
    business_logic_active_findings: number;
    latest_run_status?: string | null;
    latest_run_id?: string | null;
    latest_run_total_tests?: number;
    latest_run_vulnerable_count?: number;
    coverage_targets?: Record<string, unknown>;
    engine_plan?: GovernanceEnginePlanItem[];
  };
  governance: {
    open_policy_violations: number;
    latest_policy_pack?: string | null;
    latest_policy_violation?: string | null;
  };
  top_endpoint_risk: Array<{
    endpoint_id: string;
    method: string;
    path: string;
    risk_score: number;
    open_findings: number;
    severity_counts?: Record<string, number>;
  }>;
  vulnerability_trend: Array<{
    date: string;
    open_findings: number;
  }>;
  north_star_readiness: NorthStarReadiness;
  reports: GovernanceReleaseReports;
}

export interface GovernanceEnginePlanItem {
  engine: string;
  display_name?: string;
  enabled?: boolean;
  status?: string;
  reason?: string;
  requires_auth_profile?: boolean;
  requires_openapi_spec?: boolean;
  artifact_type?: string | null;
  runtime_available?: boolean;
}

export interface NorthStarCapability {
  id: string;
  name: string;
  status: string;
  completion_percent?: number;
  ready: string[];
  missing: string[];
  next_action?: string | null;
}

export interface NorthStarProductionBlocker {
  id: string;
  capability_id?: string;
  capability_name?: string;
  check?: string;
  next_action?: string;
  owner?: string | null;
  evidence_status?: string | null;
  sla_status?: string | null;
}

export interface NorthStarP1Workstream {
  id: string;
  name: string;
  owner: string;
  priority: string;
  status: string;
  evidence_status: string;
  ready_checks: string[];
  missing_checks: string[];
  blockers: string[];
  next_action: string;
}

export interface NorthStarReadiness {
  overall_status: string;
  readiness_score: number;
  ready_count: number;
  partial_count: number;
  gap_count: number;
  control_counts: {
    ready: number;
    missing: number;
    total: number;
  };
  production_blockers: NorthStarProductionBlocker[];
  p1_workstreams: NorthStarP1Workstream[];
  capabilities: NorthStarCapability[];
  next_gaps: string[];
}

export interface GovernanceExecutiveSummaryReport {
  readiness_statement: string;
  blocker_summary: string;
  owner_summary: string;
  evidence_status: string;
  sla_health: string;
}

export interface GovernanceTechnicalReport {
  evidence_status: string;
  sla_health: string;
  endpoint_risk: string;
  trend_summary: string;
  artifact_status: string;
}

export interface GovernanceReleaseReports {
  executive_summary: GovernanceExecutiveSummaryReport;
  technical_report: GovernanceTechnicalReport;
}

export type GatePolicyPack = 'strict' | 'advisory' | 'evidence-only' | 'llm-strict';

export interface CicdTriggerSummary {
  id: string;
  source: string;
  repo?: string | null;
  branch?: string | null;
  commit_sha?: string | null;
  status: string;
  test_run_id?: string | null;
  created_at?: string | null;
}

export interface CicdGateDecision {
  status: 'PASSED' | 'FAILED' | 'PENDING' | string;
  passed: boolean;
  reason: string;
  exit_code: number;
  run_id?: string | null;
  trigger_id?: string | null;
  run_status?: string | null;
  policy?: {
    policy_pack?: string;
    fail_on_severities?: string[];
    fail_on_errors?: boolean;
    fail_on_no_execution?: boolean;
    fail_on_unauthenticated?: boolean;
    require_evidence_integrity?: boolean;
    require_evidence_completeness?: boolean;
    require_safety_policies?: boolean;
    require_confirmatory_retests?: boolean;
    require_confirmed_findings?: boolean;
    require_llm_judge_validation?: boolean;
  };
  counts?: GateDecisionCounts;
  quota?: {
    allowed?: boolean;
    limit?: number;
    remaining?: number;
    reset_seconds?: number;
  };
  scan_context?: {
    authenticated?: boolean;
    pentest_profile_id?: string | null;
    auth_profile_id?: string | null;
    auth_context_reason?: string | null;
    trigger_source?: string | null;
    source_schedule_id?: string | null;
    source_vulnerability_id?: string | null;
  };
  decision_integrity?: {
    hash_algorithm?: string;
    decision_hash?: string;
    signature_algorithm?: string;
    decision_signature?: string;
  };
  failing_results?: GateResultSummary[];
  unconfirmed_results?: GateResultSummary[];
  unverified_evidence_results?: GateResultSummary[];
  incomplete_evidence_results?: GateResultSummary[];
  missing_safety_policy_results?: GateResultSummary[];
  missing_llm_judge_validation_results?: GateResultSummary[];
}

export interface GateDecisionCounts {
  total_results?: number;
  executed_results?: number;
  vulnerable_results?: number;
  failing_results?: number;
  unconfirmed_blocking_results?: number;
  unverified_evidence_results?: number;
  incomplete_evidence_results?: number;
  inconsistent_evidence_results?: number;
  errored_results?: number;
  skipped_results?: number;
  safety_policy_results?: number;
  missing_safety_policy_results?: number;
  missing_target_guard_policy_results?: number;
  missing_state_change_policy_results?: number;
  missing_llm_judge_validation_results?: number;
  by_severity?: Record<string, number>;
}

export interface GateResultSummary {
  id?: string;
  endpoint_id?: string | null;
  template_id?: string | null;
  severity?: string | null;
  is_vulnerable?: boolean;
  confirmed?: boolean | null;
  missing_safety_policies?: string[];
}

export interface AuthProfileSummary {
  id: string;
  name: string;
  description?: string | null;
  auth_mode: string;
  header_name?: string | null;
  cookie_name?: string | null;
  scope_domains: string[];
  openapi_security_scheme?: string | null;
  dynamic_template_path?: string | null;
  is_active: boolean;
  has_token: boolean;
  has_credentials: boolean;
  has_static_headers: boolean;
  cookie_count: number;
}

export interface PentestProfileSummary {
  id: string;
  name: string;
  description?: string | null;
  mode: string;
  allow_state_change: boolean;
  follow_redirects: boolean;
  max_concurrency: number;
  request_timeout_seconds: number;
  auth_profile_id?: string | null;
  attacker_role: string;
  schemathesis_enabled: boolean;
  schemathesis_stateful: boolean;
  schemathesis_max_examples: number;
  schemathesis_workers: number;
  nuclei_enabled: boolean;
  nuclei_include_dast: boolean;
  nuclei_template_tags: string[];
  zap_enabled: boolean;
}

export interface CreateAuthProfilePayload {
  name: string;
  description?: string;
  auth_mode: string;
  header_name?: string | null;
  header_value?: string | null;
  token?: string | null;
  username?: string | null;
  password?: string | null;
  cookie_name?: string | null;
  cookie_value?: string | null;
  login_url?: string | null;
  login_method?: string;
  token_json_path?: string | null;
  dynamic_template_path?: string | null;
  openapi_security_scheme?: string | null;
  scope_domains?: string[];
}

export interface CreatePentestProfilePayload {
  name: string;
  description?: string;
  mode: string;
  allow_state_change?: boolean;
  follow_redirects?: boolean;
  max_concurrency?: number;
  request_timeout_seconds?: number;
  auth_profile_id?: string | null;
  attacker_role?: string;
  schemathesis_enabled?: boolean;
  schemathesis_stateful?: boolean;
  schemathesis_max_examples?: number;
  schemathesis_workers?: number;
  nuclei_enabled?: boolean;
  nuclei_include_dast?: boolean;
  nuclei_template_tags?: string[];
  zap_enabled?: boolean;
}

export interface PentestPreparedArtifact {
  filename?: string;
  content?: string;
  command?: string;
  available?: boolean;
  env_vars?: Array<{ name: string; value: string }>;
  recommendations?: string[];
}

export interface PreparedEnginePlanItem {
  engine: string;
  display_name?: string;
  enabled?: boolean;
  status: string;
  reason?: string;
  requires_auth_profile?: boolean;
  requires_openapi_spec?: boolean;
  artifact_type?: string | null;
  runtime_available?: boolean;
}

export interface PreparedPentestMaterials {
  summary: {
    profile: PentestProfileSummary;
    auth_profile: AuthProfileSummary | null;
    openapi_spec_id?: string | null;
    artifact_types: string[];
    engine_plan?: PreparedEnginePlanItem[];
    engine_status_counts?: Record<string, number>;
  };
  artifacts: Record<string, PentestPreparedArtifact>;
}

export interface PentestArtifactRecord {
  id: string;
  artifact_type: string;
  filename?: string | null;
  pentest_profile_id?: string | null;
  created_at?: string | null;
  metadata: Record<string, unknown>;
}

export interface TestingTemplateSummary {
  id: string;
  name: string;
  severity: string;
  category: string;
  description?: string;
}

export interface TestingEndpointSummary {
  id: string;
  method: string;
  path: string;
  host: string;
  path_pattern?: string | null;
  risk_score?: number | null;
  last_seen?: string | null;
}

export interface TestRunSummary {
  id: string;
  status: string;
  total_tests: number;
  vulnerable_count: number;
  error_count: number;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

export interface TestRunResultDetail {
  endpoint_id: string;
  template_id: string;
  is_vulnerable: boolean;
  severity?: string | null;
  evidence?: string | null;
  error?: string | null;
}

export interface TestRunDetail extends TestRunSummary {
  results: TestRunResultDetail[];
}

export interface VulnerabilityLifecycleRecord {
  id: string;
  template_id?: string | null;
  endpoint_id?: string | null;
  url?: string | null;
  method?: string | null;
  severity?: string | null;
  type?: string | null;
  description?: string | null;
  status?: string | null;
  confidence?: string | null;
  false_positive?: boolean;
  evidence?: Record<string, unknown> | null;
  evidence_redacted?: boolean;
  evidence_integrity?: {
    verified?: boolean;
    checked_count?: number;
    failed_count?: number;
    missing_count?: number;
  };
  fingerprint?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  occurrence_count?: number;
  sla_due_at?: string | null;
  sla_status?: string | null;
  confirmed?: boolean | null;
  confirmation_status?: string | null;
  latest_retest?: Record<string, unknown> | null;
  retest_support?: {
    supported?: boolean;
    queued_scan_supported?: boolean;
    manual_outcome_supported?: boolean;
    reason?: string;
    missing_fields?: string[];
  };
  latest_safety_policies?: Record<string, unknown> | null;
  ticket_url?: string | null;
  created_at?: string | null;
}

export interface VulnerabilityLifecycleOptions {
  limit?: number;
  offset?: number;
  status?: string;
  confirmation_status?: string;
}

export interface TicketSyncPayload {
  external_status: string;
  external_key?: string | null;
  ticket_url?: string | null;
  source?: string;
}

export interface RetestOutcomePayload {
  outcome: 'clean' | 'still_vulnerable';
  run_id?: string | null;
  executed?: number;
  vulnerable?: number;
  errors?: number;
  skipped?: number;
  reason?: string | null;
}

export interface OpenApiSpecHistoryItem {
  id: string;
  version?: string | null;
  path_count: number;
  created_at?: string | null;
}

export async function fetchDetectionMeta(signal?: AbortSignal) {
  return get<DetectionMeta>('/detection/meta', signal);
}

export async function fetchPentestMeta(signal?: AbortSignal) {
  return get<PentestMeta>('/pentest/meta', signal);
}

const SECRET_REPLACEMENT = '[REDACTED]';
const SECRET_QUERY_VALUE_RE = /([?&](?:access_token|api_key|apikey|auth|bearer|key|password|refresh_token|secret|token)=)[^&\s]+/gi;
const BEARER_SECRET_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const RAW_SECRET_LITERAL_RE = /\b(?:raw[-_]?secret[-_]?token|raw[-_]?token|secret[-_]?value|api[-_]?key)\b/gi;

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const numberOrDefault = (value: unknown, fallback = 0) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function sanitizeGovernanceText(value: string) {
  return value
    .replace(SECRET_QUERY_VALUE_RE, `$1${SECRET_REPLACEMENT}`)
    .replace(BEARER_SECRET_RE, `Bearer ${SECRET_REPLACEMENT}`)
    .replace(RAW_SECRET_LITERAL_RE, SECRET_REPLACEMENT);
}

function sanitizeGovernanceValue<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeGovernanceText(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeGovernanceValue(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeGovernanceValue(entry)]),
    ) as T;
  }
  return value;
}

const stringOrDefault = (value: unknown, fallback: string) =>
  sanitizeGovernanceText(typeof value === 'string' && value.trim() ? value : fallback);

const optionalString = (value: unknown) =>
  value === undefined || value === null ? null : sanitizeGovernanceText(String(value));

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((item) => optionalString(item))
        .filter((item): item is string => Boolean(item))
    : [];

const northStarCapabilityOwners: Record<string, string> = {
  authenticated_by_default: 'Identity/Auth Engineer',
  continuous_authenticated_workflows: 'Platform Backend Engineer',
  context_aware_selection: 'Product / Frontend / Reporting Engineer',
  enterprise_governance: 'Security Platform Engineer',
  identity_business_logic: 'Identity Testing Engineer',
  lifecycle_sla_ticketing: 'AppSec Backend Engineer',
  llm_api_security: 'AI Security Engineer',
  multi_engine_execution: 'Backend Platform Engineer',
  reproducible_evidence_retests: 'AppSec Backend Engineer',
  target_and_destructive_safety: 'Security Platform Engineer',
};

const northStarCheckOwners: Record<string, string> = {
  audit_logs: 'Security Platform Engineer',
  business_logic: 'Advanced Testing',
  ci_cd_gates: 'Security Platform Engineer',
  engine_artifact_accountability: 'Security Platform Engineer',
  llm_api: 'AI Security Engineer',
  sla_tracking: 'AppSec Backend Engineer',
  technical_report: 'Product / Frontend / Reporting Engineer',
  tenant_isolation: 'Security Platform Engineer',
};

const northStarCheckNextActions: Record<string, string> = {
  audit_logs: 'Record redacted audit events for gate, report, and lifecycle decisions.',
  bola_bfla: 'Run multi-identity BOLA/BFLA replay coverage across role and tenant boundaries.',
  business_logic: 'Add active business-logic abuse coverage and evidence for sensitive flows.',
  ci_cd_gates: 'Enable strict CI/CD release gates for North Star promotion decisions.',
  engine_artifact_accountability: 'Require hashed engine artifacts before promotion.',
  llm_api: 'Add deterministic LLM API security coverage for prompt, RAG, and tool-abuse checks.',
  sla_tracking: 'Surface SLA health and overdue owner actions in release governance.',
  technical_report: 'Publish the technical report with evidence status, endpoint risk, trend, and artifact accountability.',
  tenant_isolation: 'Show tenant-scoped governance evidence for all release-control data.',
};

const governanceKey = (value?: string | null) =>
  sanitizeGovernanceText(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

export function getNorthStarNextAction(check?: string | null, workstreamName?: string | null) {
  const checkKey = governanceKey(check);
  if (checkKey && northStarCheckNextActions[checkKey]) {
    return northStarCheckNextActions[checkKey];
  }
  const name = sanitizeGovernanceText(workstreamName || '').trim();
  return name
    ? `Assign an owner action for the ${name} production-readiness gap.`
    : 'Assign an owner action for this production-readiness gap.';
}

export function getNorthStarOwnerFallback(capabilityId?: string | null, check?: string | null) {
  const capabilityKey = governanceKey(capabilityId);
  if (capabilityKey && northStarCapabilityOwners[capabilityKey]) {
    return northStarCapabilityOwners[capabilityKey];
  }
  const checkKey = governanceKey(check);
  if (checkKey && northStarCheckOwners[checkKey]) {
    return northStarCheckOwners[checkKey];
  }
  return 'Security Platform Engineer';
}

function normalizeNorthStarCapability(value: unknown): NorthStarCapability {
  const source = asRecord(value);
  return {
    id: stringOrDefault(source.id, 'unknown_capability'),
    name: stringOrDefault(source.name, 'Unknown capability'),
    status: stringOrDefault(source.status, 'unknown'),
    completion_percent: numberOrDefault(source.completion_percent),
    ready: stringArray(source.ready),
    missing: stringArray(source.missing),
    next_action: optionalString(source.next_action),
  };
}

function normalizeNorthStarProductionBlocker(value: unknown): NorthStarProductionBlocker {
  const source = asRecord(value);
  return {
    id: stringOrDefault(source.id, 'unknown_blocker'),
    capability_id: stringOrDefault(source.capability_id, 'unknown_capability'),
    capability_name: stringOrDefault(source.capability_name, 'Unknown capability'),
    check: stringOrDefault(source.check, 'unknown_check'),
    next_action: stringOrDefault(source.next_action, 'No remediation action recorded.'),
    owner: optionalString(source.owner),
    evidence_status: optionalString(source.evidence_status),
    sla_status: optionalString(source.sla_status),
  };
}

function normalizeNorthStarP1Workstream(value: unknown): NorthStarP1Workstream {
  const source = asRecord(value);
  const missingChecks = stringArray(source.missing_checks);
  const blockers = stringArray(source.blockers);
  const name = stringOrDefault(source.name, 'Unknown workstream');
  const nextActionCheck = missingChecks[0] ?? blockers[0] ?? source.id;
  return {
    id: stringOrDefault(source.id, 'unknown_workstream'),
    name,
    owner: stringOrDefault(source.owner, 'Unassigned'),
    priority: stringOrDefault(source.priority, 'P1'),
    status: stringOrDefault(source.status, 'unknown'),
    evidence_status: stringOrDefault(source.evidence_status, 'unknown'),
    ready_checks: stringArray(source.ready_checks),
    missing_checks: missingChecks,
    blockers,
    next_action: stringOrDefault(source.next_action, getNorthStarNextAction(optionalString(nextActionCheck), name)),
  };
}

function findMatchingWorkstream(
  blocker: NorthStarProductionBlocker,
  workstreams: NorthStarP1Workstream[],
): NorthStarP1Workstream | undefined {
  const blockerCheck = governanceKey(blocker.check);
  const blockerId = governanceKey(blocker.id);
  return workstreams.find((workstream) => {
    const workstreamKeys = [
      workstream.id,
      ...workstream.missing_checks,
      ...workstream.blockers,
    ].map((value) => governanceKey(value));
    return workstreamKeys.some((key) => key && (key === blockerCheck || blockerId.includes(key)));
  });
}

function enrichNorthStarProductionBlocker(
  blocker: NorthStarProductionBlocker,
  workstreams: NorthStarP1Workstream[],
): NorthStarProductionBlocker {
  const matchingWorkstream = findMatchingWorkstream(blocker, workstreams);
  const evidenceStatus = blocker.evidence_status ?? matchingWorkstream?.evidence_status ?? 'missing';
  return {
    ...blocker,
    owner:
      blocker.owner ??
      matchingWorkstream?.owner ??
      getNorthStarOwnerFallback(blocker.capability_id, blocker.check),
    evidence_status: evidenceStatus,
    sla_status:
      blocker.sla_status ??
      (evidenceStatus.toUpperCase() === 'MISSING' || matchingWorkstream?.status.toUpperCase() === 'BLOCKED'
        ? 'OVERDUE'
        : null),
  };
}

function normalizeNorthStarReadiness(value: unknown): NorthStarReadiness {
  const source = asRecord(value);
  const controlCounts = asRecord(source.control_counts);
  const p1Workstreams = Array.isArray(source.p1_workstreams)
    ? source.p1_workstreams.map(normalizeNorthStarP1Workstream)
    : [];
  const productionBlockers = Array.isArray(source.production_blockers)
    ? source.production_blockers
        .map(normalizeNorthStarProductionBlocker)
        .map((blocker) => enrichNorthStarProductionBlocker(blocker, p1Workstreams))
    : [];
  return {
    overall_status: stringOrDefault(source.overall_status, 'unknown'),
    readiness_score: numberOrDefault(source.readiness_score),
    ready_count: numberOrDefault(source.ready_count),
    partial_count: numberOrDefault(source.partial_count),
    gap_count: numberOrDefault(source.gap_count),
    control_counts: {
      ready: numberOrDefault(controlCounts.ready),
      missing: numberOrDefault(controlCounts.missing),
      total: numberOrDefault(controlCounts.total),
    },
    production_blockers: productionBlockers,
    p1_workstreams: p1Workstreams,
    capabilities: Array.isArray(source.capabilities) ? source.capabilities.map(normalizeNorthStarCapability) : [],
    next_gaps: stringArray(source.next_gaps),
  };
}

function normalizeReleaseReports(
  value: unknown,
  context: {
    executive: GovernanceDashboard['executive'];
    sla: GovernanceDashboard['sla'];
    topEndpointRisk: GovernanceDashboard['top_endpoint_risk'];
    vulnerabilityTrend: GovernanceDashboard['vulnerability_trend'];
    northStarReadiness: NorthStarReadiness;
  },
): GovernanceReleaseReports {
  const source = asRecord(value);
  const executive = asRecord(source.executive_summary);
  const technical = asRecord(source.technical_report);
  const blockerCount = context.northStarReadiness.production_blockers.length;
  const topEndpoint = context.topEndpointRisk[0];
  const latestTrend = context.vulnerabilityTrend[context.vulnerabilityTrend.length - 1];
  const slaSummary = `${context.sla.overdue} overdue / ${context.sla.due_soon} due soon / ${context.sla.on_track} on track`;

  return {
    executive_summary: {
      readiness_statement: stringOrDefault(
        executive.readiness_statement,
        `${context.executive.open_findings} open findings and ${blockerCount} North Star blockers.`,
      ),
      blocker_summary: stringOrDefault(executive.blocker_summary, `${blockerCount} production blockers.`),
      owner_summary: stringOrDefault(
        executive.owner_summary,
        context.northStarReadiness.p1_workstreams.length
          ? `${context.northStarReadiness.p1_workstreams.length} P1 workstream owners tracked.`
          : 'No P1 owner data reported.',
      ),
      evidence_status: stringOrDefault(executive.evidence_status, 'Not reported'),
      sla_health: stringOrDefault(executive.sla_health, slaSummary),
    },
    technical_report: {
      evidence_status: stringOrDefault(technical.evidence_status, 'Not reported'),
      sla_health: stringOrDefault(technical.sla_health, slaSummary),
      endpoint_risk: stringOrDefault(
        technical.endpoint_risk,
        topEndpoint ? `${topEndpoint.method} ${topEndpoint.path} carries risk ${topEndpoint.risk_score}.` : 'No active endpoint risk.',
      ),
      trend_summary: stringOrDefault(
        technical.trend_summary,
        latestTrend ? `${latestTrend.open_findings} open findings on ${latestTrend.date}.` : 'No trend samples.',
      ),
      artifact_status: stringOrDefault(technical.artifact_status, 'Not reported'),
    },
  };
}

function normalizeEndpointRisk(value: unknown): GovernanceDashboard['top_endpoint_risk'][number] {
  const source = asRecord(value);
  const severityCounts = asRecord(source.severity_counts);
  return {
    endpoint_id: stringOrDefault(source.endpoint_id, 'unknown-endpoint'),
    method: stringOrDefault(source.method, 'UNKNOWN'),
    path: stringOrDefault(source.path, '/'),
    risk_score: numberOrDefault(source.risk_score),
    open_findings: numberOrDefault(source.open_findings),
    severity_counts: Object.fromEntries(
      Object.entries(severityCounts).map(([severity, count]) => [sanitizeGovernanceText(severity), numberOrDefault(count)]),
    ),
  };
}

function normalizeTrendPoint(value: unknown): GovernanceDashboard['vulnerability_trend'][number] {
  const source = asRecord(value);
  return {
    date: stringOrDefault(source.date, 'unknown'),
    open_findings: numberOrDefault(source.open_findings),
  };
}

export function normalizeGovernanceDashboard(dashboard: Partial<GovernanceDashboard> & UnknownRecord): GovernanceDashboard {
  const source = asRecord(dashboard);
  const executiveSource = asRecord(source.executive);
  const sla: GovernanceDashboard['sla'] = {
    overdue: numberOrDefault(asRecord(source.sla).overdue),
    due_soon: numberOrDefault(asRecord(source.sla).due_soon),
    on_track: numberOrDefault(asRecord(source.sla).on_track),
    no_sla: numberOrDefault(asRecord(source.sla).no_sla),
  };
  const coverageSource = asRecord(source.coverage);
  const coverage: GovernanceDashboard['coverage'] = {
    llm_active_findings: numberOrDefault(coverageSource.llm_active_findings),
    business_logic_active_findings: numberOrDefault(coverageSource.business_logic_active_findings),
    latest_run_status: optionalString(coverageSource.latest_run_status),
    latest_run_id: optionalString(coverageSource.latest_run_id),
    latest_run_total_tests: numberOrDefault(coverageSource.latest_run_total_tests),
    latest_run_vulnerable_count: numberOrDefault(coverageSource.latest_run_vulnerable_count),
    coverage_targets: asRecord(coverageSource.coverage_targets),
    engine_plan: Array.isArray(coverageSource.engine_plan) ? coverageSource.engine_plan : [],
  };
  const governanceSource = asRecord(source.governance);
  const topEndpointRisk = Array.isArray(source.top_endpoint_risk)
    ? source.top_endpoint_risk.map(normalizeEndpointRisk)
    : [];
  const vulnerabilityTrend = Array.isArray(source.vulnerability_trend)
    ? source.vulnerability_trend.map(normalizeTrendPoint)
    : [];
  const northStarReadiness = normalizeNorthStarReadiness(source.north_star_readiness);
  const executive: GovernanceDashboard['executive'] = {
    open_findings: numberOrDefault(executiveSource.open_findings),
    critical_open_findings: numberOrDefault(executiveSource.critical_open_findings),
    high_open_findings: numberOrDefault(executiveSource.high_open_findings),
    medium_open_findings: numberOrDefault(executiveSource.medium_open_findings),
    low_open_findings: numberOrDefault(executiveSource.low_open_findings),
    risk_score: numberOrDefault(executiveSource.risk_score),
  };

  return sanitizeGovernanceValue({
    account_id: numberOrDefault(source.account_id),
    generated_at: optionalString(source.generated_at) ?? undefined,
    executive,
    sla,
    coverage,
    governance: {
      open_policy_violations: numberOrDefault(governanceSource.open_policy_violations),
      latest_policy_pack: optionalString(governanceSource.latest_policy_pack),
      latest_policy_violation: optionalString(governanceSource.latest_policy_violation),
    },
    top_endpoint_risk: topEndpointRisk,
    vulnerability_trend: vulnerabilityTrend,
    north_star_readiness: northStarReadiness,
    reports: normalizeReleaseReports(source.reports ?? source.release_report, {
      executive,
      sla,
      topEndpointRisk,
      vulnerabilityTrend,
      northStarReadiness,
    }),
  });
}

export async function fetchGovernanceDashboard(signal?: AbortSignal) {
  const dashboard = await get<Partial<GovernanceDashboard> & UnknownRecord>('/dashboard/governance', signal);
  return normalizeGovernanceDashboard(dashboard);
}

export async function fetchAuthProfiles(signal?: AbortSignal) {
  return get<{ total: number; profiles: AuthProfileSummary[] }>('/pentest/auth-profiles', signal);
}

export async function createAuthProfile(payload: CreateAuthProfilePayload, signal?: AbortSignal) {
  return post<{ status: string; profile: AuthProfileSummary }>('/pentest/auth-profiles', payload, signal);
}

export async function fetchPentestProfiles(signal?: AbortSignal) {
  return get<{ total: number; profiles: PentestProfileSummary[] }>('/pentest/profiles', signal);
}

export async function createPentestProfile(payload: CreatePentestProfilePayload, signal?: AbortSignal) {
  return post<{ status: string; profile: PentestProfileSummary }>('/pentest/profiles', payload, signal);
}

export async function preparePentestProfile(
  profileId: string,
  payload: { target_url: string; spec_id?: string | null; persist?: boolean },
  signal?: AbortSignal,
) {
  return post<PreparedPentestMaterials>(`/pentest/profiles/${profileId}/prepare`, payload, signal);
}

export async function fetchPentestArtifacts(
  options?: { profileId?: string | null; limit?: number },
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  if (options?.profileId) params.set('profile_id', options.profileId);
  if (options?.limit) params.set('limit', String(options.limit));
  const query = params.toString();
  return get<{ total: number; artifacts: PentestArtifactRecord[] }>(`/pentest/artifacts${query ? `?${query}` : ''}`, signal);
}

export async function fetchTestingTemplates(signal?: AbortSignal) {
  return get<{ count: number; templates: TestingTemplateSummary[] }>('/tests/templates', signal);
}

export async function fetchTestingEndpoints(limit: number = 20, signal?: AbortSignal) {
  return get<{ total: number; endpoints: TestingEndpointSummary[] }>(`/endpoints/?limit=${limit}`, signal);
}

export async function fetchTestRuns(limit: number = 10, signal?: AbortSignal) {
  return get<{ total: number; runs: TestRunSummary[] }>(`/tests/runs?limit=${limit}`, signal);
}

export async function fetchTestRunDetail(runId: string, signal?: AbortSignal) {
  return get<TestRunDetail>(`/tests/runs/${runId}`, signal);
}

export async function startTestRun(
  templateIds: string[],
  endpointIds: string[],
  pentestProfileId?: string | null,
  signal?: AbortSignal,
) {
  return post<{ status: string; run_id: string; templates: number; endpoints: number; pentest_profile_id?: string | null }>(
    '/tests/run',
    {
      template_ids: templateIds,
      endpoint_ids: endpointIds,
      pentest_profile_id: pentestProfileId ?? null,
    },
    signal,
  );
}

export async function fetchOpenApiHistory(limit: number = 10, signal?: AbortSignal) {
  return get<{ total: number; specs: OpenApiSpecHistoryItem[] }>(`/openapi/history?limit=${limit}`, signal);
}

export async function fetchCicdTriggers(limit: number = 25, signal?: AbortSignal) {
  return get<{ total: number; triggers: CicdTriggerSummary[] }>(`/cicd/triggers?limit=${limit}`, signal);
}

export async function evaluateCicdGate(
  runId: string,
  policyPack: GatePolicyPack = 'strict',
  signal?: AbortSignal,
) {
  return get<CicdGateDecision>(
    `/cicd/gate/${encodeURIComponent(runId)}?policy_pack=${encodeURIComponent(policyPack)}`,
    signal,
  );
}

export async function evaluateCicdTriggerGate(
  triggerId: string,
  policyPack: GatePolicyPack = 'strict',
  signal?: AbortSignal,
) {
  return get<CicdGateDecision>(
    `/cicd/triggers/${encodeURIComponent(triggerId)}/gate?policy_pack=${encodeURIComponent(policyPack)}`,
    signal,
  );
}

export function buildCicdGateExportUrl(runId: string, format: 'sarif' | 'junit') {
  return buildApiUrl(`/cicd/gate/${encodeURIComponent(runId)}/${format}`);
}

export async function fetchVulnerabilityLifecycle(
  options: VulnerabilityLifecycleOptions = {},
  signal?: AbortSignal,
) {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 50));
  if (options.offset) params.set('offset', String(options.offset));
  if (options.status) params.set('status', options.status);
  if (options.confirmation_status) params.set('confirmation_status', options.confirmation_status);
  return get<{ total: number; offset: number; vulnerabilities: VulnerabilityLifecycleRecord[] }>(
    `/vulnerabilities/?${params.toString()}`,
    signal,
  );
}

export async function syncVulnerabilityTicket(
  vulnerabilityId: string,
  payload: TicketSyncPayload,
  signal?: AbortSignal,
) {
  return post<{ status: string; sync: Record<string, unknown>; vulnerability: VulnerabilityLifecycleRecord }>(
    `/vulnerabilities/${encodeURIComponent(vulnerabilityId)}/ticket/sync`,
    payload,
    signal,
  );
}

export async function recordVulnerabilityRetestOutcome(
  vulnerabilityId: string,
  payload: RetestOutcomePayload,
  signal?: AbortSignal,
) {
  return post<{ status: string; retest: Record<string, unknown>; vulnerability: VulnerabilityLifecycleRecord }>(
    `/vulnerabilities/${encodeURIComponent(vulnerabilityId)}/retest/outcome`,
    payload,
    signal,
  );
}
