import { useQuery } from '@tanstack/react-query';
import {
  fetchLatestSpec,
  fetchSpecHistory,
  diffSpecs,
  fetchSchemaViolations,
} from '@/services/openapi.service';

export function useLatestSpec() {
  return useQuery({
    queryKey: ['openapi', 'latest'],
    queryFn: ({ signal }) => fetchLatestSpec(signal).catch(() => null),
    retry: false,
  });
}

export function useSpecHistory(limit = 10) {
  return useQuery({
    queryKey: ['openapi', 'history', limit],
    queryFn: ({ signal }) => fetchSpecHistory(limit, signal),
    retry: false,
  });
}

export function useSpecDiff(baseSpecId: string | null, revisionSpecId: string | null) {
  return useQuery({
    queryKey: ['openapi', 'diff', baseSpecId, revisionSpecId],
    queryFn: ({ signal }) => diffSpecs(baseSpecId!, revisionSpecId!, signal),
    enabled: Boolean(baseSpecId && revisionSpecId),
    retry: false,
  });
}

export function useSchemaViolations(limit = 50) {
  return useQuery({
    queryKey: ['openapi', 'violations', limit],
    queryFn: ({ signal }) => fetchSchemaViolations(limit, signal).catch(() => null),
    retry: false,
  });
}
