from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from server.config import settings

_engine_kwargs = {
    "echo": False,
    "future": True,
    "pool_pre_ping": True,
}

if not settings.DATABASE_URL.startswith("sqlite"):
    _engine_kwargs.update({
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_timeout": settings.DB_POOL_TIMEOUT,
        "pool_recycle": settings.DB_POOL_RECYCLE,
    })

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
