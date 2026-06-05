import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAuthProfile,
  createPentestProfile,
  evaluateCicdGate,
  evaluateCicdTriggerGate,
  fetchAuthProfiles,
  fetchCicdTriggers,
  fetchDetectionMeta,
  fetchGovernanceDashboard,
  fetchOpenApiHistory,
  fetchPentestArtifacts,
  fetchPentestMeta,
  fetchPentestProfiles,
  fetchTestRunDetail,
  fetchTestRuns,
  fetchTestingEndpoints,
  fetchTestingTemplates,
  fetchVulnerabilityLifecycle,
  preparePentestProfile,
  recordVulnerabilityRetestOutcome,
  startTestRun,
  syncVulnerabilityTicket,
  type CreateAuthProfilePayload,
  type CreatePentestProfilePayload,
  type GatePolicyPack,
  type RetestOutcomePayload,
  type TicketSyncPayload,
  type VulnerabilityLifecycleOptions,
} from '@/services/security-ops.service';

export function useDetectionMeta() {
  return useQuery({
    queryKey: ['security-ops', 'detection-meta'],
    queryFn: ({ signal }) => fetchDetectionMeta(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function usePentestMeta() {
  return useQuery({
    queryKey: ['security-ops', 'pentest-meta'],
    queryFn: ({ signal }) => fetchPentestMeta(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useGovernanceDashboard() {
  return useQuery({
    queryKey: ['security-ops', 'governance-dashboard'],
    queryFn: ({ signal }) => fetchGovernanceDashboard(signal),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useAuthProfiles() {
  return useQuery({
    queryKey: ['security-ops', 'auth-profiles'],
    queryFn: ({ signal }) => fetchAuthProfiles(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useCreateAuthProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAuthProfilePayload) => createAuthProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'auth-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'pentest-meta'] });
    },
  });
}

export function usePentestProfiles() {
  return useQuery({
    queryKey: ['security-ops', 'pentest-profiles'],
    queryFn: ({ signal }) => fetchPentestProfiles(signal),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useCreatePentestProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePentestProfilePayload) => createPentestProfile(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'pentest-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'pentest-meta'] });
    },
  });
}

export function usePreparePentestProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, payload }: { profileId: string; payload: { target_url: string; spec_id?: string | null; persist?: boolean } }) =>
      preparePentestProfile(profileId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'pentest-artifacts'] });
    },
  });
}

export function usePentestArtifacts(profileId?: string | null, limit: number = 20) {
  return useQuery({
    queryKey: ['security-ops', 'pentest-artifacts', profileId ?? 'all', limit],
    queryFn: ({ signal }) => fetchPentestArtifacts({ profileId, limit }, signal),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useTestingTemplates() {
  return useQuery({
    queryKey: ['security-ops', 'templates'],
    queryFn: ({ signal }) => fetchTestingTemplates(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useTestingEndpoints(limit: number = 20) {
  return useQuery({
    queryKey: ['security-ops', 'endpoints', limit],
    queryFn: ({ signal }) => fetchTestingEndpoints(limit, signal),
    staleTime: 10_000,
    refetchInterval: 20_000,
  });
}

export function useTestRuns(limit: number = 10) {
  return useQuery({
    queryKey: ['security-ops', 'test-runs', limit],
    queryFn: ({ signal }) => fetchTestRuns(limit, signal),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useTestRunDetail(runId: string | null) {
  return useQuery({
    queryKey: ['security-ops', 'test-run-detail', runId],
    queryFn: ({ signal }) => fetchTestRunDetail(runId!, signal),
    enabled: Boolean(runId),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });
}

export function useStartTestRun() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { templateIds: string[]; endpointIds: string[]; pentestProfileId?: string | null }) =>
      startTestRun(payload.templateIds, payload.endpointIds, payload.pentestProfileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'test-runs'] });
      queryClient.invalidateQueries({ queryKey: ['testing'] });
    },
  });
}

export function useOpenApiHistory(limit: number = 10) {
  return useQuery({
    queryKey: ['security-ops', 'openapi-history', limit],
    queryFn: ({ signal }) => fetchOpenApiHistory(limit, signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useCicdTriggers(limit: number = 25) {
  return useQuery({
    queryKey: ['security-ops', 'cicd-triggers', limit],
    queryFn: ({ signal }) => fetchCicdTriggers(limit, signal),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useCicdGateDecision(runId: string | null, policyPack: GatePolicyPack = 'strict') {
  return useQuery({
    queryKey: ['security-ops', 'cicd-gate', runId, policyPack],
    queryFn: ({ signal }) => evaluateCicdGate(runId!, policyPack, signal),
    enabled: Boolean(runId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useCicdTriggerGateDecision(triggerId: string | null, policyPack: GatePolicyPack = 'strict') {
  return useQuery({
    queryKey: ['security-ops', 'cicd-trigger-gate', triggerId, policyPack],
    queryFn: ({ signal }) => evaluateCicdTriggerGate(triggerId!, policyPack, signal),
    enabled: Boolean(triggerId),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useVulnerabilityLifecycle(options: VulnerabilityLifecycleOptions = {}) {
  return useQuery({
    queryKey: ['security-ops', 'vulnerability-lifecycle', options],
    queryFn: ({ signal }) => fetchVulnerabilityLifecycle(options, signal),
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

export function useSyncVulnerabilityTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vulnerabilityId, payload }: { vulnerabilityId: string; payload: TicketSyncPayload }) =>
      syncVulnerabilityTicket(vulnerabilityId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'vulnerability-lifecycle'] });
      queryClient.invalidateQueries({ queryKey: ['testing'] });
    },
  });
}

export function useRecordVulnerabilityRetestOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vulnerabilityId, payload }: { vulnerabilityId: string; payload: RetestOutcomePayload }) =>
      recordVulnerabilityRetestOutcome(vulnerabilityId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'vulnerability-lifecycle'] });
      queryClient.invalidateQueries({ queryKey: ['testing'] });
      queryClient.invalidateQueries({ queryKey: ['security-ops', 'cicd-gate'] });
    },
  });
}
