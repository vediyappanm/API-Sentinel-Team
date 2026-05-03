"""Threat actor correlation compatibility layer."""

from __future__ import annotations

import datetime
from typing import Any, Dict, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from server.modules.cache import redis_cache
from server.config import settings
from server.models.core import BlockedIP, MaliciousEvent, MaliciousEventRecord, ThreatActor

from .correlation_agent import correlation_agent
from .enforcement_agent import enforcement_agent
from .models import DetectionEnvelope, DetectionSignal
from .pipeline import unified_detection_pipeline
from .state_store import state_store

SEVERITY_WEIGHTS = {
    "CRITICAL": 0.30,
    "HIGH": 0.20,
    "MEDIUM": 0.10,
    "LOW": 0.05,
}


async def correlate_threat(
    db: AsyncSession,
    account_id: int,
    source_ip: str,
    event_type: str,
    severity: str,
    endpoint_id: Optional[str] = None,
    payload_snippet: Optional[str] = None,
) -> Dict[str, Any]:
    """Compatibility shim around the unified correlation/enforcement flow."""
    if unified_detection_pipeline.is_enabled():
        observed_at_ms = int(datetime.datetime.utcnow().timestamp() * 1000)
        envelope = DetectionEnvelope(
            source_type="legacy_correlation",
            event_type="legacy_event",
            account_id=account_id,
            observed_at_ms=observed_at_ms,
            actor_id=source_ip or "anonymous",
            source_ip=source_ip or "",
            method="UNKNOWN",
            path=endpoint_id or "/",
            endpoint_id=endpoint_id,
            endpoint_scope=endpoint_id or "/",
            request_body_text=payload_snippet or "",
            context_source="LEGACY_CORRELATION",
        )
        signal = DetectionSignal(
            detector_id="legacy.correlation",
            incident_type=event_type,
            category=event_type,
            severity=severity,
            confidence=1.0,
            summary=f"Legacy threat event {event_type}",
            actor_id=envelope.actor_id,
            source_ip=envelope.source_ip,
            endpoint_id=endpoint_id,
            endpoint_scope=envelope.endpoint_scope,
            scores={"rule": SEVERITY_WEIGHTS.get(severity, 0.05)},
            evidence={"payload_snippet": payload_snippet or ""},
        )
        state = {
            "profile_state": {},
            "reputation": await state_store.get_actor_reputation(db, account_id, source_ip),
        }
        decision = await correlation_agent.correlate(
            db,
            envelope,
            [signal],
            state,
            persist=(unified_detection_pipeline.mode() == "active"),
            shadow=(unified_detection_pipeline.mode() == "shadow"),
        )
        if unified_detection_pipeline.is_active():
            await enforcement_agent.apply(db, envelope, decision, persist=True)
            actor = await state_store.get_actor_reputation(db, account_id, source_ip)
            return {
                "actor_id": getattr(actor, "id", envelope.actor_id),
                "risk_score": float(getattr(actor, "risk_score", decision.risk_score) or decision.risk_score),
                "event_count": int(getattr(actor, "event_count", 1) or 1),
                "auto_blocked": bool(decision.auto_blocked),
                "was_already_blocked": bool(getattr(actor, "status", "") == "BLOCKED" and not decision.auto_blocked),
            }
        return {
            "actor_id": envelope.actor_id,
            "risk_score": 0.0,
            "event_count": 0,
            "auto_blocked": False,
            "was_already_blocked": False,
        }

    result = await db.execute(
        select(ThreatActor).where(
            and_(
                ThreatActor.account_id == account_id,
                ThreatActor.source_ip == source_ip,
            )
        )
    )
    actor = result.scalar_one_or_none()

    if actor is None:
        actor = ThreatActor(
            account_id=account_id,
            source_ip=source_ip,
            status="MONITORING",
            event_count=1,
            risk_score=0.0,
        )
        db.add(actor)
        await db.flush()
    else:
        actor.event_count += 1

    risk_increment = SEVERITY_WEIGHTS.get(severity, 0.05)
    new_risk_score = min(1.0, actor.risk_score + risk_increment)
    actor.risk_score = new_risk_score
    actor.last_seen = datetime.datetime.utcnow()

    db.add(MaliciousEvent(
        account_id=account_id,
        actor_id=actor.id,
        event_type=event_type,
        severity=severity,
        detected_at=datetime.datetime.utcnow(),
    ))
    db.add(MaliciousEventRecord(
        account_id=account_id,
        actor=source_ip,
        ip=source_ip,
        method="UNKNOWN",
        event_type=event_type,
        category=event_type,
        severity=severity,
        label="threat",
        status="OPEN",
        payload=payload_snippet,
        detected_at=int(datetime.datetime.utcnow().timestamp() * 1000),
    ))

    auto_blocked = False
    was_already_blocked = actor.status == "BLOCKED"

    if new_risk_score >= settings.DETECTION_IP_BLOCK_THRESHOLD and not was_already_blocked:
        actor.status = "BLOCKED"
        blocked_ip_result = await db.execute(
            select(BlockedIP).where(
                and_(
                    BlockedIP.account_id == account_id,
                    BlockedIP.ip == source_ip,
                )
            )
        )
        blocked_ip = blocked_ip_result.scalar_one_or_none()
        if blocked_ip is None:
            blocked_ip = BlockedIP(
                account_id=account_id,
                ip=source_ip,
                reason=f"Auto-blocked by threat correlation (risk_score={new_risk_score:.2f})",
                blocked_by="AUTO",
                risk_score=new_risk_score,
                event_count=actor.event_count,
            )
            db.add(blocked_ip)
        else:
            blocked_ip.risk_score = new_risk_score
            blocked_ip.event_count = actor.event_count
            blocked_ip.blocked_by = "AUTO"
        await redis_cache.delete(f"blocked:{account_id}:{source_ip}")
        auto_blocked = True

    return {
        "actor_id": actor.id,
        "risk_score": new_risk_score,
        "event_count": actor.event_count,
        "auto_blocked": auto_blocked,
        "was_already_blocked": was_already_blocked,
    }
