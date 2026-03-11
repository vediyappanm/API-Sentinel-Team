"""Real-time log stream ingestion + WebSocket live feed — AppSentinel sensor gateway."""
import re
import uuid
import datetime
from urllib.parse import unquote
from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.modules.persistence.database import get_db, AsyncSessionLocal
from server.models.core import RequestLog, MaliciousEventRecord, Alert, Sensor, ThreatActor, BlockedIP
from server.api.websocket.manager import ws_manager

router   = APIRouter()
ACCOUNT_ID = 1000000

# ── Nginx combined log pattern ─────────────────────────────────────────────────
_LOG_RE = re.compile(
    r'(?P<ip>\S+)\s+\S+\s+\S+\s+'
    r'\[(?P<time>[^\]]+)\]\s+'
    r'"(?P<method>[A-Z]+)\s+(?P<path>\S+)\s+HTTP/[^"]+"\s+'
    r'(?P<status>\d{3})\s+(?P<bytes>\S+)'
    r'(?:\s+"(?P<referer>[^"]*)"\s+"(?P<ua>[^"]*)")?'
)
_LOG_TIME_FMT = "%d/%b/%Y:%H:%M:%S %z"

# ── Attack signatures ──────────────────────────────────────────────────────────
_ATTACK_SIGNATURES = [
    (re.compile(r"(union\s+select|select\s+.*from|insert\s+into|drop\s+table|'.*or\s+'1'='1|;--)", re.I), "SQL Injection", "HIGH"),
    (re.compile(r"(<script|javascript:|onerror\s*=|onload\s*=|alert\s*\(|<iframe)", re.I), "XSS", "HIGH"),
    (re.compile(r"(\.\./|\.\.%2f|%2e%2e/|/etc/passwd|/etc/shadow|/proc/self)", re.I), "Path Traversal", "CRITICAL"),
    (re.compile(r"(;\s*(ls|cat|whoami|id|wget|curl|bash|sh)\b|&&|\|\s*(cat|ls|id))", re.I), "Command Injection", "CRITICAL"),
    (re.compile(r"(\bexec\b|\beval\b|base64_decode|system\s*\(|passthru\s*\()", re.I), "Code Injection", "CRITICAL"),
    (re.compile(r"(\bscanner\b|nikto|nmap|sqlmap|dirbuster|gobuster|nuclei)", re.I), "Scanning Tool", "MEDIUM"),
    (re.compile(r"(wp-admin|phpMyAdmin|\.env|\.git/config|web\.config|\.htaccess)", re.I), "Sensitive File Access", "HIGH"),
    (re.compile(r"(AND\s+\d+=\d+|OR\s+\d+=\d+|WAITFOR\s+DELAY|SLEEP\s*\()", re.I), "Blind SQLi", "CRITICAL"),
    (re.compile(r"(\bLDAP\b|ldap://|CN=|DC=)", re.I), "LDAP Injection", "HIGH"),
    (re.compile(r"(file://|gopher://|dict://|ftp://|sftp://)", re.I), "SSRF", "CRITICAL"),
]

_SEV_ORDER = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}


def _detect_attacks(path: str, ua: str) -> list[dict]:
    target = unquote(path) + " " + (ua or "")
    found = []
    for pattern, category, severity in _ATTACK_SIGNATURES:
        if pattern.search(target):
            found.append({"category": category, "severity": severity})
    return found


def _parse_line(line: str) -> dict | None:
    m = _LOG_RE.match(line.strip())
    if not m:
        return None
    try:
        ts = datetime.datetime.strptime(m.group("time"), _LOG_TIME_FMT)
    except Exception:
        ts = datetime.datetime.now(datetime.timezone.utc)
    return {
        "ip":     m.group("ip"),
        "time":   ts,
        "method": m.group("method"),
        "path":   m.group("path"),
        "status": int(m.group("status")),
        "bytes":  m.group("bytes"),
        "ua":     m.group("ua") or "",
    }


class IngestPayload(BaseModel):
    lines: list[str]
    sensor_key: str | None = None


@router.post("/ingest")
async def ingest_lines(
    body: IngestPayload,
    x_sensor_key: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Receive log lines from log_shipper agent. Parse, detect, store, broadcast."""
    sensor_key = body.sensor_key or x_sensor_key
    lines_processed  = 0
    threats_detected = 0

    # Validate sensor key if provided
    if sensor_key:
        result = await db.execute(
            select(Sensor).where(Sensor.sensor_key == sensor_key)
        )
        sensor = result.scalar_one_or_none()
        if not sensor:
            raise HTTPException(status_code=403, detail="Invalid sensor key")
    else:
        sensor = None

    # Load blocked IPs for fast lookup
    blocked_result = await db.execute(
        select(BlockedIP.ip).where(BlockedIP.account_id == ACCOUNT_ID)
    )
    blocked_ips = set(blocked_result.scalars().all())

    for line in body.lines:
        parsed = _parse_line(line)
        if not parsed:
            continue

        attacks = _detect_attacks(parsed["path"], parsed["ua"])
        lines_processed += 1
        is_blocked = parsed["ip"] in blocked_ips

        # Store request log
        log = RequestLog(
            id=str(uuid.uuid4()),
            account_id=ACCOUNT_ID,
            source_ip=parsed["ip"],
            method=parsed["method"],
            path=parsed["path"],
            response_code=parsed["status"],
            created_at=parsed["time"],
        )
        db.add(log)

        # For each attack detected
        for attack in attacks:
            threats_detected += 1
            evt = MaliciousEventRecord(
                id=str(uuid.uuid4()),
                account_id=ACCOUNT_ID,
                actor=parsed["ip"],
                ip=parsed["ip"],
                url=parsed["path"],
                method=parsed["method"],
                category=attack["category"],
                severity=attack["severity"],
                detected_at=int(parsed["time"].timestamp() * 1000),
                status="OPEN",
            )
            db.add(evt)

            # Auto-create Alert for CRITICAL/HIGH
            if _SEV_ORDER.get(attack["severity"], 0) >= 3:
                alert = Alert(
                    id=str(uuid.uuid4()),
                    account_id=ACCOUNT_ID,
                    title=f"{attack['category']} detected from {parsed['ip']}",
                    message=f"Attack pattern matched on {parsed['method']} {parsed['path']}",
                    severity=attack["severity"],
                    category=attack["category"],
                    source_ip=parsed["ip"],
                    endpoint=parsed["path"],
                )
                db.add(alert)

        # Broadcast to WebSocket clients
        event_msg = {
            "type": "log_entry",
            "data": {
                "ip":        parsed["ip"],
                "method":    parsed["method"],
                "path":      parsed["path"],
                "status":    parsed["status"],
                "bytes":     parsed["bytes"],
                "timestamp": parsed["time"].isoformat(),
                "attacks":   attacks,
                "blocked":   is_blocked,
            },
        }
        await ws_manager.broadcast(event_msg)

    # Update sensor counters
    if sensor:
        sensor.lines_shipped   = (sensor.lines_shipped or 0) + lines_processed
        sensor.events_detected = (sensor.events_detected or 0) + threats_detected
        sensor.last_heartbeat  = datetime.datetime.now(datetime.timezone.utc)
        sensor.status          = "ONLINE"

    await db.commit()
    return {
        "status":          "ok",
        "lines_processed": lines_processed,
        "threats_detected": threats_detected,
    }


@router.get("/recent")
async def recent_events(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
):
    """REST fallback — last N request logs with any attack records."""
    logs_result = await db.execute(
        select(RequestLog)
        .where(RequestLog.account_id == ACCOUNT_ID)
        .order_by(RequestLog.created_at.desc())
        .limit(limit)
    )
    logs = logs_result.scalars().all()

    # Get recent malicious events for cross-ref
    evt_result = await db.execute(
        select(MaliciousEventRecord)
        .where(MaliciousEventRecord.account_id == ACCOUNT_ID)
        .order_by(MaliciousEventRecord.created_at.desc())
        .limit(200)
    )
    events = evt_result.scalars().all()
    threat_ips = {e.ip: {"category": e.category, "severity": e.severity} for e in events}

    return [
        {
            "ip":        r.source_ip,
            "method":    r.method,
            "path":      r.path,
            "status":    r.response_code,
            "timestamp": r.created_at.isoformat() if r.created_at else None,
            "attacks":   [threat_ips[r.source_ip]] if r.source_ip in threat_ips else [],
        }
        for r in logs
    ]


@router.websocket("/live")
async def websocket_live(websocket: WebSocket):
    """WebSocket endpoint — push live log events to connected dashboard clients."""
    await ws_manager.connect(websocket)
    try:
        # Send last 20 events immediately on connect
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RequestLog)
                .where(RequestLog.account_id == ACCOUNT_ID)
                .order_by(RequestLog.created_at.desc())
                .limit(20)
            )
            recent = result.scalars().all()

            evt_result = await db.execute(
                select(MaliciousEventRecord)
                .where(MaliciousEventRecord.account_id == ACCOUNT_ID)
                .order_by(MaliciousEventRecord.created_at.desc())
                .limit(100)
            )
            events = evt_result.scalars().all()
            threat_ips = {e.ip: {"category": e.category, "severity": e.severity} for e in events}

        for r in reversed(recent):
            await websocket.send_json({
                "type": "log_entry",
                "data": {
                    "ip":        r.source_ip,
                    "method":    r.method,
                    "path":      r.path,
                    "status":    r.response_code,
                    "timestamp": r.created_at.isoformat() if r.created_at else None,
                    "attacks":   [threat_ips[r.source_ip]] if r.source_ip in threat_ips else [],
                    "blocked":   False,
                },
            })

        # Keep connection alive — ping/pong
        while True:
            try:
                await websocket.receive_text()   # client ping
            except WebSocketDisconnect:
                break
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket)
