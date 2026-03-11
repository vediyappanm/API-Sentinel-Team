import uuid
from sqlalchemy.orm import declarative_base, Mapped, mapped_column
from sqlalchemy import String, Integer, DateTime, Float, Boolean, JSON, BigInteger, Text, func

Base = declarative_base()


class APIEndpoint(Base):
    __tablename__ = "api_endpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False, default=1000000, index=True)
    collection_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(10), nullable=True)
    path: Mapped[str] = mapped_column(String, nullable=True)
    path_pattern: Mapped[str] = mapped_column(String, nullable=True)
    host: Mapped[str] = mapped_column(String(255), nullable=True)
    port: Mapped[int] = mapped_column(Integer, nullable=True)
    protocol: Mapped[str] = mapped_column(String(10), nullable=True)
    description: Mapped[str] = mapped_column(String, nullable=True)
    tags: Mapped[dict] = mapped_column(JSON, nullable=True)
    # Runtime data from captured traffic
    last_response_code: Mapped[int] = mapped_column(Integer, nullable=True, default=200)
    last_response_body: Mapped[str] = mapped_column(Text, nullable=True)
    last_request_body: Mapped[str] = mapped_column(Text, nullable=True)
    last_query_string: Mapped[str] = mapped_column(String, nullable=True)
    last_response_headers: Mapped[dict] = mapped_column(JSON, nullable=True)
    private_variable_count: Mapped[int] = mapped_column(Integer, nullable=True, default=0)
    # Security metadata
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    severity_score: Mapped[float] = mapped_column(Float, default=0.0)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False)
    api_type: Mapped[str] = mapped_column(String(20), default="REST")  # REST, GRAPHQL, GRPC, SOAP
    access_type: Mapped[str] = mapped_column(String(20), default="PRIVATE") # PUBLIC, PRIVATE, PARTNER
    auth_types_found: Mapped[list] = mapped_column(JSON, default=list) # ["JWT", "BASIC"]
    
    last_seen = mapped_column(DateTime(timezone=True), nullable=True)
    last_tested = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class YamlTemplate(Base):
    __tablename__ = "yaml_templates"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    severity: Mapped[str] = mapped_column(String(50), nullable=True)
    description: Mapped[str] = mapped_column(String, nullable=True)
    remediation_plan: Mapped[str] = mapped_column(Text, nullable=True)
    yaml_content: Mapped[str] = mapped_column(String, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class TestAccount(Base):
    """Stores victim/attacker tokens for BOLA/BFLA tests."""
    __tablename__ = "test_accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    auth_headers: Mapped[dict] = mapped_column(JSON, nullable=True)   # {"Authorization": "Bearer xyz"}
    auth_token: Mapped[str] = mapped_column(String, nullable=True)    # legacy plain token
    role: Mapped[str] = mapped_column(String(50), nullable=True)      # ADMIN, MEMBER, ATTACKER
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    template_id: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    endpoint_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    url: Mapped[str] = mapped_column(String, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=True)
    severity: Mapped[str] = mapped_column(String(50), nullable=True)
    type: Mapped[str] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    confidence: Mapped[str] = mapped_column(String(20), default="HIGH") # HIGH, MEDIUM, LOW
    remediation: Mapped[str] = mapped_column(Text, nullable=True)
    evidence: Mapped[dict] = mapped_column(JSON, nullable=True)
    false_positive: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class TestRun(Base):
    """Tracks an execution of one or more templates against endpoints."""
    __tablename__ = "test_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")  # PENDING/RUNNING/COMPLETED/FAILED
    template_ids: Mapped[list] = mapped_column(JSON, nullable=True)
    endpoint_ids: Mapped[list] = mapped_column(JSON, nullable=True)
    total_tests: Mapped[int] = mapped_column(Integer, default=0)
    vulnerable_count: Mapped[int] = mapped_column(Integer, default=0)
    error_count: Mapped[int] = mapped_column(Integer, default=0)
    started_at = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class TestResult(Base):
    """Individual result for one template × endpoint combination."""
    __tablename__ = "test_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id: Mapped[str] = mapped_column(String(36), nullable=True)
    endpoint_id: Mapped[str] = mapped_column(String(36), nullable=True)
    template_id: Mapped[str] = mapped_column(String(100), nullable=True)
    is_vulnerable: Mapped[bool] = mapped_column(Boolean, default=False)
    severity: Mapped[str] = mapped_column(String(50), nullable=True)
    sent_request: Mapped[dict] = mapped_column(JSON, nullable=True)
    received_response: Mapped[dict] = mapped_column(JSON, nullable=True)
    percentage_match: Mapped[float] = mapped_column(Float, default=0.0)
    evidence: Mapped[str] = mapped_column(Text, nullable=True)
    error: Mapped[str] = mapped_column(String, nullable=True)
    skip_reason: Mapped[str] = mapped_column(String, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class SampleData(Base):
    """Captured request/response pairs from traffic (feeds wordList fuzzing)."""
    __tablename__ = "sample_data"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    endpoint_id: Mapped[str] = mapped_column(String(36), nullable=True)
    request: Mapped[dict] = mapped_column(JSON, nullable=True)
    response: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuthMechanism(Base):
    """Stores how auth tokens are sent for a given account/host."""
    __tablename__ = "auth_mechanisms"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    name: Mapped[str] = mapped_column(String(100), nullable=True)
    header_key: Mapped[str] = mapped_column(String(100), nullable=True, default="Authorization")
    prefix: Mapped[str] = mapped_column(String(50), nullable=True, default="Bearer ")
    token_type: Mapped[str] = mapped_column(String(50), nullable=True, default="BEARER")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class TestSchedule(Base):
    """Cron-based scheduled test runs."""
    __tablename__ = "test_schedules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=True)
    cron_expression: Mapped[str] = mapped_column(String(100), nullable=True)
    template_ids: Mapped[list] = mapped_column(JSON, nullable=True)
    endpoint_ids: Mapped[list] = mapped_column(JSON, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class RequestLog(Base):
    """Lightweight request log for rate/anomaly detection."""
    __tablename__ = "request_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    endpoint_id: Mapped[str] = mapped_column(String(36), nullable=True)
    source_ip: Mapped[str] = mapped_column(String(45), nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=True)
    path: Mapped[str] = mapped_column(String, nullable=True)
    response_code: Mapped[int] = mapped_column(Integer, nullable=True)
    response_time_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class WAFEvent(Base):
    """Security events blocked or flagged by the WAF layer."""
    __tablename__ = "waf_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    source_ip: Mapped[str] = mapped_column(String(45), nullable=True)
    endpoint_id: Mapped[str] = mapped_column(String(36), nullable=True)
    rule_id: Mapped[str] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(20), nullable=True, default="BLOCKED")  # BLOCKED/LOGGED/ALLOWED
    method: Mapped[str] = mapped_column(String(10), nullable=True)
    path: Mapped[str] = mapped_column(String, nullable=True)
    payload_snippet: Mapped[str] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=True, default="MEDIUM")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class ThreatActor(Base):
    __tablename__ = "threat_actors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    source_ip: Mapped[str] = mapped_column(String(45), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="MONITORING")
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    last_seen = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MaliciousEvent(Base):
    __tablename__ = "malicious_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    actor_id: Mapped[str] = mapped_column(String(36), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50))
    severity: Mapped[str] = mapped_column(String(20))
    detected_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class APICollection(Base):
    __tablename__ = "api_collections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    name: Mapped[str] = mapped_column(String(255))
    host: Mapped[str] = mapped_column(String(255), nullable=True)
    type: Mapped[str] = mapped_column(String(50), default="MIRRORING")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class Account(Base):
    """Represents a tenant (company/org)."""
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    plan_tier: Mapped[str] = mapped_column(String(50), default="FREE")
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    """System user belonging to an account."""
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="MEMBER", index=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class ApiToken(Base):
    """Long-lived tokens for CI/CD or integration access."""
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    account_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    name: Mapped[str] = mapped_column(String(100))
    token_hash: Mapped[str] = mapped_column(String(255), unique=True)
    scopes: Mapped[list] = mapped_column(JSON, default=list)
    expires_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class Integration(Base):
    """Third-party integration configuration (Slack, Jira, PagerDuty, etc.)."""
    __tablename__ = "integrations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    type: Mapped[str] = mapped_column(String(50), nullable=False)   # slack | jira | pagerduty | webhook
    name: Mapped[str] = mapped_column(String(100), nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, nullable=True)        # webhook_url, api_token, etc.
    events: Mapped[list] = mapped_column(JSON, nullable=True)        # ["vulnerability_found", "test_complete"]
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    """Immutable trail of user/system actions for security & compliance."""
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=True, index=True)
    resource_id: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    details: Mapped[dict] = mapped_column(JSON, nullable=True)
    details_encrypted: Mapped[str] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(45), nullable=True)
    ip_address_encrypted: Mapped[str] = mapped_column(String(100), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class GovernanceRule(Base):
    """API governance policy rules (naming, security, schema enforcement)."""
    __tablename__ = "governance_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    rule_type: Mapped[str] = mapped_column(String(50), nullable=True)  # NAMING | SECURITY | SCHEMA | RATE_LIMIT
    condition: Mapped[dict] = mapped_column(JSON, nullable=True)
    action: Mapped[str] = mapped_column(String(20), default="WARN")    # WARN | BLOCK | ALERT
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    violation_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class MaliciousEventRecord(Base):
    """
    Full-fidelity malicious event — mirrors MaliciousEventMessage + SampleMaliciousRequest protos.
    Replaces the lightweight MaliciousEvent model for threat_detection dashboard ops.
    """
    __tablename__ = "malicious_event_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    # Actor / source
    actor: Mapped[str] = mapped_column(String(255), nullable=True, index=True)    # IP or actor identifier
    filter_id: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    detected_at: Mapped[int] = mapped_column(BigInteger, default=0)                # unix ms
    # Request details
    ip: Mapped[str] = mapped_column(String(45), nullable=True, index=True)
    url: Mapped[str] = mapped_column(String, nullable=True)
    method: Mapped[str] = mapped_column(String(10), nullable=True)
    host: Mapped[str] = mapped_column(String(255), nullable=True)
    api_collection_id: Mapped[int] = mapped_column(Integer, default=0, index=True)
    payload: Mapped[str] = mapped_column(Text, nullable=True)
    # Classification
    event_type: Mapped[str] = mapped_column(String(50), default="EVENT_TYPE_SINGLE")
    category: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    sub_category: Mapped[str] = mapped_column(String(100), nullable=True, index=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=True, index=True)
    type: Mapped[str] = mapped_column(String(100), nullable=True)
    label: Mapped[str] = mapped_column(String(20), nullable=True)          # threat | guardrail
    context_source: Mapped[str] = mapped_column(String(50), nullable=True)  # API | MCP | GEN_AI | AGENTIC
    session_id: Mapped[str] = mapped_column(String(100), nullable=True)
    # Status & triage
    status: Mapped[str] = mapped_column(String(30), default="OPEN")         # OPEN | IGNORED | RESOLVED
    successful_exploit: Mapped[bool] = mapped_column(Boolean, default=False)
    jira_ticket_url: Mapped[str] = mapped_column(String, nullable=True)
    country_code: Mapped[str] = mapped_column(String(10), nullable=True)
    dest_country_code: Mapped[str] = mapped_column(String(10), nullable=True)
    # Raw metadata blob (schema errors, policy info, etc.)
    event_metadata: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class AgenticSession(Base):
    """
    Stores agentic session documents — mirrors SessionDocumentMessage proto.
    Tracks multi-turn LLM/agent conversations for threat analysis.
    """
    __tablename__ = "agentic_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    session_identifier: Mapped[str] = mapped_column(String(255), unique=True)
    session_summary: Mapped[str] = mapped_column(Text, nullable=True)
    conversation_info: Mapped[list] = mapped_column(JSON, default=list)   # List[ConversationEntry]
    is_malicious: Mapped[bool] = mapped_column(Boolean, default=False)
    blocked_reason: Mapped[str] = mapped_column(String, nullable=True)
    created_at_ts: Mapped[int] = mapped_column(BigInteger, default=0)     # unix ms from proto
    updated_at_ts: Mapped[int] = mapped_column(BigInteger, default=0)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class ThreatConfig(Base):
    """
    Singleton-per-account threat detection configuration — mirrors ThreatConfiguration proto.
    Stores actor identification rules, rate-limit config, archival settings, and ML models.
    """
    __tablename__ = "threat_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, unique=True, default=1000000)
    actor_config: Mapped[dict] = mapped_column(JSON, nullable=True)          # Actor proto serialized
    ratelimit_config: Mapped[dict] = mapped_column(JSON, nullable=True)      # RatelimitConfig proto
    param_enumeration_config: Mapped[dict] = mapped_column(JSON, nullable=True)
    archival_days: Mapped[int] = mapped_column(Integer, default=30)
    archival_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    model_store: Mapped[dict] = mapped_column(JSON, nullable=True)          # ML models storage
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── New feature models ─────────────────────────────────────────────────────────

class SourceCodeRepo(Base):
    """Registered source code repository for scanning."""
    __tablename__ = "source_code_repos"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    name: Mapped[str] = mapped_column(String(255))
    repo_type: Mapped[str] = mapped_column(String(50), default="LOCAL")  # LOCAL | GITHUB | GITLAB
    repo_url: Mapped[str] = mapped_column(String, nullable=True)
    local_path: Mapped[str] = mapped_column(String, nullable=True)
    branch: Mapped[str] = mapped_column(String(100), default="main")
    languages: Mapped[list] = mapped_column(JSON, default=list)
    access_token: Mapped[str] = mapped_column(String(512), nullable=True)  # GitHub/GitLab PAT
    last_scanned_at = mapped_column(DateTime(timezone=True), nullable=True)
    finding_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class SourceCodeFinding(Base):
    """Static source code analysis finding."""
    __tablename__ = "source_code_findings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    repo_id: Mapped[str] = mapped_column(String(36), nullable=True)
    file_path: Mapped[str] = mapped_column(String, nullable=True)
    line_number: Mapped[int] = mapped_column(Integer, nullable=True)
    finding_type: Mapped[str] = mapped_column(String(100), nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    title: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    code_snippet: Mapped[str] = mapped_column(Text, nullable=True)
    remediation: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    endpoint_id: Mapped[str] = mapped_column(String(36), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class NucleiScan(Base):
    """Nuclei vulnerability scanner run."""
    __tablename__ = "nuclei_scans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    target: Mapped[str] = mapped_column(String, nullable=False)
    template_ids: Mapped[list] = mapped_column(JSON, default=list)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    severity_filter: Mapped[list] = mapped_column(JSON, default=list)
    custom_template_ids: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    findings: Mapped[list] = mapped_column(JSON, default=list)
    total_found: Mapped[int] = mapped_column(Integer, default=0)
    started_at = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class NucleiTemplate(Base):
    """Custom Nuclei YAML template managed by user."""
    __tablename__ = "nuclei_templates"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    name: Mapped[str] = mapped_column(String(255))
    template_id: Mapped[str] = mapped_column(String(255), nullable=True)  # id field from YAML
    description: Mapped[str] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="medium")
    tags: Mapped[list] = mapped_column(JSON, default=list)
    yaml_content: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class APIWorkflow(Base):
    """Multi-step API sequence for chained testing."""
    __tablename__ = "api_workflows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=True)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class APIWorkflowRun(Base):
    """Execution record for an API workflow."""
    __tablename__ = "api_workflow_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workflow_id: Mapped[str] = mapped_column(String(36), nullable=False)
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    step_results: Mapped[list] = mapped_column(JSON, default=list)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str] = mapped_column(Text, nullable=True)
    started_at = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class CICDTrigger(Base):
    """CI/CD pipeline test trigger record."""
    __tablename__ = "cicd_triggers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    source: Mapped[str] = mapped_column(String(50), nullable=True)
    pipeline_id: Mapped[str] = mapped_column(String(255), nullable=True)
    commit_sha: Mapped[str] = mapped_column(String(100), nullable=True)
    branch: Mapped[str] = mapped_column(String(100), nullable=True)
    repo: Mapped[str] = mapped_column(String(255), nullable=True)
    test_run_id: Mapped[str] = mapped_column(String(36), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    webhook_payload: Mapped[dict] = mapped_column(JSON, nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class BillingPlan(Base):
    """Subscription billing plan definition."""
    __tablename__ = "billing_plans"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), unique=True)
    tier: Mapped[str] = mapped_column(String(50))
    max_endpoints: Mapped[int] = mapped_column(Integer, default=100)
    max_users: Mapped[int] = mapped_column(Integer, default=5)
    max_scans_per_month: Mapped[int] = mapped_column(Integer, default=10)
    features: Mapped[list] = mapped_column(JSON, default=list)
    price_monthly_usd: Mapped[float] = mapped_column(Float, default=0.0)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class BillingSubscription(Base):
    """Account billing subscription."""
    __tablename__ = "billing_subscriptions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False)
    plan_id: Mapped[str] = mapped_column(String(36), nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE")
    scans_used_this_month: Mapped[int] = mapped_column(Integer, default=0)
    current_period_start = mapped_column(DateTime(timezone=True), nullable=True)
    current_period_end = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_subscription_id: Mapped[str] = mapped_column(String(255), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class MCPEndpoint(Base):
    """MCP (Model Context Protocol) endpoint registered for shielding."""
    __tablename__ = "mcp_endpoints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    name: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String, nullable=False)
    shield_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_tools: Mapped[list] = mapped_column(JSON, default=list)
    blocked_patterns: Mapped[list] = mapped_column(JSON, default=list)
    rate_limit_rpm: Mapped[int] = mapped_column(Integer, default=60)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class OAuthProvider(Base):
    """SSO / OAuth2 provider configuration."""
    __tablename__ = "oauth_providers"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    client_id: Mapped[str] = mapped_column(String(255), nullable=True)
    client_secret_enc: Mapped[str] = mapped_column(String(512), nullable=True)
    scopes: Mapped[list] = mapped_column(JSON, default=list)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    allowed_domains: Mapped[list] = mapped_column(JSON, default=list)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class BlockedIP(Base):
    """IPs blocked by the WAF/sensor layer."""
    __tablename__ = "blocked_ips"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    ip: Mapped[str] = mapped_column(String(45), unique=True, nullable=False, index=True)
    reason: Mapped[str] = mapped_column(String(255), nullable=True)
    blocked_by: Mapped[str] = mapped_column(String(50), default="MANUAL")  # MANUAL | AUTO | SENSOR
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    event_count: Mapped[int] = mapped_column(Integer, default=0)
    expires_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class Alert(Base):
    """Security alerts generated by the threat engine."""
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), default="MEDIUM")
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    source_ip: Mapped[str] = mapped_column(String(45), nullable=True)
    endpoint: Mapped[str] = mapped_column(String(512), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")
    acknowledged_by: Mapped[str] = mapped_column(String(100), nullable=True)
    resolved_at = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class Sensor(Base):
    """Registered nginx log-shipper agents."""
    __tablename__ = "sensors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    host: Mapped[str] = mapped_column(String(255), nullable=True)
    sensor_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    version: Mapped[str] = mapped_column(String(20), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="OFFLINE")
    log_path: Mapped[str] = mapped_column(String(512), nullable=True)
    lines_shipped: Mapped[int] = mapped_column(Integer, default=0)
    events_detected: Mapped[int] = mapped_column(Integer, default=0)
    last_heartbeat = mapped_column(DateTime(timezone=True), nullable=True)
    created_at = mapped_column(DateTime(timezone=True), server_default=func.now())


class JWTRevokedToken(Base):
    """Stores invalidated JWT tokens for revocation (logout/password change)."""
    __tablename__ = "jwt_revoked_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_jti: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    account_id: Mapped[int] = mapped_column(BigInteger, default=1000000, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=True, index=True)
    revoked_at = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at = mapped_column(DateTime(timezone=True), nullable=False)
