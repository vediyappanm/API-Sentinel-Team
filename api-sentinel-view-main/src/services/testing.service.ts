import { get, post } from '@/lib/api-client';
import type { ApiCollectionId } from '@/services/discovery.service';

export interface AktoIssue {
  id: string;
  creationTime: number;
  severity: string;
  testSubType: string;
  testCategory: string;
  issueStatus: string;
  url: string;
  method: string;
  apiCollectionId: ApiCollectionId;
  lastSeen: number;
  endpointId?: string;
  description?: string;
  hasEvidence?: boolean;
  confidence?: string | number | null;
}

export interface AktoIssueSummary {
  totalIssues: number;
  openIssues: number;
  fixedIssues: number;
  severityBreakdown: Record<string, number>;
}

const DEFAULT_COLLECTION_ID: ApiCollectionId = 'default-inventory';

interface RawVulnerability {
  id: string;
  created_at?: string;
  severity?: string;
  type?: string;
  category?: string;
  status?: string;
  url?: string;
  method?: string;
  api_collection_id?: ApiCollectionId;
  collection_id?: ApiCollectionId;
  endpoint_id?: string;
  description?: string;
  evidence?: unknown;
  confidence?: string | number | null;
  last_seen_at?: string;
}

interface RawTemplate {
  name?: string;
  category?: string;
}

export interface ComplianceFinding {
  id?: string;
  title?: string;
  type?: string;
  endpoint?: string;
  url?: string;
  severity?: string;
}

export interface ComplianceReport {
  total_open?: number;
  sections: Record<string, ComplianceFinding[]>;
}

export async function fetchAllIssues(
  skip: number = 0,
  limit: number = 50,
  filters?: Record<string, unknown>,
  sortKey?: string,
  sortOrder?: number,
  signal?: AbortSignal,
) {
  const data = await get<{ total: number; vulnerabilities: RawVulnerability[] }>('/vulnerabilities/', signal);

  const issues: AktoIssue[] = (data.vulnerabilities || []).map((vulnerability) => ({
    id: vulnerability.id,
    creationTime: vulnerability.created_at ? new Date(vulnerability.created_at).getTime() : Date.now(),
    severity: vulnerability.severity || 'LOW',
    testSubType: vulnerability.type || 'Generic Vulnerability',
    testCategory: vulnerability.category || 'Security',
    issueStatus: vulnerability.status || 'OPEN',
    url: vulnerability.url || '/',
    method: vulnerability.method || 'GET',
    apiCollectionId: vulnerability.api_collection_id ?? vulnerability.collection_id ?? DEFAULT_COLLECTION_ID,
    lastSeen: vulnerability.last_seen_at
      ? new Date(vulnerability.last_seen_at).getTime()
      : vulnerability.created_at
        ? new Date(vulnerability.created_at).getTime()
        : Date.now(),
    endpointId: vulnerability.endpoint_id,
    description: vulnerability.description,
    hasEvidence: Boolean(vulnerability.evidence),
    confidence: vulnerability.confidence,
  }));

  return {
    issues,
    totalIssuesCount: data.total || 0,
  };
}

export async function fetchIssueSummary(signal?: AbortSignal): Promise<AktoIssueSummary> {
  // Use the server-side aggregate endpoint — avoids fetching 1000 records client-side.
  try {
    const data = await get<{
      totalIssues: number;
      openIssues: number;
      fixedIssues: number;
      severityBreakdown: Record<string, number>;
    }>('/vulnerabilities/summary', signal);

    if (typeof data?.totalIssues === 'number') {
      return {
        totalIssues: data.totalIssues,
        openIssues: data.openIssues,
        fixedIssues: data.fixedIssues,
        severityBreakdown: {
          CRITICAL: data.severityBreakdown?.CRITICAL ?? 0,
          HIGH: data.severityBreakdown?.HIGH ?? 0,
          MEDIUM: data.severityBreakdown?.MEDIUM ?? 0,
          LOW: data.severityBreakdown?.LOW ?? 0,
        },
      };
    }
  } catch {
    // fall through to client-side fallback
  }

  // Fallback: compute from a bounded page fetch
  const data = await fetchAllIssues(0, 100, undefined, undefined, undefined, signal);
  const breakdown: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  data.issues.forEach((issue) => {
    if (breakdown[issue.severity] !== undefined) breakdown[issue.severity]++;
  });
  return {
    totalIssues: data.totalIssuesCount,
    openIssues: data.issues.filter((issue) => issue.issueStatus === 'OPEN').length,
    fixedIssues: data.issues.filter((issue) => issue.issueStatus === 'FIXED').length,
    severityBreakdown: breakdown,
  };
}

export async function fetchSeverityInfoForIssues(signal?: AbortSignal) {
  const summary = await fetchIssueSummary(signal);
  return { severityInfo: summary.severityBreakdown };
}

export async function fetchVulnerableRequests(
  skip: number = 0,
  limit: number = 50,
  filters?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const data = await fetchAllIssues(skip, limit, filters, undefined, undefined, signal);
  return {
    testingRunResults: data.issues.map((issue) => ({
      hexId: issue.id,
      testSubType: issue.testSubType,
      testCategory: issue.testCategory,
      apiInfoKey: { url: issue.url, method: issue.method, apiCollectionId: issue.apiCollectionId },
      vulnerable: true,
    })),
    total: data.totalIssuesCount,
  };
}

export async function updateIssueStatus(issueId: string, status: string, signal?: AbortSignal) {
  return post(`/vulnerabilities/${issueId}/status`, { status }, signal);
}

export async function bulkUpdateIssueStatus(issueIds: string[], status: string, signal?: AbortSignal) {
  return post('/vulnerabilities/bulk-status', { issue_ids: issueIds, status }, signal);
}

export async function fetchIssuesByDay(startTs: number, endTs: number, signal?: AbortSignal) {
  let url = '/vulnerabilities/trend?';
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;
  return get<{ issuesTrend: { ts: number; count: number }[] }>(url, signal);
}

export async function fetchAllSubCategories(signal?: AbortSignal) {
  const data = await get<{ templates: RawTemplate[] }>('/tests/templates', signal);
  return {
    subCategories: (data.templates || []).map((template) => ({
      name: template.name,
      superCategory: { name: template.category || 'Vulnerability' },
    })),
  };
}

export async function startTestSelection(
  templateIds: string[],
  endpointIds: { url: string; method: string; apiCollectionId: ApiCollectionId }[],
  signal?: AbortSignal,
) {
  return post(
    '/tests/run',
    {
      template_ids: templateIds,
      endpoint_ids: endpointIds.map((endpoint) => `${endpoint.method} ${endpoint.url}`),
    },
    signal,
  );
}

export async function generateReportPDF(
  framework: string = 'OWASP_API_2023',
  format: string = 'html',
  signal?: AbortSignal,
) {
  return get<unknown>(`/compliance/reports/${framework}/export?format=${format}`, signal);
}

export async function fetchComplianceReport(framework: string = 'OWASP_API_2023', signal?: AbortSignal) {
  return get<ComplianceReport>(`/compliance/reports/${framework}`, signal);
}

export async function downloadReportPDF(reportId: string, signal?: AbortSignal) {
  return { downloadUrl: `/api/compliance/reports/${reportId}/export?format=html` };
}

export interface FindingDetail {
  id: string;
  template_id?: string | null;
  endpoint_id?: string | null;
  url?: string | null;
  method?: string | null;
  severity?: string | null;
  type?: string | null;
  description?: string | null;
  status?: string | null;
  confidence?: string | number | null;
  evidence?: unknown;
  evidence_integrity?: unknown;
  created_at?: string;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  remediation?: string | null;
  ticket_url?: string | null;
}

export async function fetchFinding(findingId: string, signal?: AbortSignal) {
  return get<FindingDetail>(`/vulnerabilities/${findingId}`, signal);
}

export async function fetchFindingsForEndpoint(endpointId: string, signal?: AbortSignal) {
  return get<{ total: number; vulnerabilities: FindingDetail[] }>(
    `/vulnerabilities/?endpoint_id=${encodeURIComponent(endpointId)}&limit=50`,
    signal,
  );
}
