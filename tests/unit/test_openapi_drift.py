"""Tests for the OpenAPI drift processor (auto-doc + drift detection)."""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_sweep_is_noop_when_disabled(monkeypatch):
    from server.config import settings
    from server.modules.scheduler.openapi_drift import OpenAPIDriftProcessor

    monkeypatch.setattr(settings, "OPENAPI_DRIFT_ENABLED", False)
    proc = OpenAPIDriftProcessor()
    result = await proc.sweep()
    assert result == {"status": "disabled"}


@pytest.mark.asyncio
async def test_check_account_persists_baseline_when_no_prior_spec(db, monkeypatch):
    from server.config import settings
    from server.modules.scheduler.openapi_drift import OpenAPIDriftProcessor
    from server.models.core import OpenAPISpec
    from sqlalchemy import select

    monkeypatch.setattr(settings, "OPENAPI_DRIFT_ENABLED", True)
    proc = OpenAPIDriftProcessor()

    async def fake_generate_spec(collection_name="Discovered API", account_id=None):
        return {"openapi": "3.0.0", "paths": {"/users": {"get": {}}}}

    monkeypatch.setattr(proc._gen, "generate_spec", fake_generate_spec)

    result = await proc._check_account_with_session(db, account_id=1000000)
    assert result == {"status": "baseline"}

    stored = (await db.execute(
        select(OpenAPISpec).where(OpenAPISpec.account_id == 1000000)
    )).scalars().all()
    assert len(stored) == 1
    assert stored[0].spec_json["paths"] == {"/users": {"get": {}}}


@pytest.mark.asyncio
async def test_check_account_skips_identical_spec(db, monkeypatch):
    from server.config import settings
    from server.modules.scheduler.openapi_drift import OpenAPIDriftProcessor
    from server.models.core import OpenAPISpec
    from sqlalchemy import select

    monkeypatch.setattr(settings, "OPENAPI_DRIFT_ENABLED", True)
    proc = OpenAPIDriftProcessor()

    spec = {"openapi": "3.0.0", "paths": {"/users": {"get": {}}}}
    db.add(OpenAPISpec(account_id=1000000, spec_json=spec))
    await db.commit()

    async def fake_generate_spec(collection_name="Discovered API", account_id=None):
        return dict(spec)

    monkeypatch.setattr(proc._gen, "generate_spec", fake_generate_spec)

    result = await proc._check_account_with_session(db, account_id=1000000)
    assert result == {"status": "unchanged"}

    stored = (await db.execute(
        select(OpenAPISpec).where(OpenAPISpec.account_id == 1000000)
    )).scalars().all()
    assert len(stored) == 1  # no new row was added


@pytest.mark.asyncio
async def test_check_account_detects_drift(db, monkeypatch):
    from server.config import settings
    from server.modules.scheduler.openapi_drift import OpenAPIDriftProcessor
    from server.models.core import OpenAPISpec
    from sqlalchemy import select

    monkeypatch.setattr(settings, "OPENAPI_DRIFT_ENABLED", True)
    proc = OpenAPIDriftProcessor()

    old_spec = {"openapi": "3.0.0", "paths": {"/users": {"get": {}}}}
    db.add(OpenAPISpec(account_id=1000000, spec_json=old_spec))
    await db.commit()

    async def fake_generate_spec(collection_name="Discovered API", account_id=None):
        return {"openapi": "3.0.0", "paths": {}}  # /users removed

    monkeypatch.setattr(proc._gen, "generate_spec", fake_generate_spec)

    result = await proc._check_account_with_session(db, account_id=1000000)
    assert result["status"] == "drifted"
    assert result["change_count"] == 1

    stored = (await db.execute(
        select(OpenAPISpec)
        .where(OpenAPISpec.account_id == 1000000)
        .order_by(OpenAPISpec.created_at.desc())
    )).scalars().all()
    assert len(stored) == 2  # baseline + new drifted version


@pytest.mark.asyncio
async def test_drift_creates_violation_alert_and_evidence(db, monkeypatch):
    from server.config import settings
    from server.modules.scheduler.openapi_drift import OpenAPIDriftProcessor
    from server.models.core import OpenAPISpec, APIEndpoint, PolicyViolation, Alert, EvidenceRecord
    from sqlalchemy import select

    monkeypatch.setattr(settings, "OPENAPI_DRIFT_ENABLED", True)
    proc = OpenAPIDriftProcessor()

    db.add(APIEndpoint(id="ep-1", account_id=1000000, method="GET", path="/users"))
    old_spec = {"openapi": "3.0.0", "paths": {"/users": {"get": {}}}}
    db.add(OpenAPISpec(account_id=1000000, spec_json=old_spec))
    await db.commit()

    async def fake_generate_spec(collection_name="Discovered API", account_id=None):
        return {"openapi": "3.0.0", "paths": {}}  # /users removed -> path_removed, HIGH

    monkeypatch.setattr(proc._gen, "generate_spec", fake_generate_spec)

    result = await proc._check_account_with_session(db, account_id=1000000)
    await db.commit()
    assert result["status"] == "drifted"

    violations = (await db.execute(
        select(PolicyViolation).where(PolicyViolation.account_id == 1000000)
    )).scalars().all()
    assert len(violations) == 1
    assert violations[0].rule_type == "DRIFT"
    assert violations[0].severity == "HIGH"
    assert violations[0].endpoint_id == "ep-1"

    alerts = (await db.execute(
        select(Alert).where(Alert.account_id == 1000000)
    )).scalars().all()
    assert len(alerts) == 1
    assert alerts[0].category == "API_DRIFT"
    assert alerts[0].severity == "HIGH"

    evidence = (await db.execute(
        select(EvidenceRecord).where(EvidenceRecord.account_id == 1000000)
    )).scalars().all()
    assert len(evidence) == 1
    assert evidence[0].evidence_type == "drift"
