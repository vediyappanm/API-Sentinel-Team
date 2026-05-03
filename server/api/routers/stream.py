"""Real-time log stream ingestion + WebSocket live feed gateway."""

from __future__ import annotations

import datetime
import gzip
import json
import re
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from server.api.websocket.manager import ws_manager
from server.config import settings
from server.models.core import Alert, IngestionJob, MaliciousEventRecord, RequestLog, Sensor, ThreatActor
from server.modules.auth.audit import log_action
from server.modules.auth.rbac import RBAC
from server.modules.detection.pipeline import unified_detection_pipeline
from server.modules.ingestion.queue import IngestionJobItem, ingestion_queue
from server.modules.persistence.database import AsyncSessionLocal, get_db
from server.modules.quotas.tenant_quota import check_ingest_quota

router = APIRouter()

_ATTACK_SIGS = [
    (re.compile(r"union\s+select|drop\s+table|insert\s+into|or\s+'1'\s*=\s*'1|;\s*--", re.I), "SQL Injection", "HIGH"),
    (re.compile(r"sleep\s*\(|waitfor\s+delay|benchmark\s*\(", re.I), "Blind SQLi", "CRITICAL"),
    (re.compile(r"<script|onerror\s*=|onload\s*=|javascript:|alert\s*\(", re.I), "XSS", "HIGH"),
    (re.compile(r"\.\./|\.\.\\|/etc/passwd|/proc/self|/windows/system32", re.I), "Path Traversal", "CRITICAL"),
    (re.compile(r"[;&|`]\s*\+?(cat|id|whoami|bash|sh|wget|curl)[\s+]", re.I), "Command Injection", "CRITICAL"),
    (re.compile(r"\beval\s*\(|base64_decode|system\s*\(|exec\s*\(", re.I), "Code Injection", "CRITICAL"),
    (re.compile(r"nikto|sqlmap|nmap|dirbuster|masscan|nuclei|burpsuite", re.I), "Scanning Tool", "MEDIUM"),
    (re.compile(r"\.env\b|\.git/config|phpMyAdmin|wp-admin|\.htaccess", re.I), "Sensitive File Access", "HIGH"),
    (re.compile(r"ldap://|CN=|DC=|ou=", re.I), "LDAP Injection", "HIGH"),
    (re.compile(r"file://|gopher://|ftp://|dict://|sftp://", re.I), "SSRF", "CRITICAL"),
]


def _detect_attacks(path: str, headers: dict) -> list[dict]:
    target = path + " " + headers.get("user-agent", "")
    hits = []
    for pattern, category, severity in _ATTACK_SIGS:
        if pattern.search(target):
            hits.append({"category": category, "severity": severity})
    return hits


class IngestPayload(BaseModel):
    lines: list[str]
    sensor_key: str | None = None


@router.post("/ingest")
async def ingest_lines(
    body: IngestPayload,
    x_sensor_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Receive log lines from log shipper and enqueue them."""
    sensor_key = body.sensor_key or x_sensor_key
    if len(body.lines) > settings.INGESTION_MAX_LINES:
        raise HTTPException(status_code=413, detail="Too many lines in one request")
    for line in body.lines:
        if len(line.encode("utf-8")) > settings.INGESTION_MAX_LINE_BYTES:
            raise HTTPException(status_code=413, detail="Log line exceeds size limit")

    if not sensor_key:
        raise HTTPException(status_code=403, detail="Sensor key required")

    result = await db.execute(select(Sensor).where(Sensor.sensor_key == sensor_key))
    sensor = result.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=403, detail="Invalid sensor key")
    account_id = sensor.account_id

    quota = await check_ingest_quota(account_id, cost=len(body.lines))
    if not quota.allowed:
        raise HTTPException(
            status_code=429,
            detail="Ingestion rate limit exceeded",
            headers={"Retry-After": str(max(1, quota.reset_at - int(datetime.datetime.now().timestamp())))},
        )

    job_id = str(uuid.uuid4())
    job = IngestionJob(
        id=job_id,
        account_id=account_id,
        job_type="stream_lines",
        status="QUEUED",
        accepted_count=len(body.lines),
        job_metadata={"sensor_key": sensor_key},
    )
    db.add(job)
    await db.commit()

    queued = await ingestion_queue.enqueue(
        IngestionJobItem(
            job_id=job_id,
            account_id=account_id,
            job_type="stream_lines",
            payload={"lines": body.lines, "sensor_key": sensor_key},
        )
    )
    if not queued:
        job.status = "FAILED"
        job.error_message = "Queue full"
        await db.commit()
        raise HTTPException(status_code=429, detail="Ingestion queue is full")

    await log_action(
        db=db,
        account_id=account_id,
        action="INGESTION_STREAM_ENQUEUED",
        resource_type="ingestion_job",
        resource_id=job_id,
        details={"accepted": len(body.lines), "sensor_key": sensor_key or ""},
    )
    await db.commit()

    return {
        "status": "queued",
        "job_id": job_id,
        "lines_processed": len(body.lines),
        "threats_detected": 0,
    }


@router.post("/ingest/ebpf")
async def ingest_ebpf_events(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Receive structured events from the eBPF kernel sensor."""
    raw = await request.body()
    if request.headers.get("content-encoding", "").lower() == "gzip":
        try:
            raw = gzip.decompress(raw)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Invalid gzip body") from exc

    try:
        data = json.loads(raw)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from exc

    events = data.get("events", [])
    if not events:
        return {"status": "ok", "events_processed": 0, "threats_detected": 0}

    auth = request.headers.get("authorization", "")
    sensor_key = auth.removeprefix("Bearer ").strip() if auth.lower().startswith("bearer ") else None
    if not sensor_key:
        raise HTTPException(status_code=403, detail="Sensor key required")

    res = await db.execute(select(Sensor).where(Sensor.sensor_key == sensor_key))
    sensor = res.scalar_one_or_none()
    if not sensor:
        raise HTTPException(status_code=403, detail="Invalid sensor key")

    account_id = sensor.account_id
    sensor.last_heartbeat = datetime.datetime.utcnow()
    sensor.lines_shipped = (sensor.lines_shipped or 0) + len(events)
    sensor.status = "ONLINE"

    pipeline_mode = unified_detection_pipeline.mode()
    threats_detected = 0
    ws_batch = []
    new_actors: dict[str, ThreatActor] = {}

    for ev in events:
        req = ev.get("request") or {}
        resp = ev.get("response") or {}
        method = (req.get("method") or ev.get("method") or "GET").upper()
        path = req.get("path") or ev.get("path") or "/"
        host = req.get("host") or ev.get("host") or ""
        headers = req.get("headers") or ev.get("headers") or {}
        status = int(resp.get("status") or ev.get("status") or 0)
        source_ip = ev.get("source_ip") or ev.get("src_ip") or ""
        protocol = ev.get("protocol") or "HTTP/1.1"
        ts_raw = ev.get("observed_at") or ev.get("ts")
        if ts_raw is None:
            ts = datetime.datetime.utcnow()
        elif int(ts_raw) > 9_999_999_999:
            ts = datetime.datetime.utcfromtimestamp(int(ts_raw) / 1000)
        else:
            ts = datetime.datetime.utcfromtimestamp(int(ts_raw))

        if pipeline_mode == "active":
            result = await unified_detection_pipeline.process(
                db,
                account_id=account_id,
                source_type="stream_ebpf",
                raw_event=ev,
                persist_request_log=True,
                context_source="EBPF_SENSOR",
            )
            attacks = [
                {"category": signal.category, "severity": signal.severity}
                for signal in result["signals"]
            ]
            threats_detected += len(attacks)
        else:
            if pipeline_mode == "shadow":
                await unified_detection_pipeline.process(
                    db,
                    account_id=account_id,
                    source_type="stream_ebpf",
                    raw_event=ev,
                    persist_request_log=False,
                    context_source="EBPF_SENSOR",
                    shadow=True,
                )

            db.add(RequestLog(
                account_id=account_id,
                source_ip=source_ip,
                method=method,
                path=path,
                response_code=status,
                created_at=ts,
            ))

            attacks = _detect_attacks(path, headers)
            for attack in attacks:
                threats_detected += 1
                category = attack["category"]
                severity = attack["severity"]

                db.add(MaliciousEventRecord(
                    account_id=account_id,
                    ip=source_ip,
                    actor=source_ip,
                    url=f"{host}{path}",
                    method=method,
                    category=category,
                    severity=severity,
                    status="OPEN",
                    context_source="EBPF_SENSOR",
                    detected_at=int(ts.timestamp() * 1000),
                ))

                score_inc = {"CRITICAL": 1.0, "HIGH": 0.5, "MEDIUM": 0.1, "LOW": 0.05}.get(severity, 0.1)
                if source_ip in new_actors:
                    actor = new_actors[source_ip]
                    actor.event_count = (actor.event_count or 0) + 1
                    actor.risk_score = min(10.0, (actor.risk_score or 0) + score_inc)
                    actor.last_seen = ts
                else:
                    actor_result = await db.execute(select(ThreatActor).where(
                        ThreatActor.source_ip == source_ip,
                        ThreatActor.account_id == account_id,
                    ))
                    actor = actor_result.scalar_one_or_none()
                    if actor:
                        actor.event_count = (actor.event_count or 0) + 1
                        actor.risk_score = min(10.0, (actor.risk_score or 0) + score_inc)
                        actor.last_seen = ts
                    else:
                        actor = ThreatActor(
                            account_id=account_id,
                            source_ip=source_ip,
                            event_count=1,
                            risk_score=score_inc,
                            status="MONITORING",
                            last_seen=ts,
                        )
                        db.add(actor)
                        new_actors[source_ip] = actor

                if severity in {"HIGH", "CRITICAL"}:
                    db.add(Alert(
                        account_id=account_id,
                        title=f"{category} detected from {source_ip}",
                        message=f"{severity} {category} on {method} {path} (status {status})",
                        severity=severity,
                        category=category,
                        source_ip=source_ip,
                        endpoint=path,
                        status="OPEN",
                    ))

        ws_batch.append({
            "ip": source_ip,
            "method": method,
            "path": path,
            "host": host,
            "status": status,
            "protocol": protocol,
            "timestamp": ts.isoformat(),
            "attacks": attacks,
            "blocked": False,
            "source": "ebpf",
        })

    await db.commit()

    for entry in ws_batch:
        await ws_manager.broadcast({"type": "log_entry", "data": entry}, account_id=account_id)

    return {
        "status": "ok",
        "events_processed": len(events),
        "threats_detected": threats_detected,
    }


@router.get("/recent")
async def recent_events(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(RBAC.require_auth),
):
    """REST fallback: recent tenant-scoped request logs with threat overlays."""
    account_id = payload.get("account_id")
    logs_result = await db.execute(
        select(RequestLog)
        .where(RequestLog.account_id == account_id)
        .order_by(RequestLog.created_at.desc())
        .limit(limit)
    )
    logs = logs_result.scalars().all()

    evt_result = await db.execute(
        select(MaliciousEventRecord)
        .where(MaliciousEventRecord.account_id == account_id)
        .order_by(MaliciousEventRecord.created_at.desc())
        .limit(200)
    )
    events = evt_result.scalars().all()
    threat_ips = {e.ip: {"category": e.category, "severity": e.severity} for e in events if e.ip}

    return [
        {
            "ip": r.source_ip,
            "method": r.method,
            "path": r.path,
            "status": r.response_code,
            "timestamp": r.created_at.isoformat() if r.created_at else None,
            "attacks": [threat_ips[r.source_ip]] if r.source_ip in threat_ips else [],
        }
        for r in logs
    ]


@router.websocket("/live")
async def websocket_live(websocket: WebSocket):
    """WebSocket endpoint for live tenant-scoped events."""
    token = websocket.query_params.get("token")
    if not token:
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = websocket.cookies.get("access_token")

    connected = await ws_manager.connect(websocket, token=token)
    if not connected:
        return

    try:
        metadata = ws_manager.active_connections.get(websocket, {})
        account_id = metadata.get("account_id")
        async with AsyncSessionLocal() as db:
            logs_stmt = select(RequestLog).order_by(RequestLog.created_at.desc()).limit(20)
            events_stmt = select(MaliciousEventRecord).order_by(MaliciousEventRecord.created_at.desc()).limit(100)
            if account_id is not None:
                logs_stmt = logs_stmt.where(RequestLog.account_id == account_id)
                events_stmt = events_stmt.where(MaliciousEventRecord.account_id == account_id)

            recent = (await db.execute(logs_stmt)).scalars().all()
            events = (await db.execute(events_stmt)).scalars().all()
            threat_ips = {e.ip: {"category": e.category, "severity": e.severity} for e in events if e.ip}

        for request_log in reversed(recent):
            await websocket.send_json({
                "type": "log_entry",
                "data": {
                    "ip": request_log.source_ip,
                    "method": request_log.method,
                    "path": request_log.path,
                    "status": request_log.response_code,
                    "timestamp": request_log.created_at.isoformat() if request_log.created_at else None,
                    "attacks": [threat_ips[request_log.source_ip]] if request_log.source_ip in threat_ips else [],
                    "blocked": False,
                },
            })

        while True:
            try:
                await websocket.receive_text()
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(websocket)
