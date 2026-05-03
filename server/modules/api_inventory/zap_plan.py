"""Generate OWASP ZAP scan plans from stored OpenAPI specs."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import yaml


_HTTP_METHODS = ("get", "post", "put", "patch", "delete", "options", "head")


def _normalized_target(target_url: str) -> str:
    return target_url.rstrip("/")


def _include_regex(target_url: str, path: str) -> str:
    base = _normalized_target(target_url)
    suffix = path if path.startswith("/") else f"/{path}"
    return f"{base}{suffix}.*"


class ZapScanPlanBuilder:
    """Builds a CI-friendly ZAP automation plan from an OpenAPI spec."""

    def build(
        self,
        *,
        spec: dict[str, Any],
        target_url: str,
        spec_id: str | None = None,
        context_name: str = "api-sentinel",
        max_passive_wait_minutes: int = 5,
        active_scan_policy: str = "API Policy",
        fail_severity: str = "High",
        warn_severity: str = "Medium",
        auth_header_name: str | None = None,
        auth_header_site: str | None = None,
        extra_headers: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        extra_headers = extra_headers or {}
        paths = (spec or {}).get("paths", {}) or {}
        operations: list[dict[str, Any]] = []
        include_paths: list[str] = []
        auth_required = 0

        for path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue
            include_paths.append(_include_regex(target_url, path))
            for method in _HTTP_METHODS:
                operation = path_item.get(method)
                if not isinstance(operation, dict):
                    continue
                requires_auth = bool(operation.get("security") or spec.get("security"))
                auth_required += 1 if requires_auth else 0
                operations.append(
                    {
                        "method": method.upper(),
                        "path": path,
                        "operation_id": operation.get("operationId"),
                        "requires_auth": requires_auth,
                        "summary": operation.get("summary"),
                    }
                )

        plan = {
            "env": {
                "contexts": [
                    {
                        "name": context_name,
                        "urls": [_normalized_target(target_url)],
                        "includePaths": include_paths or [f"{_normalized_target(target_url)}.*"],
                        "excludePaths": [],
                    }
                ],
                "parameters": {
                    "failOnError": True,
                    "failOnWarning": False,
                    "progressToStdout": True,
                },
            },
            "jobs": [
                {
                    "type": "openapi",
                    "parameters": {
                        "apiFile": "openapi.json",
                        "context": context_name,
                        "targetUrl": _normalized_target(target_url),
                    },
                },
            ],
        }

        if extra_headers:
            plan["jobs"].append(
                {
                    "type": "replacer",
                    "parameters": {"deleteAllRules": False},
                    "rules": [
                        {
                            "description": f"Inject {header}",
                            "url": "",
                            "matchType": "req_header",
                            "matchString": header,
                            "replacementString": value,
                            "matchRegex": False,
                            "tokenProcessing": False,
                        }
                        for header, value in sorted(extra_headers.items())
                    ],
                }
            )

        plan["jobs"].extend(
            [
                {
                    "type": "passiveScan-wait",
                    "parameters": {"maxDuration": max(1, max_passive_wait_minutes)},
                },
                {
                    "type": "activeScan",
                    "parameters": {
                        "context": context_name,
                        "policy": active_scan_policy,
                    },
                },
                {
                    "type": "passiveScan-wait",
                    "parameters": {"maxDuration": max(1, max_passive_wait_minutes)},
                },
                {
                    "type": "exitStatus",
                    "parameters": {
                        "errorLevel": fail_severity.title(),
                        "warnLevel": warn_severity.title(),
                        "okExitValue": 0,
                        "errorExitValue": 1,
                        "warnExitValue": 2,
                    },
                },
            ]
        )

        required_env = []
        if auth_header_name:
            required_env.extend(
                [
                    {"name": "ZAP_AUTH_HEADER", "value": auth_header_name},
                    {"name": "ZAP_AUTH_HEADER_VALUE", "value": "<set-in-ci>"},
                ]
            )
            if auth_header_site:
                required_env.append({"name": "ZAP_AUTH_HEADER_SITE", "value": auth_header_site})

        parsed_target = urlparse(_normalized_target(target_url))
        docker_command = (
            "docker run --rm -v ${PWD}:/zap/wrk -w /zap/wrk "
            "ghcr.io/zaproxy/zaproxy:stable "
            "zap.sh -cmd -autorun zap-plan.yaml"
        )

        return {
            "summary": {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "spec_id": spec_id,
                "target_url": _normalized_target(target_url),
                "host": parsed_target.netloc,
                "path_count": len(paths),
                "operation_count": len(operations),
                "authenticated_operation_count": auth_required,
                "uses_header_auth_env": bool(auth_header_name),
                "uses_replacer_rules": bool(extra_headers),
            },
            "artifacts": {
                "openapi_filename": "openapi.json",
                "plan_filename": "zap-plan.yaml",
                "openapi_spec": spec,
                "automation_yaml": yaml.safe_dump(plan, sort_keys=False),
            },
            "execution": {
                "docker_command": docker_command,
                "local_command": "zap.sh -cmd -autorun zap-plan.yaml",
                "required_env": required_env,
            },
            "plan": plan,
            "operations": operations,
            "recommendations": [
                "Run the plan with a disposable auth token scoped to test data.",
                "Prefer the built-in ZAP authentication header env vars for a single bearer-style header.",
                "Use replacer rules only when the target needs multiple custom headers.",
            ],
        }
