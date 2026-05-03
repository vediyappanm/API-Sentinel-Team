# Implementation Update

This file records the changes made in the latest enhancement pass.

## Latest Fresh-Bootstrap + Default-Tenant Hardening Pass

### What Was Hardened

- Made Alembic fresh installs work from a truly empty database:
  - `migrations/env.py`
- Alembic now:
  - adds the repo root to `sys.path`
  - honors `DATABASE_URL`
  - bootstraps current metadata only for a truly empty DB during `upgrade`
  - stamps the current head revision so greenfield installs no longer fail on the broken historical baseline chain
- Added an integration regression test for that path:
  - `tests/integration/test_fresh_bootstrap_migration.py`
- Removed frontend fake collection/account assumptions from the discovery/protection/testing data layer:
  - `api-sentinel-view-main/src/services/discovery.service.ts`
  - `api-sentinel-view-main/src/services/protection.service.ts`
  - `api-sentinel-view-main/src/services/testing.service.ts`
  - `api-sentinel-view-main/src/hooks/use-discovery.ts`
  - `api-sentinel-view-main/src/lib/auth-context.tsx`
- Frontend outcome:
  - collection IDs now carry real backend values or explicit non-tenant placeholders like `default-inventory`
  - session restore no longer silently invents account `1000000`
- Hardened backend helpers so they fail closed instead of silently writing into tenant `1000000`:
  - `server/modules/identity/auth_rotator.py`
  - `server/modules/test_executor/result_aggregator.py`
  - `server/modules/traffic_capture/sample_data_writer.py`
  - `server/modules/vulnerability_detector/store.py`
  - `server/modules/threat_engine/actor_tracker.py`
  - `server/modules/threat_engine/stream_processor.py`
- Added helper regression coverage:
  - `tests/unit/test_account_id_required_helpers.py`

### Validation

```powershell
venv311\Scripts\python.exe -m pytest `
  tests\unit\test_account_id_required_helpers.py `
  tests\integration\test_fresh_bootstrap_migration.py `
  tests\security\test_rbac_new_endpoints.py `
  tests\security\test_legacy_router_tenant_isolation.py -q

venv311\Scripts\python.exe -m py_compile `
  migrations\env.py `
  server\modules\identity\auth_rotator.py `
  server\modules\test_executor\result_aggregator.py `
  server\modules\traffic_capture\sample_data_writer.py `
  server\modules\vulnerability_detector\store.py `
  server\modules\threat_engine\actor_tracker.py `
  server\modules\threat_engine\stream_processor.py

cd api-sentinel-view-main
npm run build
npm run test
npm run test:e2e -- --reporter=list
```

Result:

- backend regression tests: `37 passed`
- backend `py_compile` passed
- fresh manual `alembic upgrade head` on a new SQLite DB succeeded and stamped:
  - `20260329_account_scoped_identity_uniqueness`
- frontend production build passed
- frontend unit tests passed
- Playwright E2E: `2 passed`

## Latest Frontend Session + BOLA Hardening Pass

### What Was Hardened

- Removed the last frontend pages that still depended on `localStorage` bearer tokens and moved them to the shared cookie-aware API client:
  - `api-sentinel-view-main/src/lib/api-client.ts`
  - `api-sentinel-view-main/src/customer/pages/alerts/AlertCenter.tsx`
  - `api-sentinel-view-main/src/customer/pages/discovery/ApiCatalogue.tsx`
  - `api-sentinel-view-main/src/customer/pages/discovery/ApiSequenceFlow.tsx`
  - `api-sentinel-view-main/src/customer/pages/live/LiveFeed.tsx`
  - `api-sentinel-view-main/src/customer/pages/protection/BlockList.tsx`
  - `api-sentinel-view-main/src/components/widgets/SensitiveDataWidget.tsx`
- Added reusable frontend session helpers for:
  - building API URLs
  - building WebSocket URLs
  - raw authenticated fetches with `credentials: include`
  - consistent `401` handling / session-expiry redirect
- Fixed live frontend/backend contract mismatches that were still hiding behind raw fetches:
  - alerts now normalize `created_at -> timestamp`
  - blocklist now normalizes `created_at -> blocked_at`
  - auto-block results now normalize `newly_blocked -> blocked_count`
  - sensitive-data widget now uses the real `GET /api/pii/findings` feed instead of a non-existent summary endpoint
- Fully locked down the legacy BOLA router:
  - `server/api/routers/bola.py`
- BOLA changes included:
  - removed hardcoded tenant defaulting
  - added auth + permission enforcement
  - scoped endpoint/sample/attacker lookup to the authenticated account
  - imported/fixed vulnerability listing correctly
  - prevented cross-tenant BOLA test-account reuse
- Removed the FastAPI startup deprecation warning source in:
  - `server/api/routers/schedules.py`

### Tests Added / Updated

- Extended:
  - `tests/security/test_rbac_new_endpoints.py`
  - `tests/security/test_legacy_router_tenant_isolation.py`

### Validation

```powershell
venv311\Scripts\python.exe -m pytest tests\security\test_rbac_new_endpoints.py tests\security\test_legacy_router_tenant_isolation.py -q
venv311\Scripts\python.exe -m pytest tests\integration\test_customer_data_feeds.py tests\integration\test_openapi_validation.py -q
venv311\Scripts\python.exe -m py_compile server\api\routers\bola.py server\api\routers\schedules.py

cd api-sentinel-view-main
npm run build
npm run test
npm run test:e2e -- --reporter=list
```

Result:

- backend security tests: `31 passed`
- backend integration tests: `6 passed`
- backend `py_compile` passed
- frontend production build passed
- frontend unit tests passed
- Playwright E2E: `2 passed`

## Latest Account-Scoped Uniqueness Migration Pass

### What Was Hardened

- Converted three tenant-sensitive global uniqueness rules into account-scoped uniqueness in the ORM:
  - `ThreatActor(account_id, source_ip)`
  - `AgenticSession(account_id, session_identifier)`
  - `BlockedIP(account_id, ip)`
- Updated model definitions in:
  - `server/models/core.py`
- Added a new Alembic merge migration:
  - `migrations/versions/20260329_account_scoped_identity_uniqueness.py`
- Removed temporary cross-tenant workarounds and updated dependent code to use the new account-scoped uniqueness safely:
  - `server/api/routers/agent_guard.py`
  - `server/api/routers/akto_admin.py`
  - `server/api/routers/blocklist.py`
  - `server/api/routers/threat_detection.py`
  - `server/api/routers/traffic.py`
  - `server/modules/threat_engine/actor_tracker.py`

### Tests Added

- Added:
  - `tests/unit/test_account_scoped_uniqueness.py`

### Validation

```powershell
venv311\Scripts\python.exe -m pytest tests\unit\test_account_scoped_uniqueness.py tests\security\test_legacy_router_tenant_isolation.py tests\security\test_rbac_new_endpoints.py tests\security\test_security_self.py -q
```

Result:

- `34 passed`

### Migration Validation

- Verified the new Alembic revision upgrades a copied local SQLite database from the existing stamped heads to:
  - `20260329_account_scoped_identity_uniqueness`
- Confirmed the upgraded schema now contains:
  - `uq_threat_actors_account_source_ip`
  - `uq_agentic_sessions_account_session_identifier`
  - `uq_blocked_ips_account_ip`

## Latest Legacy Router Tenant-Isolation Pass

### What Was Hardened

- Removed fixed/default account handling from the remaining legacy tenant-facing routers and switched them to auth-derived account scoping:
  - `server/api/routers/alerts.py`
  - `server/api/routers/blocklist.py`
  - `server/api/routers/sensors.py`
  - `server/api/routers/mcp_shield.py`
  - `server/api/routers/oauth.py`
  - `server/api/routers/workflows.py`
  - `server/api/routers/threat_detection.py`
- Tightened auth boundaries on legacy management actions:
  - alerts mutating routes now require security-engineer/admin
  - blocklist mutations now require security-engineer/admin
  - sensor inventory/register/deregister now require admin
  - MCP shield endpoint management now requires `mcp_shield:manage`
  - workflow CRUD/execute now require workflow permissions
  - OAuth provider CRUD/list now requires admin
  - threat-detection session listing and actor-status mutations now require auth
- Added safer handling around legacy globally unique identifiers so tenant B no longer mutates tenant A rows during threat/session operations.

### Tests Added

- Extended:
  - `tests/security/test_rbac_new_endpoints.py`
- Added:
  - `tests/security/test_legacy_router_tenant_isolation.py`

### Validation

```powershell
venv311\Scripts\python.exe -m pytest tests\security\test_rbac_new_endpoints.py tests\security\test_legacy_router_tenant_isolation.py tests\security\test_security_self.py -q
```

Result:

- `28 passed`

### Remaining Honest Risk

- Some legacy models still use globally unique tenant-sensitive fields, so full production-grade isolation still needs a schema/migration pass:
  - `ThreatActor.source_ip`
  - `BlockedIP.ip`
  - `AgenticSession.session_identifier`

## Latest Release Hardening Pass

### What Was Hardened

- Stabilized the new frontend Playwright flow for:
  - workspace switching
  - customer-user creation
  - auth profile creation
  - pentest profile creation
  - material preparation
  - verification run launch
- Made the Playwright web-server setup cross-platform so the same config now works on local Windows and CI Linux:
  - `api-sentinel-view-main/playwright.config.ts`
  - `api-sentinel-view-main/tests/e2e/workspace-and-pentest.spec.ts`
- Tightened route-level permissions on endpoint and test operations:
  - endpoint reads now require `endpoints:read`
  - endpoint writes now require `endpoints:write`
  - endpoint deletes now require `endpoints:delete`
  - test reads now require `tests:read`
  - test execution now requires `tests:run`
  - files:
    - `server/api/routers/endpoints.py`
    - `server/api/routers/tests.py`
- Removed fixed-tenant handling from the traffic import/export surfaces and made them account-aware + permissioned:
  - `server/api/routers/traffic.py`
  - `server/modules/traffic_capture/sample_data_writer.py`
- Hardened the Akto-compatible admin shim endpoints so admin-only data and actions are no longer exposed to any authenticated user:
  - `server/api/routers/akto_admin.py`

### CI / Quality Gates

- Expanded CI to cover:
  - backend security tests
  - frontend unit tests
  - frontend production build
  - frontend Playwright E2E on pull requests
- Updated file:
  - `.github/workflows/ci.yml`

### Validation

```powershell
venv311\Scripts\python.exe -m pytest tests\security\test_rbac_new_endpoints.py tests\security\test_security_self.py tests\integration\test_pipeline.py tests\integration\test_detection_meta.py tests\integration\test_pentest_router.py tests\integration\test_endpoint_revisions.py -q

cd api-sentinel-view-main
npm run test
npm run build
npm run test:e2e -- --reporter=list
```

Result:

- `26 passed`
- frontend unit tests passed
- frontend production build passed
- Playwright E2E: `2 passed`

## Latest Codex Owner-Agent Setup

### What Was Added

- Added a root owner-agent instruction file so one Codex agent can run this repo end to end:
  - `AGENTS.md`
- Added a ready-to-copy prompt file for non-technical handoff to a single Codex owner agent:
  - `docs/CODEX_SINGLE_OWNER_PROMPT.md`

### Why It Matters

- Codex now has repo-specific instructions for:
  - backend run commands
  - frontend run/build/test commands
  - migrations
  - Docker and Helm deployment paths
  - staging-first deployment discipline
  - safe behavior around secrets, destructive actions, and production risk
- This makes it much easier to give one Codex agent full ownership from build through staging deploy without rewriting instructions every time.

## Latest Dev Runtime Stabilization Pass

### What Was Fixed

- Prevented the pentest control-plane endpoints from crashing when a local SQLite database has not been migrated to the latest schema yet:
  - `server/api/routers/pentest.py`
- Pentest read endpoints now degrade safely with empty/default inventory plus schema metadata instead of returning raw SQL errors.
- Pentest write endpoints now return an actionable `503` message telling local developers to run:
  - `alembic upgrade head`
- Fixed the endpoint lifecycle background worker shutdown path:
  - `server/modules/api_inventory/lifecycle.py`
- The lifecycle worker now:
  - uses structured logging correctly
  - awaits task cancellation during shutdown
  - avoids the noisy reload-time traceback caused by disposing the DB engine before the task finished
- Fixed a stale lineage router import so the app can import cleanly in tests:
  - `server/api/routers/lineage.py`

### Validation

```powershell
$env:DEBUG='true'
venv311\Scripts\python.exe -m pytest tests\integration\test_pentest_router.py tests\unit\test_endpoint_lifecycle.py -q
```

Result:

- `5 passed`

## Latest Frontend Detection + Pentest UX Pass

### What Was Enhanced

- Added a dedicated security-ops frontend data layer for the new backend control-plane surfaces:
  - `api-sentinel-view-main/src/services/security-ops.service.ts`
  - `api-sentinel-view-main/src/hooks/use-security-ops.ts`
- Reworked the customer testing workspace to reflect the unified detection engine and the new pentest control plane:
  - `api-sentinel-view-main/src/customer/pages/testing/TestDashboard.tsx`
  - `api-sentinel-view-main/src/customer/pages/testing/TestConfiguration.tsx`
  - `api-sentinel-view-main/src/customer/pages/testing/TestInspector.tsx`
  - `api-sentinel-view-main/src/customer/pages/testing/TestingLayout.tsx`
- Reworked admin operations so detection and pentest posture are visible from one operational screen:
  - `api-sentinel-view-main/src/admin/pages/operations/OperationsDashboard.tsx`

### Frontend Outcome

- The testing dashboard now shows:
  - unified detection pipeline mode
  - detector registry counts and state backend status
  - pentest stack readiness, auth profile counts, and recent run telemetry
- The configuration screen now supports:
  - auth profile creation
  - pentest profile creation
  - Schemathesis / Nuclei material preparation
  - scoped run launch against templates and endpoints
  - persisted artifact visibility
- The inspector now supports:
  - recent run selection
  - per-run result review
  - SARIF / JUnit export actions
- The operations dashboard now exposes:
  - system tab
  - detection tab with thresholds and detector registry
  - pentest tab with scan-stack readiness and category coverage
  - references tab with official detection and pentest documentation links

### Frontend Validation

```powershell
cd api-sentinel-view-main
npm run build
```

Result:

- production build passed
- new entry chunk: `54.90 kB`
- detection / pentest pages are route-split and production-compiled

### Cleanup Included

- Removed duplicate JSX `onBlur` warnings in:
  - `api-sentinel-view-main/src/pages/Login.tsx`

## Latest Deploy Hardening Pass

### What Was Hardened

- Reworked app startup so production no longer auto-creates schema or seeds demo tenants on boot:
  - `server/api/main.py`
  - added explicit startup flags in `server/config.py`
- Added deploy-safe settings validation:
  - rejects `STARTUP_BOOTSTRAP_SCHEMA=True` and `STARTUP_ENABLE_DEMO_BOOTSTRAP=True` when `DEBUG=False`
  - accepts deploy-style `DEBUG` values like `release` and `production`
- Replaced optimistic health behavior with real deploy probes:
  - `GET /api/health`
  - `GET /api/health/live`
  - `GET /api/health/ready`
  - updated file: `server/api/routers/health.py`
- Fixed scheduled scan execution so APScheduler creates a real `TestRun` and preserves tenant/account context:
  - `server/modules/scheduler/test_scheduler.py`
  - `server/api/routers/schedules.py`

### Packaging and Deployment Updates

- Restored a shared backend dependency manifest:
  - `requirements.txt`
- Cleaned the container image build:
  - removed unused spaCy download
  - copied `tests-library`
  - added `PYTHONDONTWRITEBYTECODE` / `PYTHONUNBUFFERED`
  - file: `Dockerfile`
- Fixed `docker-compose` for realistic local deployment:
  - aligned Postgres credentials
  - added required secrets/envs
  - switched healthcheck to `/api/health/ready`
  - runs `alembic upgrade head` before app boot
  - file: `docker-compose.yml`
- Refreshed deploy environment docs:
  - `.env.example`
- Hardened Helm deployment config:
  - explicit secrets for `DATABASE_URL`, `REDIS_URL`, `KAFKA_BOOTSTRAP_SERVERS`, `JWT_SECRET`, `API_KEY`, `ENCRYPTION_KEY`
  - readiness/liveness probe paths
  - pre-install/pre-upgrade migration job
  - files:
    - `infra/helm/api-sentinel/values.yaml`
    - `infra/helm/api-sentinel/templates/secret.yaml`
    - `infra/helm/api-sentinel/templates/deployment.yaml`
    - `infra/helm/api-sentinel/templates/migrate-job.yaml`
- Updated GitHub deploy workflows to pass required Helm secrets:
  - `.github/workflows/deploy.yml`
  - `.github/workflows/deploy-env.yml`

### Validation

```powershell
venv311\Scripts\python.exe -m py_compile `
  server\api\main.py `
  server\api\routers\health.py `
  server\api\routers\schedules.py `
  server\config.py `
  server\modules\scheduler\test_scheduler.py `
  tests\unit\test_health_router.py `
  tests\unit\test_scheduler.py

$env:DEBUG='true'
venv311\Scripts\python.exe -m pytest tests\unit\test_health_router.py tests\unit\test_scheduler.py -q
venv311\Scripts\python.exe -c "import asyncpg, apscheduler, email_validator; import server.api.main; print('deploy deps ok')"
venv311\Scripts\python.exe -c "import server.api.main; print('app import ok')"
```

Result:

- `py_compile` passed
- `4 passed`
- `deploy deps ok`
- `app import ok`

### Important Note

- This hardening makes the deploy/runtime path much safer and more repeatable.
- It does **not** make the whole platform fully production-ready by itself; broader auth and tenant-isolation gaps across other routers still need a dedicated hardening pass.

## Latest Pentest Production Batch

### What Was Added

- Added a new pentest control-plane API:
  - `GET /api/pentest/meta`
  - `GET /api/pentest/auth-profiles`
  - `POST /api/pentest/auth-profiles`
  - `GET /api/pentest/profiles`
  - `POST /api/pentest/profiles`
  - `POST /api/pentest/profiles/{profile_id}/prepare`
  - `GET /api/pentest/artifacts`
- Added durable pentest/auth configuration models:
  - `AuthProfile`
  - `PentestProfile`
  - `PentestArtifact`
- Added new pentest orchestration modules:
  - `server/modules/pentest/profiles.py`
  - `server/modules/pentest/nuclei_secret_file.py`
  - `server/modules/pentest/schemathesis_runner.py`
  - `server/modules/pentest/orchestrator.py`

### What Was Hardened

- Upgraded the legacy scan runner to become profile-aware:
  - `server/api/routers/tests.py`
- Upgraded the execution engine for more realistic authenticated testing:
  - shared DB-backed auth rotation
  - role-context injection for BFLA/BOLA templates
  - request-level redirect handling
  - per-profile concurrency / timeout / redirect policy
  - profile-driven static and dynamic auth material resolution
  - files:
    - `server/modules/test_executor/execution_engine.py`
    - `server/modules/test_executor/baseline_capture.py`
    - `server/modules/test_executor/context_manager.py`
    - `server/modules/test_executor/request_mutator.py`
- Removed a hidden nested-transaction pattern from test-result vulnerability storage:
  - `server/modules/test_executor/result_aggregator.py`
- Registered the new pentest API router:
  - `server/api/routers/__init__.py`

### What The New Pentest Batch Enables

- reusable authenticated scan profiles for bearer/basic/header/cookie flows
- Schemathesis config generation from stored OpenAPI + auth profile settings
- Nuclei authenticated secret-file generation scoped to target domains
- prepared pentest artifacts that can be persisted and audited
- safer production defaults for scan concurrency and request behavior
- existing `/api/tests/run` scans can now use a `pentest_profile_id`

### Validation

```powershell
$env:DEBUG='true'
venv311\Scripts\python.exe -m pytest tests\unit\test_pentest_builders.py tests\integration\test_pentest_router.py tests\integration\test_pipeline.py::test_full_test_run_pipeline -q
venv311\Scripts\python.exe -c "from server.api.main import app; print('app import ok')"
```

Result:

- `5 passed`
- `app import ok`

## Latest Detection Engine Production Pass

### What Was Added

- Added a new authenticated detection control-plane endpoint:
  - `GET /api/detection/meta`
- Added detection-engine knowledge-pack docs:
  - `docs/detection-engine/README.md`
  - `docs/detection-engine/detector-catalog.md`
  - `docs/detection-engine/ml-handoff.md`

### What Was Hardened

- Registered the unified detection pipeline in the public router surface:
  - `server/api/routers/__init__.py`
- Wired eBPF stream ingestion into the unified pipeline with active/shadow handling:
  - `server/api/routers/stream.py`
- Wired queued ingestion paths into the unified pipeline:
  - `server/modules/ingestion/processors.py`
- Wired stream aggregate detection into the unified pipeline:
  - `server/modules/streaming/pipeline.py`
- Converted enforcement to pure ASGI middleware:
  - `server/modules/enforcement/adaptive_rate_limiter.py`
- Reworked legacy compatibility layers so correlation/incident calls delegate safely into the new flow:
  - `server/modules/detection/correlation_engine.py`
  - `server/modules/response/incident_orchestrator.py`
  - `server/modules/detection/engine.py`

### Validation

```powershell
$env:DEBUG='true'
venv311\Scripts\python.exe -m pytest tests\integration\test_detection_meta.py tests\unit\test_detection_engine.py tests\test_tier2_enforcement_integration.py -q
```

Result:

- `11 passed`

## Latest Update: AppSentinels-Inspired Organization Onboarding

### What Was Added

- Added a production-style onboarding flow inspired by the public AppSentinels onboarding pattern:
  - `api-sentinel-view-main/src/pages/Onboarding.tsx`
  - `api-sentinel-view-main/src/lib/onboarding-context.tsx`
- Added real settings pages for the previously empty onboarding-related settings tiles:
  - `api-sentinel-view-main/src/admin/pages/settings/ApiKeysManagement.tsx`
  - `api-sentinel-view-main/src/admin/pages/settings/LicenseUsage.tsx`
  - `api-sentinel-view-main/src/admin/pages/settings/AttributeMapping.tsx`

### Backend Persistence Added

- Added persistent organization settings storage:
  - `server/models/core.py`
  - `server/api/routers/akto_admin.py`
- Added real account settings persistence for:
  - deployment preferences
  - traffic source defaults
  - application defaults
  - identity/session attribute mapping
  - feature envelope
  - onboarding completion state
  - license envelope metadata
- Added organization API key management endpoints:
  - `POST /api/getApiKeys`
  - `POST /api/createApiKey`
  - `POST /api/revokeApiKey`

### Frontend Integration Added

- Wired settings routes into the app:
  - `api-sentinel-view-main/src/App.tsx`
- Updated the settings landing page to navigate to real screens instead of placeholders:
  - `api-sentinel-view-main/src/admin/pages/settings/SettingsPage.tsx`
- Updated the top bar search shortcuts to include the new settings pages:
  - `api-sentinel-view-main/src/components/layout/TopBar.tsx`
- Upgraded onboarding so it now:
  - loads persisted account settings
  - saves onboarding progress back to the backend
  - links directly to API keys, license usage, and attribute mapping

### Tests and Validation

Backend verification:

```powershell
$env:DEBUG='true'
$env:PYTHONPATH='c:\Users\ELCOT\OneDrive\Desktop\soc'
venv311\Scripts\python.exe -m pytest tests\integration\test_admin_settings.py tests\security\test_rbac_new_endpoints.py -q
```

Result:

- `13 passed`

Frontend verification:

```powershell
cd api-sentinel-view-main
npm run build
```

Result:

- production build passed

### Notes

- This implementation is intentionally AppSentinels-inspired, not a literal clone of proprietary/private behavior.
- The new onboarding flow now covers the major public setup concepts that were missing in this project:
  - controller/runtime planning
  - traffic bootstrap
  - application registration
  - org API keys
  - license envelope
  - session/user/tenant attribute mapping
  - go-live validation

## Latest Frontend Hardening Pass

### What Was Enhanced

- Converted the app to route-level lazy loading in:
  - `api-sentinel-view-main/src/App.tsx`
- Added a shared app-shell loading experience for route transitions and auth restoration:
  - `api-sentinel-view-main/src/components/layout/AppShellFallback.tsx`
  - `api-sentinel-view-main/src/components/auth/ProtectedRoute.tsx`
- Added responsive layout state for desktop collapse + mobile drawer behavior:
  - `api-sentinel-view-main/src/components/layout/layout-context.tsx`
  - `api-sentinel-view-main/src/hooks/use-media-query.ts`
- Upgraded the main shell for better mobile/desktop behavior:
  - `api-sentinel-view-main/src/customer/layouts/CustomerLayout.tsx`
  - `api-sentinel-view-main/src/components/layout/Sidebar.tsx`
  - `api-sentinel-view-main/src/components/layout/TopBar.tsx`
- Added Vite manual chunking for better production delivery:
  - `api-sentinel-view-main/vite.config.ts`

### Production Build Result

- Before this pass, the frontend was shipping as a roughly `1.2 MB` monolithic main JS bundle.
- After this pass, the build is split into route and vendor chunks.
- The new entry chunk is roughly `49.71 kB`.
- The largest remaining shared chunk is `charts-vendor` at roughly `411.14 kB`.

### Notes

- This is a meaningful production improvement for first-load behavior and responsive usability.
- The charts/maps vendors are still the biggest remaining frontend weight, so deeper chart-level code splitting would be the next performance step.

## Latest Frontend Workspace Separation Pass

### What Was Enhanced

- Split the frontend into three production-style workspaces:
  - customer workspace under `/app/*`
  - organization admin workspace under `/admin/*`
  - platform admin workspace under `/platform/*`
- Added workspace-aware route guards and root routing so users land in the right area based on role and onboarding state.
- Added a separate platform admin workspace shell so internal/vendor operations are not mixed into tenant-facing admin screens.
- Kept compatibility redirects for the legacy URL structure so migration does not break bookmarked or older in-app links.

### Production Cleanups Included

- Updated internal navigation to use the new workspace routes directly instead of relying on legacy redirects.
- Fixed discovery, testing, and protection tab layouts after moving them under `/app/*`.
- Fixed auth session restore so browser sessions now recover correctly from the backend's `httpOnly` cookie on refresh.
- Updated logout to call the backend logout endpoint before clearing local auth state.
- Aligned signup validation with backend password policy before form submission.

### Validation

```powershell
cd api-sentinel-view-main
npm run build
```

Result:

- production build passed
- workspace split and route migration compiled successfully

## What Was Added

### 1. Finding Fingerprints and Deduplication
- Added stable fingerprint generation for:
  - vulnerabilities
  - source-code findings
  - Nuclei findings
- New module:
  - `server/modules/utils/finding_fingerprint.py`
- Added reusable vulnerability upsert/dedup helper:
  - `server/modules/vulnerability_detector/store.py`

### 2. Vulnerability Dedup Applied Across Flows
- Integrated deduplicated vulnerability creation into:
  - `server/modules/test_executor/result_aggregator.py`
  - `server/modules/ingestion/processors.py`
  - `server/api/routers/bola.py`

### 3. OpenAPI to ZAP Scan Plan Generation
- Added a new ZAP automation plan builder:
  - `server/modules/api_inventory/zap_plan.py`
- Added new authenticated API endpoint:
  - `POST /api/openapi/scan-plan`
- Updated file:
  - `server/api/routers/openapi_specs.py`

This endpoint now returns:
- generated ZAP automation YAML
- OpenAPI artifact payload
- execution commands
- required environment variables
- operation summary

### 4. Unified Endpoint Lineage View
- Added endpoint lineage service:
  - `server/modules/api_inventory/lineage.py`
- Added new authenticated API endpoint:
  - `GET /api/endpoints/{endpoint_id}/lineage`
- Updated file:
  - `server/api/routers/endpoints.py`

This lineage response now brings together:
- endpoint revisions
- vulnerabilities
- policy violations
- evidence
- test results
- source-code findings
- OpenAPI documentation status
- related Nuclei matches

### 5. Source Code Scan Improvements
- Updated:
  - `server/api/routers/source_code.py`

Improvements:
- deduplicates repeated findings across scans
- links discovered source-code endpoints back to known API endpoints
- returns created vs deduplicated finding counts
- returns fingerprints in findings API responses

### 6. Nuclei API Hardening
- Updated:
  - `server/api/routers/nuclei.py`

Improvements:
- added auth and tenant scoping to scan/list/detail/template routes
- deduplicates repeated findings within and across scans
- returns fingerprints for findings
- reports new vs repeated vs deduplicated findings

### 7. Minor Auth and Routing Fixes
- Updated:
  - `server/modules/auth/rbac.py`
  - `server/api/routers/evidence.py`

Fixes:
- direct `RBAC.require_auth(request)` calls now work safely
- `/api/evidence` no longer depends on a redirect edge case

## Tests Added or Updated

### New / Updated Tests
- `tests/unit/test_finding_fingerprint.py`
- `tests/integration/test_openapi_validation.py`
- `tests/integration/test_endpoint_revisions.py`
- `tests/integration/test_source_code_scan_dedup.py`
- `tests/security/test_rbac_new_endpoints.py`

### Validation Run

```powershell
$env:PYTHONPATH='c:\Users\ELCOT\OneDrive\Desktop\soc'
$env:DEBUG='true'
venv311\Scripts\python.exe -m pytest `
  tests\unit\test_finding_fingerprint.py `
  tests\unit\test_openapi_diff.py `
  tests\integration\test_openapi_validation.py `
  tests\integration\test_endpoint_revisions.py `
  tests\integration\test_source_code_scan_dedup.py `
  tests\security\test_rbac_new_endpoints.py -q
```

Result:

- `17 passed`

## Important Note

These changes improve production readiness, but they do **not** fully resolve all previously identified repo-wide issues.

Still outstanding from the larger review:
- broader tenant-isolation gaps in other routers
- startup-time schema/demo seeding
- deployment/config mismatches
- incomplete CI quality gates
- frontend lint/performance/test debt

## Main Files Changed In This Pass

- `server/modules/utils/finding_fingerprint.py`
- `server/modules/vulnerability_detector/store.py`
- `server/modules/api_inventory/zap_plan.py`
- `server/modules/api_inventory/lineage.py`
- `server/modules/test_executor/result_aggregator.py`
- `server/modules/ingestion/processors.py`
- `server/api/routers/bola.py`
- `server/api/routers/source_code.py`
- `server/api/routers/openapi_specs.py`
- `server/api/routers/endpoints.py`
- `server/api/routers/nuclei.py`
- `server/api/routers/vulnerabilities.py`
- `server/modules/auth/rbac.py`
- `server/api/routers/evidence.py`

## Latest Background Worker + Import Scope Hardening Pass

### Updated
- `server/modules/analytics/processor.py`
- `server/modules/storage/archiver.py`
- `server/modules/integrations/burp_importer.py`
- `server/modules/integrations/postman_importer.py`
- `server/modules/source_code_analyzer/scanner.py`
- `server/api/routers/integrations.py`
- `server/api/routers/audit_logs.py`
- `tests/unit/test_background_processors.py`
- `tests/unit/test_account_id_required_helpers.py`
- `tests/integration/test_integrations_import.py`

### Improvements
- analytics and archive startup workers now support safe all-tenant mode when configured with account `0`, instead of silently behaving like single-tenant workers
- background workers now clear tenant context after each tenant pass and use safe exception logging
- Burp/Postman/source-code import helpers now require explicit `account_id` instead of falling back to tenant `1000000`
- Burp sample-data imports now persist the authenticated tenant on `SampleData` rows
- audit-log helper now fails closed if `account_id` is missing

### Validation Run

```powershell
venv311\Scripts\python.exe -m pytest `
  tests\unit\test_background_processors.py `
  tests\unit\test_account_id_required_helpers.py `
  tests\integration\test_integrations_import.py `
  tests\integration\test_source_code_scan_dedup.py -q
```

Result:

- `14 passed`

Additional verification:

- `py_compile ok` for the changed backend modules and new tests

## Latest Background Multi-Tenant Hardening Pass

### Updated
- `server/modules/analytics/processor.py`
- `server/modules/analytics/aggregator.py`
- `server/modules/storage/archiver.py`
- `server/modules/integrations/burp_importer.py`
- `server/modules/integrations/postman_importer.py`
- `server/modules/source_code_analyzer/scanner.py`
- `server/api/routers/integrations.py`
- `tests/unit/test_account_id_required_helpers.py`
- `tests/unit/test_background_processors.py`
- `tests/integration/test_import_scoping.py`

### Improvements
- `AnalyticsProcessor` now treats `account_id=0` as safe all-tenant mode instead of silently assuming tenant `1000000`
- `ArchiveProcessor` now supports the same all-tenant mode and no longer behaves like a hidden single-tenant worker
- background processor error logging now uses standard-library-safe exception logging
- Burp/Postman importers and the source-code scanner now fail closed when `account_id` is missing
- Burp-imported `SampleData` is now explicitly stored under the caller's account instead of relying on model defaults
- fixed the analytics aggregation bug where `func.case(..., else_=...)` crashed under SQLAlchemy 2

### Validation Run

```powershell
venv311\Scripts\python.exe -m pytest `
  tests\unit\test_background_processors.py `
  tests\unit\test_account_id_required_helpers.py `
  tests\integration\test_import_scoping.py `
  tests\integration\test_fresh_bootstrap_migration.py `
  tests\security\test_rbac_new_endpoints.py `
  tests\security\test_legacy_router_tenant_isolation.py -q
```

Result:

- `45 passed`

Additional checks:

- `py_compile ok` on changed backend files
- `cd api-sentinel-view-main && npm run build` passed

## Latest Runtime Tenant-Identity Hardening Pass

### Updated
- `server/api/routers/stream.py`
- `server/modules/storage/warm_exporter.py`
- `server/modules/test_executor/execution_engine.py`
- `tests/unit/test_account_id_required_helpers.py`
- `tests/unit/test_warm_exporter.py`
- `tests/security/test_stream_ingest_auth.py`

### Improvements
- stream ingestion now requires a valid sensor identity instead of silently routing unauthenticated ingest traffic into a default tenant
- eBPF stream ingestion now enforces the same sensor-key requirement
- warm-store export now uses a global cursor account (`0`) instead of pinning export state to tenant `1000000`
- warm-store exporter logging now uses standard-library-safe exception logging
- execution-engine role-context lookup now fails closed when endpoint tenant context is missing

### Validation Run

```powershell
venv311\Scripts\python.exe -m pytest `
  tests\unit\test_background_processors.py `
  tests\unit\test_account_id_required_helpers.py `
  tests\unit\test_warm_exporter.py `
  tests\integration\test_import_scoping.py `
  tests\integration\test_fresh_bootstrap_migration.py `
  tests\security\test_stream_ingest_auth.py `
  tests\security\test_rbac_new_endpoints.py `
  tests\security\test_legacy_router_tenant_isolation.py -q
```

Result:

- `51 passed`

Additional checks:

- `py_compile ok` on changed backend files

## Latest ORM Tenant Guard Pass

### Updated
- `server/modules/persistence/database.py`
- `tests/unit/test_account_id_orm_guard.py`

### Improvements
- async ORM flushes now reject tenant-scoped rows when `account_id` is missing instead of silently inheriting model defaults
- tenant-scoped rows also reject non-positive `account_id` values
- `WarmExportCursor` keeps the intentional global cursor exception and allows `account_id=0`

### Validation Run

```powershell
venv311\Scripts\python.exe -m pytest `
  tests\unit\test_account_id_orm_guard.py `
  tests\unit\test_account_id_required_helpers.py `
  tests\unit\test_warm_exporter.py `
  tests\security\test_stream_ingest_auth.py `
  tests\integration\test_import_scoping.py `
  tests\integration\test_fresh_bootstrap_migration.py -q
```

Result:

- `21 passed`

Additional checks:

- `py_compile ok` on the ORM guard changes

## Latest Onboarding State Sync Pass

### What Was Updated
- backend `GET /api/getAccountSettingsForAdvancedFilters` now computes go-live validation flags (controller health, passive traffic, inventory, policies) and merges them into `accountSettings.onboarding.validation` so downstream consumers see canonical state.
- onboarding workflow now logs validation state changes (controller health/inventory) to the backend, syncs manual checkbox toggles, and pulls the canonical validation flags when the account settings payload arrives.

### Validation

```powershell
venv311\Scripts\python.exe -m pytest tests\integration\test_fresh_bootstrap_migration.py -q
cd api-sentinel-view-main
npm run test -- --run
```

Result:

- backend migration test: `1 passed`
- frontend Vitest: `1 passed`

## Latest Lifecycle Stability + Full Validation Pass

### Updated
- `server/modules/api_inventory/lifecycle.py`
- `tests/unit/test_endpoint_lifecycle.py`

### Improvements
- fixed lifecycle error logging so exception handling never crashes on stdlib logger fallback
- removed DB-level mixed-timezone datetime comparisons from lifecycle sweeps and normalized endpoint timestamps in Python to UTC-naive before stale/revive decisions
- kept lifecycle behavior unchanged at outcome level (zombie mark + revive), but made it stable for mixed sqlite timestamp formats
- added regression coverage for timezone-aware stale endpoints in sqlite-backed tests

### Validation Run

```powershell
venv311\Scripts\python.exe -m pytest tests\unit\test_endpoint_lifecycle.py tests\unit\test_account_id_orm_guard.py -q
venv311\Scripts\python.exe -m pytest tests -q

cd api-sentinel-view-main
npm run test -- --run
npm run build
npm run test:e2e -- --reporter=list
```

Result:

- targeted backend tests: `6 passed`
- full backend test suite: `164 passed, 6 skipped`
- frontend unit tests: passed
- frontend production build: passed
- Playwright E2E: `2 passed`

## Latest Staging Rehearsal + Deploy Fix Pass

### Updated
- `.dockerignore`
- `docker-compose.yml`
- `migrations/versions/20260329_account_scoped_identity_uniqueness.py`
- `tests/integration/test_fresh_bootstrap_migration.py`

### What Was Fixed
- fixed Docker build-context failures on Windows/OneDrive by adding a real `.dockerignore` and excluding transient artifacts (`__pycache__`, local venvs, local DB files, node/dist caches)
- resolved local staging port conflict by moving Redis host bind from `6379:6379` to `6380:6379` in Compose
- fixed a production-blocking Alembic issue on Postgres:
  - prior revision id `20260329_account_scoped_identity_uniqueness` exceeded Alembic/Postgres `alembic_version.version_num VARCHAR(32)`
  - migrated to safe revision id `20260329_acct_scoped_identity_uq`
  - updated bootstrap migration regression test to match

### Staging Rehearsal Validation

```powershell
# Build + start staging-like stack
docker compose up -d --build

# Smoke checks
curl.exe -sS -i http://127.0.0.1:8000/api/health/ready
curl.exe -sS -i http://127.0.0.1:8000/api/health/live
curl.exe -sS -i http://127.0.0.1:8000/api/health

# Auth smoke (signup + cookie session)
POST /api/auth/signup
GET  /api/auth/me
GET  /api/detection/meta
GET  /api/pentest/meta
```

Result:

- Compose services up: `fastapi`, `postgres`, `redis`, `kafka`
- `/api/health/ready`: `200`
- `/api/health/live`: `200`
- `/api/health`: `200`
- authenticated `/api/auth/me`: `200`
- authenticated `/api/detection/meta`: `200`
- authenticated `/api/pentest/meta`: `200`

### Additional Validation

```powershell
venv311\Scripts\python.exe -m pytest tests\integration\test_fresh_bootstrap_migration.py -q
```

Result:

- `1 passed`
