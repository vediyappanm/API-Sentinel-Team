import { useQuery } from '@tanstack/react-query';
import {
  fetchTotalIssues,
  fetchCriticalIssuesTrend,
  fetchIssuesTrend,
  fetchHistoricalData,
  fetchThreatData,
} from '@/services/dashboard.service';
import { fetchEndpointsCount } from '@/services/discovery.service';
import { getDailyThreatActorsCount, fetchCountBySeverity } from '@/services/protection.service';

export function useDashboardKPIs() {
  const issues = useQuery({
    queryKey: ['dashboard', 'totalIssues'],
    queryFn: ({ signal }) => fetchTotalIssues(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });

  const endpoints = useQuery({
    queryKey: ['dashboard', 'endpoints'],
    queryFn: ({ signal }) => fetchEndpointsCount(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });

  const historical = useQuery({
    queryKey: ['dashboard', 'historical'],
    queryFn: ({ signal }) => fetchHistoricalData(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });

  const threats = useQuery({
    queryKey: ['dashboard', 'threats'],
    queryFn: ({ signal }) => fetchThreatData(signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });

  return {
    issues,
    endpoints,
    historical,
    threats,
    isLoading: issues.isLoading || endpoints.isLoading,
  };
}

export function useIssuesTrend(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['dashboard', 'issuesTrend', startTs, endTs],
    queryFn: ({ signal }) => fetchIssuesTrend(startTs, endTs, signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useCriticalTrend(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['dashboard', 'criticalTrend', startTs, endTs],
    queryFn: ({ signal }) => fetchCriticalIssuesTrend(startTs, endTs, signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useThreatTrend(startTs: number, endTs: number) {
  return useQuery({
    queryKey: ['dashboard', 'threatTrend', startTs, endTs],
    queryFn: ({ signal }) => getDailyThreatActorsCount(startTs, endTs, signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}

export function useSeverityBreakdown(startTs?: number, endTs?: number) {
  return useQuery({
    queryKey: ['dashboard', 'severity', startTs, endTs],
    queryFn: ({ signal }) => fetchCountBySeverity(startTs, endTs, signal),
    staleTime: 30_000,
    refetchInterval: 60_000, // resilience fallback; realtime.ts pushes invalidation on WS events
  });
}
