"""PII detection router — scan endpoints and sample data for sensitive information."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from server.modules.persistence.database import get_db
from server.modules.vulnerability_detector.pii_scanner import PIIScanner
from server.models.core import SampleData, APIEndpoint

router = APIRouter()
_scanner = PIIScanner()


@router.get("/")
async def get_pii_findings(
    endpoint_id: str = Query(None),
    limit: int = Query(50),
    db: AsyncSession = Depends(get_db),
):
    """Scan stored sample data and return PII findings."""
    query = select(SampleData).limit(limit)
    if endpoint_id:
        query = query.where(SampleData.endpoint_id == endpoint_id)

    result = await db.execute(query)
    samples = result.scalars().all()

    all_findings = []
    for sample in samples:
        # Scan response body
        resp_body = (sample.response or {}).get("body", "")
        findings = _scanner.scan_payload(resp_body)
        for f in findings:
            all_findings.append({
                "endpoint_id": sample.endpoint_id,
                "sample_id": sample.id,
                "source": "response",
                **f,
            })
        # Scan request body
        req_body = (sample.request or {}).get("body", "")
        findings = _scanner.scan_payload(req_body)
        for f in findings:
            all_findings.append({
                "endpoint_id": sample.endpoint_id,
                "sample_id": sample.id,
                "source": "request",
                **f,
            })

    return {"total": len(all_findings), "findings": all_findings}


@router.post("/scan-endpoint")
async def scan_endpoint(endpoint_id: str, db: AsyncSession = Depends(get_db)):
    """Scan all captured traffic for a specific endpoint for PII."""
    result = await db.execute(
        select(SampleData).where(SampleData.endpoint_id == endpoint_id)
    )
    samples = result.scalars().all()

    findings = []
    for sample in samples:
        for source, payload in [("response", (sample.response or {}).get("body", "")),
                                 ("request", (sample.request or {}).get("body", ""))]:
            for f in _scanner.scan_payload(payload):
                findings.append({"source": source, "sample_id": sample.id, **f})

    return {
        "endpoint_id": endpoint_id,
        "samples_scanned": len(samples),
        "findings": findings,
        "has_pii": len(findings) > 0,
    }


@router.post("/scan-text")
async def scan_text(text: str):
    """Scan arbitrary text for PII patterns."""
    findings = _scanner.scan_string(text)
    return {"findings": findings, "has_pii": len(findings) > 0}
