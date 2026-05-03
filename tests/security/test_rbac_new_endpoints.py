import pytest
from server.modules.auth.jwt_issuer import JWTIssuer

from server.modules.ingestion.schema import EventBatch, APITrafficEvent, APIRequest, APIResponse


@pytest.mark.asyncio
async def test_ingestion_requires_auth(client):
    event = APITrafficEvent(
        account_id=1000000,
        observed_at=1710000000000,
        request=APIRequest(method="GET", path="/health"),
        response=APIResponse(status_code=200),
    )
    payload = EventBatch(events=[event]).model_dump()
    resp = await client.post("/api/ingestion/v2/events", json=payload)
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_openapi_requires_auth(client):
    resp = await client.post("/api/openapi/rebuild")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_openapi_history_requires_auth(client):
    resp = await client.get("/api/openapi/history")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_openapi_violations_requires_auth(client):
    resp = await client.get("/api/openapi/violations")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_openapi_diff_requires_auth(client):
    resp = await client.post("/api/openapi/diff")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_openapi_scan_plan_requires_auth(client):
    resp = await client.post("/api/openapi/scan-plan", json={"target_url": "https://api.example.com"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_endpoint_lineage_requires_auth(client):
    resp = await client.get("/api/endpoints/test-endpoint/lineage")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_account_settings_requires_auth(client):
    resp = await client.post("/api/getAccountSettingsForAdvancedFilters")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_api_keys_requires_auth(client):
    resp = await client.post("/api/getApiKeys")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_create_api_key_requires_auth(client):
    resp = await client.post("/api/createApiKey", json={"name": "test", "scopes": []})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_nuclei_scans_requires_auth(client):
    resp = await client.get("/api/nuclei/scans")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_evidence_requires_auth(client):
    resp = await client.get("/api/evidence")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_pii_findings_requires_auth(client):
    resp = await client.get("/api/pii/findings")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_bola_vulnerabilities_requires_auth(client):
    resp = await client.get("/api/bola/vulnerabilities")
    assert resp.status_code == 401


def _headers_for_role(role: str, account_id: int = 1000000):
    token = JWTIssuer.create_access_token({
        "sub": f"{role.lower()}-user",
        "email": f"{role.lower()}@example.com",
        "account_id": account_id,
        "role": role,
    })
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_traffic_status_requires_auth(client):
    resp = await client.get("/api/traffic/status")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_viewer_cannot_create_endpoint(client):
    resp = await client.post(
        "/api/endpoints/",
        headers=_headers_for_role("VIEWER"),
        json={"method": "GET", "path": "/denied", "host": "example.com"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_run_tests(client):
    resp = await client.post(
        "/api/tests/run",
        headers=_headers_for_role("VIEWER"),
        json={"template_ids": [], "endpoint_ids": []},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_viewer_cannot_run_bola_scan(client):
    resp = await client.post(
        "/api/bola/scan-endpoint/test-endpoint",
        headers=_headers_for_role("VIEWER"),
        json="attacker-role-id",
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_member_cannot_import_traffic(client):
    resp = await client.post(
        "/api/traffic/har/upload",
        headers=_headers_for_role("MEMBER"),
        files={"file": ("empty.har", b"{}", "application/json")},
    )
    assert resp.status_code == 403


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", "/api/alerts/"),
        ("get", "/api/blocklist/"),
        ("get", "/api/sensors/"),
        ("get", "/api/mcp-shield/endpoints"),
        ("get", "/api/mcp-shield/servers"),
        ("get", "/api/workflows/"),
        ("get", "/api/threat-detection/sessions"),
    ],
)
@pytest.mark.asyncio
async def test_legacy_routes_require_auth(client, method, path):
    resp = await getattr(client, method)(path)
    assert resp.status_code == 401
