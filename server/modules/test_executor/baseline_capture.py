"""
Captures a baseline response from an endpoint before mutation.
Used by ExecutionEngine to feed original_response into percentage_match checks.
"""
import httpx


class BaselineCapturer:
    """Sends the original (unmodified) request to get a baseline response."""

    async def capture(
        self,
        endpoint: dict,
        *,
        headers: dict | None = None,
        cookies: dict | None = None,
        timeout_seconds: float = 8.0,
        follow_redirects: bool = False,
        auth: tuple[str, str] | None = None,
    ) -> dict:
        url = endpoint.get("url") or f"{endpoint.get('protocol', 'http')}://{endpoint.get('host', '')}{endpoint.get('path', '/')}"
        method = endpoint.get("method", "GET").upper()
        merged_headers = dict(endpoint.get("headers") or {})
        merged_headers.update(headers or {})

        try:
            async with httpx.AsyncClient(timeout=timeout_seconds, verify=False, cookies=cookies or {}) as client:
                resp = await client.request(
                    method=method,
                    url=url,
                    headers=merged_headers,
                    auth=auth,
                    follow_redirects=follow_redirects,
                )
                return {
                    "status_code": resp.status_code,
                    "headers": dict(resp.headers),
                    "body": resp.text,
                }
        except Exception:
            # Fall back to cached data stored on the endpoint record
            return {
                "status_code": endpoint.get("last_response_code", 200),
                "headers": {},
                "body": endpoint.get("last_response_body") or "",
            }
