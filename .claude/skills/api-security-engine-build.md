---
title: "API Security Backend Engine - Complete Build Guide"
description: "End-to-end production-ready API security platform build guide (14-16 weeks)"
tags: ["backend", "api-security", "python", "fastapi", "architecture", "kafka", "postgresql"]
author: "Engineering Team"
version: "1.0"
created: "2026-03-08"
---

# 🏗️ API Security Backend Engine - Complete Build Guide

> **Status**: APPROVED FOR IMPLEMENTATION
> **Timeline**: 14-16 weeks
> **Stack**: Python 3.11+, FastAPI, PostgreSQL 16, Kafka, Redis, Coraza WAF
> **Reference**: Akto tests-library (208 security test templates)

## Quick Links
- [Full Architecture Plan](../../API_SECURITY_ENGINE_BUILD_PLAN.md)
- [PostgreSQL Schema](../../API_SECURITY_ENGINE_BUILD_PLAN.md#-postgresql-schema-14-tables--extensions)
- [Module Breakdown](../../API_SECURITY_ENGINE_BUILD_PLAN.md#-module-by-module-breakdown)
- [14-Week Roadmap](../../API_SECURITY_ENGINE_BUILD_PLAN.md#-implementation-roadmap-14-16-weeks)
- [Akto Tests Library](https://github.com/akto-api-security/tests-library.git)

## What We're Building

A **production-grade API Security Backend Engine** with:

✅ **Real-time Traffic Capture** (mitmproxy, Scapy)
✅ **API Auto-Discovery** (endpoint clustering, OpenAPI generation)
✅ **208 Security Tests** (OWASP Top 10, HackerOne Top 10)
✅ **PII Detection** (Presidio + spaCy, 50+ entity types)
✅ **Anomaly Detection** (PyOD Isolation Forest, rate abuse, BOLA)
✅ **Inline WAF** (Coraza OWASP CRS v4)
✅ **Real-time Kafka Streaming** (5 topics, Swarm IDPS integration)
✅ **REST API** (FastAPI, 30+ endpoints, WebSocket push)
✅ **Compliance Reporting** (OWASP, GDPR, HIPAA)

## Architecture: 5-Layer Pipeline

```
[Traffic Capture] → [API Inventory] → [Test Executor] → [Vulnerability Detection] → [WAF/Monitoring]
   mitmproxy         clustering      YAML parser      Presidio, PyOD           Coraza, Kafka
    Scapy            OpenAPI          fuzzing          Risk Scoring             alerts
```

## 9 Core Modules

| # | Module | Tech | Lines |
|---|--------|------|-------|
| 1 | **Traffic Capture** | mitmproxy, Scapy | 800 |
| 2 | **API Inventory** | clustering, OpenAPI | 900 |
| 3 | **Test Executor** | YAML parser, mutations | 1200 |
| 4 | **Vulnerability Detector** | Presidio, Bayesian filter | 1000 |
| 5 | **Anomaly Engine** | PyOD, Prophet, GeoIP | 900 |
| 6 | **WAF Integration** | Coraza, CRS rules | 600 |
| 7 | **Persistence** | SQLAlchemy, asyncpg | 700 |
| 8 | **Kafka Streaming** | Producers, consumers | 500 |
| 9 | **REST API Server** | FastAPI, WebSocket | 1300 |
| **TOTAL** | | **~8000 lines** |

## Phase Timeline

| Phase | Duration | Focus | Deliverable |
|-------|----------|-------|-------------|
| **0** | Weeks 1-2 | Foundation | PostgreSQL, Redis, Kafka, Docker Compose |
| **1** | Weeks 3-4 | Traffic Capture | mitmproxy addon, 1000 events/sec |
| **2** | Weeks 5-6 | API Inventory | endpoint discovery, OpenAPI spec |
| **3** | Weeks 7-9 | Test Executor | 208 YAML templates, 50 tests/sec |
| **4** | Weeks 10-11 | Vulnerability Detection | Presidio PII, CVSS scoring |
| **5** | Week 12 | Anomaly Detection | ML models, real-time scoring |
| **6** | Week 13 | WAF Integration | Coraza blocking, event logging |
| **7** | Weeks 14-15 | REST API | 30+ endpoints, WebSocket |
| **8** | Weeks 15-16 | Dashboard Integration | real-time charts, compliance reports |
| **9** | Week 16+ | Production Readiness | load testing, Kubernetes, monitoring |

## Technology Stack

### Backend Core
```yaml
- Python 3.11+ (async/await)
- FastAPI (REST API)
- Uvicorn (ASGI server)
- Pydantic v2 (validation)
- SQLAlchemy 2.0 (async ORM)
- asyncpg (PostgreSQL driver)
```

### Traffic Capture
```yaml
- mitmproxy 10.x (transparent proxy, <5ms latency)
- Scapy (raw packet capture)
- httpx (async HTTP client)
```

### Database & Cache
```yaml
- PostgreSQL 16 (JSON columns, full-text search)
- Redis 7.x (caching, rate limiting)
- Alembic (schema migrations)
```

### Message Bus
```yaml
- Apache Kafka 3.x (KRaft mode)
- kafka-python (producer/consumer)
- Schema Registry (Avro)
```

### Security & Detection
```yaml
- Presidio (PII detection, 50+ types)
- spaCy en_core_web_lg (NLP)
- PyOD (45+ anomaly algorithms)
- scikit-learn (ML models)
- detect-secrets (hardcoded secrets)
- TruffleHog (git scanning)
- Coraza WAF (OWASP CRS v4)
```

### Testing & Validation
```yaml
- PyYAML (YAML parsing)
- jsonschema (response validation)
- Faker (synthetic data)
- pytest (unit/integration tests)
```

## Database Schema (PostgreSQL 16)

**14 Core Tables**:
1. `api_endpoints` - discovered endpoints
2. `api_parameters` - path params, query args, headers
3. `yaml_templates` - 208 security test templates
4. `test_runs` - execution history
5. `test_results` - individual test outcomes
6. `sensitive_findings` - PII/secrets detected
7. `anomaly_events` - rate abuse, BOLA, unusual patterns
8. `waf_events` - requests blocked by Coraza
9. `compliance_checks` - OWASP/GDPR/HIPAA mappings
10. `kafka_offsets` - consumer offset tracking
11-14. Supporting tables (indexes, logs, metrics)

**Indices**: 20+ for query performance (<5ms lookup)
**Partitioning**: time-series tables partitioned by week

## Kafka Architecture (5 Topics)

| Topic | Purpose | Retention | Consumers |
|-------|---------|-----------|-----------|
| `raw-traffic` | API requests/responses | 7 days | inventory, anomaly detector |
| `test-events` | test results, vulnerabilities | 30 days | vulnerability detector |
| `vulnerability-alerts` | actionable findings | 90 days | dashboard WebSocket, alerts |
| `anomaly-scores` | ML-based abuse detection | 30 days | WAF, rate limiter |
| `compliance-events` | framework mappings | 1 year | compliance reporting |

## REST API Endpoints (30+)

### Inventory
```
GET    /api/endpoints
GET    /api/endpoints/{id}
GET    /api/openapi-spec
POST   /api/endpoints/scan
```

### Testing
```
POST   /api/tests/run               # async test execution
GET    /api/tests/runs/{id}
GET    /api/tests/results?severity=CRITICAL
GET    /api/tests/templates         # all 208 templates
```

### Vulnerabilities
```
GET    /api/vulnerabilities
POST   /api/vulnerabilities/filter
PATCH  /api/vulnerabilities/{id}/status
```

### PII & Compliance
```
GET    /api/pii-findings
GET    /api/compliance/reports/{framework}
POST   /api/compliance/export       # PDF report
```

### Anomalies & WAF
```
GET    /api/anomalies
GET    /api/waf-events
```

### Health
```
GET    /health
GET    /ready
GET    /metrics                     # Prometheus
```

## Development Workflow

### Setup (First Day)
```bash
# Clone tests library
git clone https://github.com/akto-api-security/tests-library.git

# Create Python environment
python3.11 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start services
docker-compose up -d

# Run tests
pytest tests/ -v --cov
```

### Development Cycle
1. **Design**: Specify module API in `schema.md`
2. **Implement**: Write core logic + unit tests (TDD)
3. **Integrate**: Connect to PostgreSQL + Kafka
4. **Test**: Integration tests, load testing
5. **Deploy**: Docker image, Kubernetes manifests
6. **Monitor**: Prometheus metrics, alerting

### Code Quality
- **Type Checking**: `mypy --strict` (100% coverage)
- **Formatting**: `black .` + `ruff check .`
- **Testing**: `pytest --cov=80%` minimum
- **Security**: `bandit -r server/`
- **Performance**: locust load testing

## Key Design Decisions

| Decision | Rationale | Trade-off |
|----------|-----------|-----------|
| **Python + FastAPI** | async-first, easy to scale, good for I/O-bound | slower than Go/Rust |
| **PostgreSQL** | ACID, JSON support, full-text search | not NoSQL flexibility |
| **Kafka** | real-time streaming, swarm IDPS compatible | operational complexity |
| **Coraza (Go)** | OWASP CRS v4, <5ms latency | separate language |
| **Presidio** | production-tested, 50+ entity types | ML model overhead |
| **Async everywhere** | handle 1000+ concurrent | debugging complexity |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Test Latency | <500ms per test | JMeter, real execution |
| API Inventory Accuracy | >95% | manual audit comparison |
| PII Detection Recall | >90% | labeled dataset |
| False Positive Rate | <5% | human review |
| System Uptime | 99.95% | Prometheus |
| Dashboard Response | <2s | Lighthouse |
| Kafka Lag | <5 seconds | broker metrics |

## Common Pitfalls (Lessons from Akto)

❌ **Don't**: Use synchronous HTTP client (blocks threads)
✅ **Do**: Use `httpx.AsyncClient` with connection pooling

❌ **Don't**: Load all 208 YAML templates at runtime
✅ **Do**: Cache parsed templates in memory (3MB RAM)

❌ **Don't**: Store full request/response bodies in PostgreSQL
✅ **Do**: Store first 1KB + hash, link to S3 if needed

❌ **Don't**: Block on Kafka writes
✅ **Do**: Async producer with error callbacks

❌ **Don't**: Run Coraza synchronously
✅ **Do**: Use gRPC client with connection pooling

## Resources

**Akto Reference**:
- Tests library: https://github.com/akto-api-security/tests-library
- Main repo: https://github.com/akto-api-security/akto
- Docs: https://docs.akto.io

**Security Standards**:
- OWASP API Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header
- CWE/CVE mappings: https://cwe.mitre.org

**Tools**:
- FastAPI: https://fastapi.tiangolo.com
- SQLAlchemy: https://docs.sqlalchemy.org
- Presidio: https://microsoft.github.io/presidio
- Coraza: https://coraza.io/docs
- Kafka: https://developer.confluent.io

**Full List**: See [API_SECURITY_ENGINE_BUILD_PLAN.md](../../API_SECURITY_ENGINE_BUILD_PLAN.md#-references--resources)

## Questions?

1. **"Why not use Akto's backend directly?"**
   - OOM crashes, licensing restrictions, enterprise lock-in
   - We own 100% of the code, can customize freely

2. **"Can we run this locally?"**
   - Yes! Docker Compose with 1GB RAM minimum (4GB recommended)
   - mitmproxy requires root/admin for packet capture

3. **"How do we test against real APIs?"**
   - Set `TARGET_API=https://api.example.com` in `.env`
   - mitmproxy will intercept traffic if configured as proxy
   - Or use synthetic traffic from HAR files (resources/juiceshop.har)

4. **"What about compliance?"**
   - All code: MIT, Apache 2.0, BSD licensed
   - No proprietary/GPL code
   - Can use commercially without restrictions

5. **"Timeline realistic?"**
   - Yes: 1200+ lines/week possible with 2-3 engineers
   - Akto tests-library reduces test creation from months to days
   - PostgreSQL schema pre-designed

---

**Version**: 1.0
**Last Updated**: March 8, 2026
**Status**: READY FOR IMPLEMENTATION
**Next Step**: Start PHASE 0 (Foundation setup)
