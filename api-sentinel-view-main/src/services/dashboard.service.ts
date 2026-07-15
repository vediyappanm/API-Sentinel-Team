import { get, post } from '@/lib/api-client';
import { fetchAllIssues } from './testing.service';
import { fetchEndpointsCount } from './discovery.service';
import { fetchSecurityEvents } from './protection.service';

/* ───── Types for New Dashboard ───── */

export interface DashboardHistorical {
  totalApis: number;
  newApis: number;
  criticalIssues: number;
  highIssues: number;
  totalThreats: number;
  blockedThreats: number;
  resolvedIssues: number;
  unauthApis: number;
}

/** Shape returned by GET /api/vulnerabilities/summary */
interface VulnerabilitySummaryResponse {
  totalIssues: number;
  openIssues: number;
  fixedIssues: number;
  severityBreakdown: Record<string, number>;
  statusBreakdown: Record<string, number>;
}

interface RawVulnerability {
  severity?: string;
  status?: string;
}

export interface DashboardTrendPoint {
  ts: number;
  count?: number;
  total?: number;
  blocked?: number;
  successful?: number;
}

export interface DashboardThreatData {
  totalActors: number;
  blockedActors: number;
  whitelistedActors: number;
  highActors: number;
  mediumActors: number;
  lowActors: number;
  mcpSessions?: number;
}

interface RawThreatActor {
  status?: string;
  risk_score?: number;
}

interface ThreatActorsResponse {
  actors?: RawThreatActor[];
  total?: number;
}

/**
 * Fetch the server-side aggregate summary from the dedicated endpoint.
 * Falls back to a local aggregate over a 100-record fetch if the endpoint
 * returns an unexpected shape (e.g. old server version).
 */
export async function fetchVulnerabilitySummary(signal?: AbortSignal): Promise<VulnerabilitySummaryResponse> {
  try {
    const data = await get<VulnerabilitySummaryResponse>('/vulnerabilities/summary', signal);
    // Basic shape guard — if the server returns the aggregate format, use it directly
    if (typeof data?.totalIssues === 'number') {
      return data;
    }
  } catch {
    // fall through to client-side fallback
  }

  // Fallback: fetch a page and aggregate client-side (capped at 100 to limit payload)
  const fallback = await get<{ total: number; vulnerabilities: RawVulnerability[] }>('/vulnerabilities/?limit=100', signal);
  const vulns = fallback.vulnerabilities ?? [];
  const breakdown: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  let openCount = 0;
  let fixedCount = 0;
  vulns.forEach((v) => {
    const sev = (v.severity ?? 'LOW').toUpperCase();
    if (sev in breakdown) breakdown[sev]++;
    if (v.status === 'OPEN') openCount++;
    if (v.status === 'CLOSED' || v.status === 'RESOLVED') fixedCount++;
  });
  return {
    totalIssues: fallback.total ?? vulns.length,
    openIssues: openCount,
    fixedIssues: fixedCount,
    severityBreakdown: breakdown,
    statusBreakdown: {},
  };
}

/* ───── API Summary Logic ───── */

export async function fetchTotalIssues(signal?: AbortSignal) {
  const summary = await fetchVulnerabilitySummary(signal);
  return {
    totalIssues: summary.totalIssues,
    openIssues: summary.openIssues,
    criticalIssues: summary.severityBreakdown.CRITICAL || 0
  };
}

export async function fetchHistoricalData(signal?: AbortSignal): Promise<DashboardHistorical> {
  const [endpoints, issues, security] = await Promise.all([
    fetchEndpointsCount(signal),
    fetchVulnerabilitySummary(signal),
    fetchSecurityEvents(0, 500, undefined, undefined, undefined, undefined, undefined, signal)
  ]);

  const unauthCount = security.maliciousEvents.filter(
    e => e.category === 'Broken Auth' || e.category === 'JWT Forgery' || e.category === 'Broken Authentication'
  ).length;

  return {
    totalApis: endpoints.endpointsCount,
    newApis: endpoints.endpointsCount,
    criticalIssues: issues.severityBreakdown.CRITICAL || 0,
    highIssues: issues.severityBreakdown.HIGH || 0,
    totalThreats: security.total,
    blockedThreats: security.maliciousEvents.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length,
    resolvedIssues: issues.fixedIssues,
    unauthApis: unauthCount,
  };
}

export async function fetchIssuesByApis(signal?: AbortSignal) {
  // Use a bounded fetch — 100 records is enough for the "top endpoints" view
  const issues = await fetchAllIssues(0, 100, undefined, undefined, undefined, signal);
  const counts: Record<string, number> = {};

  issues.issues.forEach(i => {
    const key = `${i.method} ${i.url}`;
    counts[key] = (counts[key] || 0) + 1;
  });

  return {
    issuesByApis: Object.entries(counts).map(([key, count]) => {
      const [method, ...rest] = key.split(' ');
      return { url: rest.join(' '), method, count };
    })
  };
}

/* ───── Stubs for visual parts ───── */

export async function fetchIssuesTrend(startTs: number, endTs: number, signal?: AbortSignal) {
  try {
    const res = await get<{ issuesTrend?: DashboardTrendPoint[] }>(`/threat-actors/trend?start_ts=${startTs}&end_ts=${endTs}`, signal);
    return { issuesTrend: res.issuesTrend || [] };
  } catch {
    return { issuesTrend: [] };
  }
}

export async function fetchCriticalIssuesTrend(startTs: number, endTs: number, signal?: AbortSignal) {
  // Uses the dedicated vulnerability trend endpoint with a severity filter.
  // The 4th parameter to fetchAllIssues is sortKey — NOT severity — so we
  // call the trend endpoint directly instead.
  try {
    const res = await get<{ issuesTrend: { ts: number; count: number }[] }>(
      `/vulnerabilities/trend?severity=CRITICAL&start_ts=${startTs}&end_ts=${endTs}`,
      signal,
    );
    return { criticalTrend: res.issuesTrend || [] };
  } catch {
    return { criticalTrend: [] };
  }
}

export async function fetchEndpointDiscoveryData(signal?: AbortSignal) {
  return { discoveryData: {} };
}

export async function fetchTestingData(signal?: AbortSignal) {
  return { testingData: {} };
}

export async function fetchThreatData(signal?: AbortSignal) {
  try {
    const raw = await get<ThreatActorsResponse | RawThreatActor[]>('/threat-actors/?limit=500', signal);
    const actors = Array.isArray(raw) ? raw : (raw.actors ?? []);
    const total = Array.isArray(raw) ? actors.length : (raw.total ?? actors.length);
    return {
      threatData: {
        totalActors: total,
        blockedActors: actors.filter(a => a.status === 'BLOCKED').length,
        whitelistedActors: actors.filter(a => a.status === 'WHITELISTED').length,
        highActors: actors.filter(a => a.risk_score > 7).length,
        mediumActors: actors.filter(a => a.risk_score > 3 && a.risk_score <= 7).length,
        lowActors: actors.filter(a => a.risk_score <= 3).length,
      },
    };
  } catch {
    return { threatData: { totalActors: 0, blockedActors: 0, whitelistedActors: 0, highActors: 0, mediumActors: 0, lowActors: 0 } };
  }
}

