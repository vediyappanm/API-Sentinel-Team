# API Sentinel QA Report

Date: 2026-03-29
Workspace: `c:\Users\ELCOT\OneDrive\Desktop\soc`

## Scope

This pass focused on live admin and customer flows, plus the backend contracts those pages depend on.

Covered:
- admin signup and login
- workspace switching
- customer-only invite and login
- admin route sweep
- customer route sweep
- restricted-route enforcement
- pentest workbench happy path
- targeted backend contract feeds used by customer pages

Not fully covered:
- platform admin workspace end-to-end, because there is no simple local self-service `PLATFORM_ADMIN` bootstrap flow
- every form permutation and destructive action across the full app

## What Was Broken

The live sweep found four concrete issues:

1. `Schema Validation` called a missing frontend/backend contract.
   - Frontend requested `GET /api/openapi-specs/violations`
   - Backend only exposed OpenAPI management endpoints under `/api/openapi/*`

2. `Sensitive Data` called a missing backend route.
   - Frontend requested `GET /api/pii/findings`
   - Backend only exposed `GET /api/pii/`

3. `MCP Shield` called a missing backend route.
   - Frontend requested `GET /api/mcp-shield/servers`
   - Backend only exposed `GET /api/mcp-shield/endpoints`

4. The pentest configuration E2E was ambiguous after material preparation.
   - The page rendered both freshly prepared artifacts and persisted artifacts with the same visible label
   - The Playwright selector matched two `nuclei secret file` elements

## Fixes Applied

- Added `GET /api/openapi/violations` and mapped stored schema policy violations into the UI shape.
- Updated the Schema Validation page to call `/api/openapi/violations`.
- Added `GET /api/pii/findings` with enriched finding payloads for the customer UI.
- Added `GET /api/mcp-shield/servers` with customer-readable server summaries.
- Opened MCP Shield read access to authenticated users for listing data, while keeping mutation endpoints protected.
- Added explicit test IDs for prepared and persisted pentest artifact titles.
- Updated the Playwright pentest flow to target the prepared artifact deterministically.

## Verification

### Automated

- `venv311\Scripts\python.exe -m pytest tests\integration\test_customer_data_feeds.py tests\security\test_rbac_new_endpoints.py tests\integration\test_openapi_validation.py -q`
  - Result: `30 passed`

- `cd api-sentinel-view-main && npm run test:e2e -- --reporter=list`
  - Result: `2 passed`

### Live browser sweep

Verified clean after the fixes:
- `/app/discovery/schema`
- `/app/discovery/sensitive-data`
- `/app/protection/mcp-shield`

These pages no longer emitted `404` fetch errors in the live customer sweep.

## Current Status

Working well in this pass:
- admin login and admin workspace access
- customer invite and customer login
- admin/customer workspace separation
- restricted-route redirects
- pentest workbench happy path
- schema validation feed
- sensitive data feed
- MCP Shield feed

## Remaining Gaps

- platform admin still needs its own realistic test path
- frontend unit coverage is still very thin
- there are still broader repo-wide production concerns outside this QA slice, including legacy areas, deployment history, and remaining warning cleanup

## Recommended Next QA Pass

1. Full manual form-validation sweep on admin settings and onboarding
2. Customer workflow sweep on discovery, protection, reports, and live feed with richer seeded data
3. Platform admin bootstrap and route coverage
4. Negative-path session tests:
   - expired session
   - logout + browser back
   - direct deep links while unauthorized
