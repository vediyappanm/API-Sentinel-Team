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
