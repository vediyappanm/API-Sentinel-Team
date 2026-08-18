"""Cap and redact captured traffic samples before they are persisted."""

from __future__ import annotations

import json
from typing import Any

from server.models.core import APIEndpoint
from server.modules.utils.redactor import Redactor

# Match the sensor's 8 KiB evidence cap.
MAX_BODY_CHARS = 8192


def persistable_body(value: Any, *, max_chars: int = MAX_BODY_CHARS) -> str | None:
    """Return a redacted, length-capped body string, or None when empty."""
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        try:
            value = bytes(value).decode("utf-8", errors="replace")
        except Exception:
            return None
    if isinstance(value, (dict, list)):
        redacted = Redactor.redact_json(value)
        text = json.dumps(redacted, default=str) if not isinstance(redacted, str) else redacted
    else:
        text = str(value).strip()
        if not text:
            return None
        redacted = Redactor.redact_json(text)
        text = redacted if isinstance(redacted, str) else json.dumps(redacted, default=str)
    if not text:
        return None
    if len(text) > max_chars:
        return text[:max_chars]
    return text


def persistable_identity(value: Any, *, max_len: int = 128) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"unknown", "anonymous", "none", "null", "-"}:
        return None
    return text[:max_len]


def persistable_headers(headers: Any) -> dict[str, str] | None:
    if not isinstance(headers, dict) or not headers:
        return None
    lowered = {str(key).lower(): str(value) for key, value in headers.items() if value is not None}
    redacted = Redactor.redact_headers(lowered)
    return redacted or None


def apply_captured_sample(
    endpoint: APIEndpoint | None,
    *,
    request_body: Any = None,
    response_body: Any = None,
    response_headers: Any = None,
    request_headers: Any = None,
    user_id: str | None = None,
) -> None:
    """Keep the latest non-empty sample on the catalogue row for tests/detection."""
    if endpoint is None:
        return
    req_text = persistable_body(request_body)
    if req_text:
        endpoint.last_request_body = req_text
    resp_text = persistable_body(response_body)
    if resp_text:
        endpoint.last_response_body = resp_text
    headers = persistable_headers(response_headers)
    if headers:
        endpoint.last_response_headers = headers
    auth = list(endpoint.auth_types_found or [])
    req_headers = persistable_headers(request_headers) or {}
    authorization = str(req_headers.get("authorization") or "")
    if user_id or authorization.lower().startswith("bearer "):
        if "JWT" not in auth:
            auth.append("JWT")
            endpoint.auth_types_found = auth
    elif authorization.lower().startswith("basic ") and "BASIC" not in auth:
        auth.append("BASIC")
        endpoint.auth_types_found = auth
