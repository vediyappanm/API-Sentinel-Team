import { get } from '@/lib/api-client';

export interface RiskReason {
  factor: string;
  count: number;
  points: number;
}

export interface FindingFact {
  label: string;
  value: string;
}

export interface TopRisk {
  id: string;
  title: string;
  severity: string;
  status: string;
  confidence: string | number | null;
  api: {
    endpoint_id?: string | null;
    method?: string | null;
    url?: string | null;
    host?: string | null;
  };
  has_evidence: boolean;
  facts: FindingFact[];
  next_action: string;
}

export interface OrganizationAttention {
  window_hours: number;
  risk_model: {
    id: string;
    formula: string;
    rationale: string;
  };
  posture: {
    score: number;
    scale: string;
    reasons: RiskReason[];
  };
  severity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  inventory: {
    apis_discovered: number;
    internet_facing: number;
    shadow: number;
    unauthenticated: number;
    sensitive: number;
  };
  activity: {
    open_findings: number;
    resolved_findings: number;
    new_findings: number;
    resolved_in_window: number;
    open_alerts: number;
  };
  top_risks: TopRisk[];
  notes: string[];
  continuous_testing_enabled: boolean;
}

export async function fetchOrganizationAttention(
  windowHours: 24 | 168,
  signal?: AbortSignal,
) {
  return get<OrganizationAttention>(`/organization/attention?window_hours=${windowHours}`, signal);
}
