import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import ReleaseGovernance from './ReleaseGovernance';

const mutateAsync = vi.fn();

vi.mock('@/hooks/use-security-ops', () => ({
  useCicdGateDecision: () => ({
    data: {
      status: 'FAILED',
      passed: false,
      reason: 'unconfirmed_blocking_findings',
      exit_code: 1,
      run_id: 'run-1',
      policy: {
        policy_pack: 'strict',
        fail_on_severities: ['CRITICAL', 'HIGH'],
        require_confirmatory_retests: true,
        require_evidence_integrity: true,
        require_evidence_completeness: true,
        require_safety_policies: true,
      },
      counts: {
        total_results: 21,
        failing_results: 2,
        unconfirmed_blocking_results: 1,
        unverified_evidence_results: 0,
        incomplete_evidence_results: 0,
        missing_safety_policy_results: 0,
        errored_results: 0,
        by_severity: { CRITICAL: 1, HIGH: 1, MEDIUM: 2, LOW: 4 },
      },
      quota: { allowed: true, remaining: 5998, limit: 6000, reset_seconds: 60 },
      scan_context: {
        authenticated: true,
        pentest_profile_id: 'profile-1',
        auth_profile_id: 'auth-1',
        trigger_source: 'ci',
      },
      decision_integrity: {
        hash_algorithm: 'sha256',
        signature_algorithm: 'hmac-sha256',
        decision_hash: 'abcd1234efgh5678',
        decision_signature: 'signed-decision',
      },
      failing_results: [{ id: 'result-1', template_id: 'auth-bypass', severity: 'CRITICAL', endpoint_id: 'endpoint-1' }],
      unconfirmed_results: [{ id: 'result-2', template_id: 'bola-replay', severity: 'HIGH', endpoint_id: 'endpoint-2' }],
      unverified_evidence_results: [],
      incomplete_evidence_results: [],
      missing_safety_policy_results: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useGovernanceDashboard: () => ({
    data: {
      account_id: 42,
      generated_at: '2026-06-04T05:30:00Z',
      executive: {
        open_findings: 7,
        critical_open_findings: 1,
        high_open_findings: 2,
        risk_score: 46,
      },
      sla: {
        overdue: 1,
        due_soon: 2,
        on_track: 4,
      },
      coverage: {
        llm_active_findings: 2,
        business_logic_active_findings: 1,
        latest_run_status: 'COMPLETED',
        latest_run_id: 'run-1',
        latest_run_total_tests: 21,
        latest_run_vulnerable_count: 2,
        coverage_targets: {
          endpoint_coverage: 84,
          authenticated_coverage: 76,
        },
        engine_plan: [
          {
            engine: 'schemathesis',
            display_name: 'Schemathesis',
            status: 'ready',
            reason: 'requirements_satisfied',
            artifact_type: 'schemathesis_stateful_report',
          },
          {
            engine: 'nuclei',
            display_name: 'Nuclei',
            status: 'blocked',
            reason: 'missing_auth_profile',
            artifact_type: 'nuclei_findings',
          },
        ],
      },
      governance: {
        open_policy_violations: 3,
        latest_policy_pack: 'llm-strict',
        latest_policy_violation: 'Weak evidence blocked release gate',
      },
      north_star_readiness: {
        overall_status: 'partial',
        readiness_score: 63,
        ready_count: 2,
        partial_count: 1,
        gap_count: 1,
        control_counts: { ready: 7, missing: 4, total: 11 },
        production_blockers: [
          {
            id: 'enterprise_governance.engine_artifact_accountability',
            capability_id: 'enterprise_governance',
            capability_name: 'Enterprise Governance',
            check: 'engine_artifact_accountability',
            next_action: 'Require hashed engine artifacts before promotion.',
          },
        ],
        p1_workstreams: [
          {
            id: 'multi_identity_bola_bfla',
            name: 'Multi-Identity BOLA/BFLA',
            owner: 'AuthZ Engineer',
            priority: 'P1',
            status: 'ready',
            evidence_status: 'deterministic',
            ready_checks: ['bola_bfla'],
            missing_checks: [],
            blockers: [],
          },
          {
            id: 'business_logic',
            name: 'Business Logic Abuse',
            owner: 'Advanced Testing',
            priority: 'P1',
            status: 'blocked',
            evidence_status: 'missing',
            ready_checks: [],
            missing_checks: ['business_logic'],
            blockers: ['business_logic'],
          },
          {
            id: 'llm_api_security',
            name: 'LLM API Security',
            owner: 'AI Security',
            priority: 'P1',
            status: 'ready',
            evidence_status: 'deterministic',
            ready_checks: ['llm_api'],
            missing_checks: [],
            blockers: [],
          },
          {
            id: 'governance_ui_reports',
            name: 'Governance UI and Reports',
            owner: 'Frontend + PM',
            priority: 'P1',
            status: 'partial',
            evidence_status: 'report-ready',
            ready_checks: ['ci_cd_gates', 'audit_logs', 'tenant_isolation', 'sla_tracking'],
            missing_checks: ['technical_report'],
            blockers: ['technical_report'],
          },
        ],
        capabilities: [],
        next_gaps: ['business_logic', 'governance_ui_reports'],
      },
      reports: {
        executive_summary: {
          readiness_statement: 'Release blocked by 1 North Star blocker.',
          blocker_summary: 'Engine artifact accountability is missing.',
          owner_summary: 'Frontend + PM owns governance UI and reports.',
          evidence_status: 'partial',
          sla_health: '1 overdue / 2 due soon',
        },
        technical_report: {
          evidence_status: 'Deterministic evidence is available for BOLA and LLM checks.',
          sla_health: '1 overdue finding needs triage.',
          endpoint_risk: '/v1/responses carries risk 91.',
          trend_summary: 'Open findings increased to 6 on 2026-06-01.',
          artifact_status: 'SARIF and JUnit export links are available.',
        },
      },
      top_endpoint_risk: [
        {
          endpoint_id: 'endpoint-1',
          method: 'POST',
          path: '/v1/responses',
          risk_score: 91,
          open_findings: 2,
        },
      ],
      vulnerability_trend: [
        { date: '2026-05-29', open_findings: 1 },
        { date: '2026-05-30', open_findings: 0 },
        { date: '2026-05-31', open_findings: 2 },
        { date: '2026-06-01', open_findings: 6 },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useCicdTriggers: () => ({
    data: {
      total: 1,
      triggers: [
        {
          id: 'trigger-1',
          source: 'github',
          repo: 'sentinel/api',
          branch: 'main',
          commit_sha: 'abc123',
          status: 'QUEUED',
          test_run_id: 'run-1',
          created_at: '2026-06-04T04:00:00Z',
        },
      ],
    },
    isLoading: false,
  }),
  useTestRuns: () => ({
    data: {
      total: 1,
      runs: [{ id: 'run-1', status: 'COMPLETED', total_tests: 21, vulnerable_count: 2, error_count: 0 }],
    },
    isLoading: false,
  }),
  useVulnerabilityLifecycle: () => ({
    data: {
      total: 1,
      vulnerabilities: [
        {
          id: 'vuln-1',
          severity: 'HIGH',
          type: 'BOLA',
          method: 'GET',
          url: 'https://api.example.com/users/123',
          status: 'IN_REMEDIATION',
          sla_status: 'OVERDUE',
          sla_due_at: '2026-06-03T00:00:00Z',
          confirmation_status: 'UNCONFIRMED',
          evidence_integrity: { verified: true },
          retest_support: { supported: true, queued_scan_supported: true, manual_outcome_supported: true },
          ticket_url: 'https://jira.example.com/browse/SEC-101',
          latest_retest: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useSyncVulnerabilityTicket: () => ({ mutateAsync, isPending: false }),
  useRecordVulnerabilityRetestOutcome: () => ({ mutateAsync, isPending: false }),
}));

describe('ReleaseGovernance', () => {
  it('renders gate integrity, CI exports, trigger context, and lifecycle actions', () => {
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <ReleaseGovernance />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: /release governance/i })).toBeInTheDocument();
    expect(screen.getByText(/executive risk/i)).toBeInTheDocument();
    expect(screen.getByText(/llm active/i)).toBeInTheDocument();
    expect(screen.getByText(/business logic active/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\/v1\/responses/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/finding trend/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2026-06-01/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/sla dashboard/i)).toBeInTheDocument();
    expect(screen.getAllByText(/2 due soon/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/engine accountability/i)).toBeInTheDocument();
    expect(screen.getAllByText(/schemathesis/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/nuclei/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/missing auth profile/i)).toBeInTheDocument();
    expect(screen.getByText(/tenant governance/i)).toBeInTheDocument();
    expect(screen.getByText(/tenant 42/i)).toBeInTheDocument();
    expect(screen.getByText(/weak evidence blocked release gate/i)).toBeInTheDocument();
    expect(screen.getByText(/north star readiness/i)).toBeInTheDocument();
    expect(screen.getByText(/north star command board/i)).toBeInTheDocument();
    expect(screen.getByText(/63% ready/i)).toBeInTheDocument();
    expect(screen.getByText(/authz engineer/i)).toBeInTheDocument();
    expect(screen.getByText(/advanced testing/i)).toBeInTheDocument();
    expect(screen.getByText(/ai security/i)).toBeInTheDocument();
    expect(screen.getAllByText(/frontend \+ pm/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/deterministic/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/technical_report/i)).toBeInTheDocument();
    expect(screen.getByText(/publish the technical report with evidence status/i)).toBeInTheDocument();
    expect(screen.getByText(/require hashed engine artifacts before promotion/i)).toBeInTheDocument();
    expect(screen.getByText(/executive summary/i)).toBeInTheDocument();
    expect(screen.getByText(/release blocked by 1 north star blocker/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy executive report/i })).toBeInTheDocument();
    expect(screen.getAllByText(/technical report/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /copy technical report/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /download report json/i })).toBeInTheDocument();
    expect(screen.getByText(/deterministic evidence is available for bola and llm checks/i)).toBeInTheDocument();
    expect(screen.getByText(/open findings increased to 6 on 2026-06-01/i)).toBeInTheDocument();
    expect(screen.getByText(/unconfirmed blocking findings/i)).toBeInTheDocument();
    expect(screen.getByText(/hmac-sha256/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sarif/i })).toHaveAttribute('href', expect.stringContaining('/api/cicd/gate/run-1/sarif'));
    expect(screen.getByRole('link', { name: /junit/i })).toHaveAttribute('href', expect.stringContaining('/api/cicd/gate/run-1/junit'));
    expect(screen.getByText(/github/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sla overdue/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /sync ticket/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /mark clean/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /still vulnerable/i }).length).toBeGreaterThan(0);
  }, 10_000);
});
