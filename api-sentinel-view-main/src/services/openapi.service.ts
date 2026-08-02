import { get, post } from '@/lib/api-client';

export interface OpenAPISpecSummary {
  id: string;
  spec: { paths?: Record<string, unknown>; [key: string]: unknown };
}

export interface OpenAPISpecHistoryEntry {
  id: string;
  version: string;
  path_count: number;
  created_at: string | null;
}

export interface OpenAPISpecHistoryResponse {
  total: number;
  specs: OpenAPISpecHistoryEntry[];
}

export interface OpenAPIDiffChange {
  id: string;
  severity: string;
  path: string;
  method: string | null;
  component: string;
  message: string;
  why_it_matters: string;
  recommended_action: string;
  details: Record<string, unknown>;
  fingerprint: string;
}

export interface OpenAPIDiffResponse {
  base_spec_id?: string;
  revision_spec_id?: string;
  summary: Record<string, number>;
  breaking_changes: OpenAPIDiffChange[];
  recommendations: unknown[];
}

export interface SchemaViolation {
  id: string;
  endpoint: string;
  method: string;
  violation_type: string;
  field: string;
  expected: string;
  actual: string;
  severity: 'high' | 'medium' | 'low';
  count: number;
  last_seen: string | null;
}

export interface SchemaViolationsResponse {
  total: number;
  violations: SchemaViolation[];
}

export function fetchLatestSpec(signal?: AbortSignal): Promise<OpenAPISpecSummary> {
  return get<OpenAPISpecSummary>('/openapi/latest', signal);
}

export function fetchSpecHistory(limit = 10, signal?: AbortSignal): Promise<OpenAPISpecHistoryResponse> {
  return get<OpenAPISpecHistoryResponse>(`/openapi/history?limit=${limit}`, signal);
}

export function diffSpecs(
  baseSpecId: string,
  revisionSpecId: string,
  signal?: AbortSignal,
): Promise<OpenAPIDiffResponse> {
  return post<OpenAPIDiffResponse>(
    '/openapi/diff',
    { base_spec_id: baseSpecId, revision_spec_id: revisionSpecId },
    signal,
  );
}

export function fetchSchemaViolations(limit = 50, signal?: AbortSignal): Promise<SchemaViolationsResponse> {
  return get<SchemaViolationsResponse>(`/openapi/violations?limit=${limit}`, signal);
}
