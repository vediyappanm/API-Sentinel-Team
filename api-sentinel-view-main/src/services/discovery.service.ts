import { get } from '@/lib/api-client';

export type ApiCollectionId = string | number;

export interface AktoApiCollection {
  id: ApiCollectionId;
  displayName: string;
  hostName: string;
  urlsCount: number;
  startTs: number;
  type: string;
}

export interface AktoApiInfo {
  id: { apiCollectionId: ApiCollectionId; url: string; method: string };
  allAuthTypesFound: string[];
  lastSeen: number;
  discoveredAt?: number;
  riskScore?: number;
  apiAccessTypes?: string[];
  deprecated?: boolean;
}

const DEFAULT_COLLECTION_ID: ApiCollectionId = 'default-inventory';

interface RawCollection {
  id: ApiCollectionId;
  name?: string;
  displayName?: string;
  host_name?: string;
  hostName?: string;
  urls_count?: number;
  urlsCount?: number;
  created_at?: string;
  type?: string;
}

interface CollectionsResponse {
  collections?: RawCollection[];
}

interface RawEndpoint {
  id?: string;
  collection_id?: ApiCollectionId;
  api_collection_id?: ApiCollectionId;
  path?: string;
  url?: string;
  method?: string;
  auth_types?: string[];
  last_seen?: string;
  created_at?: string;
  risk_score?: number;
  access_types?: string[];
  deprecated?: boolean;
}

interface RawPiiFinding {
  api_collection_id?: ApiCollectionId;
  collection_id?: ApiCollectionId;
  url?: string;
  method?: string;
  entity_type?: string;
  matched_text?: string;
  sample_value?: string;
}

export interface SeverityCountResponse {
  severityCount?: Record<string, number>;
}

export async function fetchApiCollections(signal?: AbortSignal) {
  const raw = await get<CollectionsResponse | RawCollection[]>('/collections/', signal);
  const data = Array.isArray(raw) ? raw : (raw.collections ?? []);

  if (!data.length) {
    return {
      apiCollections: [
        {
          id: DEFAULT_COLLECTION_ID,
          displayName: 'Default Inventory',
          hostName: 'all-hosts',
          urlsCount: 0,
          startTs: Date.now(),
          type: 'MIRRORING',
        },
      ],
    };
  }

  const apiCollections: AktoApiCollection[] = data.map((collection) => ({
    id: collection.id,
    displayName: collection.name ?? collection.displayName ?? String(collection.id),
    hostName: collection.host_name ?? collection.hostName ?? 'internal',
    urlsCount: collection.urls_count ?? collection.urlsCount ?? 0,
    startTs: collection.created_at ? new Date(collection.created_at).getTime() : Date.now(),
    type: collection.type || 'MIRRORING',
  }));

  return { apiCollections };
}

export async function fetchApiInfosForCollection(
  apiCollectionId: ApiCollectionId,
  skip: number = 0,
  limit: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const data = await get<{ total: number; endpoints: RawEndpoint[] }>('/endpoints/', signal);

  const apiInfoList: AktoApiInfo[] = (data.endpoints || []).map((endpoint) => ({
    id: {
      apiCollectionId: endpoint.collection_id ?? endpoint.api_collection_id ?? apiCollectionId,
      url: endpoint.path ?? endpoint.url ?? '/',
      method: endpoint.method ?? 'GET',
    },
    allAuthTypesFound: endpoint.auth_types ?? [],
    lastSeen: endpoint.last_seen ? new Date(endpoint.last_seen).getTime() : Date.now(),
    discoveredAt: endpoint.created_at
      ? new Date(endpoint.created_at).getTime()
      : endpoint.last_seen
        ? new Date(endpoint.last_seen).getTime()
        : Date.now(),
    riskScore: endpoint.risk_score ?? 0,
    apiAccessTypes: endpoint.access_types ?? [],
    deprecated: endpoint.deprecated ?? false,
  }));

  return {
    apiInfoList,
    total: data.total || 0,
  };
}

export async function fetchEndpointsCount(signal?: AbortSignal) {
  const data = await get<{ total: number }>('/endpoints/', signal);
  return { endpointsCount: data.total || 0 };
}

export async function fetchSeverityCounts(apiCollectionIds: ApiCollectionId[], signal?: AbortSignal) {
  return { severitiesCountResponse: [] as SeverityCountResponse[] };
}

export async function fetchRecentEndpoints(startTs: number, endTs: number, signal?: AbortSignal) {
  const data = await fetchApiInfosForCollection(DEFAULT_COLLECTION_ID, 0, 10, undefined, undefined, undefined, signal);
  return { endpoints: data.apiInfoList };
}

export async function fetchAccessTypes(apiCollectionId: ApiCollectionId, signal?: AbortSignal) {
  return { accessTypes: {} };
}

export async function fetchNewEndpointsTrend(
  period: 'HOST' | 'NON_HOST',
  startTs: number,
  endTs: number,
  signal?: AbortSignal,
) {
  return { trend: [] };
}

export interface GovernanceEvent {
  id: string;
  severity: string;
  method?: string;
  url?: string;
  timestamp: number;
  subCategory?: string;
  description?: string;
  status: string;
  eventId?: string;
}

export async function fetchGovernanceEvents(
  skip: number = 0,
  limit: number = 50,
  filters?: Record<string, unknown>,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  const status = filters?.status;
  if (typeof status === 'string' && status) {
    params.set('status', status);
  }
  const data = await get<{ total: number; violations: GovernanceEvent[] }>(
    `/governance/violations?${params.toString()}`,
    signal,
  );
  return { auditDataList: data.violations || [], total: data.total || 0 };
}

export async function fetchApiStats(signal?: AbortSignal) {
  return { apiStats: {} };
}

export async function fetchCollectionWiseEndpoints(signal?: AbortSignal) {
  return { response: {} };
}

export interface AktoSensitiveParam {
  apiCollectionId: ApiCollectionId;
  url: string;
  method: string;
  subType: string;
  isHeader: boolean;
  param: string;
  count?: number;
}

export async function fetchSensitiveParameters(
  skip: number = 0,
  limit: number = 50,
  signal?: AbortSignal,
) {
  const data = await get<{ findings: RawPiiFinding[] }>('/pii/', signal);

  const endpoints: AktoSensitiveParam[] = (data.findings || []).map((finding) => ({
    apiCollectionId: finding.api_collection_id ?? finding.collection_id ?? DEFAULT_COLLECTION_ID,
    url: finding.url || '/',
    method: finding.method || 'GET',
    subType: finding.entity_type,
    isHeader: false,
    param: finding.matched_text ?? finding.sample_value ?? '',
    count: 1,
  }));

  return {
    data: { endpoints },
    total: endpoints.length,
  };
}

export async function fetchSensitiveInfoForCollections(signal?: AbortSignal) {
  return { sensitiveInfo: {} };
}
