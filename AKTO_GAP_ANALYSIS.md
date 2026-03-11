# 🔍 Akto vs Our Engine — Deep Gap Analysis & Implementation Plan

**Date**: March 8, 2026
**Purpose**: Identify every missing feature to reach Akto backend parity
**Approach**: Analyzed 208 YAML templates + Akto DSL + our 30 implemented files

---

## 🏁 OVERALL PARITY SCORE: 35% Complete

| Layer | Akto Feature | Our Status | Gap |
|-------|-------------|------------|-----|
| **YAML Parsing** | 30+ DSL operations | 4 ops | 87% missing |
| **api_selection_filters** | Endpoint pre-filtering | ❌ None | 100% missing |
| **Request Mutation** | 15 mutation types | 4 types | 73% missing |
| **Response Validation** | 8 checks (incl. % match) | 3 checks | 62% missing |
| **Sample Data / WordLists** | Real traffic fuzzing | ❌ None | 100% missing |
| **Auth/Role System** | Victim+Attacker tokens | ❌ None | 100% missing |
| **Test Execution** | Full run → persist → report | Placeholder | 90% missing |
| **Test Scheduling** | Cron-based auto scans | ❌ None | 100% missing |
| **Traffic Capture** | mitmproxy→sample_data | Module only | 80% missing |
| **Anomaly Detection** | ML scoring (PyOD) | Framework only | 95% missing |
| **Compliance Engine** | OWASP/GDPR/HIPAA map | Router only | 95% missing |
| **HAR Ingestion** | Upload+process .har | ❌ None | 100% missing |

---

## 📋 PART 1: FULL AKTO DSL FEATURE INVENTORY

### A. `api_selection_filters` — Endpoint Pre-Filtering
*(Currently: NOT IMPLEMENTED — we run every test on every endpoint)*

Every Akto YAML starts with filters deciding IF an endpoint should be tested:

```yaml
api_selection_filters:
  response_code:           # ✅ We parse this but don't filter endpoints with it
    gte: 200
    lt: 300
  method:
    neq: "OPTIONS"         # ❌ We ignore — must skip OPTIONS endpoints
    not_contains:          # ❌ We ignore — for BFLA (skip GET endpoints)
      - GET
    eq: "POST"             # ❌ We ignore
  response_payload:
    length:
      gt: 0                # ❌ We ignore — skip empty-body endpoints
    not_contains:          # ❌ We ignore — skip error endpoints
      - "Unauthorized"
  request_payload:         # ❌ Completely missing
    for_one:               # At least one param must match
      key:
        regex: "^user_id$|^userId$"   # Fuzzy param name matching
        extract: userKey              # Extract matched key name as variable
  or:                      # ❌ OR logic for multi-location param matching
    - request_payload:
        for_one:
          key:
            regex: "^user_id$"
            extract: userKey
    - query_param:
        for_one:
          key:
            regex: "^user_id$"
            extract: userKey
  include_roles_access:    # ❌ BFLA: only endpoints ADMIN can access
    param: ADMIN
  exclude_roles_access:    # ❌ BFLA: skip endpoints MEMBER can already access
    param: MEMBER
  private_variable_context:# ❌ Only test endpoints with user-specific data
    gt: 0
```

**Impact**: Without `api_selection_filters`, every test runs on every endpoint → MASSIVE false positives + performance collapse.

---

### B. `execute.requests[].req` — Mutation DSL Operations
*(Currently: only 4 of 15 operations implemented)*

| Akto DSL Operation | Our Status | Notes |
|-------------------|-----------|-------|
| `modify_body_param` | ✅ Partial | Only top-level JSON keys, no nested |
| `modify_query_param` | ✅ Basic | Works |
| `add_header` | ✅ Basic | Works |
| `replace_body` | ✅ Works | Works |
| `remove_auth_header` | ❌ Missing | Remove Authorization/Cookie header |
| `replace_auth_header` | ❌ Missing | Swap with ATTACKER's token (BOLA) |
| `modify_header` | ❌ Missing | Change specific header value |
| `delete_header` | ❌ Missing | Remove any header by key |
| `delete_body_param` | ❌ Missing | Remove JSON body field |
| `add_body_param` | ❌ Missing | Inject new JSON field (Mass Assignment) |
| `add_query_param` | ❌ Missing | Inject new query parameter |
| `modify_method` | ❌ Missing | Change GET→POST, POST→GET etc |
| `replace_auth_header` | ❌ Missing | Core for BOLA cross-user tests |
| `follow_redirect` | ❌ Missing | Follow or ignore 3xx |
| `send_ssrf_req` | ❌ Missing | SSRF out-of-band request sending |

**DSL example requiring `replace_auth_header`** (BOLA — REPLACE_AUTH_TOKEN):
```yaml
execute:
  type: single
  requests:
    - req:
        - replace_auth_header: true   # ← swap victim token with attacker token
```

**DSL example requiring `modify_method`** (BFLA):
```yaml
execute:
  type: single
  requests:
    - req:
        - modify_header:
            ${roles_access_context.MEMBER}: 1
        - modify_method: GET          # ← change method
        - replace_body: '{}'
```

---

### C. `validate` — Response Assertion DSL
*(Currently: missing 5 of 8 assertion types)*

| Assertion | Our Status | Notes |
|-----------|-----------|-------|
| `response_code.gte/lt/eq` | ✅ Implemented | Works |
| `response_payload.contains` | ✅ Implemented | Works |
| `response_payload.not_contains` | ✅ Implemented | Works |
| `response_payload.regex` | ✅ Implemented | Works |
| `response_payload.length.gt/lt` | ❌ Missing | Must check body length |
| `response_payload.percentage_match` | ❌ Missing | **CRITICAL** — similarity vs original |
| `response_payload.percentage_match_schema` | ❌ Missing | JSON schema similarity |
| `response_header.contains` | ❌ Missing | Check response headers |
| `response_header.for_one.value` | ❌ Missing | Find specific header value |

**`percentage_match` is the most critical missing assertion**. Example:
```yaml
validate:
  response_payload:
    percentage_match:
      gte: 90   # If mutated response matches original >=90%  → BOLA confirmed!
      lt: 10    # If mutated response is <10% similar  → BFLA bypassed
    percentage_match_schema:
      gte: 90   # If JSON schema structure matches >=90% → same resource returned
```

Without `percentage_match`, **BOLA and BFLA tests cannot produce correct verdicts**.

---

### D. `wordLists` — Dynamic Fuzzing from Sample Data
*(Currently: 100% missing)*

```yaml
wordLists:
  random_ids:
    source: sample_data       # ← Pull real values from captured traffic
    key:
      regex: "^user_id$|^userId$|^uid$"
    all_apis: true            # ← Search across ALL captured API responses

execute:
  type: single
  requests:
    - req:
        - modify_body_param:
            userKey: ${random_ids}    # ← Inject real user IDs from other APIs
```

**This requires**:
1. A `sample_data` table (captured requests + responses from real traffic)
2. A `WordListResolver` that queries sample_data by parameter name regex
3. Variable injection `${random_ids}` during mutation

---

### E. `auth` + `roles_access_context` — Identity System
*(Currently: 100% missing)*

```yaml
auth:
  authenticated: true          # This test requires authentication context

api_selection_filters:
  include_roles_access:
    param: ADMIN               # Only test endpoints admin can access
  exclude_roles_access:
    param: MEMBER              # Skip if member already has access

execute:
  requests:
    - req:
        - modify_header:
            ${roles_access_context.MEMBER}: 1   # ← inject MEMBER's auth token
```

**This requires**:
1. `test_roles` table: stores ADMIN auth headers, MEMBER auth headers
2. `RolesContextBuilder` to populate `roles_access_context.ADMIN`, `roles_access_context.MEMBER`
3. Role-based endpoint filtering in `api_selection_filters`

---

### F. `execute.type` — Execution Modes
*(Currently: only `single` type, `multiple` fully missing)*

```yaml
execute:
  type: single      # ✅ We handle this
  type: multiple    # ❌ Missing — run test once per wordlist item
```

`multiple` mode runs the mutation for EACH item in wordList — essential for fuzzing.

---

## 📋 PART 2: MISSING BACKEND SYSTEMS

### G. Sample Data Collection (Core Akto Feature)
Akto captures EVERY request+response through its traffic mirror:
- Table: `sample_data` — stores {endpoint_id, request, response, timestamp}
- Table: `sensitive_sample_data` — filtered sensitive versions
- Used by: wordLists, BOLA testing, parameter discovery

**We have**: mitmproxy addon (captures) but no persistence path.

---

### H. Auth Mechanism Configuration
Akto lets users define WHERE the auth token lives:
```json
{
  "type": "BEARER",
  "header_key": "Authorization",
  "header_value": "Bearer {{token}}"
}
```
Without this, `remove_auth_header` and `replace_auth_header` don't know WHICH header to modify.

**We have**: `TestAccount` model (auth_headers JSON) but no auth mechanism detection.

---

### I. Test Run Persistence
Our `POST /api/tests/run` is a **placeholder** — it does a `print()` and returns immediately.

Akto's real test run flow:
1. Create `TestRun` record → status=RUNNING
2. For each endpoint × template, execute mutation
3. Validate response → create `TestResult` record
4. Aggregate → update `TestRun` status=COMPLETED
5. Push results to WebSocket → update dashboard in real-time

**We have**: Models (Vulnerability table) but no execution pipeline connecting them.

---

### J. Test Scheduling
Akto has cron-based scheduling:
```json
{
  "testingRunId": "...",
  "schedule": "0 0 * * *",  // daily at midnight
  "testSuiteIds": ["ALL"]
}
```

**We have**: Nothing.

---

### K. Test Suites
Akto groups tests into suites (OWASP Top 10, custom, etc.) → run suite instead of individual tests.

**We have**: Nothing.

---

### L. HAR File Ingestion
Akto accepts `.har` files to import captured traffic → populates `sample_data`.

**We have**: `har_converter.py` converts format but no API endpoint to upload + process.

---

### M. Anomaly Detection (ML)
**We have**: PyOD, scikit-learn, Prophet installed.
**Missing**: None of the ML logic is written — no Isolation Forest training, no rate baseline.

---

### N. Compliance Engine
**We have**: `/api/compliance/` router that returns 404.
**Missing**: Mapping between vulnerability types → OWASP API Top 10 categories.

---

## 📋 PART 3: IMPLEMENTATION PLAN (Priority Order)

---

### 🔴 PRIORITY 1 — Core Test Execution (Must Have)

#### Task 1.1: `api_selection_filter_engine.py`
**File**: `server/modules/test_executor/selection_filter.py`
**Purpose**: Given a YAML template + endpoint, decide if test should run

```python
class SelectionFilterEngine:
    def should_run(self, template: dict, endpoint: dict, sample_data: list) -> bool
    def _check_method_filter(self, method_rule, endpoint_method) -> bool
    def _check_response_code_filter(self, code_rule, endpoint_last_response) -> bool
    def _check_response_payload_filter(self, payload_rule, last_body) -> bool
    def _check_request_payload_filter(self, payload_rule, last_request) -> tuple[bool, dict]
    def _check_roles_access(self, roles, endpoint) -> bool
    def _check_private_variable_context(self, threshold, endpoint) -> bool
    def _extract_variables(self, filter_rules, sample_data) -> dict  # fills userKey etc
```

#### Task 1.2: Complete `RequestMutator` — All 15 Operations
**File**: Update `server/modules/test_executor/request_mutator.py`

New operations to add:
- `remove_auth_header(request, auth_mechanism)` — remove Authorization/Cookie
- `replace_auth_header(request, attacker_token)` — swap with attacker's token
- `modify_header(request, {key: value})` — set specific header
- `delete_header(request, key)` — remove specific header
- `delete_body_param(request, key)` — remove JSON field (nested support)
- `add_body_param(request, {key: value})` — inject new JSON field
- `add_query_param(request, {key: value})` — add query param
- `modify_method(request, new_method)` — change HTTP method
- Nested JSON support for `modify_body_param`

#### Task 1.3: Complete `ResponseValidator` — All 8 Assertions
**File**: Update `server/modules/test_executor/response_validator.py`

New assertions to add:
- `length_check(body, rules)` — body length gt/lt
- `percentage_match(original_body, mutated_body)` — Levenshtein/Jaccard similarity
- `percentage_match_schema(original_json, mutated_json)` — JSON key overlap %
- `response_header_check(headers, rules)` — header presence/value

```python
def _calculate_percentage_match(self, original: str, mutated: str) -> float:
    # Token-based similarity using SequenceMatcher
    from difflib import SequenceMatcher
    return SequenceMatcher(None, original, mutated).ratio() * 100

def _calculate_schema_match(self, original_json: dict, mutated_json: dict) -> float:
    # Key overlap percentage between two JSON objects
    original_keys = set(self._flatten_keys(original_json))
    mutated_keys = set(self._flatten_keys(mutated_json))
    if not original_keys: return 0.0
    return (len(original_keys & mutated_keys) / len(original_keys)) * 100
```

#### Task 1.4: Real Test Execution + Persistence
**File**: `server/modules/test_executor/test_run_manager.py` (NEW)

```python
class TestRunManager:
    async def start_run(self, endpoint_ids, template_ids, db) -> str  # returns run_id
    async def execute_all(self, run_id, db) -> None
    async def _execute_one(self, endpoint, template, run_id, auth_ctx, db) -> dict
    async def _save_result(self, result, db) -> None
    async def _update_run_status(self, run_id, status, db) -> None
```

**New DB Models needed** (`server/models/core.py`):
```python
class TestRun(Base):
    __tablename__ = "test_runs"
    id, account_id, status, started_at, completed_at,
    total_tests, vulnerable_count, template_ids (JSON), endpoint_ids (JSON)

class TestResult(Base):
    __tablename__ = "test_results"
    id, run_id, endpoint_id, template_id, is_vulnerable,
    sent_request (JSON), received_response (JSON), evidence, severity

class SampleData(Base):
    __tablename__ = "sample_data"
    id, endpoint_id, request (JSON), response (JSON), created_at
```

#### Task 1.5: Complete `/api/tests/run` Router
**File**: Update `server/api/routers/tests.py`

Replace placeholder with real execution:
```python
@router.post("/run")
async def run_scan(body: RunScanRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    run_id = await TestRunManager().start_run(body.endpoint_ids, body.template_ids, db)
    background_tasks.add_task(TestRunManager().execute_all, run_id, db)
    return {"run_id": run_id, "status": "RUNNING"}

@router.get("/runs/{run_id}")
async def get_run_status(run_id: str, db: AsyncSession = Depends(get_db)):
    # return run status + results
```

---

### 🟠 PRIORITY 2 — Auth & Identity System

#### Task 2.1: Auth Mechanism Manager
**File**: `server/modules/identity/auth_mechanism.py` (NEW)

```python
class AuthMechanismManager:
    def detect_auth_header(self, request: dict) -> str  # returns header name
    def remove_auth(self, request: dict) -> dict        # strips auth header/cookie
    def replace_auth(self, request: dict, token: str) -> dict  # swaps token
    async def load_mechanisms(self, db) -> list[dict]  # from DB

class AuthMechanism(Base):
    __tablename__ = "auth_mechanisms"
    id, name, header_key, header_prefix, token_type  # BEARER, API_KEY, BASIC
```

#### Task 2.2: Role-Based Testing (BFLA)
**File**: `server/modules/identity/roles_context.py` (NEW)

```python
class RolesContextBuilder:
    def build(self, roles: list[TestAccount]) -> dict
    # Returns {"roles_access_context": {"ADMIN": "Bearer admintoken...", "MEMBER": "Bearer usertoken..."}}
    # Used in template variable substitution: ${roles_access_context.MEMBER}
```

---

### 🟡 PRIORITY 3 — Sample Data & WordLists

#### Task 3.1: Sample Data Persistence
**File**: `server/modules/traffic_capture/sample_data_writer.py` (NEW)

```python
class SampleDataWriter:
    async def save(self, endpoint_id: str, request: dict, response: dict, db) -> None
    async def get_by_endpoint(self, endpoint_id: str, db) -> list[dict]
```

Connect to mitmproxy addon → on each request, call `SampleDataWriter.save()`

#### Task 3.2: WordList Resolver
**File**: `server/modules/test_executor/wordlist_resolver.py` (NEW)

```python
class WordListResolver:
    async def resolve(self, wordlist_cfg: dict, db) -> list[str]:
        # wordlist_cfg: {source: "sample_data", key: {regex: "^user_id$"}, all_apis: true}
        # → queries sample_data table, extracts matching param values
        # → returns ["user1", "user2", "abc-uuid-123", ...]

    def inject(self, mutation_rule: dict, wordlist_values: dict) -> list[dict]:
        # Expands ${random_ids} → one mutation per value (execute.type=multiple)
```

---

### 🟢 PRIORITY 4 — Scheduling & Suites

#### Task 4.1: Test Scheduling (APScheduler)
**File**: `server/modules/scheduler/test_scheduler.py` (NEW)

```python
from apscheduler.schedulers.asyncio import AsyncIOScheduler

class TestScheduler:
    def __init__(self): self.scheduler = AsyncIOScheduler()
    def schedule(self, run_cfg: dict) -> str   # cron schedule
    def cancel(self, job_id: str) -> None
    async def _trigger_run(self, run_cfg: dict) -> None

class TestSchedule(Base):
    __tablename__ = "test_schedules"
    id, name, cron_expression, template_ids (JSON), endpoint_ids (JSON), enabled
```

#### Task 4.2: Test Suites
**File**: `server/modules/suites/suite_manager.py` (NEW)

```python
class SuiteManager:
    BUILTIN_SUITES = {
        "OWASP_API_TOP_10": ["BOLA", "NO_AUTH", "BFLA", "MA", "SSRF", "SM"],
        "HACKERNONE_TOP_10": ["BOLA", "NO_AUTH", "MA", "COMMAND_INJECTION"],
        "ALL": None  # run everything
    }
    async def get_suite_templates(self, suite_name: str, wm: WordlistManager) -> list[dict]
```

---

### 🔵 PRIORITY 5 — HAR Ingestion & Traffic Replay

#### Task 5.1: HAR Upload API
**File**: `server/api/routers/traffic.py` (NEW)

```python
@router.post("/traffic/upload-har")
async def upload_har(file: UploadFile, db: AsyncSession = Depends(get_db)):
    har_data = json.loads(await file.read())
    converter = HARConverter()
    entries = converter.convert(har_data)
    discovery = EndpointDiscovery(db)
    writer = SampleDataWriter()
    for entry in entries:
        endpoint = await discovery.discover(entry)
        await writer.save(endpoint.id, entry['request'], entry['response'], db)
    return {"imported": len(entries)}
```

---

### 🟣 PRIORITY 6 — Anomaly Detection (ML)

#### Task 6.1: Isolation Forest Anomaly Scorer
**File**: `server/modules/anomaly_detector/isolation_forest_scorer.py` (NEW)

```python
from pyod.models.iforest import IForest

class IsolationForestScorer:
    def __init__(self): self.model = IForest(contamination=0.1)
    def fit(self, feature_matrix: np.ndarray) -> None
    def score(self, request_features: dict) -> float  # 0.0-1.0
    def _extract_features(self, request: dict) -> np.ndarray
    # Features: requests_per_sec, unique_paths, payload_entropy,
    #           param_count, error_rate, response_time_ms
```

#### Task 6.2: Rate Abuse Detector
**File**: `server/modules/anomaly_detector/rate_detector.py` (NEW)

Uses Redis sliding window counter (or SQLite time-series query) to detect:
- Requests/sec > 3σ from rolling 7-day baseline
- Sequential ID enumeration patterns in BOLA
- Unusual geographic patterns (via GeoIP)

---

### ⚪ PRIORITY 7 — Compliance Mapping

#### Task 7.1: Compliance Mapping Engine
**File**: `server/modules/compliance/mapper.py` (NEW)

```python
OWASP_API_TOP_10_MAP = {
    "BOLA": "API1:2023",       "NO_AUTH": "API2:2023",
    "MA": "API3:2023",         "SSRF": "API7:2023",
    "SM": "API8:2023",         "BFLA": "API5:2023",
    "COMMAND_INJECTION": "API10:2023",
    "INPUT": "API4:2023",      "RL": "API6:2023",
}

GDPR_MAP = {
    "pii_exposure": "Art. 32 (Security)",
    "BOLA": "Art. 5(1)(f) (Integrity and Confidentiality)"
}

class ComplianceMapper:
    def map_vulnerability(self, vuln_category: str) -> dict  # {owasp, gdpr, hipaa}
    async def generate_report(self, account_id: int, db) -> dict
```

---

## 📊 COMPLETE PENDING FILE LIST (35 files to build)

### New Files to Create
```
server/
├── modules/
│   ├── test_executor/
│   │   ├── selection_filter.py           [PRIORITY 1 — HIGH]
│   │   ├── test_run_manager.py           [PRIORITY 1 — HIGH]
│   │   ├── wordlist_resolver.py          [PRIORITY 3 — MEDIUM]
│   │   └── workflow_orchestrator.py      [PRIORITY 1 — HIGH]
│   │
│   ├── identity/
│   │   ├── __init__.py                   [PRIORITY 2 — HIGH]
│   │   ├── auth_mechanism.py             [PRIORITY 2 — HIGH]
│   │   ├── roles_context.py              [PRIORITY 2 — HIGH]
│   │   └── bola_validator.py             [PRIORITY 2 — HIGH]
│   │
│   ├── traffic_capture/
│   │   └── sample_data_writer.py         [PRIORITY 3 — MEDIUM]
│   │
│   ├── anomaly_detector/
│   │   ├── __init__.py                   [PRIORITY 6 — LOW]
│   │   ├── isolation_forest_scorer.py    [PRIORITY 6 — LOW]
│   │   ├── rate_detector.py              [PRIORITY 6 — LOW]
│   │   └── geo_anomaly.py                [PRIORITY 6 — LOW]
│   │
│   ├── scheduler/
│   │   ├── __init__.py                   [PRIORITY 4 — MEDIUM]
│   │   └── test_scheduler.py             [PRIORITY 4 — MEDIUM]
│   │
│   ├── suites/
│   │   ├── __init__.py                   [PRIORITY 4 — MEDIUM]
│   │   └── suite_manager.py              [PRIORITY 4 — MEDIUM]
│   │
│   └── compliance/
│       ├── __init__.py                   [PRIORITY 7 — LOW]
│       └── mapper.py                     [PRIORITY 7 — LOW]
│
├── models/
│   └── core.py (ADD: TestRun, TestResult, SampleData, AuthMechanism, TestSchedule)
│
└── api/
    └── routers/
        ├── tests.py     (UPDATE: real run + results endpoints)
        ├── traffic.py   (NEW: HAR upload, mitmproxy status)
        └── compliance.py (UPDATE: real report generation)
```

### Files to UPDATE
```
server/modules/test_executor/request_mutator.py    # +11 new mutation ops
server/modules/test_executor/response_validator.py # +5 new assertions
server/modules/test_executor/execution_engine.py   # + selection filter + wordlists
server/models/core.py                              # + TestRun, TestResult, SampleData
server/api/routers/tests.py                        # + real /run endpoint
server/api/routers/vulnerabilities.py              # + full CRUD
server/api/routers/anomalies.py                    # + ML scoring
server/api/routers/compliance.py                   # + real reports
```

---

## 📅 REVISED TIMELINE

| Phase | Priority | Tasks | Files | Weeks |
|-------|----------|-------|-------|-------|
| **P1: Core Test Engine** | 🔴 CRITICAL | 1.1–1.5 | 8 | 1-2 |
| **P2: Auth & Identity** | 🟠 HIGH | 2.1–2.2 | 5 | 2-3 |
| **P3: Sample Data & WordLists** | 🟡 MEDIUM | 3.1–3.2 | 3 | 3-4 |
| **P4: Scheduling & Suites** | 🟢 MEDIUM | 4.1–4.2 | 4 | 4-5 |
| **P5: HAR Ingestion** | 🔵 MEDIUM | 5.1 | 2 | 5 |
| **P6: Anomaly Detection** | 🟣 LOW | 6.1–6.2 | 4 | 6-7 |
| **P7: Compliance Engine** | ⚪ LOW | 7.1 | 2 | 7-8 |
| **P8: Production Hardening** | - | Load tests, Docker, K8s | - | 8-9 |

---

## 🎯 QUICK WIN — Start With These 5 Changes

These alone will bring us from 35% → 70% Akto parity:

1. **`selection_filter.py`** — method + response_code filter (2 hrs)
2. **`percentage_match` in ResponseValidator** — 20 lines, uses `difflib.SequenceMatcher` (1 hr)
3. **`remove_auth_header` + `replace_auth_header` in RequestMutator** — 15 lines each (1 hr)
4. **`modify_method` + `modify_header` in RequestMutator** — 10 lines each (30 min)
5. **`TestRun` + `TestResult` models + real `/run` endpoint** — end-to-end execution (4 hrs)

**Total**: ~9 hours of focused development to unlock all 200+ test templates properly.

---

## 💡 KEY INSIGHT: The Biggest Gap

The single most important missing piece is **`percentage_match`**.

Without it:
- BOLA tests (`REPLACE_AUTH_TOKEN`) → always false (can't compare responses)
- BFLA tests (`BFLA_WITH_GET_METHOD`) → always false (can't compare role responses)
- NO_AUTH tests (`REMOVE_TOKENS`) → 50% false (guessing from status code alone)

With `percentage_match` + `remove/replace_auth_header`:
- **All 6 BOLA tests** become functional
- **All 2 BFLA tests** become functional
- **All 23 NO_AUTH tests** become fully functional

That's **31 more tests** working just from 2 changes (~3 hours of work).

---

**Summary**: We have the structure. We're missing the LOGIC inside the engine.
**Status**: 35% → needs 35 more files/updates → then 95% Akto backend parity.
