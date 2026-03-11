from fastapi import APIRouter
from . import (
    health, endpoints, tests, vulnerabilities, pii, compliance,
    anomalies, waf, schedules, suites, traffic,
    accounts, auth_mechanisms, dashboard,
    auth, auth_roles, collections, integrations, threat_actors, bola,
    audit_logs, governance, organization, threat_detection,
    # New feature routers
    source_code, cicd, billing, workflows, nuclei, agent_guard, mcp_shield, oauth,
    akto_admin,
    # AppSentinel production routers
    blocklist, alerts, sensors, stream,
)

try:
    from server.api.websocket import handlers as ws
    _ws_available = True
except ImportError:
    _ws_available = False

router = APIRouter()

# Existing routers
router.include_router(health.router,           prefix="/health")
router.include_router(dashboard.router,        prefix="/dashboard")
router.include_router(endpoints.router,        prefix="/endpoints")
router.include_router(tests.router,            prefix="/tests")
router.include_router(vulnerabilities.router,  prefix="/vulnerabilities")
router.include_router(pii.router,              prefix="/pii")
router.include_router(compliance.router,       prefix="/compliance")
router.include_router(anomalies.router,        prefix="/anomalies")
router.include_router(waf.router,              prefix="/waf")
router.include_router(schedules.router,        prefix="/schedules")
router.include_router(suites.router,           prefix="/suites")
router.include_router(traffic.router,          prefix="/traffic")
router.include_router(accounts.router,         prefix="/accounts")
router.include_router(auth_mechanisms.router,  prefix="/auth-mechanisms")
router.include_router(auth.router,             prefix="/auth")
router.include_router(auth_roles.router,       prefix="/auth-roles")
router.include_router(collections.router,      prefix="/collections")
router.include_router(integrations.router,     prefix="/integrations")
router.include_router(threat_actors.router,    prefix="/threat-actors")
router.include_router(bola.router,             prefix="/bola")
router.include_router(audit_logs.router,       prefix="/audit-logs")
router.include_router(governance.router,       prefix="/governance")
router.include_router(organization.router,     prefix="/organization")
router.include_router(threat_detection.router, prefix="/threat-detection")

# New feature routers
router.include_router(source_code.router,  prefix="/source-code")
router.include_router(cicd.router,         prefix="/cicd")
router.include_router(billing.router,      prefix="/billing")
router.include_router(workflows.router,    prefix="/workflows")
router.include_router(nuclei.router,       prefix="/nuclei")
router.include_router(agent_guard.router,  prefix="/agent-guard")
router.include_router(mcp_shield.router,   prefix="/mcp-shield")
router.include_router(oauth.router,        prefix="/oauth")
router.include_router(akto_admin.router)   # no prefix — paths like /fetchModuleInfo

# AppSentinel production routers
router.include_router(blocklist.router, prefix="/blocklist")
router.include_router(alerts.router,    prefix="/alerts")
router.include_router(sensors.router,   prefix="/sensors")
router.include_router(stream.router,    prefix="/stream")

if _ws_available:
    router.include_router(ws.router, prefix="/ws")
