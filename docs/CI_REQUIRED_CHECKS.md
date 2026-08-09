# CI Required Checks (P0 Release Gate)

GitHub Actions workflow: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

Configure these as **required status checks** on protected branches (`main`, release branches):

| Check name (job `name:`) | Purpose |
|--------------------------|---------|
| `Backend unit tests` | `tests/unit` + coverage artifacts |
| `Backend integration tests` | `tests/integration` with Postgres/Redis |
| `Backend security tests` | `tests/security` + SARIF upload |
| `Backend CI/CD gate accountability` | quality-gate / engine artifact policy packs |
| `Backend E2E/API tests` | `tests/e2e` |
| `Frontend lint, test, and build` | ESLint, Vitest, Vite production build |
| `Frontend Playwright E2E` | Browser workspace/pentest flows |
| `CI required checks` | Aggregator that fails if any job above is not `success` |

## Operator steps

1. Repo → Settings → Branches → Branch protection rule for `main` (and release patterns).
2. Enable **Require status checks to pass before merging**.
3. Add every check listed above (search by the job `name:` strings).
4. Prefer requiring the aggregator `CI required checks` plus the individual jobs so a skipped/removed job cannot silently pass.

## Local parity

```bash
make test-unit
make test-integration
make test-security
pytest tests/e2e/ -q
cd api-sentinel-view-main && npm run lint && npm test && npm run build && npm run test:e2e
```

Playwright local backend env explicitly sets `PENTEST_ALLOW_PRIVATE_TARGETS=true` and allowlists `127.0.0.1,localhost` because production safety no longer treats `DEBUG=true` as permission to scan private/loopback hosts.
