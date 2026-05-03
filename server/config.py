"""
Configuration — reads from environment variables or .env file.
"""
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── App ──────────────────────────────────────────────────────────
    APP_NAME: str = "API Security Engine"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    DEFAULT_ACCOUNT_ID: int = 1000000
    API_KEY: str = "dev-api-key-change-in-production"
    JWT_SECRET: str = "change-me-in-production-32-char-minimum"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60 * 24 * 7 # 1 week
    ENCRYPTION_KEY: str = "" # Set via .env for production
    STARTUP_BOOTSTRAP_SCHEMA: bool = False
    STARTUP_ENABLE_DEMO_BOOTSTRAP: bool = False
    STARTUP_DEMO_ACCOUNT_ID: int = 1000000
    STARTUP_PLATFORM_ACCOUNT_ID: int = 999999
    STARTUP_REFRESH_TEMPLATE_LIBRARY: bool = True
    STARTUP_ENSURE_DEFAULT_PLAYBOOKS: bool = False
    STARTUP_PLAYBOOK_ACCOUNT_ID: int = 0
    STARTUP_ENABLE_TEST_SCHEDULER: bool = True
    STARTUP_ENABLE_INGESTION_QUEUE: bool = True
    STARTUP_ENABLE_ANALYTICS_PROCESSOR: bool = False
    STARTUP_ANALYTICS_ACCOUNT_ID: int = 0
    STARTUP_ENABLE_ARCHIVER: bool = False
    STARTUP_ARCHIVER_ACCOUNT_ID: int = 0
    STARTUP_ENABLE_WARM_EXPORTER: bool = True
    STARTUP_ENABLE_ENDPOINT_LIFECYCLE: bool = True
    STARTUP_ENABLE_RECON_SCHEDULER: bool = True
    STARTUP_ENABLE_STREAM_PIPELINE: bool = True

    # ── Database ─────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./api_security.db"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800

    # ── Redis (optional) ─────────────────────────────────────────────
    REDIS_URL: str = ""

    # -- Read replica (optional) ---------------------------------------------------------------
    READ_REPLICA_URL: str = ""

    # ── Kafka (optional) ─────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = ""
    KAFKA_ENABLED: bool = False
    KAFKA_CLIENT_ID: str = "api-security-engine"
    KAFKA_SECURITY_PROTOCOL: str = "PLAINTEXT"
    KAFKA_SASL_MECHANISM: str = ""
    KAFKA_SASL_USERNAME: str = ""
    KAFKA_SASL_PASSWORD: str = ""
    KAFKA_ACKS: str = "all"
    KAFKA_LINGER_MS: int = 5
    KAFKA_TOPIC_PARTITIONS: int = 3
    KAFKA_TOPIC_REPLICATION: int = 1
    KAFKA_AUTO_CREATE_TOPICS: bool = True
    KAFKA_CONSUMER_GROUP_PREFIX: str = "api-sec"

    # ── Streaming Engine ─────────────────────────────────────────────
    STREAM_ENGINE: str = "IN_PROCESS"  # IN_PROCESS | FLINK

    # ── MCP Inline Enforcement ───────────────────────────────────────
    INLINE_MCP_ENFORCEMENT_ENABLED: bool = False

    # ── ML Training ──────────────────────────────────────────────────
    ML_TRAINING_ENABLED: bool = True
    ML_TRAINING_MAX_SAMPLES: int = 50000
    ML_TRAINING_MIN_SAMPLES: int = 500
    MODEL_ARTIFACT_DIR: str = str(BASE_DIR / "models")

    # ── Tests Library ────────────────────────────────────────────────
    TESTS_LIBRARY_PATH: str = str(BASE_DIR / "tests-library")


    # ── mitmproxy ────────────────────────────────────────────────────
    MITMPROXY_PORT: int = 8080
    MITMPROXY_HOST: str = "127.0.0.1"

    # ── WAF / Coraza ─────────────────────────────────────────────────
    CORAZA_URL: str = ""

    # ── Security ─────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ]
    # CORS_ORIGINS_OVERRIDE: Can be set via env (comma-separated list, no spaces)
    # E.g., CORS_ORIGINS_OVERRIDE="https://app.example.com,https://api.example.com"
    CORS_ORIGINS_OVERRIDE: str = ""


    # ── Test Execution ───────────────────────────────────────────────
    MAX_CONCURRENT_TESTS: int = 20
    TEST_REQUEST_TIMEOUT: int = 15   # seconds
    PENTEST_DEFAULT_PROFILE_NAME: str = "Production Safe"
    PENTEST_DEFAULT_MODE: str = "SAFE"
    PENTEST_SAFE_MAX_CONCURRENCY: int = 5
    PENTEST_BALANCED_MAX_CONCURRENCY: int = 10
    PENTEST_AGGRESSIVE_MAX_CONCURRENCY: int = 20
    PENTEST_SAFE_TIMEOUT_SECONDS: int = 15
    PENTEST_ALLOW_STATE_CHANGE_DEFAULT: bool = False
    PENTEST_ENABLE_SCHEMATHESIS: bool = True
    PENTEST_ENABLE_NUCLEI_SECRET_FILES: bool = True

    # -- Ingestion / Backpressure --------------------------------------------------------------
    INGESTION_QUEUE_MAX_SIZE: int = 5000
    INGESTION_WORKERS: int = 4
    INGESTION_RATE_LIMIT_RPM: int = 6000  # per tenant
    INGESTION_MAX_LINES: int = 1000
    INGESTION_MAX_LINE_BYTES: int = 4096
    INGESTION_JOB_TTL_HOURS: int = 24
    INGESTION_MAX_EVENTS: int = 2000
    INGESTION_MIN_QUALITY_SCORE: float = 0.6
    INGESTION_DROP_LOW_QUALITY: bool = True
    DETECTION_WINDOW_SECONDS: int = 60
    DETECTION_BURST_THRESHOLD: int = 45
    DETECTION_ALERT_COOLDOWN_SECONDS: int = 120
    DETECTION_SLOW_RESPONSE_THRESHOLD_MS: int = 1500
    UNIFIED_PIPELINE_MODE: str = "off"  # off | shadow | active
    DETECTION_META_VERSION: str = "2026-03-29"
    DETECTION_ALERT_DEDUPE_SECONDS: int = 300
    DETECTION_IP_BLOCK_THRESHOLD: float = 0.8
    DETECTION_RATE_LIMIT_THRESHOLD: float = 0.65
    DETECTION_ENDPOINT_BLOCK_THRESHOLD: float = 0.9
    DETECTION_BATCH_LIMIT: int = 100
    DETECTION_MAX_QUERY_PAGE_SIZE: int = 500
    DETECTION_LARGE_RESPONSE_BYTES: int = 500000
    DETECTION_TIMING_WINDOW_SIZE: int = 20
    DETECTION_BASELINE_EWMA_ALPHA: float = 0.3
    DETECTION_BASELINE_ZSCORE_THRESHOLD: float = 2.5
    DETECTION_OBJECT_ENUM_THRESHOLD: int = 8
    DETECTION_EXFIL_PAGE_THRESHOLD: int = 10
    DETECTION_RULE_WEIGHT: float = 0.30
    DETECTION_BEHAVIORAL_WEIGHT: float = 0.25
    DETECTION_ML_WEIGHT: float = 0.20
    DETECTION_SEQUENCE_WEIGHT: float = 0.15
    DETECTION_REPUTATION_WEIGHT: float = 0.10

    # -- Caching ------------------------------------------------------------------------------
    ENDPOINTS_CACHE_TTL: int = 60     # seconds
    DASHBOARD_CACHE_TTL: int = 30     # seconds

    # -- Privacy / Redaction -----------------------------------------------------------------
    REDACT_PAYLOADS_BY_DEFAULT: bool = True

    # -- Archival / Cold Store ---------------------------------------------------------------
    ARCHIVE_ENABLED: bool = True
    ARCHIVE_DIR: str = str(BASE_DIR / "data" / "archives")
    ARCHIVE_BUCKET: str = ""
    ARCHIVE_REGION: str = ""
    ARCHIVE_AFTER_DAYS: int = 7
    ARCHIVE_BATCH_SIZE: int = 500
    RETENTION_DELETE_AFTER_DAYS: int = 365

    # -- Stream Processing ------------------------------------------------------------------
    STREAM_PROCESSING_ENABLED: bool = True
    STREAM_AUTH_FAILURE_THRESHOLD: int = 100
    STREAM_DISTINCT_ACTORS_THRESHOLD: int = 50
    STREAM_ALERT_SUPPRESS_SECONDS: int = 300
    STREAM_MIN_QUALITY_SCORE: float = 0.5

    # -- ML Shadow Mode ---------------------------------------------------------------------
    ML_SHADOW_MODE: bool = True
    ML_ALERT_THRESHOLD: float = 0.9

    # -- ClickHouse Warm Store --------------------------------------------------------------
    CLICKHOUSE_ENABLED: bool = False
    CLICKHOUSE_URL: str = "http://localhost:8123"
    CLICKHOUSE_USER: str = ""
    CLICKHOUSE_PASSWORD: str = ""
    CLICKHOUSE_DATABASE: str = "api_security"
    CLICKHOUSE_TIMEOUT_SECONDS: int = 10
    WARM_EXPORT_INTERVAL_SECONDS: int = 120
    WARM_EXPORT_BATCH_SIZE: int = 1000

    # ── Endpoint Lifecycle ────────────────────────────────────────────
    LIFECYCLE_SWEEP_INTERVAL_SECONDS: int = 3600
    ZOMBIE_ENDPOINT_DAYS: int = 30

    # ── Recon Scheduler ───────────────────────────────────────────────
    RECON_SCHEDULER_ENABLED: bool = True
    RECON_SCHEDULER_INTERVAL_SECONDS: int = 300
    RECON_DEFAULT_INTERVAL_SECONDS: int = 86400

    # ── Tenant Isolation (RLS) ───────────────────────────────────────
    TENANT_RLS_ENABLED: bool = False
    TENANT_RLS_SETTING_NAME: str = "app.current_account_id"

    # ── GitLab ───────────────────────────────────────────────────────────
    GITLAB_WEBHOOK_SECRET: str = ""

    # ── Splunk ───────────────────────────────────────────────────────────
    SPLUNK_HEC_URL: str = ""
    SPLUNK_HEC_TOKEN: str = ""
    SPLUNK_INDEX: str = "main"

    # ── Datadog ──────────────────────────────────────────────────────────
    DATADOG_API_KEY: str = ""
    DATADOG_APP_KEY: str = ""
    DATADOG_SITE: str = "datadoghq.com"

    # ── Azure DevOps ─────────────────────────────────────────────────────
    AZURE_DEVOPS_ORG: str = ""
    AZURE_DEVOPS_PROJECT: str = ""
    AZURE_DEVOPS_PAT: str = ""

    # ── PagerDuty ────────────────────────────────────────────────────────
    PAGERDUTY_ROUTING_KEY: str = ""

    # ── BigQuery ─────────────────────────────────────────────────────────
    BIGQUERY_PROJECT_ID: str = ""
    BIGQUERY_DATASET_ID: str = ""

    # ── Nuclei ───────────────────────────────────────────────────────────
    NUCLEI_TIMEOUT: int = 120
    NUCLEI_RATE_LIMIT: int = 150

    # ── Billing / Stripe ─────────────────────────────────────────────────
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""

    # ── Agent Guard ──────────────────────────────────────────────────────
    AGENT_GUARD_ENABLED: bool = True
    AGENT_GUARD_BLOCK_ON_CRITICAL: bool = True

    # ── MCP Shield ───────────────────────────────────────────────────────
    MCP_SHIELD_ENABLED: bool = True
    MCP_DEFAULT_RATE_LIMIT_RPM: int = 60

    @field_validator("DEBUG", mode="before")
    @classmethod
    def _coerce_debug_value(cls, value):
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"release", "prod", "production"}:
                return False
            if normalized in {"dev", "debug", "development"}:
                return True
        return value

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if self.UNIFIED_PIPELINE_MODE not in {"off", "shadow", "active"}:
            raise ValueError("UNIFIED_PIPELINE_MODE must be one of: off, shadow, active")

        if self.STARTUP_ENSURE_DEFAULT_PLAYBOOKS and self.STARTUP_PLAYBOOK_ACCOUNT_ID <= 0:
            raise ValueError("STARTUP_PLAYBOOK_ACCOUNT_ID must be > 0 when STARTUP_ENSURE_DEFAULT_PLAYBOOKS=True")
        if self.STARTUP_ENABLE_ANALYTICS_PROCESSOR and self.STARTUP_ANALYTICS_ACCOUNT_ID < 0:
            raise ValueError("STARTUP_ANALYTICS_ACCOUNT_ID must be >= 0 when STARTUP_ENABLE_ANALYTICS_PROCESSOR=True")
        if self.STARTUP_ENABLE_ARCHIVER and self.STARTUP_ARCHIVER_ACCOUNT_ID < 0:
            raise ValueError("STARTUP_ARCHIVER_ACCOUNT_ID must be >= 0 when STARTUP_ENABLE_ARCHIVER=True")

        if not self.DEBUG:
            if self.STARTUP_BOOTSTRAP_SCHEMA:
                raise ValueError("STARTUP_BOOTSTRAP_SCHEMA must remain disabled when DEBUG=False; run Alembic migrations separately")
            if self.STARTUP_ENABLE_DEMO_BOOTSTRAP:
                raise ValueError("STARTUP_ENABLE_DEMO_BOOTSTRAP must remain disabled when DEBUG=False")

            # Critical secrets validation
            if self.JWT_SECRET == "change-me-in-production-32-char-minimum":
                raise ValueError("JWT_SECRET must be changed from the default when DEBUG=False")
            if self.API_KEY == "dev-api-key-change-in-production":
                raise ValueError("API_KEY must be changed from the default when DEBUG=False")
            if not self.ENCRYPTION_KEY:
                raise ValueError("ENCRYPTION_KEY must be set in production for PAT rotation and data encryption")

            # CORS validation
            cors_origins = self.CORS_ORIGINS
            if self.CORS_ORIGINS_OVERRIDE:
                # Parse CORS_ORIGINS_OVERRIDE from comma-separated string
                cors_origins = [o.strip() for o in self.CORS_ORIGINS_OVERRIDE.split(",") if o.strip()]
                if not cors_origins:
                    raise ValueError("CORS_ORIGINS_OVERRIDE is set but empty after parsing")

            # Check for localhost/127.0.0.1 in production
            for origin in cors_origins:
                if "localhost" in origin or "127.0.0.1" in origin:
                    raise ValueError(f"CORS origin '{origin}' contains localhost/127.0.0.1 in production. Use CORS_ORIGINS_OVERRIDE for production URLs.")

        return self

settings = Settings()
