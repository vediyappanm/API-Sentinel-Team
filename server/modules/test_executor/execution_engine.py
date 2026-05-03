import asyncio
import json

import httpx
import jsonpath_ng
from sqlalchemy import select

from .baseline_capture import BaselineCapturer
from .context_manager import ContextManager
from .graph.graph import Graph, Node, NodeType
from .graph.graph_executor_factory import GraphExecutorFactory
from .request_mutator import RequestMutator
from .response_validator import ResponseValidator
from .wordlist_resolver import WordListResolver
from server.config import settings
from server.models.core import TestAccount
from server.modules.identity.auth_rotator import AuthRotator
from server.modules.identity.roles_context import RolesContextBuilder


class ExecutionEngine:
    """
    Orchestrates authenticated template execution with graph-based request flows.
    """

    def __init__(
        self,
        concurrency: int = 10,
        test_id: str | None = None,
        timeout_seconds: float | None = None,
        db=None,
        auth_profile: object | None = None,
        follow_redirects: bool = False,
        attacker_role: str = "ATTACKER",
    ):
        self.mutator = RequestMutator()
        self.validator = ResponseValidator()
        self.baseliner = BaselineCapturer()
        self.auth_rotator = AuthRotator()
        self.roles_context_builder = RolesContextBuilder()
        self.limit = asyncio.Semaphore(max(1, concurrency))
        self.test_id = test_id or "test-run"
        self.timeout_seconds = float(timeout_seconds or settings.TEST_REQUEST_TIMEOUT)
        self.db = db
        self.auth_profile = auth_profile
        self.follow_redirects = bool(follow_redirects)
        self.attacker_role = attacker_role or "ATTACKER"
        self._runtime_auth_cache: dict[str, dict] = {}

    async def execute_test(self, endpoint: dict, template: dict) -> dict:
        """
        Runs a specific test template against a target endpoint using graph-based orchestration.
        """
        context_manager = ContextManager()
        execute_cfg = template.get("execute", {})
        requests = execute_cfg.get("requests", [])

        if not requests:
            return {"error": "No requests defined in template"}

        initial_context = await self._build_initial_context(endpoint)
        context_manager.store.update(initial_context)

        wordlists_cfg = template.get("wordLists", {})
        if wordlists_cfg:
            resolver = WordListResolver()
            resolved_wordlists = await resolver.resolve(wordlists_cfg)
            for var_name, values in resolved_wordlists.items():
                context_manager.store[var_name] = values[0] if values else ""

        runtime_auth = await self._resolve_runtime_auth(endpoint)
        baseline = await self.baseliner.capture(
            endpoint,
            headers=runtime_auth["headers"],
            cookies=runtime_auth["cookies"],
            timeout_seconds=self.timeout_seconds,
            follow_redirects=self.follow_redirects,
            auth=runtime_auth["basic_auth"],
        )
        context_manager.store["baseline"] = baseline
        graph = self._build_graph(requests)

        execute_type = execute_cfg.get("type", "single")
        executor = GraphExecutorFactory.get_executor(execute_type, context_manager)
        final_results = []
        last_request_sent = None
        last_response_data = None

        async def run_node_step(node: Node, resolved_data: dict, current_context: dict):
            nonlocal last_request_sent, last_response_data
            async with self.limit:
                req_rules = resolved_data.get("req", [{}])
                if not req_rules:
                    req_rules = [{}]

                auth_cfg = template.get("auth", {})
                allow_state_change = execute_cfg.get("allow_state_change", False)
                is_validation_node = node.data.get("validation_node", False) or (node.id == list(graph.nodes.keys())[-1])
                node_last_response = None

                async with httpx.AsyncClient(
                    timeout=self.timeout_seconds,
                    verify=True,
                    cookies=runtime_auth["cookies"],
                ) as client:
                    for rule_idx, current_rule in enumerate(req_rules):
                        current_rule = context_manager.substitute_recursive(current_rule)
                        auth_context = dict(current_context.get("auth_context", {}))
                        auth_context.setdefault("auth_header", runtime_auth["auth_header"])
                        auth_context.setdefault("attacker_token", current_context.get("attacker_token", ""))
                        mutated_req = self.mutator.mutate(endpoint, current_rule, auth_context=auth_context)
                        mutated_req = self._apply_runtime_auth(mutated_req, runtime_auth, auth_cfg)

                        method = (mutated_req.get("method") or "").upper()
                        if method in {"DELETE", "PUT", "PATCH"} and not allow_state_change:
                            final_results.append(
                                {
                                    "node_id": node.id,
                                    "rule_idx": rule_idx,
                                    "vulnerable": False,
                                    "error": "state_change_blocked",
                                }
                            )
                            continue

                        headers = mutated_req.get("headers") or {}
                        headers.setdefault("X-APISecurity-Test-ID", self.test_id)
                        mutated_req["headers"] = headers
                        follow_redirects = bool(mutated_req.get("follow_redirect", self.follow_redirects))
                        last_request_sent = {
                            "method": mutated_req["method"],
                            "url": mutated_req["url"],
                            "headers": headers,
                            "body": mutated_req.get("body"),
                            "follow_redirects": follow_redirects,
                        }

                        try:
                            resp = await client.request(
                                method=mutated_req["method"],
                                url=mutated_req["url"],
                                headers=headers,
                                content=mutated_req.get("body"),
                                auth=runtime_auth["basic_auth"],
                                follow_redirects=follow_redirects,
                            )
                        except Exception as req_err:
                            final_results.append(
                                {
                                    "node_id": node.id,
                                    "rule_idx": rule_idx,
                                    "vulnerable": False,
                                    "error": str(req_err),
                                }
                            )
                            continue

                        response_data = {
                            "status_code": resp.status_code,
                            "headers": dict(resp.headers),
                            "body": resp.text,
                        }
                        node_last_response = response_data
                        last_response_data = response_data

                        vulnerable = (
                            self.validator.validate(
                                response_data,
                                template.get("validate", {}),
                                original_response=baseline,
                            )
                            if is_validation_node
                            else (200 <= resp.status_code < 300)
                        )

                        final_results.append(
                            {
                                "node_id": node.id,
                                "rule_idx": rule_idx,
                                "vulnerable": vulnerable,
                                "response": {
                                    "status_code": resp.status_code,
                                    "headers": response_data["headers"],
                                },
                            }
                        )

                return node_last_response

        try:
            await executor.execute(graph, {}, run_node_step)
        except Exception as exc:
            final_results.append({"error": str(exc)})

        is_vulnerable = any(result.get("vulnerable", False) for result in final_results)

        return {
            "template_id": template["id"],
            "severity": template.get("info", {}).get("severity"),
            "is_vulnerable": is_vulnerable,
            "results": final_results,
            "context_variables": list(context_manager.store.keys()),
            "sent_request": last_request_sent,
            "received_response": last_response_data,
        }

    def _build_graph(self, requests: list) -> Graph:
        graph = Graph()
        prev_node_id = None
        for idx, req_cfg in enumerate(requests):
            node_id = f"step_{idx}"
            node = Node(id=node_id, type=NodeType.API, data=req_cfg)
            graph.add_node(node)
            if prev_node_id:
                graph.add_edge(prev_node_id, node_id)
            prev_node_id = node_id
        return graph

    async def _build_initial_context(self, endpoint: dict) -> dict:
        roles_context = {}
        if self.db is not None:
            account_id = endpoint.get("account_id")
            if account_id is None:
                raise ValueError("endpoint account_id is required")
            result = await self.db.execute(
                select(TestAccount).where(TestAccount.account_id == account_id)
            )
            roles_context = self.roles_context_builder.build(result.scalars().all())
        flat_roles = self.roles_context_builder.flatten(roles_context)
        attacker_token = self.roles_context_builder.get_attacker_token(roles_context, self.attacker_role)
        auth_header = self._profile_header_name()
        context = {
            **flat_roles,
            "roles_access_context": roles_context,
            "attacker_token": attacker_token,
            "auth_context": {
                "attacker_token": attacker_token,
                "auth_header": auth_header,
            },
            "auth_context.attacker_token": attacker_token,
            "auth_context.auth_header": auth_header,
        }
        return context

    async def _resolve_runtime_auth(self, endpoint: dict) -> dict:
        auth_profile = self.auth_profile
        if auth_profile is None:
            return {
                "headers": {},
                "cookies": {},
                "basic_auth": None,
                "auth_header": "Authorization",
            }

        cache_key = f"{getattr(auth_profile, 'id', 'inline')}:{endpoint.get('host')}:{endpoint.get('path')}"
        if cache_key in self._runtime_auth_cache:
            return self._runtime_auth_cache[cache_key]

        mode = (getattr(auth_profile, "auth_mode", "header") or "header").lower()
        headers = dict(getattr(auth_profile, "static_headers", {}) or {})
        cookies = {}
        basic_auth = None
        auth_header = self._profile_header_name()

        if mode == "basic":
            basic_auth = (getattr(auth_profile, "username", "") or "", getattr(auth_profile, "password", "") or "")
        elif mode == "cookie":
            for item in getattr(auth_profile, "cookies", []) or []:
                key = item.get("key")
                value = item.get("value")
                if key and value is not None:
                    cookies[key] = value
            if getattr(auth_profile, "cookie_name", None) and getattr(auth_profile, "cookie_value", None):
                cookies[auth_profile.cookie_name] = auth_profile.cookie_value
        elif mode == "dynamic_bearer":
            token_value = await self._fetch_dynamic_token(auth_profile)
            if token_value:
                headers[auth_header] = token_value
        else:
            token_value = getattr(auth_profile, "token", None) or getattr(auth_profile, "header_value", None)
            if token_value:
                headers[auth_header] = token_value

        resolved = {
            "headers": headers,
            "cookies": cookies,
            "basic_auth": basic_auth,
            "auth_header": auth_header,
        }
        self._runtime_auth_cache[cache_key] = resolved
        return resolved

    async def _fetch_dynamic_token(self, auth_profile: object) -> str:
        login_url = getattr(auth_profile, "login_url", None)
        token_selector = getattr(auth_profile, "token_json_path", None)
        if not login_url or not token_selector:
            return ""

        payload = dict(getattr(auth_profile, "login_payload", {}) or {})
        if getattr(auth_profile, "username", None) and "username" not in payload:
            payload["username"] = auth_profile.username
        if getattr(auth_profile, "password", None) and "password" not in payload:
            payload["password"] = auth_profile.password

        async with httpx.AsyncClient(timeout=self.timeout_seconds, verify=True) as client:
            response = await client.request(
                method=(getattr(auth_profile, "login_method", "POST") or "POST").upper(),
                url=login_url,
                json=payload,
                headers=dict(getattr(auth_profile, "login_headers", {}) or {}),
                follow_redirects=self.follow_redirects,
            )
        if response.status_code >= 400:
            return ""
        return self._extract_token(response, token_selector)

    def _extract_token(self, response: httpx.Response, selector: str) -> str:
        if selector.startswith("$"):
            try:
                body_json = response.json()
                expression = jsonpath_ng.parse(selector)
                matches = expression.find(body_json)
                if matches:
                    return str(matches[0].value)
            except Exception:
                return ""
            return ""
        if selector.startswith("/"):
            try:
                body = response.json()
            except Exception:
                return ""
            current = body
            for part in [segment for segment in selector.split("/") if segment]:
                if isinstance(current, dict):
                    current = current.get(part)
                else:
                    return ""
            return str(current or "")
        return response.headers.get(selector, "")

    def _apply_runtime_auth(self, request: dict, runtime_auth: dict, auth_cfg: dict) -> dict:
        mutated = dict(request)
        headers = dict(mutated.get("headers") or {})
        for key, value in (runtime_auth.get("headers") or {}).items():
            headers.setdefault(key, value)
        if auth_cfg.get("type") == "override" and self.db is not None:
            # Template requests can still fully override auth via RequestMutator.
            headers = {
                key: value
                for key, value in headers.items()
            }
        mutated["headers"] = headers
        return mutated

    def _profile_header_name(self) -> str:
        if self.auth_profile is None:
            return "Authorization"
        return getattr(self.auth_profile, "header_name", None) or "Authorization"
