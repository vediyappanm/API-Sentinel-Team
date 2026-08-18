import { useQuery } from '@tanstack/react-query';
import { fetchOrganizationAttention } from '@/services/organization.service';

export function useOrganizationAttention(windowHours: 24 | 168) {
  return useQuery({
    queryKey: ['organization', 'attention', windowHours],
    queryFn: ({ signal }) => fetchOrganizationAttention(windowHours, signal),
    staleTime: 15_000,
  });
}
