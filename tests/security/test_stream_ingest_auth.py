import pytest
from sqlalchemy import select

from server.models.core import IngestionJob, Sensor


@pytest.mark.asyncio
async def test_stream_ingest_requires_sensor_key(client):
    response = await client.post("/api/stream/ingest", json={"lines": ["127.0.0.1 - - [ok]"]})
    assert response.status_code == 403
    assert response.json()["message"] == "Sensor key required"


@pytest.mark.asyncio
async def test_stream_ingest_rejects_invalid_sensor_key(client):
    response = await client.post(
        "/api/stream/ingest",
        headers={"x-sensor-key": "bad-key"},
        json={"lines": ["127.0.0.1 - - [ok]"]},
    )
    assert response.status_code == 403
    assert response.json()["message"] == "Invalid sensor key"


@pytest.mark.asyncio
async def test_stream_ingest_uses_sensor_account(client, db_session, monkeypatch):
    sensor = Sensor(
        id="sensor-ingest-1",
        account_id=2003,
        name="collector-1",
        sensor_key="sensor-key-2003",
    )
    db_session.add(sensor)
    await db_session.commit()

    async def fake_enqueue(item):
        return True

    monkeypatch.setattr("server.api.routers.stream.ingestion_queue.enqueue", fake_enqueue)

    response = await client.post(
        "/api/stream/ingest",
        headers={"x-sensor-key": sensor.sensor_key},
        json={"lines": ["127.0.0.1 - - [ok]"]},
    )
    assert response.status_code == 200

    result = await db_session.execute(select(IngestionJob).where(IngestionJob.account_id == sensor.account_id))
    job = result.scalar_one()
    assert job.job_type == "stream_lines"


@pytest.mark.asyncio
async def test_stream_ebpf_ingest_requires_sensor_key(client):
    response = await client.post("/api/stream/ingest/ebpf", json={"events": [{"path": "/health"}]})
    assert response.status_code == 403
    assert response.json()["message"] == "Sensor key required"
