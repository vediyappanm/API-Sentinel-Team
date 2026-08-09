from __future__ import annotations

import argparse
import asyncio
import copy
import datetime
import json
import os
import re
import socket
import uuid
from dataclasses import dataclass
from urllib.parse import urlunparse

import httpx
from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from server.config import settings
from server.models.core import (
    APIEndpoint,
    AuditLog,
    PentestArtifact,
    SampleData,
    TestAccount,
    TestResult,
    TestRun,
    Vulnerability,
)
from server.modules.identity.authorization_replay import (
    auth_headers_for_account,
    authorization_identity_label,
    authorization_identity_summary,
    build_authorization_replay_evidence,
    build_replay_request,
    classify_authorization_issue,
    evaluate_authorization_replay,
    infer_victim_account,
)
from server.modules.identity.role_keys import authorization_role_key
from server.modules.persistence.database import AsyncSessionLocal
from server.modules.pentest.auth_preflight import (
    ActiveScanAuthError,
    PentestProfileNotFound,
    active_scan_auth_audit_context,
    load_profile_and_auth_for_active_scan,
)
from server.modules.pentest.engine_plan import (
    ENGINE_EXECUTION_ORDER,
    engine_outcome_summaries,
)
from server.modules.pentest.execution_artifacts import (
    persist_execution_artifact,
    verify_execution_artifact_payload,
)
from server.modules.pentest.target_policy import target_guard_policy_for_error
from server.modules.pentest.worker_isolation import (
    cleanup_worker_isolation_session,
    configured_worker_isolation_mode,
    create_worker_isolation_session,
    worker_isolation_enforcement_metadata,
    worker_kubernetes_namespace,
    worker_kubernetes_service_account,
    worker_resource_limits,
)
from server.modules.test_executor.kill_switch import (
    KILL_SWITCH_REASON,
    PentestKillSwitchError,
    ensure_pentest_not_killed,
    kill_switch_enabled,
)
from server.modules.test_executor.scan_plan import verify_scan_plan_integrity
from server.modules.test_executor.state_change_guard import (
    StateChangeBlocked,
    StateChangeGuard,
    state_change_policy_for_request,
)
from server.modules.test_executor.target_guard import TargetGuard, TargetGuardError, endpoint_target_url
from server.modules.test_executor.worker_validation import (
    build_worker_runtime_validation,
    validate_worker_staging_scan_acceptance,
)
from server.modules.utils.redactor import Redactor
from server.modules.vulnerability_detector.lifecycle import (
    is_vulnerability_retest_trigger_source,
    isoformat,
    latest_remediation_retest_integrity,
    retest_outcome_digest,
)
from server.modules.vulnerability_detector.store import create_or_merge_vulnerability

_WORKER_ID_SAFE_CHARS = re.compile(r"[^A-Za-z0-9._:@*=-]+")
_ENGINE_EXECUTION_ARTIFACT_TYPES = {
    "templates": "templates_execution",
    "schemathesis": "schemathesis_execution",
    "nuclei": "nuclei_execution",
    "zap": "zap_execution",
    "passive": "passive_findings",
}
_EXTERNAL_ENGINE_ARTIFACT_TYPES = [
    _ENGINE_EXECUTION_ARTIFACT_TYPES["schemathesis"],
    _ENGINE_EXECUTION_ARTIFACT_TYPES["nuclei"],
    _ENGINE_EXECUTION_ARTIFACT_TYPES["zap"],
]
_EXTERNAL_ENGINE_ARTIFACT_TYPES_BY_ENGINE = {"schemathesis", "nuclei", "zap"}
_SCAN_PLAN_COVERAGE_TARGETS = ("authorization", "business_logic", "llm_api")
_SCAN_PLAN_COVERAGE_STATUSES = {"available", "discovered", "gap", "not_requested", "partial", "ready"}
_SCAN_PLAN_COVERAGE_SIGNALS = {
    "auth_context",
    "body_key",
    "path_hint",
    "private_identifier",
    "role_context",
    "state_changing_method",
    "tool_context",
    "workflow_path",
}
_SCAN_PLAN_COVERAGE_READINESS_KEYS = {
    "auth_context_ready",
    "bfla_replay_testable",
    "bola_replay_testable",
    "private_identifier_context_ready",
    "prompt_context_ready",
    "role_context_ready",
    "state_change_context_ready",
    "tool_abuse_testable",
    "tool_context_ready",
    "workflow_abuse_testable",
    "workflow_context_ready",
}
_BUSINESS_ABUSE_FAMILIES = ("coupon_abuse", "otp_spam", "workflow_bypass", "resource_exhaustion")
_LLM_ACTIVE_FAMILIES = (
    "prompt_injection",
    "rag_exfiltration",
    "indirect_prompt_injection",
    "dangerous_tool_invocation",
    "privilege_escalating_tool_invocation",
    "tool_chain_injection",
)
_ACTIVE_TEST_FAMILIES = _BUSINESS_ABUSE_FAMILIES + _LLM_ACTIVE_FAMILIES
_BUSINESS_ABUSE_FAMILY_STATUSES = {"ready", "missing_template", "missing_endpoint_context"}
_ACTIVE_TEST_FAMILY_SIGNALS = {
    "bulk",
    "body_key",
    "captcha",
    "cart",
    "checkout",
    "coupon",
    "discount",
    "export",
    "invoice",
    "mfa",
    "order",
    "otp",
    "path_hint",
    "payment",
    "promo",
    "referral",
    "retrieval_context",
    "search",
    "subscription",
    "tool_invocation_context",
    "tool_output_context",
    "upload",
    "untrusted_context",
    "verification",
}
_AUTHORIZATION_REPLAY_ENGINE = "authorization_replay"
_AUTHORIZATION_REPLAY_TEMPLATE_ID = "AUTHORIZATION_REPLAY_MATRIX"


@dataclass(frozen=True)
class ClaimedScanRun:
    run_id: str
    template_ids: list[str]
    endpoint_ids: list[str]
    account_id: int
    test_intensity: str | None = None
    scan_plan: dict[str, object] | None = None
    pentest_profile_id: str | None = None
    trigger_source: str | None = None
    source_vulnerability_id: str | None = None
    source_schedule_id: str | None = None
    auth_context: dict[str, object] | None = None
    engine_accountability: dict[str, object] | None = None
    worker_id: str | None = None
    lease_expires_at: datetime.datetime | None = None
    claim_count: int = 0


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


def _lease_seconds() -> int:
    return max(1, int(settings.PENTEST_SCAN_DISPATCH_LEASE_SECONDS))


def _max_claims() -> int:
    return max(1, int(getattr(settings, "PENTEST_SCAN_MAX_CLAIMS", 3)))


def _worker_governance_policy(account_id: int | None) -> dict[str, object]:
    isolation_mode = configured_worker_isolation_mode()
    return {
        "lease_seconds": _lease_seconds(),
        "max_claims": _max_claims(),
        "tenant_scoped": account_id is not None,
        "kill_switch_enforced": True,
        "isolation_mode": isolation_mode,
        "per_run_worker_required": True,
        "kubernetes_job_ready": isolation_mode == "kubernetes_job",
        "kubernetes_namespace": worker_kubernetes_namespace(),
        "kubernetes_service_account": worker_kubernetes_service_account(),
        "resource_limits_required": True,
        "resource_limits": worker_resource_limits(),
    }


def _engine_accountability_policy() -> dict[str, object]:
    return {
        "isolation_model": "leased_external_worker",
        "lease_required": True,
        "worker_identity_required": True,
        "worker_isolation_manifest_required": True,
        "sandbox_cleanup_required": True,
        "artifact_hash_required": True,
        "artifact_verification_required": True,
        "redacted_evidence_required": True,
        "secret_values_persisted": False,
        "external_engine_artifact_types": list(_EXTERNAL_ENGINE_ARTIFACT_TYPES),
    }


def _scan_plan_claim_summary(scan_plan: dict | None) -> dict[str, object]:
    if not isinstance(scan_plan, dict):
        return {}
    selection = scan_plan.get("selection") if isinstance(scan_plan.get("selection"), dict) else {}
    context = scan_plan.get("context") if isinstance(scan_plan.get("context"), dict) else {}
    summary = {
        "schema_version": scan_plan.get("schema_version"),
        "hash_algorithm": scan_plan.get("hash_algorithm"),
        "scan_plan_hash": scan_plan.get("scan_plan_hash"),
        "scan_plan_integrity": _scan_plan_integrity_summary(scan_plan),
        "test_intensity": scan_plan.get("test_intensity"),
        "selected_pair_count": int(selection.get("selected_pair_count") or 0),
        "skipped_pair_count": int(selection.get("skipped_pair_count") or 0),
        "requested_pair_count": int(selection.get("template_endpoint_pair_count") or 0),
        "context_status": context.get("status"),
        "selection_starved": bool(selection.get("selection_starved")),
    }
    coverage_targets = _scan_plan_coverage_targets_summary(scan_plan.get("coverage_targets"))
    if coverage_targets:
        summary["coverage_targets"] = coverage_targets
    return summary


def _claimed_scan_plan_handoff(scan_plan: dict | None) -> dict[str, object] | None:
    if not isinstance(scan_plan, dict):
        return None
    safe_plan = dict(scan_plan)
    safe_plan["scan_plan_integrity"] = _scan_plan_integrity_summary(scan_plan)
    return safe_plan


def _scan_plan_integrity_summary(scan_plan: dict[str, object]) -> dict[str, object]:
    integrity = verify_scan_plan_integrity(scan_plan)
    return {
        "verified": bool(integrity.get("verified")),
        "status": str(integrity.get("status") or "MISMATCH"),
        "hash_algorithm": integrity.get("hash_algorithm"),
        "expected_hash": integrity.get("expected_hash"),
        "actual_hash": integrity.get("actual_hash"),
    }


def _claim_scan_plan_with_integrity(scan_plan: dict | None) -> dict[str, object] | None:
    if not isinstance(scan_plan, dict):
        return scan_plan
    claimed_scan_plan = copy.deepcopy(scan_plan)
    claimed_scan_plan["scan_plan_integrity"] = _scan_plan_integrity_summary(claimed_scan_plan)
    return claimed_scan_plan


def _scan_plan_coverage_targets_summary(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    summary: dict[str, object] = {}
    for target in _SCAN_PLAN_COVERAGE_TARGETS:
        raw_target = value.get(target)
        if not isinstance(raw_target, dict):
            continue
        status = str(raw_target.get("status") or "not_requested")
        if status not in _SCAN_PLAN_COVERAGE_STATUSES:
            status = "gap"
        signals = [
            signal
            for signal in sorted(str(item) for item in (raw_target.get("signals") or []))
            if signal in _SCAN_PLAN_COVERAGE_SIGNALS
        ]
        target_summary: dict[str, object] = {
            "template_requested": bool(raw_target.get("template_requested")),
            "template_covered": bool(raw_target.get("template_covered")),
            "endpoint_signal_count": _safe_nonnegative_int(raw_target.get("endpoint_signal_count")),
            "status": status,
            "signals": signals,
        }
        identity_context = _scan_plan_identity_context_summary(raw_target.get("identity_context"))
        if identity_context:
            target_summary["identity_context"] = identity_context
        readiness = _scan_plan_readiness_summary(raw_target.get("readiness"))
        if readiness:
            target_summary["readiness"] = readiness
        active_families = _scan_plan_active_test_families_summary(
            raw_target.get("active_test_families")
        )
        if active_families:
            target_summary["active_test_families"] = active_families
        summary[target] = target_summary
    return summary


def _scan_plan_active_test_families_summary(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    summary: dict[str, object] = {}
    for family in _ACTIVE_TEST_FAMILIES:
        raw_family = value.get(family)
        if not isinstance(raw_family, dict):
            continue
        status = str(raw_family.get("status") or "")
        if status not in _BUSINESS_ABUSE_FAMILY_STATUSES:
            status = (
                "ready"
                if bool(raw_family.get("ready"))
                else "missing_template"
                if _safe_nonnegative_int(raw_family.get("template_count")) == 0
                else "missing_endpoint_context"
            )
        signals = [
            signal
            for signal in sorted(str(item) for item in (raw_family.get("signals") or []))
            if signal in _ACTIVE_TEST_FAMILY_SIGNALS
        ]
        summary[family] = {
            "template_count": _safe_nonnegative_int(raw_family.get("template_count")),
            "endpoint_signal_count": _safe_nonnegative_int(raw_family.get("endpoint_signal_count")),
            "ready": bool(raw_family.get("ready")),
            "status": status,
            "signals": signals,
        }
    return summary


def _scan_plan_readiness_summary(value: object) -> dict[str, bool]:
    if not isinstance(value, dict):
        return {}
    return {
        key: bool(value.get(key))
        for key in sorted(_SCAN_PLAN_COVERAGE_READINESS_KEYS)
        if key in value
    }


def _scan_plan_identity_context_summary(value: object) -> dict[str, object]:
    if not isinstance(value, dict):
        return {}
    return {
        "role_count": _safe_nonnegative_int(value.get("role_count")),
        "multi_identity_ready": bool(value.get("multi_identity_ready")),
        "privileged_role_present": bool(value.get("privileged_role_present")),
        "low_privilege_role_present": bool(value.get("low_privilege_role_present")),
        "privilege_boundary_pair_count": _safe_nonnegative_int(value.get("privilege_boundary_pair_count")),
    }


def _safe_nonnegative_int(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _scan_plan_engine_plan(scan_plan: dict | None) -> list[dict[str, object]]:
    if not isinstance(scan_plan, dict):
        return []
    engine_plan = scan_plan.get("engine_plan")
    if not isinstance(engine_plan, list):
        return []
    return [item for item in engine_plan if isinstance(item, dict)]


def _default_worker_engine_plan(
    *,
    template_ids: list[str] | None,
    endpoint_ids: list[str] | None,
) -> list[dict[str, object]]:
    if template_ids and endpoint_ids:
        return [
            {
                "engine": "templates",
                "status": "ready",
                "reason": "template_run_claimed",
            }
        ]
    return []


def _worker_engine_accountability(
    *,
    scan_plan: dict | None,
    template_ids: list[str] | None,
    endpoint_ids: list[str] | None,
) -> dict[str, object]:
    raw_engine_plan = _scan_plan_engine_plan(scan_plan)
    engine_plan_present = bool(raw_engine_plan)
    if not raw_engine_plan:
        raw_engine_plan = _default_worker_engine_plan(
            template_ids=template_ids,
            endpoint_ids=endpoint_ids,
        )

    safe_engine_plan = Redactor.redact_json(raw_engine_plan)
    if not isinstance(safe_engine_plan, list):
        safe_engine_plan = []
    entries = {
        str(item.get("engine")): item
        for item in safe_engine_plan
        if isinstance(item, dict) and str(item.get("engine")) in ENGINE_EXECUTION_ORDER
    }

    ready_active_engines = [
        engine
        for engine in ENGINE_EXECUTION_ORDER
        if engine != "passive" and entries.get(engine, {}).get("status") == "ready"
    ]
    blocked_engines = [
        engine
        for engine in ENGINE_EXECUTION_ORDER
        if entries.get(engine, {}).get("status") == "blocked"
    ]
    disabled_engines = [
        engine
        for engine in ENGINE_EXECUTION_ORDER
        if entries.get(engine, {}).get("status") == "disabled"
    ]
    continuous_engines = [
        engine
        for engine in ENGINE_EXECUTION_ORDER
        if entries.get(engine, {}).get("status") in {"available", "continuous"}
    ]
    claim_execution_engines = [
        engine for engine in ready_active_engines if engine == "templates"
    ]
    required_artifacts = [
        {
            "engine": engine,
            "artifact_type": _ENGINE_EXECUTION_ARTIFACT_TYPES[engine],
            "hash_required": True,
            "verification_required": True,
        }
        for engine in claim_execution_engines
        if engine in _ENGINE_EXECUTION_ARTIFACT_TYPES
    ]
    planned_external_artifacts = [
        {
            "engine": engine,
            "artifact_type": _ENGINE_EXECUTION_ARTIFACT_TYPES[engine],
            "hash_required": True,
            "verification_required": True,
            "produced_by_this_worker": False,
        }
        for engine in ready_active_engines
        if engine not in claim_execution_engines and engine in _EXTERNAL_ENGINE_ARTIFACT_TYPES_BY_ENGINE
    ]

    return {
        **_engine_accountability_policy(),
        "scan_plan_engine_plan_present": engine_plan_present,
        "template_count": len(template_ids or []),
        "endpoint_count": len(endpoint_ids or []),
        "execution_order": list(ENGINE_EXECUTION_ORDER),
        "claim_execution_engines": claim_execution_engines,
        "required_artifacts": required_artifacts,
        "planned_external_artifacts": planned_external_artifacts,
        "ready_active_engines": ready_active_engines,
        "continuous_engines": continuous_engines,
        "blocked_engines": blocked_engines,
        "disabled_engines": disabled_engines,
        "ready_engine_count": len(ready_active_engines),
        "blocked_engine_count": len(blocked_engines),
        "disabled_engine_count": len(disabled_engines),
        "engine_outcomes": engine_outcome_summaries(safe_engine_plan),
    }


def _lease_expires_at(now: datetime.datetime) -> datetime.datetime:
    return now + datetime.timedelta(seconds=_lease_seconds())


def normalize_worker_id(worker_id: str | None) -> str | None:
    """Return a redacted, bounded worker identifier safe for persistence and audit logs."""
    if worker_id is None:
        return None
    normalized = Redactor.redact_text(str(worker_id)).strip()
    normalized = _WORKER_ID_SAFE_CHARS.sub("-", normalized).strip("-")
    if not normalized:
        return None
    return normalized[:100]


def _worker_identity(worker_id: str | None = None) -> str:
    normalized = normalize_worker_id(worker_id)
    if normalized:
        return normalized
    generated = f"{socket.gethostname()}-{uuid.uuid4()}"
    return normalize_worker_id(generated) or str(uuid.uuid4())


async def _claimed_run_auth_context(db, run: TestRun) -> dict[str, object]:
    base: dict[str, object] = {
        "pentest_profile_id": run.pentest_profile_id,
    }
    if not run.pentest_profile_id:
        return {
            **base,
            "auth_resolution_status": "not_bound",
            **active_scan_auth_audit_context(None, None),
        }
    try:
        profile, auth_profile = await load_profile_and_auth_for_active_scan(
            db,
            account_id=int(run.account_id),
            pentest_profile_id=run.pentest_profile_id,
        )
    except (PentestProfileNotFound, ActiveScanAuthError) as exc:
        return {
            **base,
            "auth_resolution_status": "failed",
            "auth_resolution_reason": getattr(exc, "reason", "pentest_profile_not_found"),
            **active_scan_auth_audit_context(None, None),
        }
    return {
        **base,
        "auth_resolution_status": "resolved",
        **active_scan_auth_audit_context(profile, auth_profile),
    }


def _claimable_filter(now: datetime.datetime, account_id: int | None = None):
    stale_before = now - datetime.timedelta(seconds=_lease_seconds())
    claimable_status = or_(
        TestRun.status == "PENDING",
        and_(
            TestRun.status == "DISPATCHED",
            or_(
                TestRun.dispatch_lease_expires_at < now,
                and_(
                    TestRun.dispatch_lease_expires_at.is_(None),
                    or_(TestRun.started_at.is_(None), TestRun.started_at < stale_before),
                ),
            ),
        ),
        and_(
            TestRun.status == "RUNNING",
            TestRun.worker_id.is_not(None),
            TestRun.dispatch_lease_expires_at < now,
        ),
    )
    if account_id is None:
        return claimable_status
    return and_(claimable_status, TestRun.account_id == account_id)


async def _record_dead_letter_retest_outcome(
    db,
    *,
    run: TestRun,
    now: datetime.datetime,
    reason: str,
) -> None:
    if not is_vulnerability_retest_trigger_source(run.trigger_source) or not run.source_vulnerability_id:
        return

    vulnerability = (
        await db.execute(
            select(Vulnerability).where(
                and_(
                    Vulnerability.id == run.source_vulnerability_id,
                    Vulnerability.account_id == run.account_id,
                )
            )
        )
    ).scalar_one_or_none()
    if vulnerability is None:
        return

    retest = {
        "run_id": run.id,
        "status": "FAILED",
        "outcome": "FAILED",
        "completed_at": isoformat(now),
        "executed": 0,
        "vulnerable": 0,
        "errors": 1,
        "skipped": 0,
        "reason": reason,
    }
    retest["hash_algorithm"] = "sha256"
    retest["retest_hash"] = retest_outcome_digest(retest)

    evidence = dict(vulnerability.evidence or {})
    previous_retests = evidence.get("remediation_retests")
    if not isinstance(previous_retests, list):
        previous_retests = []
    evidence["remediation_retests"] = (previous_retests + [retest])[-10:]
    evidence["latest_remediation_retest"] = retest
    vulnerability.evidence = evidence

    db.add(
        AuditLog(
            account_id=int(run.account_id),
            action="VULNERABILITY_RETEST_COMPLETED",
            resource_type="vulnerability",
            resource_id=vulnerability.id,
            details={
                "run_id": run.id,
                "status": "FAILED",
                "outcome": "FAILED",
                "previous_status": vulnerability.status,
                "new_status": vulnerability.status,
                "executed": 0,
                "vulnerable": 0,
                "errors": 1,
                "skipped": 0,
                "reason": reason,
                "hash_algorithm": retest["hash_algorithm"],
                "retest_hash": retest["retest_hash"],
                "retest_integrity": latest_remediation_retest_integrity(evidence),
            },
        )
    )


def _worker_run_timeout_seconds(isolation_session_timeout: int | None = None) -> int:
    """Scan-run wall clock budget; lease seconds is the authoritative upper bound."""
    lease_budget = _lease_seconds()
    configured = int(getattr(settings, "PENTEST_SCAN_WORKER_TIMEOUT_SECONDS", 0) or 0)
    if configured > 0:
        return max(1, min(configured, lease_budget))
    isolation_budget = int(isolation_session_timeout or 0)
    if isolation_budget > 15:
        return max(1, min(isolation_budget, lease_budget))
    return lease_budget


def _redacted_worker_failure_context(
    *,
    run_id: str,
    worker_id: str | None,
    reason: str,
    previous_status: str | None = None,
    worker_isolation: dict[str, object] | None = None,
    engine: str | None = None,
    extra: dict[str, object] | None = None,
) -> dict[str, object]:
    details: dict[str, object] = {
        "run_id": Redactor.redact_text(run_id),
        "worker_id": normalize_worker_id(worker_id),
        "reason": Redactor.redact_text(reason),
    }
    if previous_status:
        details["previous_status"] = previous_status
    if engine:
        details["engine"] = Redactor.redact_text(engine)
    if worker_isolation:
        details["worker_isolation"] = Redactor.redact_json(worker_isolation)
    if extra:
        details.update(Redactor.redact_json(extra) if isinstance(extra, dict) else {"extra": str(extra)})
    return details


async def _mark_claimed_run_failed(
    *,
    db_bind: AsyncEngine | None,
    run_id: str,
    account_id: int,
    worker_id: str | None,
    reason: str,
    action: str = "SCAN_RUN_FAILED",
    worker_isolation: dict[str, object] | None = None,
    engine: str | None = None,
) -> None:
    session_factory = AsyncSessionLocal if db_bind is None else async_sessionmaker(
        bind=db_bind,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    async with session_factory() as db:
        run = (
            await db.execute(
                select(TestRun).where(
                    TestRun.id == run_id,
                    TestRun.account_id == account_id,
                )
            )
        ).scalar_one_or_none()
        if run is None:
            return
        if run.status in {"COMPLETED", "FAILED", "CANCELED"}:
            return
        previous_status = run.status
        now = _utc_now()
        run.status = "FAILED"
        run.completed_at = now
        run.error_count = max(1, int(run.error_count or 0))
        run.dispatch_lease_expires_at = None
        db.add(
            AuditLog(
                account_id=int(run.account_id),
                action=action,
                resource_type="test_run",
                resource_id=run.id,
                details=_redacted_worker_failure_context(
                    run_id=run.id,
                    worker_id=worker_id or run.worker_id,
                    reason=reason,
                    previous_status=previous_status,
                    worker_isolation=worker_isolation,
                    engine=engine,
                ),
            )
        )
        await db.commit()


async def _dead_letter_exhausted_claims(db, *, now: datetime.datetime, account_id: int | None) -> int:
    """Fail claimable runs that have exceeded the worker retry budget."""
    max_claims = _max_claims()
    exhausted_filter = and_(
        _claimable_filter(now, account_id),
        func.coalesce(TestRun.claim_count, 0) >= max_claims,
    )
    result = await db.execute(
        select(TestRun)
        .where(exhausted_filter)
        .order_by(TestRun.created_at.asc())
        .limit(50)
    )
    exhausted_runs = result.scalars().all()
    if not exhausted_runs:
        return 0

    for run in exhausted_runs:
        previous_status = run.status
        reason = "worker_claim_limit_exceeded"
        run.worker_id = normalize_worker_id(run.worker_id)
        run.status = "FAILED"
        run.completed_at = now
        run.error_count = max(1, int(run.error_count or 0))
        run.dispatch_lease_expires_at = None
        await _record_dead_letter_retest_outcome(db, run=run, now=now, reason=reason)
        db.add(
            AuditLog(
                account_id=int(run.account_id),
                action="SCAN_RUN_DEAD_LETTERED",
                resource_type="test_run",
                resource_id=run.id,
                details=_redacted_worker_failure_context(
                    run_id=run.id,
                    worker_id=run.worker_id,
                    reason=reason,
                    previous_status=previous_status,
                    extra={
                        "claim_count": int(run.claim_count or 0),
                        "max_claims": max_claims,
                        "trigger_source": run.trigger_source,
                        "source_vulnerability_id": run.source_vulnerability_id,
                        "source_schedule_id": run.source_schedule_id,
                    },
                ),
            )
        )
    await db.flush()
    return len(exhausted_runs)


async def claim_next_pending_run(
    *,
    db_bind: AsyncEngine | None = None,
    account_id: int | None = None,
    worker_id: str | None = None,
) -> ClaimedScanRun | None:
    """Atomically claim one queued scan run for external worker execution."""
    if kill_switch_enabled():
        return None

    session_factory = AsyncSessionLocal if db_bind is None else async_sessionmaker(
        bind=db_bind,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )

    async with session_factory() as db:
        now = _utc_now()
        lease_expires = _lease_expires_at(now)
        worker_identity = _worker_identity(worker_id)
        dead_lettered = await _dead_letter_exhausted_claims(db, now=now, account_id=account_id)
        if dead_lettered:
            await db.commit()
        claimable = and_(
            _claimable_filter(now, account_id),
            func.coalesce(TestRun.claim_count, 0) < _max_claims(),
        )
        result = await db.execute(
            select(TestRun)
            .where(claimable)
            .order_by(TestRun.created_at.asc())
            .limit(1)
        )
        run = result.scalar_one_or_none()
        if run is None:
            return None

        update_result = await db.execute(
            update(TestRun)
            .where(and_(TestRun.id == run.id, claimable))
            .values(
                status="DISPATCHED",
                started_at=now,
                worker_id=worker_identity,
                dispatch_lease_expires_at=lease_expires,
                worker_heartbeat_at=now,
                claim_count=func.coalesce(TestRun.claim_count, 0) + 1,
            )
            .execution_options(synchronize_session=False)
        )
        if update_result.rowcount != 1:
            await db.rollback()
            return None

        next_claim_count = int(run.claim_count or 0) + 1
        auth_context = await _claimed_run_auth_context(db, run)
        template_ids = list(run.template_ids or [])
        endpoint_ids = list(run.endpoint_ids or [])
        scan_plan = _claim_scan_plan_with_integrity(getattr(run, "scan_plan", None))
        engine_accountability = _worker_engine_accountability(
            scan_plan=scan_plan,
            template_ids=template_ids,
            endpoint_ids=endpoint_ids,
        )
        previous_status = run.status
        reclaim = previous_status in {"DISPATCHED", "RUNNING"}
        claim_details = {
            "run_id": run.id,
            "worker_id": worker_identity,
            "lease_expires_at": isoformat(lease_expires),
            "claim_count": next_claim_count,
            "previous_status": previous_status,
            "previous_worker_id": normalize_worker_id(run.worker_id) if reclaim else None,
            "reclaimed": reclaim,
            "trigger_source": run.trigger_source,
            "source_vulnerability_id": run.source_vulnerability_id,
            "source_schedule_id": run.source_schedule_id,
            **auth_context,
            "template_count": len(template_ids),
            "endpoint_count": len(endpoint_ids),
            "test_intensity": getattr(run, "test_intensity", None),
            "scan_plan": _scan_plan_claim_summary(scan_plan),
            "worker_governance": _worker_governance_policy(account_id),
            "engine_accountability": engine_accountability,
        }
        db.add(
            AuditLog(
                account_id=int(run.account_id),
                action="SCAN_RUN_CLAIMED",
                resource_type="test_run",
                resource_id=run.id,
                details=claim_details,
            )
        )
        if reclaim:
            db.add(
                AuditLog(
                    account_id=int(run.account_id),
                    action="SCAN_RUN_WORKER_LOST",
                    resource_type="test_run",
                    resource_id=run.id,
                    details={
                        "run_id": run.id,
                        "previous_status": previous_status,
                        "previous_worker_id": normalize_worker_id(run.worker_id),
                        "new_worker_id": worker_identity,
                        "claim_count": next_claim_count,
                        "reason": "lease_expired_or_stale_worker",
                    },
                )
            )
        await db.commit()
        return ClaimedScanRun(
            run_id=run.id,
            template_ids=template_ids,
            endpoint_ids=endpoint_ids,
            account_id=int(run.account_id),
            test_intensity=getattr(run, "test_intensity", None),
            scan_plan=_claimed_scan_plan_handoff(scan_plan),
            pentest_profile_id=run.pentest_profile_id,
            trigger_source=run.trigger_source,
            source_vulnerability_id=run.source_vulnerability_id,
            source_schedule_id=run.source_schedule_id,
            auth_context=auth_context,
            engine_accountability=engine_accountability,
            worker_id=worker_identity,
            lease_expires_at=lease_expires,
            claim_count=next_claim_count,
        )


async def heartbeat_claimed_run(
    run_id: str,
    worker_id: str,
    *,
    db_bind: AsyncEngine | None = None,
    account_id: int | None = None,
) -> bool:
    """Refresh the lease for a run still owned by the same worker."""
    session_factory = AsyncSessionLocal if db_bind is None else async_sessionmaker(
        bind=db_bind,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    async with session_factory() as db:
        now = _utc_now()
        normalized_worker_id = _worker_identity(worker_id)
        filters = [
            TestRun.id == run_id,
            TestRun.worker_id == normalized_worker_id,
            TestRun.status.in_(["DISPATCHED", "RUNNING"]),
            TestRun.dispatch_lease_expires_at >= now,
        ]
        if account_id is not None:
            filters.append(TestRun.account_id == account_id)
        run = (
            await db.execute(
                select(TestRun)
                .where(and_(*filters))
                .limit(1)
            )
        ).scalar_one_or_none()
        if run is None:
            return False
        previous_lease_expires_at = run.dispatch_lease_expires_at
        previous_heartbeat_at = run.worker_heartbeat_at
        lease_expires_at = _lease_expires_at(now)
        result = await db.execute(
            update(TestRun)
            .where(and_(*filters))
            .values(
                worker_heartbeat_at=now,
                dispatch_lease_expires_at=lease_expires_at,
            )
            .execution_options(synchronize_session=False)
        )
        if result.rowcount == 1:
            db.add(
                AuditLog(
                    account_id=int(run.account_id),
                    action="SCAN_RUN_HEARTBEAT",
                    resource_type="test_run",
                    resource_id=run.id,
                    details={
                        "worker_id": normalized_worker_id,
                        "status": run.status,
                        "claim_count": int(run.claim_count or 0),
                        "heartbeat_at": isoformat(now),
                        "previous_heartbeat_at": isoformat(previous_heartbeat_at),
                        "lease_expires_at": isoformat(lease_expires_at),
                        "previous_lease_expires_at": isoformat(previous_lease_expires_at),
                        "lease_seconds": _lease_seconds(),
                    },
                )
            )
        await db.commit()
        return result.rowcount == 1


async def worker_queue_health(db, *, account_id: int) -> dict[str, object]:
    """Return tenant-scoped queue and lease health for operators."""
    now = _utc_now()
    max_claims = _max_claims()
    result = await db.execute(select(TestRun).where(TestRun.account_id == account_id))
    runs = result.scalars().all()
    pending = [run for run in runs if str(run.status or "").upper() == "PENDING"]
    dispatched = [run for run in runs if str(run.status or "").upper() == "DISPATCHED"]
    running = [run for run in runs if str(run.status or "").upper() == "RUNNING"]
    active = dispatched + running
    failed = [run for run in runs if str(run.status or "").upper() == "FAILED"]
    expired_active = [run for run in active if _lease_expired(run, now)]

    oldest_pending_age_seconds = None
    pending_created = [_as_aware_utc(getattr(run, "created_at", None)) for run in pending]
    pending_created = [created_at for created_at in pending_created if created_at is not None]
    if pending_created:
        oldest_pending_age_seconds = max(0, int((now - min(pending_created)).total_seconds()))

    oldest_expired_lease_age_seconds = None
    expired_lease_times = [
        _as_aware_utc(getattr(run, "dispatch_lease_expires_at", None)) for run in expired_active
    ]
    expired_lease_times = [expires_at for expires_at in expired_lease_times if expires_at is not None]
    if expired_lease_times:
        oldest_expired_lease_age_seconds = max(0, int((now - min(expired_lease_times)).total_seconds()))

    reclaimable_runs = [
        run
        for run in expired_active
        if _is_claimable_run(run, now) and int(run.claim_count or 0) < max_claims
    ]
    dead_letter_ready_runs = [
        run
        for run in runs
        if _is_claimable_run(run, now) and int(run.claim_count or 0) >= max_claims
    ]

    health = {
        "pending_count": len(pending),
        "dispatched_count": len(dispatched),
        "running_count": len(running),
        "active_count": len(active),
        "expired_lease_count": len(expired_active),
        "reclaimable_count": len(reclaimable_runs),
        "dead_letter_ready_count": len(dead_letter_ready_runs),
        "dead_letter_count": sum(1 for run in failed if int(run.error_count or 0) > 0),
        "exhausted_claim_count": sum(1 for run in runs if int(run.claim_count or 0) >= max_claims),
        "oldest_pending_age_seconds": oldest_pending_age_seconds,
        "oldest_expired_lease_age_seconds": oldest_expired_lease_age_seconds,
        "reclaimable_runs": _worker_health_run_samples(reclaimable_runs, now=now, max_claims=max_claims),
        "dead_letter_ready_runs": _worker_health_run_samples(
            dead_letter_ready_runs,
            now=now,
            max_claims=max_claims,
        ),
        "kill_switch_paused": kill_switch_enabled(),
        "lease_seconds": _lease_seconds(),
        "max_claims": max_claims,
        "worker_governance": _worker_governance_policy(account_id),
        "engine_accountability_policy": _engine_accountability_policy(),
    }
    health["runtime_validation"] = build_worker_runtime_validation(queue_health=health)
    return health


def _is_claimable_run(run: TestRun, now: datetime.datetime) -> bool:
    status = str(getattr(run, "status", "") or "").upper()
    if status == "PENDING":
        return True
    if status == "DISPATCHED":
        lease_expires_at = _as_aware_utc(getattr(run, "dispatch_lease_expires_at", None))
        if lease_expires_at is not None:
            return lease_expires_at < now
        stale_before = now - datetime.timedelta(seconds=_lease_seconds())
        started_at = _as_aware_utc(getattr(run, "started_at", None))
        return started_at is None or started_at < stale_before
    if status == "RUNNING":
        return getattr(run, "worker_id", None) is not None and _lease_expired(run, now)
    return False


def _worker_health_run_samples(
    runs: list[TestRun],
    *,
    now: datetime.datetime,
    max_claims: int,
) -> list[dict[str, object]]:
    sorted_runs = sorted(
        runs,
        key=lambda run: (
            _as_aware_utc(getattr(run, "dispatch_lease_expires_at", None)) or now,
            str(getattr(run, "id", "") or ""),
        ),
    )
    return [
        _worker_health_run_sample(run, now=now, max_claims=max_claims)
        for run in sorted_runs[:25]
    ]


def _worker_health_run_sample(
    run: TestRun,
    *,
    now: datetime.datetime,
    max_claims: int,
) -> dict[str, object]:
    lease_expires_at = _as_aware_utc(getattr(run, "dispatch_lease_expires_at", None))
    seconds_since_lease_expired = None
    if lease_expires_at is not None and lease_expires_at < now:
        seconds_since_lease_expired = max(0, int((now - lease_expires_at).total_seconds()))
    sample = {
        "run_id": Redactor.redact_text(str(getattr(run, "id", "") or "")),
        "status": str(getattr(run, "status", "") or "").upper(),
        "worker_id": normalize_worker_id(getattr(run, "worker_id", None)),
        "claim_count": int(getattr(run, "claim_count", None) or 0),
        "max_claims": max_claims,
        "lease_expires_at": isoformat(lease_expires_at),
        "seconds_since_lease_expired": seconds_since_lease_expired,
        "trigger_source": Redactor.redact_text(str(getattr(run, "trigger_source", "") or "")),
        "source_vulnerability_id": Redactor.redact_text(str(getattr(run, "source_vulnerability_id", "") or "")),
        "source_schedule_id": Redactor.redact_text(str(getattr(run, "source_schedule_id", "") or "")),
        "template_count": len(getattr(run, "template_ids", None) or []),
        "endpoint_count": len(getattr(run, "endpoint_ids", None) or []),
    }
    return {
        key: value
        for key, value in sample.items()
        if value not in (None, "")
    }


def _lease_expired(run: TestRun, now: datetime.datetime) -> bool:
    lease_expires_at = _as_aware_utc(getattr(run, "dispatch_lease_expires_at", None))
    return lease_expires_at is not None and lease_expires_at < now


def _as_aware_utc(value: datetime.datetime | None) -> datetime.datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)


def _claimed_run_requests_authorization_replay(claimed: ClaimedScanRun) -> bool:
    engine_plan = _scan_plan_engine_plan(claimed.scan_plan)
    if any(
        str(item.get("engine")) == _AUTHORIZATION_REPLAY_ENGINE
        and str(item.get("status") or "").lower() == "ready"
        for item in engine_plan
    ):
        return True
    return any(str(template_id) == _AUTHORIZATION_REPLAY_TEMPLATE_ID for template_id in claimed.template_ids)


def _authorization_replay_options(scan_plan: dict[str, object] | None) -> dict[str, object]:
    raw_options = {}
    if isinstance(scan_plan, dict) and isinstance(scan_plan.get(_AUTHORIZATION_REPLAY_ENGINE), dict):
        raw_options = scan_plan[_AUTHORIZATION_REPLAY_ENGINE]

    return {
        "allow_state_change": bool(raw_options.get("allow_state_change", False)),
        "require_response_similarity": bool(raw_options.get("require_response_similarity", True)),
        "body_similarity_threshold": _safe_float(raw_options.get("body_similarity_threshold"), 70.0),
        "schema_similarity_threshold": _safe_float(raw_options.get("schema_similarity_threshold"), 70.0),
    }


def _safe_float(value: object, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _http_content(body: object) -> str | bytes | None:
    if body in (None, ""):
        return None
    if isinstance(body, (str, bytes)):
        return body
    return json.dumps(body, sort_keys=True, separators=(",", ":"), default=str)


def _authorization_replay_template_id(issue_type: str | None, victim: TestAccount | None, attacker: TestAccount) -> str:
    victim_role = authorization_role_key(victim) or "UNKNOWN"
    attacker_role = authorization_role_key(attacker) or "UNKNOWN"
    return f"{issue_type or 'AUTHZ'}_AUTHZ_REPLAY_{victim_role}_TO_{attacker_role}"[:100]


async def _load_authorization_replay_endpoint_and_sample(
    db,
    *,
    account_id: int,
    endpoint_id: str,
) -> tuple[APIEndpoint, SampleData]:
    endpoint = (
        await db.execute(
            select(APIEndpoint).where(
                APIEndpoint.id == endpoint_id,
                APIEndpoint.account_id == account_id,
            )
        )
    ).scalar_one_or_none()
    if endpoint is None:
        raise ValueError("authorization_replay_endpoint_not_found")

    sample = (
        await db.execute(
            select(SampleData)
            .where(
                SampleData.endpoint_id == endpoint_id,
                SampleData.account_id == account_id,
            )
            .order_by(SampleData.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if sample is None:
        raise ValueError("authorization_replay_sample_missing")
    return endpoint, sample


async def _authorization_replay_accounts(db, *, account_id: int) -> tuple[list[TestAccount], list[TestAccount]]:
    result = await db.execute(
        select(TestAccount)
        .where(TestAccount.account_id == account_id)
        .order_by(TestAccount.created_at.asc())
    )
    all_accounts = result.scalars().all()
    return all_accounts, [account for account in all_accounts if auth_headers_for_account(account)]


async def _execute_authorization_replay_claimed_run(
    claimed: ClaimedScanRun,
    *,
    db_bind: AsyncEngine | None,
    worker_isolation: dict[str, object] | None = None,
    worker_isolation_context: dict[str, object] | None = None,
) -> dict[str, object]:
    session_factory = AsyncSessionLocal if db_bind is None else async_sessionmaker(
        bind=db_bind,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )

    async with session_factory() as db:
        run = (
            await db.execute(
                select(TestRun).where(
                    TestRun.id == claimed.run_id,
                    TestRun.account_id == claimed.account_id,
                    TestRun.worker_id == claimed.worker_id,
                    TestRun.status.in_(["DISPATCHED", "RUNNING"]),
                )
            )
        ).scalar_one_or_none()
        if run is None:
            return {"status": "aborted", "reason": "worker_claim_lost", "run_id": claimed.run_id}

        now = _utc_now()
        run.status = "RUNNING"
        run.worker_heartbeat_at = now
        options = _authorization_replay_options(claimed.scan_plan)
        execution_results: list[dict[str, object]] = []
        executed = 0
        vulnerable = 0
        errors = 0
        skipped = 0
        first_target_url = None

        try:
            for endpoint_id in claimed.endpoint_ids:
                ensure_pentest_not_killed()
                await heartbeat_claimed_run(
                    claimed.run_id,
                    claimed.worker_id or "",
                    db_bind=db_bind,
                    account_id=claimed.account_id,
                )
                summary = await _execute_authorization_replay_endpoint(
                    db,
                    account_id=claimed.account_id,
                    run_id=claimed.run_id,
                    endpoint_id=endpoint_id,
                    options=options,
                    source_vulnerability_id=claimed.source_vulnerability_id,
                )
                execution_results.append(summary)
                first_target_url = first_target_url or str(summary.get("target_url") or "")
                executed += int(summary.get("executed") or 0)
                vulnerable += int(summary.get("vulnerable") or 0)
                errors += int(summary.get("errors") or 0)
                skipped += int(summary.get("skipped") or 0)
        except PentestKillSwitchError as exc:
            errors += 1
            reason = Redactor.redact_text(str(exc))
            await _finish_authorization_replay_run(
                db,
                run=run,
                status="FAILED",
                executed=executed,
                vulnerable=vulnerable,
                errors=errors,
                skipped=skipped,
                reason=reason,
            )
            db.add(
                AuditLog(
                    account_id=int(run.account_id),
                    action="SCAN_RUN_FAILED",
                    resource_type="test_run",
                    resource_id=run.id,
                    details=_redacted_worker_failure_context(
                        run_id=run.id,
                        worker_id=claimed.worker_id,
                        reason=reason,
                        previous_status="RUNNING",
                        worker_isolation=worker_isolation,
                        engine=_AUTHORIZATION_REPLAY_ENGINE,
                    ),
                )
            )
            await db.commit()
            return {
                "status": "failed",
                "engine": _AUTHORIZATION_REPLAY_ENGINE,
                "executed": executed,
                "vulnerable": vulnerable,
                "errors": errors,
                "skipped": skipped,
                "reason": reason,
            }
        except Exception as exc:
            errors += 1
            reason = Redactor.redact_text(str(exc))
            await _finish_authorization_replay_run(
                db,
                run=run,
                status="FAILED",
                executed=executed,
                vulnerable=vulnerable,
                errors=errors,
                skipped=skipped,
                reason=reason,
            )
            db.add(
                AuditLog(
                    account_id=int(run.account_id),
                    action="SCAN_RUN_FAILED",
                    resource_type="test_run",
                    resource_id=run.id,
                    details=_redacted_worker_failure_context(
                        run_id=run.id,
                        worker_id=claimed.worker_id,
                        reason=reason,
                        previous_status="RUNNING",
                        worker_isolation=worker_isolation,
                        engine=_AUTHORIZATION_REPLAY_ENGINE,
                    ),
                )
            )
            await db.commit()
            return {
                "status": "failed",
                "engine": _AUTHORIZATION_REPLAY_ENGINE,
                "executed": executed,
                "vulnerable": vulnerable,
                "errors": errors,
                "skipped": skipped,
                "reason": reason,
            }

        await _finish_authorization_replay_run(
            db,
            run=run,
            status="COMPLETED",
            executed=executed,
            vulnerable=vulnerable,
            errors=errors,
            skipped=skipped,
            reason=None,
        )
        execution_payload = {
            "status": "COMPLETED",
            "engine": _AUTHORIZATION_REPLAY_ENGINE,
            "executed": executed,
            "vulnerable": vulnerable,
            "errors": errors,
            "skipped": skipped,
            "trigger_source": claimed.trigger_source,
            "source_vulnerability_id": claimed.source_vulnerability_id,
            "worker_id": claimed.worker_id,
            "claim_count": claimed.claim_count,
            "test_intensity": claimed.test_intensity,
            "scan_plan": claimed.scan_plan,
            "results": execution_results,
            "worker_isolation_enforcement": worker_isolation_enforcement_metadata(
                worker_isolation_context,
                engine=_AUTHORIZATION_REPLAY_ENGINE,
            ),
        }
        await persist_execution_artifact(
            db,
            account_id=claimed.account_id,
            engine=_AUTHORIZATION_REPLAY_ENGINE,
            target_url=first_target_url or "http://unknown.local/",
            profile_id=claimed.pentest_profile_id,
            execution=execution_payload,
            engine_plan=_scan_plan_engine_plan(claimed.scan_plan),
            findings={
                "created_count": vulnerable,
                "vulnerable_count": vulnerable,
                "endpoint_count": len(claimed.endpoint_ids),
            },
            auth_context=claimed.auth_context,
            run_id=claimed.run_id,
            worker_isolation=worker_isolation,
        )
        db.add(
            AuditLog(
                account_id=claimed.account_id,
                action="SCAN_RUN_COMPLETED",
                resource_type="test_run",
                resource_id=claimed.run_id,
                details={
                    "engine": _AUTHORIZATION_REPLAY_ENGINE,
                    "executed": executed,
                    "vulnerable": vulnerable,
                    "errors": errors,
                    "skipped": skipped,
                    "trigger_source": claimed.trigger_source,
                    "source_vulnerability_id": claimed.source_vulnerability_id,
                    "worker_id": claimed.worker_id,
                    "scan_plan": _scan_plan_claim_summary(claimed.scan_plan),
                },
            )
        )
        await db.commit()

    return {
        "status": "completed",
        "engine": _AUTHORIZATION_REPLAY_ENGINE,
        "executed": executed,
        "vulnerable": vulnerable,
        "errors": errors,
        "skipped": skipped,
    }


async def _execute_authorization_replay_endpoint(
    db,
    *,
    account_id: int,
    run_id: str,
    endpoint_id: str,
    options: dict[str, object],
    source_vulnerability_id: str | None,
) -> dict[str, object]:
    endpoint, sample = await _load_authorization_replay_endpoint_and_sample(
        db,
        account_id=account_id,
        endpoint_id=endpoint_id,
    )
    original_request = dict(sample.request or {})
    original_response = dict(sample.response or {})
    original_url = str(original_request.get("url") or endpoint_target_url(endpoint))
    original_request["url"] = original_url
    original_request["method"] = str(original_request.get("method") or endpoint.method or "GET").upper()

    target_guard = TargetGuard.from_settings()
    allow_state_change = bool(options.get("allow_state_change"))
    allow_destructive_methods = bool(
        options.get(
            "allow_destructive_methods",
            options.get("allow_destructive", False),
        )
    )
    state_guard = StateChangeGuard(
        allow_state_change=allow_state_change,
        allow_destructive_methods=allow_destructive_methods,
    )
    target_guard.validate_url(original_url)
    state_guard.validate_request(original_request)

    all_accounts, replayable_accounts = await _authorization_replay_accounts(db, account_id=account_id)
    victim = infer_victim_account(all_accounts, original_request)
    attackers = [
        account
        for account in replayable_accounts
        if victim is None or getattr(account, "id", None) != getattr(victim, "id", None)
    ]
    if not attackers:
        return {
            "endpoint_id": endpoint_id,
            "target_url": Redactor.redact_url(original_url),
            "executed": 0,
            "vulnerable": 0,
            "errors": 0,
            "skipped": 1,
            "reason": "no_replayable_attacker_accounts",
        }

    executed = 0
    vulnerable = 0
    errors = 0
    results: list[dict[str, object]] = []
    async with httpx.AsyncClient(timeout=10.0) as client:
        for attacker in attackers:
            replay_request = build_replay_request(original_request, attacker)
            replay_request["method"] = str(replay_request.get("method") or "GET").upper()
            replay_url = str(replay_request.get("url") or original_url)
            target_guard.validate_url(replay_url, base_url=original_url)
            state_guard.validate_request(replay_request)
            started_at = _utc_now()
            response = await client.request(
                method=replay_request["method"],
                url=replay_url,
                headers=replay_request.get("headers", {}),
                content=_http_content(replay_request.get("body")),
            )
            finished_at = _utc_now()
            attacker_response = {
                "status_code": response.status_code,
                "headers": dict(response.headers),
                "body": response.text[:4000],
                "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
                "url": replay_url,
            }
            assessment = evaluate_authorization_replay(
                original_response,
                attacker_response,
                body_similarity_threshold=float(options.get("body_similarity_threshold") or 70.0),
                schema_similarity_threshold=float(options.get("schema_similarity_threshold") or 70.0),
                require_response_similarity=bool(options.get("require_response_similarity", True)),
            )
            issue_type = classify_authorization_issue(
                victim=victim,
                attacker=attacker,
                assessment=assessment,
                original_request=original_request,
                replay_request=replay_request,
            )
            evidence = build_authorization_replay_evidence(
                endpoint_id=endpoint_id,
                issue_type=issue_type,
                victim=victim,
                attacker=attacker,
                original_request=original_request,
                original_response=original_response,
                replay_request=replay_request,
                attacker_response=attacker_response,
                assessment=assessment,
                allow_state_change=bool(options.get("allow_state_change")),
            )
            safe_request = Redactor.redact_http_message(replay_request)
            safe_response = Redactor.redact_http_message(attacker_response)
            test_result = TestResult(
                run_id=run_id,
                endpoint_id=endpoint_id,
                template_id=_authorization_replay_template_id(issue_type, victim, attacker),
                is_vulnerable=bool(issue_type),
                severity="HIGH" if issue_type else "INFO",
                sent_request=safe_request,
                received_response=safe_response,
                percentage_match=assessment.get("similarity_pct"),
                evidence=json.dumps(evidence, sort_keys=True, separators=(",", ":"), default=str),
            )
            db.add(test_result)
            await db.flush()

            vulnerability_summary = None
            if issue_type:
                vulnerable += 1
                if source_vulnerability_id:
                    vulnerability_summary = {
                        "id": source_vulnerability_id,
                        "created": False,
                        "template_id": test_result.template_id,
                        "type": issue_type,
                    }
                else:
                    vulnerability, created, fingerprint = await create_or_merge_vulnerability(
                        db,
                        {
                            "account_id": account_id,
                            "template_id": test_result.template_id,
                            "endpoint_id": endpoint_id,
                            "url": Redactor.redact_url(replay_url),
                            "method": replay_request["method"],
                            "severity": "HIGH" if assessment.get("confidence") == "HIGH" else "MEDIUM",
                            "type": issue_type,
                            "description": (
                                f"{issue_type} authorization replay succeeded for "
                                f"{authorization_identity_label(attacker)} against captured victim traffic."
                            ),
                            "confidence": assessment.get("confidence"),
                            "remediation": (
                                "Enforce object and function-level authorization on every request using server-side "
                                "ownership, tenant, and role checks. Deny by default when the authenticated principal "
                                "does not own the object or lacks the required role."
                            ),
                            "evidence": evidence,
                        },
                    )
                    vulnerability_summary = {
                        "id": vulnerability.id,
                        "created": created,
                        "fingerprint": fingerprint,
                        "template_id": vulnerability.template_id,
                        "type": vulnerability.type,
                    }

            executed += 1
            results.append(
                {
                    "attacker": authorization_identity_summary(attacker),
                    "victim": authorization_identity_summary(victim),
                    "test_id": test_result.id,
                    "issue_type": issue_type,
                    "is_vulnerable": bool(issue_type),
                    "response_code": assessment.get("attacker_status_code"),
                    "confidence": assessment.get("confidence"),
                    "vulnerability": vulnerability_summary,
                }
            )

    return {
        "endpoint_id": endpoint_id,
        "target_url": Redactor.redact_url(original_url),
        "executed": executed,
        "vulnerable": vulnerable,
        "errors": errors,
        "skipped": 0,
        "results": results,
    }


async def _finish_authorization_replay_run(
    db,
    *,
    run: TestRun,
    status: str,
    executed: int,
    vulnerable: int,
    errors: int,
    skipped: int,
    reason: str | None,
) -> None:
    run.status = status
    run.completed_at = _utc_now()
    run.total_tests = executed
    run.vulnerable_count = vulnerable
    run.error_count = errors
    run.dispatch_lease_expires_at = None
    outcome = (
        "FAILED"
        if status == "FAILED" or errors > 0
        else "NO_EXECUTION"
        if executed == 0
        else "STILL_VULNERABLE"
        if vulnerable > 0
        else "CLEAN"
    )
    await _record_authorization_replay_retest_outcome(
        db,
        run=run,
        status=status,
        outcome=outcome,
        executed=executed,
        vulnerable=vulnerable,
        errors=errors,
        skipped=skipped,
        reason=reason,
    )


async def _record_authorization_replay_retest_outcome(
    db,
    *,
    run: TestRun,
    status: str,
    outcome: str,
    executed: int,
    vulnerable: int,
    errors: int,
    skipped: int,
    reason: str | None,
) -> None:
    if not is_vulnerability_retest_trigger_source(run.trigger_source) or not run.source_vulnerability_id:
        return
    source = (
        await db.execute(
            select(Vulnerability).where(
                Vulnerability.id == run.source_vulnerability_id,
                Vulnerability.account_id == run.account_id,
            )
        )
    ).scalar_one_or_none()
    if source is None:
        return

    now = _utc_now()
    previous_status = source.status
    retest = {
        "run_id": run.id,
        "status": status,
        "outcome": outcome,
        "completed_at": isoformat(now),
        "executed": int(executed),
        "vulnerable": int(vulnerable),
        "errors": int(errors),
        "skipped": int(skipped),
    }
    if reason:
        retest["reason"] = Redactor.redact_text(reason)
    retest["hash_algorithm"] = "sha256"
    retest["retest_hash"] = retest_outcome_digest(retest)

    evidence = dict(source.evidence or {})
    previous_retests = evidence.get("remediation_retests")
    if not isinstance(previous_retests, list):
        previous_retests = []
    evidence["remediation_retests"] = (previous_retests + [retest])[-10:]
    evidence["latest_remediation_retest"] = retest
    source.evidence = evidence

    if not source.false_positive and str(source.status or "").upper() != "ACCEPTED_RISK":
        if outcome == "CLEAN":
            source.status = "CLOSED"
        elif outcome == "STILL_VULNERABLE":
            source.status = "OPEN"
            source.last_seen_at = now

    db.add(
        AuditLog(
            account_id=int(run.account_id),
            action="VULNERABILITY_RETEST_COMPLETED",
            resource_type="vulnerability",
            resource_id=source.id,
            details={
                "run_id": run.id,
                "status": status,
                "outcome": outcome,
                "previous_status": previous_status,
                "new_status": source.status,
                "executed": int(executed),
                "vulnerable": int(vulnerable),
                "errors": int(errors),
                "skipped": int(skipped),
                "reason": reason,
                "hash_algorithm": retest["hash_algorithm"],
                "retest_hash": retest["retest_hash"],
                "retest_integrity": latest_remediation_retest_integrity(evidence),
            },
        )
    )


async def run_pending_scan_once(
    *,
    db_bind: AsyncEngine | None = None,
    account_id: int | None = None,
    worker_id: str | None = None,
) -> dict[str, object]:
    """Claim and execute one queued scan run outside the FastAPI request lifecycle."""
    if kill_switch_enabled():
        return {"status": "paused", "claimed": False, "reason": KILL_SWITCH_REASON}

    claimed = await claim_next_pending_run(db_bind=db_bind, account_id=account_id, worker_id=worker_id)
    if claimed is None:
        return {"status": "idle", "claimed": False}

    engine_name = _claimed_execution_engine(claimed)
    run_timeout = _worker_run_timeout_seconds()
    isolation_session = create_worker_isolation_session(
        run_id=claimed.run_id,
        worker_id=claimed.worker_id or "",
        account_id=claimed.account_id,
        engine=engine_name,
        claim_count=claimed.claim_count,
        lease_expires_at=claimed.lease_expires_at,
        timeout_seconds=run_timeout,
    )
    worker_isolation_context = isolation_session.to_runtime_context()
    worker_isolation = isolation_session.to_metadata(
        runtime_context_created=True,
        enforced_engines=[engine_name],
    )
    cleanup: dict[str, object] | None = None
    execution: dict[str, object] = {"status": "failed", "reason": "worker_execution_not_started"}

    async def _execute_claimed() -> dict[str, object]:
        ensure_pentest_not_killed()
        if _claimed_run_requests_authorization_replay(claimed):
            return await _execute_authorization_replay_claimed_run(
                claimed,
                db_bind=db_bind,
                worker_isolation=worker_isolation,
                worker_isolation_context=worker_isolation_context,
            )
        from server.api.routers.tests import _run_security_tasks

        return await _run_security_tasks(
            claimed.run_id,
            claimed.template_ids,
            claimed.endpoint_ids,
            claimed.account_id,
            claimed.pentest_profile_id,
            worker_id=claimed.worker_id,
            db_bind=db_bind,
            worker_isolation=worker_isolation,
            worker_isolation_context=worker_isolation_context,
        ) or {"status": "completed"}

    try:
        try:
            execution = await asyncio.wait_for(_execute_claimed(), timeout=run_timeout)
        except asyncio.TimeoutError:
            reason = f"worker_run_timed_out_after_{run_timeout}s"
            await _mark_claimed_run_failed(
                db_bind=db_bind,
                run_id=claimed.run_id,
                account_id=claimed.account_id,
                worker_id=claimed.worker_id,
                reason=reason,
                action="SCAN_RUN_TIMED_OUT",
                worker_isolation=worker_isolation,
                engine=engine_name,
            )
            execution = {"status": "timed_out", "reason": reason}
        except PentestKillSwitchError as exc:
            reason = Redactor.redact_text(str(exc))
            await _mark_claimed_run_failed(
                db_bind=db_bind,
                run_id=claimed.run_id,
                account_id=claimed.account_id,
                worker_id=claimed.worker_id,
                reason=reason,
                worker_isolation=worker_isolation,
                engine=engine_name,
            )
            execution = {"status": "failed", "reason": reason}
        except Exception as exc:
            reason = Redactor.redact_text(str(exc))
            await _mark_claimed_run_failed(
                db_bind=db_bind,
                run_id=claimed.run_id,
                account_id=claimed.account_id,
                worker_id=claimed.worker_id,
                reason=reason,
                worker_isolation=worker_isolation,
                engine=engine_name,
            )
            execution = {"status": "failed", "reason": reason}
    finally:
        cleanup = cleanup_worker_isolation_session(isolation_session)

    execution_status = str(execution.get("status") or "completed").lower()
    worker_status = "executed" if execution_status == "completed" else execution_status
    result = {
        "status": worker_status,
        "claimed": True,
        "run_id": claimed.run_id,
        "templates": len(claimed.template_ids),
        "endpoints": len(claimed.endpoint_ids),
        "test_intensity": claimed.test_intensity,
        "scan_plan": _scan_plan_claim_summary(claimed.scan_plan),
        "pentest_profile_id": claimed.pentest_profile_id,
        "trigger_source": claimed.trigger_source,
        "source_vulnerability_id": claimed.source_vulnerability_id,
        "source_schedule_id": claimed.source_schedule_id,
        "worker_id": claimed.worker_id,
        "lease_expires_at": claimed.lease_expires_at.isoformat() if claimed.lease_expires_at else None,
        "engine_accountability": claimed.engine_accountability,
        "worker_isolation": {
            **worker_isolation,
            "cleanup": cleanup,
        },
        "execution": execution,
    }
    artifact_summary, artifact_payload = await _latest_worker_execution_artifact(
        db_bind=db_bind,
        claimed=claimed,
    )
    result["worker_artifact"] = artifact_summary
    result["worker_acceptance"] = validate_worker_staging_scan_acceptance(result, artifact_payload)
    return result


async def _latest_worker_execution_artifact(
    *,
    db_bind: AsyncEngine | None,
    claimed: ClaimedScanRun,
) -> tuple[dict[str, object], dict[str, object]]:
    session_factory = AsyncSessionLocal if db_bind is None else async_sessionmaker(
        bind=db_bind,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    engine = _claimed_execution_engine(claimed)
    artifact_type = f"{engine}_execution"
    async with session_factory() as db:
        artifact = (
            await db.execute(
                select(PentestArtifact)
                .where(
                    PentestArtifact.account_id == claimed.account_id,
                    PentestArtifact.run_id == claimed.run_id,
                    PentestArtifact.artifact_type == artifact_type,
                )
                .order_by(PentestArtifact.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

    if artifact is None:
        return (
            {
                "present": False,
                "artifact_type": artifact_type,
                "artifact_verification": {
                    "verified": False,
                    "status": "MISSING",
                    "hash_algorithm": "sha256",
                },
            },
            {},
        )

    payload = artifact.content_json if isinstance(artifact.content_json, dict) else {}
    verification = verify_execution_artifact_payload(payload) if payload else {
        "verified": False,
        "status": "MISSING",
        "hash_algorithm": None,
    }
    return (
        {
            "present": bool(payload),
            "artifact_id": Redactor.redact_text(str(artifact.id)),
            "artifact_type": artifact.artifact_type,
            "filename": Redactor.redact_text(str(artifact.filename or "")),
            "hash_algorithm": payload.get("hash_algorithm"),
            "artifact_hash": payload.get("artifact_hash"),
            "artifact_verification": verification,
        },
        payload,
    )


def _claimed_execution_engine(claimed: ClaimedScanRun) -> str:
    if _claimed_run_requests_authorization_replay(claimed):
        return _AUTHORIZATION_REPLAY_ENGINE
    return "templates"


async def run_worker_loop(
    *,
    db_bind: AsyncEngine | None = None,
    account_id: int | None = None,
    worker_id: str | None = None,
    poll_interval_seconds: float = 2.0,
    max_runs: int | None = None,
) -> dict[str, int]:
    """Continuously execute queued scans; useful for a dedicated worker process."""
    executed = 0
    claimed_count = 0
    aborted = 0
    failed = 0
    canceled = 0
    idle_cycles = 0
    while max_runs is None or claimed_count < max_runs:
        result = await run_pending_scan_once(db_bind=db_bind, account_id=account_id, worker_id=worker_id)
        if result.get("claimed"):
            claimed_count += 1
            status = str(result.get("status") or "")
            if status == "executed":
                executed += 1
            elif status == "aborted":
                aborted += 1
            elif status == "failed":
                failed += 1
            elif status == "canceled":
                canceled += 1
            idle_cycles = 0
            continue

        idle_cycles += 1
        if max_runs is not None:
            break
        await asyncio.sleep(max(0.1, poll_interval_seconds))

    return {
        "claimed": claimed_count,
        "executed": executed,
        "aborted": aborted,
        "failed": failed,
        "canceled": canceled,
        "idle_cycles": idle_cycles,
    }


def build_arg_parser() -> argparse.ArgumentParser:
    """CLI for the dedicated scan-worker container / process."""
    parser = argparse.ArgumentParser(
        prog="api-sentinel-scan-worker",
        description="Poll and execute queued API Sentinel scan runs in an isolated worker process.",
    )
    parser.add_argument(
        "--account-id",
        type=int,
        default=_env_int("API_SENTINEL_ACCOUNT_ID"),
        help="Optional account scope for claim selection (or API_SENTINEL_ACCOUNT_ID).",
    )
    parser.add_argument(
        "--worker-id",
        default=os.environ.get("API_SENTINEL_WORKER_ID") or None,
        help="Stable worker identity for leases/heartbeats (or API_SENTINEL_WORKER_ID).",
    )
    parser.add_argument(
        "--poll-interval",
        type=float,
        default=_env_float("PENTEST_SCAN_WORKER_POLL_INTERVAL", 2.0),
        help="Seconds to sleep when the queue is idle (default 2).",
    )
    parser.add_argument(
        "--max-runs",
        type=int,
        default=_env_int("PENTEST_SCAN_WORKER_MAX_RUNS"),
        help="Stop after N claimed runs; omit for continuous polling.",
    )
    return parser


def _env_int(name: str) -> int | None:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return None
    return int(raw)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return float(raw)


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    summary = asyncio.run(
        run_worker_loop(
            account_id=args.account_id,
            worker_id=args.worker_id,
            poll_interval_seconds=max(0.1, float(args.poll_interval)),
            max_runs=args.max_runs,
        )
    )
    print(json.dumps({"status": "stopped", **summary}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
