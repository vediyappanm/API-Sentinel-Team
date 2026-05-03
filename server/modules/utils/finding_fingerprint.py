"""Stable fingerprints for findings, scans, and vulnerabilities."""

from __future__ import annotations

import json
import re
from hashlib import sha256
from typing import Any
from urllib.parse import urlparse


_TRANSIENT_KEYS = {
    "timestamp",
    "time",
    "created_at",
    "updated_at",
    "request_id",
    "trace_id",
    "scan_id",
    "job_id",
    "run_id",
    "matched-at",
}

_SEVERITY_ORDER = {
    "INFO": 0,
    "LOW": 1,
    "MEDIUM": 2,
    "HIGH": 3,
    "CRITICAL": 4,
}


def _get_value(data: Any, key: str, default: Any = None) -> Any:
    if isinstance(data, dict):
        return data.get(key, default)
    return getattr(data, key, default)


def _normalize_text(value: Any) -> str:
    if value is None:
        return ""
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def _normalize_path(value: Any) -> str:
    path = _normalize_text(value).replace("\\", "/")
    return path.lower()


def _normalize_url(value: Any) -> str:
    raw = _normalize_text(value)
    if not raw:
        return ""
    parsed = urlparse(raw)
    host = parsed.netloc.lower()
    path = parsed.path or "/"
    return f"{host}{path}"


def _shape(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): _shape(val)
            for key, val in sorted(value.items())
            if str(key).lower() not in _TRANSIENT_KEYS
        }
    if isinstance(value, list):
        return [_shape(item) for item in value[:5]]
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if value is None:
        return "null"
    return _normalize_text(value)[:120]


def _digest(label: str, payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return sha256(f"{label}:{encoded}".encode("utf-8")).hexdigest()[:20]


def severity_rank(value: str | None) -> int:
    return _SEVERITY_ORDER.get(_normalize_text(value).upper(), -1)


def higher_severity(first: str | None, second: str | None) -> str | None:
    if severity_rank(first) >= severity_rank(second):
        return first
    return second


def vulnerability_fingerprint(data: Any) -> str:
    endpoint_identity = _normalize_text(_get_value(data, "endpoint_id"))
    if not endpoint_identity:
        endpoint_identity = _normalize_url(_get_value(data, "url"))
    payload = {
        "account_id": _get_value(data, "account_id", 0),
        "template_id": _normalize_text(_get_value(data, "template_id")).upper(),
        "endpoint": endpoint_identity,
        "method": _normalize_text(_get_value(data, "method")).upper(),
        "type": _normalize_text(_get_value(data, "type")).upper(),
        "evidence_shape": _shape(_get_value(data, "evidence")),
    }
    return _digest("vulnerability", payload)


def source_finding_fingerprint(data: Any) -> str:
    payload = {
        "account_id": _get_value(data, "account_id", 0),
        "repo_id": _normalize_text(_get_value(data, "repo_id")),
        "file_path": _normalize_path(_get_value(data, "file_path")),
        "line_number": _get_value(data, "line_number"),
        "finding_type": _normalize_text(_get_value(data, "finding_type")).upper(),
        "title": _normalize_text(_get_value(data, "title")),
        "endpoint_id": _normalize_text(_get_value(data, "endpoint_id")),
    }
    return _digest("source_finding", payload)


def nuclei_fingerprint(finding: Any, target: str = "", account_id: int | None = None) -> str:
    payload = {
        "account_id": account_id or 0,
        "target": _normalize_url(target or _get_value(finding, "host")),
        "template_id": _normalize_text(_get_value(finding, "template-id")).upper(),
        "name": _normalize_text(_get_value(finding, "name")),
        "severity": _normalize_text(_get_value(finding, "severity")).upper(),
        "matched_at": _normalize_url(_get_value(finding, "matched-at")),
    }
    return _digest("nuclei", payload)


def collapse_by_fingerprint(items: list[Any], fingerprint_fn) -> tuple[list[Any], list[dict[str, Any]]]:
    seen: dict[str, Any] = {}
    duplicates: list[dict[str, Any]] = []
    for item in items:
        fingerprint = fingerprint_fn(item)
        if fingerprint in seen:
            duplicates.append({"fingerprint": fingerprint, "item": item})
            continue
        seen[fingerprint] = item
    return list(seen.values()), duplicates
