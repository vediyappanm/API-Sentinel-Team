import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCicdGateExportUrl,
  evaluateCicdGate,
  fetchCicdTriggers,
  fetchGovernanceDashboard,
  normalizeGovernanceDashboard,
  fetchVulnerabilityLifecycle,
  recordVulnerabilityRetestOutcome,
  syncVulnerabilityTicket,
} from './security-ops.service';

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('security operations release governance service', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('evaluates a CI gate with the selected policy pack', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'FAILED', policy: { policy_pack: 'strict' } }));

    await evaluateCicdGate('run-123', 'strict');

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/cicd/gate/run-123?policy_pack=strict',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('fetches recent CI triggers with a bounded limit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 0, triggers: [] }));

    await fetchCicdTriggers(25);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/cicd/triggers?limit=25',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('loads governance dashboard aggregates from the release-control endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ executive: { open_findings: 2 }, sla: { overdue: 1 } }));

    await fetchGovernanceDashboard();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/dashboard/governance',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('normalizes governance dashboard trend, engine accountability, and optional SLA fields', () => {
    const dashboard = normalizeGovernanceDashboard({
      account_id: 42,
      executive: {
        open_findings: 1,
        critical_open_findings: 0,
        high_open_findings: 1,
        risk_score: 15,
      },
      sla: {
        overdue: 0,
        due_soon: 1,
        on_track: 0,
      },
      coverage: {
        llm_active_findings: 0,
        business_logic_active_findings: 1,
        engine_plan: [{ engine: 'zap', status: 'blocked', reason: 'missing_openapi_spec' }],
      },
      governance: {
        open_policy_violations: 1,
        latest_policy_violation: 'Target guard rejected unsafe scope',
      },
      top_endpoint_risk: [],
    });

    expect(dashboard.sla.no_sla).toBe(0);
    expect(dashboard.vulnerability_trend).toEqual([]);
    expect(dashboard.coverage.engine_plan?.[0]).toEqual({
      engine: 'zap',
      status: 'blocked',
      reason: 'missing_openapi_spec',
    });
    expect(dashboard.governance.latest_policy_violation).toBe('Target guard rejected unsafe scope');
  });

  it('normalizes North Star readiness reports without exposing raw secrets', () => {
    const dashboard = normalizeGovernanceDashboard({
      account_id: 42,
      executive: {
        open_findings: 3,
        critical_open_findings: 1,
        high_open_findings: 1,
        risk_score: 63,
      },
      sla: {
        overdue: 1,
        due_soon: 1,
        on_track: 1,
      },
      coverage: {
        llm_active_findings: 1,
        business_logic_active_findings: 1,
      },
      governance: {
        open_policy_violations: 1,
        latest_policy_violation: 'raw-token leaked into release notes',
      },
      top_endpoint_risk: [
        {
          endpoint_id: 'endpoint-1',
          method: 'POST',
          path: '/checkout/apply-coupon?token=raw-token',
          risk_score: 91,
          open_findings: 2,
        },
      ],
      vulnerability_trend: [{ date: '2026-06-01', open_findings: 3 }],
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
            next_action: 'Inspect Bearer raw-secret-token before release.',
          },
        ],
        p1_workstreams: [
          {
            id: 'governance_ui_reports',
            name: 'Governance UI and Reports',
            owner: 'Frontend + PM',
            priority: 'P1',
            status: 'blocked',
            evidence_status: 'missing',
            ready_checks: ['ci_cd_gates'],
            missing_checks: ['technical_report'],
            blockers: ['technical_report'],
            next_action: 'Publish the technical report with evidence status, endpoint risk, trend, and artifact accountability.',
          },
        ],
        capabilities: [],
        next_gaps: ['governance_ui_reports'],
      },
      reports: {
        executive_summary: {
          readiness_statement: 'Release blocked until raw-token evidence is redacted.',
          blocker_summary: '1 production blocker remains.',
          owner_summary: 'Frontend + PM owns the reporting gap.',
          evidence_status: 'missing',
          sla_health: '1 overdue / 1 due soon',
        },
        technical_report: {
          evidence_status: 'Evidence contains Bearer raw-secret-token and must be redacted.',
          sla_health: '1 overdue finding needs owner action.',
          endpoint_risk: '/checkout/apply-coupon?token=raw-token carries risk 91.',
          trend_summary: 'Open findings increased to 3 on 2026-06-01.',
          artifact_status: 'SARIF and JUnit exports are available.',
        },
      },
    });

    expect(dashboard.north_star_readiness.readiness_score).toBe(63);
    expect(dashboard.north_star_readiness.p1_workstreams[0]).toEqual({
      id: 'governance_ui_reports',
      name: 'Governance UI and Reports',
      owner: 'Frontend + PM',
      priority: 'P1',
      status: 'blocked',
      evidence_status: 'missing',
      ready_checks: ['ci_cd_gates'],
      missing_checks: ['technical_report'],
      blockers: ['technical_report'],
      next_action: 'Publish the technical report with evidence status, endpoint risk, trend, and artifact accountability.',
    });
    expect(dashboard.north_star_readiness.production_blockers[0].next_action).toContain('[REDACTED]');
    expect(dashboard.north_star_readiness.production_blockers[0].owner).toBe('Security Platform Engineer');
    expect(dashboard.north_star_readiness.production_blockers[0].evidence_status).toBe('missing');
    expect(dashboard.north_star_readiness.p1_workstreams[0].next_action).toBe(
      'Publish the technical report with evidence status, endpoint risk, trend, and artifact accountability.',
    );
    expect(dashboard.reports.executive_summary.owner_summary).toBe('Frontend + PM owns the reporting gap.');
    expect(dashboard.reports.technical_report.endpoint_risk).toContain('[REDACTED]');
    expect(JSON.stringify(dashboard)).not.toContain('raw-token');
    expect(JSON.stringify(dashboard)).not.toContain('raw-secret-token');
  });

  it('builds direct CI export URLs for SARIF and JUnit artifacts', () => {
    expect(buildCicdGateExportUrl('run-123', 'sarif')).toBe(
      'http://localhost:3000/api/cicd/gate/run-123/sarif',
    );
    expect(buildCicdGateExportUrl('run-123', 'junit')).toBe(
      'http://localhost:3000/api/cicd/gate/run-123/junit',
    );
  });

  it('loads lifecycle-ready vulnerabilities with evidence details intact', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 1, vulnerabilities: [{ id: 'vuln-1' }] }));

    await fetchVulnerabilityLifecycle({ limit: 40, status: 'OPEN' });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/vulnerabilities/?limit=40&status=OPEN',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('syncs external ticket status without leaking ticket credentials into the URL', async () => {
    await syncVulnerabilityTicket('vuln-1', {
      external_status: 'Done',
      external_key: 'SEC-101',
      source: 'jira',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/vulnerabilities/vuln-1/ticket/sync',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          external_status: 'Done',
          external_key: 'SEC-101',
          source: 'jira',
        }),
      }),
    );
  });

  it('records manual confirmatory retest outcomes with execution counts', async () => {
    await recordVulnerabilityRetestOutcome('vuln-1', {
      outcome: 'clean',
      executed: 12,
      vulnerable: 0,
      errors: 0,
      skipped: 1,
      reason: 'Fix branch replay passed',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/vulnerabilities/vuln-1/retest/outcome',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          outcome: 'clean',
          executed: 12,
          vulnerable: 0,
          errors: 0,
          skipped: 1,
          reason: 'Fix branch replay passed',
        }),
      }),
    );
  });
});
