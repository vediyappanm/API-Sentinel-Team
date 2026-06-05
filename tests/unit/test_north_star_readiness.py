from server.modules.pentest.north_star_readiness import build_north_star_readiness
from server.modules.pentest.orchestrator import _north_star_governance_controls


def test_north_star_readiness_reports_ready_partial_and_gap_capabilities():
    readiness = build_north_star_readiness(
        auth_readiness={"authenticated": True, "status": "ready", "required": True},
        engine_plan=[
            {"engine": "templates", "status": "ready"},
            {"engine": "schemathesis", "status": "ready"},
            {"engine": "nuclei", "status": "ready"},
            {"engine": "zap", "status": "ready"},
            {"engine": "passive", "status": "available"},
        ],
        safety_controls={
            "target_guard": True,
            "state_change_guard": True,
            "destructive_method_arming": True,
        },
        lifecycle_controls={
            "confirmatory_retests": True,
            "ticketing": False,
            "sla_tracking": False,
        },
        evidence_controls={
            "reproducible_redacted_evidence": True,
            "evidence_completeness": True,
            "evidence_completeness_gate": True,
        },
        governance_controls={
            "isolated_workers": True,
            "audit_logs": True,
            "ci_cd_gates": True,
            "strict_policy_packs": True,
            "sarif_junit_artifacts": True,
            "engine_artifact_accountability": True,
            "rbac": True,
            "tenant_isolation": True,
        },
        coverage_controls={
            "bola_bfla": True,
            "business_logic": True,
            "llm_api": False,
            "context_aware_selection": False,
        },
    )

    capabilities = {item["id"]: item for item in readiness["capabilities"]}

    assert readiness["overall_status"] == "partial"
    assert readiness["ready_count"] == 6
    assert readiness["partial_count"] == 1
    assert readiness["gap_count"] == 3
    assert capabilities["continuous_authenticated_workflows"]["status"] == "gap"
    assert capabilities["authenticated_by_default"]["status"] == "ready"
    assert capabilities["multi_engine_execution"]["status"] == "ready"
    assert capabilities["reproducible_evidence_retests"]["status"] == "ready"
    assert "evidence_completeness_gate" in capabilities["reproducible_evidence_retests"]["ready"]
    assert capabilities["lifecycle_sla_ticketing"]["status"] == "partial"
    assert capabilities["context_aware_selection"]["status"] == "gap"
    assert capabilities["llm_api_security"]["status"] == "gap"
    assert "context_aware_selection" in readiness["next_gaps"]
    assert "llm_api_security" in readiness["next_gaps"]
    assert "ticketing" in capabilities["lifecycle_sla_ticketing"]["missing"]


def test_north_star_readiness_reports_continuous_authenticated_workflows():
    readiness = build_north_star_readiness(
        auth_readiness={"authenticated": True, "status": "ready"},
        engine_plan=[{"engine": "templates", "status": "ready"}],
        workflow_controls={
            "scheduled_scans": True,
            "authenticated_schedule_preflight": True,
            "queued_execution": True,
            "schedule_target_guard": True,
        },
    )

    capabilities = {item["id"]: item for item in readiness["capabilities"]}

    assert capabilities["continuous_authenticated_workflows"]["status"] == "ready"
    assert capabilities["continuous_authenticated_workflows"]["missing"] == []


def test_north_star_readiness_reports_partial_context_aware_selection():
    readiness = build_north_star_readiness(
        auth_readiness={"authenticated": True, "status": "ready"},
        engine_plan=[{"engine": "templates", "status": "ready"}],
        coverage_controls={
            "context_aware_selection": False,
            "partial_context_aware_selection": True,
        },
    )

    capability = {
        item["id"]: item
        for item in readiness["capabilities"]
    }["context_aware_selection"]

    assert capability["status"] == "partial"
    assert "some_context_signals_available" in capability["ready"]
    assert "required_context_signals_satisfied" in capability["missing"]


def test_north_star_readiness_reports_p1_workstream_owners_and_evidence_status():
    readiness = build_north_star_readiness(
        auth_readiness={"authenticated": True, "status": "ready"},
        engine_plan=[{"engine": "templates", "status": "ready"}],
        lifecycle_controls={
            "confirmatory_retests": True,
            "ticketing": True,
            "sla_tracking": True,
        },
        governance_controls={
            "ci_cd_gates": True,
            "audit_logs": True,
            "tenant_isolation": True,
        },
        evidence_controls={
            "reproducible_redacted_evidence": True,
            "evidence_completeness": True,
            "evidence_completeness_gate": True,
        },
        coverage_controls={
            "bola_bfla": True,
            "business_logic": False,
            "llm_api": True,
            "context_aware_selection": True,
        },
    )

    workstreams = {item["id"]: item for item in readiness["p1_workstreams"]}

    assert workstreams["multi_identity_bola_bfla"] == {
        "id": "multi_identity_bola_bfla",
        "name": "Multi-Identity BOLA/BFLA",
        "owner": "AuthZ Engineer",
        "priority": "P1",
        "status": "ready",
        "evidence_status": "deterministic",
        "ready_checks": ["bola_bfla"],
        "missing_checks": [],
        "blockers": [],
    }
    assert workstreams["business_logic"]["owner"] == "Advanced Testing"
    assert workstreams["business_logic"]["status"] == "blocked"
    assert workstreams["business_logic"]["evidence_status"] == "missing"
    assert workstreams["business_logic"]["blockers"] == ["business_logic"]
    assert workstreams["llm_api_security"]["evidence_status"] == "deterministic"
    assert workstreams["governance_ui_reports"]["ready_checks"] == [
        "ci_cd_gates",
        "audit_logs",
        "tenant_isolation",
        "sla_tracking",
    ]


def test_north_star_readiness_reports_score_blockers_and_next_actions():
    readiness = build_north_star_readiness(
        auth_readiness={"authenticated": False, "status": "blocked"},
        engine_plan=[
            {"engine": "templates", "status": "ready"},
            {"engine": "schemathesis", "status": "blocked"},
            {"engine": "nuclei", "status": "blocked"},
            {"engine": "zap", "status": "blocked"},
            {"engine": "passive", "status": "available"},
        ],
        safety_controls={
            "target_guard": True,
            "state_change_guard": True,
            "destructive_method_arming": False,
        },
        evidence_controls={
            "reproducible_redacted_evidence": True,
            "evidence_completeness": True,
            "evidence_completeness_gate": False,
        },
        governance_controls={
            "isolated_workers": False,
            "audit_logs": True,
            "ci_cd_gates": True,
            "strict_policy_packs": True,
            "sarif_junit_artifacts": True,
            "engine_artifact_accountability": False,
            "rbac": True,
            "tenant_isolation": True,
        },
    )

    capabilities = {item["id"]: item for item in readiness["capabilities"]}
    blocker_ids = {item["id"] for item in readiness["production_blockers"]}

    assert 0 < readiness["readiness_score"] < 100
    assert readiness["control_counts"]["missing"] > 0
    assert "authenticated_by_default.auth_ready" in blocker_ids
    assert "target_and_destructive_safety.destructive_method_arming" in blocker_ids
    assert "enterprise_governance.engine_artifact_accountability" in blocker_ids
    assert capabilities["enterprise_governance"]["status"] == "partial"
    assert "engine_artifact_accountability" in capabilities["enterprise_governance"]["missing"]
    assert capabilities["enterprise_governance"]["next_action"] == (
        "Require CI gates to verify every ready external engine emits a hashed execution artifact."
    )


def test_orchestrator_governance_controls_include_ci_artifact_accountability(monkeypatch):
    monkeypatch.setattr(
        "server.modules.pentest.orchestrator._configured_worker_isolation_mode",
        lambda: "leased_external_worker",
    )

    controls = _north_star_governance_controls()

    assert controls["isolated_workers"] is True
    assert controls["ci_cd_gates"] is True
    assert controls["strict_policy_packs"] is True
    assert controls["sarif_junit_artifacts"] is True
    assert controls["engine_artifact_accountability"] is True
    assert controls["rbac"] is True
    assert controls["tenant_isolation"] is True
