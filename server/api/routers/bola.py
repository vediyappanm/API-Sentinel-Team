"""BOLA (Broken Object Level Authorization) testing endpoints."""

from datetime import datetime
import json

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from server.models.core import APIEndpoint, SampleData, TestAccount, TestResult, Vulnerability
from server.modules.auth.rbac import Permission, RBAC, can_run_tests
from server.modules.persistence.database import get_db
from server.modules.test_executor.request_mutator import RequestMutator
from server.modules.vulnerability_detector.store import create_or_merge_vulnerability

router = APIRouter(tags=["bola"])
mutator = RequestMutator()


@router.post("/scan-endpoint/{ep_id}")
async def scan_endpoint_for_bola(
    ep_id: str,
    attacker_role_id: str = Body(...),
    payload: dict = Depends(can_run_tests),
    db: AsyncSession = Depends(get_db),
):
    """
    Perform a BOLA test on a specific endpoint by swapping tokens.
    1. Load the tenant-scoped endpoint and its latest captured sample.
    2. Load the tenant-scoped attacker account context.
    3. Replay the victim request with the attacker's authorization context.
    4. Flag BOLA when the replay still succeeds.
    """

    account_id = int(payload["account_id"])

    ep_result = await db.execute(
        select(APIEndpoint).where(
            APIEndpoint.id == ep_id,
            APIEndpoint.account_id == account_id,
        )
    )
    endpoint = ep_result.scalar_one_or_none()
    if not endpoint:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    sample_result = await db.execute(
        select(SampleData)
        .where(
            SampleData.endpoint_id == ep_id,
            SampleData.account_id == account_id,
        )
        .order_by(SampleData.created_at.desc())
        .limit(1)
    )
    sample = sample_result.scalar_one_or_none()
    if not sample:
        raise HTTPException(status_code=400, detail="No sample data found for this endpoint. Cannot replay.")

    attacker_result = await db.execute(
        select(TestAccount).where(
            TestAccount.id == attacker_role_id,
            TestAccount.account_id == account_id,
        )
    )
    attacker = attacker_result.scalar_one_or_none()
    if not attacker:
        raise HTTPException(status_code=400, detail="Attacker role not found")

    auth_headers = attacker.auth_headers or {}
    attacker_token = auth_headers.get("Authorization") or auth_headers.get("authorization")
    if not attacker_token:
        if not attacker.auth_token:
            raise HTTPException(status_code=400, detail="Attacker account has no replayable auth token")
        attacker_token = f"Bearer {attacker.auth_token}"

    original_request = sample.request or {}
    rule = {"replace_auth_header": True}
    auth_ctx = {"attacker_token": attacker_token, "auth_header": "Authorization"}
    mutated_request = mutator.mutate(original_request, rule, auth_ctx)

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            method = mutated_request.get("method", "GET").upper()
            url = mutated_request.get("url")
            headers = mutated_request.get("headers", {})
            body = mutated_request.get("body", "")

            started_at = datetime.utcnow()
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                content=body if isinstance(body, str) else json.dumps(body),
            )
            finished_at = datetime.utcnow()

            is_vulnerable = response.status_code in (200, 201, 204)
            test_result = TestResult(
                endpoint_id=ep_id,
                template_id="BOLA_AUTH_SWAP",
                is_vulnerable=is_vulnerable,
                severity="HIGH" if is_vulnerable else "INFO",
                sent_request=mutated_request,
                received_response={
                    "status_code": response.status_code,
                    "body": response.text[:2000],
                    "headers": dict(response.headers),
                    "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
                },
                evidence=(
                    f"Access granted to {url} with attacker token (status: {response.status_code})"
                    if is_vulnerable
                    else "Access denied or status code indicates authorization enforcement."
                ),
            )
            db.add(test_result)

            if is_vulnerable:
                await create_or_merge_vulnerability(
                    db,
                    {
                        "account_id": account_id,
                        "template_id": "BOLA_AUTH_SWAP",
                        "endpoint_id": ep_id,
                        "url": url,
                        "method": method,
                        "severity": "HIGH",
                        "type": "BOLA",
                        "description": (
                            "Endpoint permits access to object data using an unauthorized token "
                            f"(attacker: {attacker.name or attacker.id})."
                        ),
                        "confidence": "HIGH",
                        "remediation": (
                            "Implement robust object-level authorization checks and verify the "
                            "authenticated user owns or is allowed to access the requested resource."
                        ),
                        "evidence": test_result.received_response,
                    },
                )

            await db.commit()
            return {
                "status": "vulnerable" if is_vulnerable else "secured",
                "response_code": response.status_code,
                "test_id": test_result.id,
            }
        except HTTPException:
            await db.rollback()
            raise
        except Exception as exc:
            await db.rollback()
            raise HTTPException(status_code=500, detail=f"BOLA replay failed: {exc}") from exc


@router.get("/vulnerabilities")
async def list_bola_vulns(
    payload: dict = Depends(RBAC.require_permission(Permission.VULNS_READ)),
    db: AsyncSession = Depends(get_db),
):
    """List BOLA vulnerabilities for the authenticated tenant only."""

    account_id = int(payload["account_id"])
    result = await db.execute(
        select(Vulnerability).where(
            Vulnerability.type == "BOLA",
            Vulnerability.account_id == account_id,
        )
    )
    vulnerabilities = result.scalars().all()
    return [
        {
            "id": vulnerability.id,
            "endpoint_id": vulnerability.endpoint_id,
            "url": vulnerability.url,
            "method": vulnerability.method,
            "severity": vulnerability.severity,
            "description": vulnerability.description,
            "confidence": vulnerability.confidence,
            "status": vulnerability.status,
            "created_at": str(vulnerability.created_at),
        }
        for vulnerability in vulnerabilities
    ]
