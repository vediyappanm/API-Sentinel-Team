# API Sentinel Agent Guide

## Mission
Own this repository end to end.

That means the default expectation is:
- inspect the codebase before making changes
- implement the requested feature or fix
- run the right tests
- fix failures you introduced
- build the backend and frontend
- prepare deployment artifacts
- deploy to staging when credentials and approval are available

Do not stop at analysis unless the user explicitly asks for analysis only.

## Ownership Model
- Prefer one owner agent for the whole task.
- Do not spawn sub-agents unless the user explicitly asks for delegation or parallel agents.
- Keep progress moving locally: code, test, verify, document.

## Repo Map
- Backend API: `server/`
- Frontend app: `api-sentinel-view-main/`
- Tests: `tests/`
- Security templates: `tests-library/`
- Alembic migrations: `migrations/`
- Helm chart: `infra/helm/api-sentinel/`
- GitHub workflows: `.github/workflows/`

## Local Development

### Backend
Windows:
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc
.\venv311\Scripts\uvicorn.exe server.api.main:app --host 127.0.0.1 --port 8000 --reload
```

Fallback with explicit debug:
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc
$env:DEBUG='true'
.\venv311\Scripts\uvicorn.exe server.api.main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc\api-sentinel-view-main
npm run dev
```

### Local URLs
- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`

## Database and Migrations

### Apply migrations
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc
.\venv311\Scripts\alembic.exe upgrade heads
```

### If local SQLite dev is out of sync
- Back up the local DB before repair.
- Prefer Alembic over ad hoc schema creation.
- If a local-only developer machine is blocked by migration drift, make the smallest safe repair and document it.

### Environment
Use `.env.example` as the baseline contract for required settings.

Production-safe defaults already expected by this repo:
- `STARTUP_BOOTSTRAP_SCHEMA=false`
- `STARTUP_ENABLE_DEMO_BOOTSTRAP=false`
- `UNIFIED_PIPELINE_MODE=shadow` before full cutover

## Quality Gates

### Backend tests
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc
.\venv311\Scripts\python.exe -m pytest tests\unit -q
.\venv311\Scripts\python.exe -m pytest tests\integration -q
.\venv311\Scripts\python.exe -m pytest tests\security -q
```

### Frontend tests
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc\api-sentinel-view-main
npm run test
npm run build
npm run test:e2e
```

### Repo shortcuts
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc
make test-unit
make test-integration
make test-security
```

Run the narrowest relevant checks while iterating, then run the broader validating checks before closing the task.

## Deployment Paths

### Docker Compose
```powershell
cd c:\Users\ELCOT\OneDrive\Desktop\soc
docker compose up --build
```

Notes:
- Compose expects Postgres, Redis, and Kafka services.
- Compose backend runs `alembic upgrade head` before starting the API.

### Helm / Kubernetes
Chart:
- `infra/helm/api-sentinel/`

Primary deployment workflows already exist in:
- `.github/workflows/deploy.yml`
- `.github/workflows/deploy-env.yml`

Helm release name:
- `api-sentinel`

When preparing deploys:
- build image
- push image
- run migrations
- deploy to staging first
- validate readiness and smoke tests
- only then propose production rollout

## Required Agent Behavior
- Inspect existing code before changing architecture.
- Preserve backward compatibility on public API routes unless the task explicitly allows breaking changes.
- Prefer safe, incremental edits over large rewrites.
- Never expose secrets in code, docs, commits, or logs.
- Never commit real credentials, tokens, cookies, or private URLs.
- Never assume production deploy is safe without staging validation.
- If you change backend behavior, verify at least one API path.
- If you change frontend behavior, verify build and at least one realistic user flow.
- If you change auth, tenanting, enforcement, detection, or pentest flows, prioritize integration coverage.

## Safety Rules
- Do not revert unrelated user changes.
- Do not use destructive git commands like `git reset --hard` or `git checkout --` unless the user explicitly asks.
- Do not remove databases, migrations, or generated artifacts unless you are certain they are disposable and the user asked for cleanup.
- Treat deployment, auth, and data-isolation changes as high risk.

## Task Completion Checklist
Before closing a substantial task, try to complete all of these:
1. Code change implemented
2. Relevant tests run
3. Build verified if UI changed
4. Migration impact checked if models changed
5. Deploy impact checked if runtime/config changed
6. User-facing summary written with honest remaining risks

## Default Delivery Style
- Be proactive.
- Explain what changed in simple language.
- Call out blockers clearly.
- If something is not fully production-ready, say so directly and name the exact remaining gap.

