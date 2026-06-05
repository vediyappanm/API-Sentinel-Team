import { get, post } from '@/lib/api-client';
import type { ApiCollectionId } from '@/services/discovery.service';

export interface AktoMaliciousEvent {
  id: string;
  eventId?: string;
  actor: string;
  filterId: string;
  ip: string;
  apiCollectionId: ApiCollectionId;
  url: string;
  method: string;
  timestamp: number;
  severity: string;
  action?: string;
  status?: string;
  description?: string;
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

interface RawSecurityEvent {
  id?: string;
  event_id?: string;
  actor_id?: string;
  ip?: string;
  api_collection_id?: ApiCollectionId;
  collection_id?: ApiCollectionId;
  url?: string;
  path?: string;
  method?: string;
  timestamp?: number;
  created_at?: string;
  severity?: string;
  action?: string;
  status?: string;
  category?: string;
  event_type?: string;
  subCategory?: string;
  sub_category?: string;
  description?: string;
  message?: string;
}

interface SecurityEventsResponse {
  events?: RawSecurityEvent[];
  total?: number;
}

interface RawThreatActor {
  source_ip?: string;
  first_seen?: string;
  last_seen?: string;
  status?: string;
  risk_score?: number;
  event_count?: number;
}

interface ThreatActorsResponse {
  actors?: RawThreatActor[];
  total?: number;
}

interface ThreatFiltersResponse {
  ips?: string[];
  types?: string[];
}

interface ThreatTopNResponse {
  top_apis?: { name: string; count: number }[];
  top_hosts?: { name: string; count: number }[];
}

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

  const data = await get<SecurityEventsResponse>(url, signal);

  const allEvents: AktoMaliciousEvent[] = (data.events || []).map((event) => ({
    id: event.id ?? event.event_id ?? `${event.ip ?? event.actor_id ?? 'event'}-${event.timestamp ?? Date.now()}`,
    eventId: event.event_id ?? event.id,
    actor: event.ip || event.actor_id || 'unknown',
    filterId: event.category || event.event_type || '-',
    ip: event.ip || event.actor_id || 'unknown',
    apiCollectionId: event.api_collection_id ?? event.collection_id ?? DEFAULT_COLLECTION_ID,
    url: event.url || event.path || '/',
    method: event.method || 'GET',
    timestamp: event.timestamp || (event.created_at ? new Date(event.created_at).getTime() : Date.now()),
    severity: event.severity || 'MEDIUM',
    action: event.action,
    status: event.status,
    description: event.description ?? event.message,
    category: event.category || event.event_type,
    subCategory: event.subCategory ?? event.sub_category,
  }));

  return {
    maliciousEvents: allEvents,
    securityEvents: allEvents,
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
  const raw = await get<ThreatActorsResponse | RawThreatActor[]>(`/threat-actors/?limit=${limit}`, signal);
  const data = Array.isArray(raw) ? raw : (raw.actors ?? []);
  const totalCount = Array.isArray(raw) ? data.length : (raw.total ?? data.length);

  const actors: AktoThreatActor[] = (data || []).map((actor) => ({
    id: actor.source_ip ?? 'unknown',
    latestApiIp: actor.source_ip ?? 'unknown',
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
  const data = await get<ThreatFiltersResponse>('/threat-actors/filters', signal);
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

  const data = await get<ThreatTopNResponse>(url, signal);
  return {
    topApis: data.top_apis || [],
    topHosts: data.top_hosts || [],
  };
}
