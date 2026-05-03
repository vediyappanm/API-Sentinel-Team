import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from server.api.main import app
from server.modules.persistence.database import get_db, get_read_db
from server.models import Base
from server.config import settings
from server.modules.auth.jwt_issuer import JWTIssuer

# Use an in-memory database for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(test_engine):
    Session = async_sessionmaker(bind=test_engine, expire_on_commit=False)
    async with Session() as session:
        yield session
        await session.rollback()

@pytest_asyncio.fixture
async def client(db_session):
    def override_get_db():
        yield db_session
    def override_get_read_db():
        yield db_session
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_read_db] = override_get_read_db
    from httpx import ASGITransport
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    token = JWTIssuer.create_access_token({
        "user_id": "test-user",
        "account_id": 1000000,
        "role": "ADMIN",
    })
    return {"Authorization": f"Bearer {token}"}

@pytest_asyncio.fixture
async def db(db_session):
    """Alias for db_session fixture for backward compatibility."""
    return db_session

@pytest.fixture
def account_id():
    """Default test account ID."""
    return 1000000

@pytest_asyncio.fixture
async def cache():
    """Mock cache fixture."""
    class MockCache:
        async def get(self, key):
            return None
        async def set(self, key, value, ttl=None):
            pass
        async def delete(self, key):
            pass
    return MockCache()
