"""Sensor management - register log-shipper agents, heartbeat, status monitoring."""

import datetime
import secrets
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.models.core import Sensor
from server.modules.auth.rbac import require_admin
from server.modules.persistence.database import AsyncSessionLocal, get_db

router = APIRouter()
OFFLINE_SECS = 120


class SensorRegister(BaseModel):
    name: str
    host: str | None = None
    log_path: str | None = "/var/log/nginx/access.log"
    version: str | None = "1.0.0"


class HeartbeatBody(BaseModel):
    lines_shipped: int | None = None
    events_detected: int | None = None


async def _mark_stale_offline(db: AsyncSession, account_id: int) -> None:
    """Mark sensors OFFLINE if no heartbeat arrived within OFFLINE_SECS."""
    cutoff = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=OFFLINE_SECS)
    result = await db.execute(
        select(Sensor).where(
            Sensor.account_id == account_id,
            Sensor.status == "ONLINE",
            Sensor.last_heartbeat < cutoff,
        )
    )
    stale = result.scalars().all()
    for sensor in stale:
        sensor.status = "OFFLINE"
    if stale:
        await db.commit()


async def _mark_stale_offline_for_account(account_id: int) -> None:
    async with AsyncSessionLocal() as db:
        await _mark_stale_offline(db, account_id)


@router.get("/")
async def list_sensors(
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    await _mark_stale_offline(db, account_id)
    result = await db.execute(
        select(Sensor).where(Sensor.account_id == account_id).order_by(Sensor.created_at.desc())
    )
    rows = result.scalars().all()
    return [_serialize(row) for row in rows]


@router.get("/summary")
async def sensor_summary(
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    await _mark_stale_offline(db, account_id)
    result = await db.execute(select(Sensor).where(Sensor.account_id == account_id))
    rows = result.scalars().all()
    return {
        "total": len(rows),
        "online": sum(1 for row in rows if row.status == "ONLINE"),
        "offline": sum(1 for row in rows if row.status == "OFFLINE"),
        "degraded": sum(1 for row in rows if row.status == "DEGRADED"),
        "total_lines": sum(row.lines_shipped for row in rows),
        "total_events": sum(row.events_detected for row in rows),
    }


@router.post("/register")
async def register_sensor(
    body: SensorRegister,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    sensor_key = secrets.token_hex(32)
    sensor = Sensor(
        id=str(uuid.uuid4()),
        account_id=account_id,
        name=body.name,
        host=body.host,
        log_path=body.log_path,
        version=body.version,
        sensor_key=sensor_key,
        status="OFFLINE",
    )
    db.add(sensor)
    await db.commit()
    await db.refresh(sensor)
    return {
        "sensor_id": sensor.id,
        "sensor_key": sensor_key,
        "ingest_url": "/api/stream/ingest",
        "heartbeat_url": f"/api/sensors/{sensor_key}/heartbeat",
        "usage": (
            f"python log_shipper.py --key {sensor_key} "
            f"--log {body.log_path} --endpoint http://YOUR_SOC_HOST/api/stream/ingest"
        ),
    }


@router.post("/{sensor_key}/heartbeat")
async def heartbeat(
    sensor_key: str,
    body: HeartbeatBody,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Sensor).where(Sensor.sensor_key == sensor_key))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")

    sensor.status = "ONLINE"
    sensor.last_heartbeat = datetime.datetime.now(datetime.timezone.utc)
    if body.lines_shipped is not None:
        sensor.lines_shipped = body.lines_shipped
    if body.events_detected is not None:
        sensor.events_detected = body.events_detected

    await db.commit()
    background_tasks.add_task(_mark_stale_offline_for_account, sensor.account_id)
    return {"status": "ok", "sensor_id": sensor.id}


@router.get("/{sensor_key}/status")
async def sensor_status(sensor_key: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sensor).where(Sensor.sensor_key == sensor_key))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    return _serialize(sensor)


@router.delete("/{sensor_id}")
async def deregister_sensor(
    sensor_id: str,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    account_id = payload["account_id"]
    result = await db.execute(
        select(Sensor).where(Sensor.id == sensor_id, Sensor.account_id == account_id)
    )
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=404, detail="Sensor not found")
    await db.delete(sensor)
    await db.commit()
    return {"status": "deregistered", "id": sensor_id}


def _serialize(sensor: Sensor) -> dict:
    return {
        "id": sensor.id,
        "name": sensor.name,
        "host": sensor.host,
        "log_path": sensor.log_path,
        "version": sensor.version,
        "status": sensor.status,
        "lines_shipped": sensor.lines_shipped,
        "events_detected": sensor.events_detected,
        "last_heartbeat": sensor.last_heartbeat.isoformat() if sensor.last_heartbeat else None,
        "created_at": sensor.created_at.isoformat() if sensor.created_at else None,
    }
