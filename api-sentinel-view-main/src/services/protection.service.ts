import { get, post } from '@/lib/api-client';
import type { ApiCollectionId } from '@/services/discovery.service';

export interface AktoMaliciousEvent {
  id: string;
  actor: string;
  filterId: string;
  ip: string;
  apiCollectionId: ApiCollectionId;
  url: string;
  method: string;
  timestamp: number;
  severity: string;
  country?: string;
  category?: string;
  subCategory?: string;
}

export interface AktoThreatActor {
  id: string;
  latestApiIp: string;
  latestApiAttackType: string[];
  discoveredAt: number;
  lastSeenAt: number;
  country: string;
  actorStatus: string;
  severity: string;
  totalRequests: number;
  riskScore?: number;
}

const DEFAULT_COLLECTION_ID: ApiCollectionId = 'default-inventory';

export async function fetchSecurityEvents(
  skip: number = 0,
  limit: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  startTs?: number,
  endTs?: number,
  signal?: AbortSignal,
) {
  let url = `/threat-actors/events?limit=${limit}`;
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;

  const data = await get<any>(url, signal);

  const allEvents: AktoMaliciousEvent[] = (data.events || []).map((event: any) => ({
    id: event.id,
    actor: event.ip || event.actor_id || 'unknown',
    filterId: event.category || event.event_type || '-',
    ip: event.ip || event.actor_id || 'unknown',
    apiCollectionId: event.api_collection_id ?? event.collection_id ?? DEFAULT_COLLECTION_ID,
    url: event.url || event.path || '/',
    method: event.method || 'GET',
    timestamp: event.timestamp || Date.now(),
    severity: event.severity || 'MEDIUM',
    category: event.category || event.event_type,
    subCategory: event.subCategory,
  }));

  return {
    maliciousEvents: allEvents,
    total: data.total || allEvents.length,
  };
}

export async function getDailyThreatActorsCount(startTs: number, endTs: number, signal?: AbortSignal) {
  let url = `/threat-actors/trend?`;
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;

  return get<{ threatTrend: { ts: number; count: number }[] }>(url, signal);
}

export async function fetchThreatActors(
  skip: number = 0,
  limit: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  startTs?: number,
  endTs?: number,
  signal?: AbortSignal,
) {
  const raw = await get<any>(`/threat-actors/?limit=${limit}`, signal);
  const data = Array.isArray(raw) ? raw : (raw?.actors ?? []);
  const totalCount = raw?.total ?? data.length;

  const actors: AktoThreatActor[] = (data || []).map((actor: any) => ({
    id: actor.source_ip,
    latestApiIp: actor.source_ip,
    latestApiAttackType: ['Suspicious Behavior'],
    discoveredAt: new Date(actor.first_seen).getTime(),
    lastSeenAt: new Date(actor.last_seen || actor.first_seen).getTime(),
    country: 'Unknown',
    actorStatus: actor.status || 'MONITORING',
    severity: actor.risk_score > 7 ? 'HIGH' : actor.risk_score > 3 ? 'MEDIUM' : 'LOW',
    totalRequests: actor.event_count || 0,
    riskScore: actor.risk_score,
  }));

  return {
    threatActors: actors,
    total: totalCount,
  };
}

export async function modifyThreatActorStatus(actorId: string, status: string, signal?: AbortSignal) {
  const endpoint = status.toUpperCase() === 'BLOCKED' ? 'block' : 'whitelist';
  return post(`/threat-actors/${actorId}/${endpoint}`, {}, signal);
}

export async function fetchThreatCategoryCount(startTs?: number, endTs?: number, signal?: AbortSignal) {
  const events = await fetchSecurityEvents(0, 500, undefined, undefined, undefined, startTs, endTs, signal);
  const counts: Record<string, number> = {};
  events.maliciousEvents.forEach((event) => {
    const category = event.category || 'Other';
    counts[category] = (counts[category] || 0) + 1;
  });
  return { categoryCount: counts };
}

export async function fetchCountBySeverity(startTs?: number, endTs?: number, signal?: AbortSignal) {
  const events = await fetchSecurityEvents(0, 500, undefined, undefined, undefined, startTs, endTs, signal);
  const counts: Record<string, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  events.maliciousEvents.forEach((event) => {
    const severity = event.severity.toUpperCase();
    if (counts[severity] !== undefined) counts[severity]++;
  });
  return { severityCount: counts };
}

export async function getActorsGeoCount(signal?: AbortSignal) {
  return get<{ countPerCountry: Record<string, number> }>('/threat-actors/geo', signal);
}

export async function fetchSecurityEventFilters(signal?: AbortSignal) {
  const data = await get<any>('/threat-actors/filters', signal);
  return {
    actors: data.ips || [],
    types: data.types || [],
  };
}

export async function fetchThreatActorFilters(signal?: AbortSignal) {
  return fetchSecurityEventFilters(signal);
}

export async function fetchThreatTopN(startTs?: number, endTs?: number, signal?: AbortSignal) {
  let url = '/threat-actors/top-n?limit=10';
  if (startTs) url += `&start_ts=${startTs}`;
  if (endTs) url += `&end_ts=${endTs}`;

  const data = await get<any>(url, signal);
  return {
    topApis: data.top_apis || [],
    topHosts: data.top_hosts || [],
  };
}
