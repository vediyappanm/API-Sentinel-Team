# API Sentinel / API Security Engine — Project Memory

Last reviewed: 2026-05-03  
Purpose: persistent context for humans and agents working in this repository.

---

## What this project is

**API-Sentinel-Team** is a full-stack **API security platform** (branded in code as **“API Security Engine”** / AppSentinel-style). It provides:

- **API inventory** and endpoint lifecycle management  
- **Vulnerability and security testing** driven by a large **tests library** (YAML templates, remediation docs; lineage from **Akto**-style patterns)  
- **Runtime monitoring**: traffic/stream ingestion, sensors, alerts, evidence, playbooks  
- **Detection pipeline** (unified “engine” with shadow/active modes)  
- **LLM/agent-adjacent controls**: agent guard, MCP shield, agentic sessions  
- **ML-assisted detection** (scikit-learn, PyOD, anomaly-oriented workflows)  
- **Enforcement** (blocks, adaptive rate limiting, policies)  
- **Compliance / PII / governance / audit** surfaces  
- **Pentest orchestration** (profiles, Nuclei integration, safe/balanced/aggressive modes)  
- **Recon** scheduling and external findings  

---

## Repository layout (high level)

| Path | Role |
|------|------|
| `server/` | Python backend (FastAPI app, routers, business logic, modules) |
| `api-sentinel-view-main/` | Frontend: **Vite + React 18 + TypeScript**, Radix/shadcn-style UI, TanStack Query, Playwright/Vitest |
| `tests-library/` | Massive catalog of security **test templates** and **remediation** markdown (OWASP/API Top 10–style coverage) |
| `migrations/` | Alembic migration scripts (`versions/`, `env.py`) |
| `tests/` | `unit/`, `integration/`, `e2e/`, `security/`, `load/` (Locust) |
| `docs/` | Extra design notes (e.g. `docs/detection-engine/README.md`) |
| `infra/` | Infrastructure bits (e.g. Flink-related material) |
| `docker-compose.yml` | **Postgres 16**, **Redis 7**, **Kafka** (Confluent local), FastAPI service |
| `Dockerfile` | Python 3.11 image; runs uvicorn; copies `server/`, `migrations/`, `tests-library/` |
| `Makefile` | Test targets: unit, integration, e2e, load, security |
| `requirements.txt` | Python dependencies (FastAPI, SQLAlchemy, Redis, Kafka, ML, etc.) |
| `api_security.db` | Local SQLite DB artifact (dev; also configurable via `DATABASE_URL`) |

---

## Backend stack

- **Framework:** FastAPI (`server.api.main:app`)  
- **ASGI server:** Uvicorn  
- **DB:** SQLAlchemy 2.x **async**; default dev URL is **SQLite** (`sqlite+aiosqlite:///./api_security.db`); production uses **PostgreSQL** + `asyncpg`  
- **Migrations:** Alembic (see `migrations/`). **`alembic.ini`** at repo root is **`COPY`**’d in **`Dockerfile`** — keep it tracked for image builds; override DB URL at runtime via env / `DATABASE_URL` as needed.  
- **Cache / queue:** Redis (optional)  
- **Streaming:** Kafka + `aiokafka`; optional `StreamPipeline`, `KafkaAlertConsumer` when `STREAM_ENGINE=FLINK`  
- **Auth:** JWT (`PyJWT`), bcrypt passwords, API keys, optional tenant **RLS** (`TENANT_RLS_ENABLED`)  
- **Rate limiting:** `slowapi` + custom **AdaptiveRequestGuard**  
- **Scheduling:** APScheduler-driven components (test scheduler, recon, lifecycle, archiver, etc.)  
- **Logging:** `structlog`  

**Config:** `server/config.py` — `pydantic-settings`, loads `.env`. Important flags include:

- `UNIFIED_PIPELINE_MODE`: `off` | `shadow` | `active` (detection/enforcement ownership)  
- `STREAM_ENGINE`: `IN_PROCESS` | `FLINK`  
- `TESTS_LIBRARY_PATH` → `./tests-library`  
- Startup toggles: demo bootstrap, template refresh, playbooks, analytics processor, archiver, ingestion queue, stream pipeline, etc.  

**API prefix:** All REST routers are mounted under **`/api`** (except `POST /` root ingest for eBPF-style sensor payloads).

---

## Main Python packages (`server/`)

- **`server/api/`** — `main.py` (lifespan, CORS, middleware), **`routers/`** (40+ route modules: auth, endpoints, tests, vulnerabilities, stream, ingestion, alerts, sensors, enforcement, ml, pentest, detection_meta, agentic, …), `rate_limiter.py`  
- **`server/models/`** — SQLAlchemy models: accounts, users, endpoints, tests, vulnerabilities, schedules, traffic/logs, integrations, audit, ingestion jobs, OpenAPI specs, evidence, playbooks, agentic sessions, metrics, etc.  
- **`server/modules/`** — Feature implementations, including non-exhaustively:  
  - `ingestion/`, `streaming/`, `threat_engine/`, `detection/`, `enforcement/`  
  - `test_executor/` (incl. **WordlistManager** / template library refresh)  
  - `analytics/`, `pentest/`, `nuclei/`, `recon/`, `ml/`, `api_inventory/`  
  - `response/` (default playbooks), `storage/`, `scheduler/`  
  - `agentic/`, plus parsers, validation, tenancy, RLS  

---

## Detection engine (conceptual)

Documented in `docs/detection-engine/README.md`:

**Flow:**  
`source adapters → NormalizationAgent → DetectionEnvelope → RuleDetectionAgent → DetectionSignal[] → CorrelationAgent → IncidentDecision → EnforcementAgent`

**Modes:** `off` (legacy detectors), `shadow` (new path runs without canonical writes), `active` (unified pipeline owns alerts/evidence/enforcement).

---

## Frontend (`api-sentinel-view-main/`)

- **Vite 5**, **React 18**, **TypeScript**  
- **UI:** Radix primitives, Tailwind, **shadcn**-style patterns (`components.json` typical)  
- **Data:** TanStack React Query, Zustand  
- **Routing:** react-router-dom  
- **Charts/maps:** recharts, react-simple-maps  
- Dev server commonly **`http://localhost:5173`** (matches default CORS in `server/config.py`)

---

## Tests library (`tests-library/`)

- Very large set of **YAML (and related) test definitions** plus **remediation** markdown per finding type (XSS, XXE, BOLA, SQLi, LLM-specific tests, etc.).  
- README in-tree points at **Akto** product/docs (this repo appears to implement or extend similar testing concepts).  
- Backend loads templates via **`WordlistManager`** from `TESTS_LIBRARY_PATH` at startup when `STARTUP_REFRESH_TEMPLATE_LIBRARY` is true.

---

## How to run (typical)

1. **Backend:** Install Python deps (`requirements.txt`), configure `.env` from `.env.example`, run Alembic upgrades if using Postgres, then `uvicorn server.api.main:app --reload` (or use Docker Compose).  
2. **Frontend:** `cd api-sentinel-view-main && npm install && npm run dev`  
3. **Health:** `/api/health/ready` (used in compose healthcheck)  

**Compose** wires FastAPI on **8000**, Postgres, Redis (**6380** host → 6379 container), Kafka **9092**.

## eBPF sensor (Argus / `api-sentinel-sensor`)

- **Ingest URL:** `POST /v1/events` (JSON body with `events[]`; `Authorization: Bearer <sensor_key>`). Same handler as `POST /api/stream/ingest/ebpf`.  
- **Register** a `Sensor` in the app; the bearer token must match `Sensor.sensor_key`. The CLI `--account-id` must match the account you used when creating that sensor.  
- **Production TLS + nginx:** see `infra/nginx/api-sentinel-production.conf` and `infra/nginx/README.md`. Example K8s DaemonSet: `infra/k8s/sensor-daemonset.example.yaml`.

---

## Testing commands (`Makefile`)

- `make test-unit` — pytest `tests/unit/` with coverage on `server`  
- `make test-integration` — `tests/integration/`  
- `make test-e2e` — `tests/e2e/`  
- `make test-security` — `tests/security/`  
- `make test-load` — Locust against localhost:8000  

---

## Security / ops notes

- Secrets: `JWT_SECRET`, `API_KEY`, `ENCRYPTION_KEY` must be set for production; `.env.example` documents patterns.  
- **Demo users** can be seeded when `STARTUP_ENABLE_DEMO_BOOTSTRAP` is true (see `_demo_users()` in `server/api/main.py` — treat as non-production only).  
- **Multi-tenant:** `account_id` appears throughout models and tests; RLS migrations exist (`20260313_enable_rls_policies.py`).  
- Root **`POST /`** accepts gzip or JSON eBPF-style batches and forwards translated lines to **`/api/stream/ingest`** internally.

---

## Known repo hygiene (from git snapshot)

Some files may be deleted locally while still referenced elsewhere (e.g. **`alembic.ini`** referenced in `Dockerfile`). Restore from version control or align paths before shipping containers.

---

## Quick “what file do I touch?”

| Task | Likely location |
|------|------------------|
| New REST endpoint | `server/api/routers/<feature>.py`, register in `server/api/routers/__init__.py` |
| DB schema change | `server/models/`, new file under `migrations/versions/` |
| Detection / pipeline logic | `server/modules/detection/`, `threat_engine/`, `streaming/` |
| Security test template | `tests-library/` |
| UI screen | `api-sentinel-view-main/src/` |
| Env / defaults | `server/config.py`, `.env` |

---

*This file is a working snapshot of architecture and conventions; update it when major modules or deployment assumptions change.*
