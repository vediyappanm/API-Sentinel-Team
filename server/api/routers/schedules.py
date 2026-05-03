"""CRUD endpoints for test schedules (cron-based)."""
from fastapi import APIRouter, Depends, Body, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, delete, select, update
from server.modules.auth.rbac import RBAC
from server.modules.persistence.database import get_db
from server.modules.scheduler.test_scheduler import TestScheduler
from server.models.core import TestSchedule

router = APIRouter()
_scheduler = TestScheduler()


@router.get("/")
async def list_schedules(
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(TestSchedule)
        .where(TestSchedule.account_id == account_id)
        .order_by(TestSchedule.created_at.desc())
    )
    schedules = result.scalars().all()
    return {
        "total": len(schedules),
        "schedules": [
            {"id": s.id, "name": s.name, "cron_expression": s.cron_expression,
             "template_ids": s.template_ids, "endpoint_ids": s.endpoint_ids,
             "enabled": s.enabled, "created_at": str(s.created_at)}
            for s in schedules
        ],
    }


@router.post("/")
async def create_schedule(
    name: str = Body(...),
    cron_expression: str = Body(..., description="Cron expression such as 0 2 * * *"),
    template_ids: list[str] = Body(...),
    endpoint_ids: list[str] = Body(...),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload["account_id"]
    schedule_id = await _scheduler.schedule(name, cron_expression, template_ids, endpoint_ids, account_id, db)
    return {"status": "created", "id": schedule_id, "name": name, "cron": cron_expression}


@router.patch("/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: str,
    enabled: bool = True,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload["account_id"]
    result = await db.execute(
        update(TestSchedule)
        .where(and_(TestSchedule.id == schedule_id, TestSchedule.account_id == account_id))
        .values(enabled=enabled)
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.commit()
    return {"status": "updated", "id": schedule_id, "enabled": enabled}


@router.delete("/{schedule_id}")
async def delete_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    account_id = payload["account_id"]
    result = await db.execute(
        delete(TestSchedule).where(and_(TestSchedule.id == schedule_id, TestSchedule.account_id == account_id))
    )
    if not result.rowcount:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.commit()
    return {"status": "deleted", "id": schedule_id}
