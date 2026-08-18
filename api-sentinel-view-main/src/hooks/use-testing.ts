import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchAllIssues,
  fetchIssueSummary,
  fetchSeverityInfoForIssues,
  fetchIssuesByDay,
  updateIssueStatus,
  bulkUpdateIssueStatus,
  fetchAllSubCategories,
  fetchFinding,
  fetchFindingsForEndpoint,
} from '@/services/testing.service';

export function useVulnerabilities(
  page: number = 0,
  pageSize: number = 50,
  filters?: Record<string, unknown>,
  sortKey?: string,
  sortOrder?: number,
) {
  return useQuery({
    queryKey: ['testing', 'issues', page, pageSize, filters, sortKey, sortOrder],
    queryFn: ({ signal }) =>
      fetchAllIssues(page * pageSize, pageSize, filters, sortKey, sortOrder, signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useIssueSummary() {
  return useQuery({
    queryKey: ['testing', 'summary'],
    queryFn: ({ signal }) => fetchIssueSummary(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useSeverityInfo() {
  return useQuery({
    queryKey: ['testing', 'severityInfo'],
    queryFn: ({ signal }) => fetchSeverityInfoForIssues(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useIssuesTrend(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['testing', 'trend', startTs, endTs],
    queryFn: ({ signal }) => fetchIssuesByDay(startTs, endTs, signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useSubCategories() {
  return useQuery({
    queryKey: ['testing', 'subCategories'],
    queryFn: ({ signal }) => fetchAllSubCategories(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useUpdateIssueStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, status }: { issueId: string; status: string }) =>
      updateIssueStatus(issueId, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['testing'] });
    },
  });
}

export function useFinding(findingId: string | undefined) {
  return useQuery({
    queryKey: ['testing', 'finding', findingId],
    queryFn: ({ signal }) => fetchFinding(findingId!, signal),
    enabled: Boolean(findingId),
    staleTime: 15_000,
  });
}

export function useEndpointFindings(endpointId: string | undefined) {
  return useQuery({
    queryKey: ['testing', 'endpoint-findings', endpointId],
    queryFn: ({ signal }) => fetchFindingsForEndpoint(endpointId!, signal),
    enabled: Boolean(endpointId),
    staleTime: 15_000,
  });
}

export function useBulkUpdateIssueStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueIds, status }: { issueIds: string[]; status: string }) =>
      bulkUpdateIssueStatus(issueIds, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['testing'] });
    },
  });
}
