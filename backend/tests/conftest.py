"""Fixtures de teste: banco isolado por transação e AsyncClient configurado."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator  # noqa: TC003

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings
from app.core.database import Base, get_db
from app.main import create_app

# ── motor de teste (compartilhado pela sessão inteira) ────────────────────────

@pytest.fixture(scope="session")
def test_settings() -> Settings:
    return Settings(
        app_env="test",
        database_url="postgresql+asyncpg://postgres:postgres@localhost:5433/clinia_test",
        test_database_url="postgresql+asyncpg://postgres:postgres@localhost:5433/clinia_test",
        jwt_secret="test-secret",
        log_level="WARNING",
        _env_file=None,  # type: ignore[call-arg]
    )


@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()


@pytest_asyncio.fixture(scope="session")
async def db_engine(test_settings: Settings):
    engine = create_async_engine(test_settings.test_database_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ── isolamento por transação ──────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncGenerator[AsyncSession, None]:
    async with db_engine.connect() as conn:
        await conn.begin_nested()
        session_factory = async_sessionmaker(conn, expire_on_commit=False, autoflush=False)
        async with session_factory() as session:
            yield session
            await session.rollback()


# ── AsyncClient com get_db sobrescrito ────────────────────────────────────────

@pytest_asyncio.fixture
async def client(  # noqa: E501
    test_settings: Settings, db_session: AsyncSession
) -> AsyncGenerator[AsyncClient, None]:
    app = create_app(test_settings)

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
