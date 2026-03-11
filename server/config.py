"""
Configuration — reads from environment variables or .env file.
"""
from pydantic_settings import BaseSettings
from pydantic import model_validator
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

class Settings(BaseSettings):
    # ── App ──────────────────────────────────────────────────────────
    APP_NAME: str = "API Security Engine"
    VERSION: str = "1.0.0"
    DEBUG: bool = True
    API_KEY: str = "dev-api-key-change-in-production"

    # ── Database ─────────────────────────────────────────────────────
    DATABASE_URL: str = "sqlite+aiosqlite:///./api_security.db"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 10
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 1800

    # ── Redis (optional) ─────────────────────────────────────────────
    REDIS_URL: str = ""

    # ── Kafka (optional) ─────────────────────────────────────────────
    KAFKA_BOOTSTRAP_SERVERS: str = ""
    KAFKA_ENABLED: bool = False

    # ── Tests Library ────────────────────────────────────────────────
    TESTS_LIBRARY_PATH: str = str(BASE_DIR / "tests-library")


    # ── mitmproxy ────────────────────────────────────────────────────
    MITMPROXY_PORT: int = 8080
    MITMPROXY_HOST: str = "127.0.0.1"

    # ── WAF / Coraza ─────────────────────────────────────────────────
    CORAZA_URL: str = ""

    # ── Security ─────────────────────────────────────────────────────
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8080"]
    ENCRYPTION_KEY: str = "" # Fernet key for PAT rotation

    # ── Test Execution ───────────────────────────────────────────────
    MAX_CONCURRENT_TESTS: int = 20
    TEST_REQUEST_TIMEOUT: int = 15   # seconds

    # ── Account ──────────────────────────────────────────────────────
    DEFAULT_ACCOUNT_ID: int = 1000000

    # ── JWT ──────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-me-in-production-32-char-minimum"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440

    # ── GitHub OAuth SSO ─────────────────────────────────────────────────
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_WEBHOOK_SECRET: str = ""
    OAUTH_REDIRECT_BASE_URL: str = "http://localhost:8000"

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

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        if not self.DEBUG:
            if self.JWT_SECRET == "change-me-in-production-32-char-minimum":
                raise ValueError("JWT_SECRET must be changed from the default when DEBUG=False")
            if self.API_KEY == "dev-api-key-change-in-production":
                raise ValueError("API_KEY must be changed from the default when DEBUG=False")
            if not self.ENCRYPTION_KEY:
                raise ValueError("ENCRYPTION_KEY must be set in production for data rotation")
        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False

settings = Settings()
