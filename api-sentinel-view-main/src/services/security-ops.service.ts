import { get, post } from '@/lib/api-client';

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

export interface PreparedPentestMaterials {
  summary: {
    profile: PentestProfileSummary;
    auth_profile: AuthProfileSummary | null;
    openapi_spec_id?: string | null;
    artifact_types: string[];
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
