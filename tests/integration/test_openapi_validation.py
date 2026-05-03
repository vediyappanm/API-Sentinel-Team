import datetime

import pytest

from server.models.core import OpenAPISpec


@pytest.mark.asyncio
async def test_openapi_rebuild_and_validate(client, auth_headers):
    rebuild = await client.post("/api/openapi/rebuild", headers=auth_headers)
    assert rebuild.status_code == 200
    spec_id = rebuild.json().get("id")
    assert spec_id

    latest = await client.get("/api/openapi/latest", headers=auth_headers)
    assert latest.status_code == 200
    assert "spec" in latest.json()

    validate = await client.post("/api/openapi/validate", headers=auth_headers)
    assert validate.status_code == 200
    assert "violations_found" in validate.json()


@pytest.mark.asyncio
async def test_openapi_history_and_diff(client, db_session, auth_headers):
    base_spec = OpenAPISpec(
        account_id=1000000,
        version="1.0.0",
        spec_json={
            "openapi": "3.0.0",
            "paths": {
                "/users": {
                    "get": {
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": {"id": {"type": "string"}, "email": {"type": "string"}},
                                        }
                                    }
                                },
                            }
                        }
                    }
                }
            },
        },
        created_at=datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=5),
    )
    revision_spec = OpenAPISpec(
        account_id=1000000,
        version="1.1.0",
        spec_json={
            "openapi": "3.0.0",
            "paths": {
                "/users": {
                    "get": {
                        "security": [{"bearerAuth": []}],
                        "responses": {
                            "200": {
                                "description": "ok",
                                "content": {
                                    "application/json": {
                                        "schema": {
                                            "type": "object",
                                            "properties": {"id": {"type": "string"}},
                                        }
                                    }
                                },
                            }
                        },
                    }
                }
            },
        },
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db_session.add_all([base_spec, revision_spec])
    await db_session.commit()

    history = await client.get("/api/openapi/history", headers=auth_headers)
    assert history.status_code == 200
    payload = history.json()
    assert payload["total"] >= 2

    diff = await client.post(
        "/api/openapi/diff",
        headers=auth_headers,
        json={"base_spec_id": base_spec.id, "revision_spec_id": revision_spec.id},
    )
    assert diff.status_code == 200
    diff_payload = diff.json()
    assert diff_payload["base_spec_id"] == base_spec.id
    assert diff_payload["revision_spec_id"] == revision_spec.id
    assert diff_payload["summary"]["total_breaking_changes"] >= 2


@pytest.mark.asyncio
async def test_openapi_scan_plan(client, db_session, auth_headers):
    spec = OpenAPISpec(
        account_id=1000000,
        version="2.0.0",
        spec_json={
            "openapi": "3.0.0",
            "security": [{"bearerAuth": []}],
            "paths": {
                "/users": {
                    "get": {"summary": "List users"},
                    "post": {"summary": "Create user"},
                },
                "/users/{id}": {
                    "get": {"summary": "Get user"},
                },
            },
        },
    )
    db_session.add(spec)
    await db_session.commit()

    resp = await client.post(
        "/api/openapi/scan-plan",
        headers=auth_headers,
        json={
            "spec_id": spec.id,
            "target_url": "https://api.example.com",
            "auth_header_name": "Authorization",
            "auth_header_site": "https://api.example.com",
            "extra_headers": {"X-Tenant": "${ZAP_TENANT_ID}"},
        },
    )
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["summary"]["spec_id"] == spec.id
    assert payload["summary"]["operation_count"] == 3
    assert payload["summary"]["authenticated_operation_count"] == 3
    assert "automation_yaml" in payload["artifacts"]
    assert "openapi" in payload["artifacts"]["automation_yaml"]
    assert "activeScan" in payload["artifacts"]["automation_yaml"]
    assert any(env["name"] == "ZAP_AUTH_HEADER" for env in payload["execution"]["required_env"])
