from sqlalchemy import select

from server.models.core import APICollection, APIEndpoint, RequestLog, Sensor
from server.modules.sensors.keys import hash_sensor_key


async def _ingest(client, db_session, events, *, account_id=1000000, key="ebpf-inventory-key"):
    sensor = Sensor(
        id=f"sensor-{key}",
        account_id=account_id,
        name="ebpf-inventory",
        sensor_key=hash_sensor_key(key),
    )
    db_session.add(sensor)
    await db_session.commit()
    response = await client.post(
        "/api/stream/ingest/ebpf",
        headers={"Authorization": f"Bearer {key}"},
        json={"events": events},
    )
    assert response.status_code == 200
    return response


async def test_ebpf_ingest_upserts_catalogue_and_stores_host(client, db_session):
    await _ingest(
        client,
        db_session,
        [
            {
                "method": "GET",
                "path": "/api/health/ready",
                "host": "payments.example.com",
                "status": 200,
                "source_ip": "10.244.0.59",
            }
        ],
    )

    endpoint = (
        await db_session.execute(
            select(APIEndpoint).where(
                APIEndpoint.account_id == 1000000,
                APIEndpoint.method == "GET",
                APIEndpoint.path_pattern == "/api/health/ready",
                APIEndpoint.host == "payments.example.com",
            )
        )
    ).scalar_one()
    assert endpoint.status == "ACTIVE"
    assert endpoint.tags["sources"] == ["ebpf"]

    collection = (
        await db_session.execute(
            select(APICollection).where(APICollection.id == endpoint.collection_id)
        )
    ).scalar_one()
    assert collection.name == "Default Inventory"

    log = (
        await db_session.execute(
            select(RequestLog).where(RequestLog.source_ip == "10.244.0.59")
        )
    ).scalar_one()
    assert log.host == "payments.example.com"
    assert log.endpoint_id == endpoint.id


async def test_ebpf_ingest_merges_harbor_blob_digests(client, db_session):
    await _ingest(
        client,
        db_session,
        [
            {
                "method": "HEAD",
                "path": (
                    "/v2/finspot/api-sentinel-frontend/blobs/"
                    "sha256:61ca4f733c802afd9e05a32f0de0361b6d713b8b53292dc15fb093229f648674"
                ),
                "host": "harbor.wecrew.in",
                "status": 401,
            },
            {
                "method": "HEAD",
                "path": (
                    "/v2/finspot/api-sentinel-frontend/blobs/"
                    "sha256:d7e5070240863957ebb0b5a44a5729963c3462666baa2947d00628cb5f2d5773"
                ),
                "host": "harbor.wecrew.in",
                "status": 401,
            },
        ],
        key="ebpf-harbor-key",
    )

    endpoints = (
        await db_session.execute(
            select(APIEndpoint).where(
                APIEndpoint.account_id == 1000000,
                APIEndpoint.host == "harbor.wecrew.in",
                APIEndpoint.method == "HEAD",
            )
        )
    ).scalars().all()
    assert len(endpoints) == 1
    assert endpoints[0].path_pattern == "/v2/finspot/api-sentinel-frontend/blobs/{digest}"


async def test_ebpf_ingest_skips_this_console_when_host_missing(client, db_session):
    await _ingest(
        client,
        db_session,
        [
            {
                "method": "GET",
                "path": "/api/stream/recent",
                "status": 200,
                "source_ip": "10.244.0.59",
            },
            {
                "method": "GET",
                "path": "/api/sensors/",
                "status": 200,
                "source_ip": "10.244.0.59",
            },
        ],
        key="ebpf-self-skip-key",
    )

    logs = (
        await db_session.execute(
            select(RequestLog).where(RequestLog.source_ip == "10.244.0.59")
        )
    ).scalars().all()
    assert logs == []


async def test_ebpf_ingest_skips_cors_public_host(client, db_session, monkeypatch):
    monkeypatch.setattr(
        "server.modules.ingestion.self_traffic.settings.CORS_ORIGINS_OVERRIDE",
        "https://sentinel.wecrew.in",
    )
    await _ingest(
        client,
        db_session,
        [
            {
                "method": "GET",
                "path": "/api/health/ready",
                "host": "sentinel.wecrew.in",
                "status": 200,
                "source_ip": "10.244.0.8",
            }
        ],
        key="ebpf-cors-skip-key",
    )
    logs = (
        await db_session.execute(
            select(RequestLog).where(RequestLog.source_ip == "10.244.0.8")
        )
    ).scalars().all()
    assert logs == []


async def test_ebpf_ingest_persists_bodies_identity_and_endpoint_sample(client, db_session):
    await _ingest(
        client,
        db_session,
        [
            {
                "method": "POST",
                "path": "/api/login",
                "host": "payments.example.com",
                "source_ip": "10.10.10.10",
                "protocol": "HTTP/2",
                "user_id": "user-42",
                "user_role": "admin",
                "session_id": "sid-abc",
                "request": {
                    "method": "POST",
                    "path": "/api/login",
                    "host": "payments.example.com",
                    "headers": {"authorization": "Bearer eyJhbGciOiJIUzI1NiJ9.aaa.bbb"},
                    "body": '{"email":"a@b.com","password":"raw-secret"}',
                },
                "response": {
                    "status": 200,
                    "headers": {"content-type": "application/json"},
                    "body": '{"ok":true,"token":"raw-token"}',
                },
            }
        ],
        key="ebpf-body-key",
    )

    log = (
        await db_session.execute(
            select(RequestLog).where(RequestLog.source_ip == "10.10.10.10")
        )
    ).scalar_one()
    assert log.host == "payments.example.com"
    assert log.protocol == "HTTP/2"
    assert log.user_id == "user-42"
    assert log.user_role == "admin"
    assert log.session_id == "sid-abc"
    assert log.request_body is not None
    assert "a@b.com" in log.request_body or "email" in log.request_body
    assert "raw-secret" not in (log.request_body or "")
    assert log.response_body is not None
    assert "raw-token" not in (log.response_body or "")

    endpoint = (
        await db_session.execute(
            select(APIEndpoint).where(
                APIEndpoint.account_id == 1000000,
                APIEndpoint.method == "POST",
                APIEndpoint.host == "payments.example.com",
                APIEndpoint.path_pattern == "/api/login",
            )
        )
    ).scalar_one()
    assert endpoint.last_request_body
    assert "raw-secret" not in endpoint.last_request_body
    assert "JWT" in (endpoint.auth_types_found or [])
