import pytest

from server.config import settings


@pytest.mark.asyncio
async def test_signup_disabled_returns_403(client, monkeypatch):
    monkeypatch.setattr(settings, "SIGNUP_ENABLED", False)
    response = await client.post(
        "/api/auth/signup",
        json={
            "email": "blocked@example.com",
            "password": "StrongPass1234!",
            "account_name": "BlockedCorp",
        },
    )
    assert response.status_code == 403
    body = response.json()
    text = str(body.get("detail") or body.get("message") or body).lower()
    assert "disabled" in text


@pytest.mark.asyncio
async def test_public_auth_config_reports_signup_flag(client, monkeypatch):
    monkeypatch.setattr(settings, "SIGNUP_ENABLED", False)
    response = await client.get("/api/auth/public-config")
    assert response.status_code == 200
    assert response.json() == {"signup_enabled": False}

    monkeypatch.setattr(settings, "SIGNUP_ENABLED", True)
    enabled = await client.get("/api/auth/public-config")
    assert enabled.json() == {"signup_enabled": True}
