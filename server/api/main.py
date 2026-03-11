from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from server.config import settings
from server.modules.persistence.database import engine, AsyncSessionLocal
from server.models import Base
from server.api.routers import router
from server.modules.test_executor.wordlist_manager import WordlistManager
from server.modules.scheduler.test_scheduler import TestScheduler

DEMO_ACCOUNT_ID = 1000000

from contextlib import asynccontextmanager
import structlog
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from server.api.rate_limiter import limiter
logger = structlog.get_logger()
_scheduler = TestScheduler()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- Startup ---
    # Create all SQLAlchemy tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Ensure demo account (id=1000000) exists
    async with AsyncSessionLocal() as db:
        exists = await db.execute(
            text("SELECT id FROM accounts WHERE id = :id"), {"id": DEMO_ACCOUNT_ID}
        )
        if not exists.fetchone():
            await db.execute(
                text("INSERT INTO accounts (id, name, plan_tier) VALUES (:id, :name, :tier)"),
                {"id": DEMO_ACCOUNT_ID, "name": "Demo Organization", "tier": "ENTERPRISE"},
            )
            logger.info("startup", message=f"Created demo account id={DEMO_ACCOUNT_ID}")
        await db.commit()

    # Load security test templates from YAML library
    wm = WordlistManager.get_instance(settings.TESTS_LIBRARY_PATH)
    wm.refresh_templates()

    # Start APScheduler for cron-based test scheduling
    _scheduler.start()

    logger.info("startup", templates_loaded=len(wm.templates), scheduler_started=True)
    
    yield
    
    # --- Shutdown ---
    _scheduler.stop()
    await engine.dispose()
    logger.info("shutdown", message="Shutdown complete.")



app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description="API Security Engine — full Akto-parity backend with Python/FastAPI/SQLite",
    lifespan=lifespan
)
app.state.limiter = limiter

@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": True, "message": "Too many requests. Please try again later."},
    )

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": True, "message": exc.detail},
    )

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    # Skip logging for common network errors or expected breaks
    logger.error("unhandled_exception", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"error": True, "message": "Internal Server Error"},
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
)

app.include_router(router, prefix="/api")
