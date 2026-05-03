import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

import server.api.routers.tests as tests_router


@pytest.mark.asyncio
async def test_scheduler_trigger_creates_run_and_delegates(test_engine, monkeypatch):
    from server.models.core import TestRun
    from server.modules.scheduler.test_scheduler import TestScheduler

    session_factory = async_sessionmaker(bind=test_engine, expire_on_commit=False)
    monkeypatch.setattr("server.modules.scheduler.test_scheduler.AsyncSessionLocal", session_factory)

    captured: dict[str, object] = {}

    async def fake_run_security_tasks(run_id, template_ids, endpoint_ids, account_id, pentest_profile_id=None, db_bind=None):
        captured["run_id"] = run_id
        captured["template_ids"] = template_ids
        captured["endpoint_ids"] = endpoint_ids
        captured["account_id"] = account_id

    monkeypatch.setattr(tests_router, "_run_security_tasks", fake_run_security_tasks)

    scheduler = TestScheduler()
    await scheduler._trigger_run("schedule-1", ["tpl-1"], ["endpoint-1"], 1000000)

    assert captured["account_id"] == 1000000
    assert captured["template_ids"] == ["tpl-1"]
    assert captured["endpoint_ids"] == ["endpoint-1"]

    async with session_factory() as db:
        result = await db.execute(select(TestRun).where(TestRun.id == captured["run_id"]))
        run = result.scalar_one()

    assert run.id == captured["run_id"]
    assert run.account_id == 1000000
    assert run.status == "PENDING"
