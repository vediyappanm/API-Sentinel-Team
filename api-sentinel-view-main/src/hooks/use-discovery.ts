import { useQuery } from '@tanstack/react-query';
import {
  type ApiCollectionId,
  fetchApiCollections,
  fetchApiInfosForCollection,
  fetchSeverityCounts,
  fetchEndpointsCount,
  fetchRecentEndpoints,
  fetchGovernanceEvents,
  fetchSensitiveParameters,
  fetchEndpoint,
  fetchEndpointHourly,
  fetchEvidenceForEndpoint,
} from '@/services/discovery.service';

export function useApiCollections() {
  return useQuery({
    queryKey: ['discovery', 'collections'],
    queryFn: ({ signal }) => fetchApiCollections(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useApiInfos(
  collectionId: ApiCollectionId | null,
  page: number = 0,
  pageSize: number = 50,
  sortKey?: string,
  sortOrder?: number,
  filters?: Record<string, unknown>,
) {
  return useQuery({
    queryKey: ['discovery', 'apiInfos', collectionId, page, pageSize, sortKey, sortOrder, filters],
    queryFn: ({ signal }) =>
      fetchApiInfosForCollection(collectionId!, page * pageSize, pageSize, sortKey, sortOrder, filters, signal),
    enabled: collectionId !== null,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSeverityCounts(apiCollectionIds: ApiCollectionId[]) {
  return useQuery({
    queryKey: ['discovery', 'severityCounts', apiCollectionIds],
    queryFn: ({ signal }) => fetchSeverityCounts(apiCollectionIds, signal),
    enabled: apiCollectionIds.length > 0,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useEndpointsCount() {
  return useQuery({
    queryKey: ['discovery', 'endpointsCount'],
    queryFn: ({ signal }) => fetchEndpointsCount(signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useRecentEndpoints(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['discovery', 'recent', startTs, endTs],
    queryFn: ({ signal }) => fetchRecentEndpoints(startTs, endTs, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useGovernanceEvents(
  page: number = 0,
  pageSize: number = 50,
  filters?: Record<string, unknown>,
) {
  return useQuery({
    queryKey: ['discovery', 'governance', page, pageSize, filters],
    queryFn: ({ signal }) => fetchGovernanceEvents(page * pageSize, pageSize, filters, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useSensitiveParameters(page: number = 0, pageSize: number = 50) {
  return useQuery({
    queryKey: ['discovery', 'sensitive', page, pageSize],
    queryFn: ({ signal }) => fetchSensitiveParameters(page * pageSize, pageSize, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useEndpoint(endpointId: string | undefined) {
  return useQuery({
    queryKey: ['discovery', 'endpoint', endpointId],
    queryFn: ({ signal }) => fetchEndpoint(endpointId!, signal),
    enabled: Boolean(endpointId),
    staleTime: 15_000,
  });
}

export function useEndpointHourly(endpointId: string | undefined, hours: number = 24) {
  return useQuery({
    queryKey: ['discovery', 'endpoint-hourly', endpointId, hours],
    queryFn: ({ signal }) => fetchEndpointHourly(endpointId!, hours, signal),
    enabled: Boolean(endpointId),
    staleTime: 30_000,
  });
}

export function useEndpointEvidence(endpointId: string | undefined) {
  return useQuery({
    queryKey: ['discovery', 'endpoint-evidence', endpointId],
    queryFn: ({ signal }) => fetchEvidenceForEndpoint(endpointId!, signal),
    enabled: Boolean(endpointId),
    staleTime: 15_000,
  });
}
