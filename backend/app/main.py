"""Ponto de entrada da aplicação.

Execução local (a partir de ``backend/``)::

    uvicorn app.main:create_app --factory --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import Settings, get_settings
from app.core.database import get_session_factory
from app.core.errors import register_error_handlers
from app.core.logging import RequestIDMiddleware, configure_logging, get_logger

logger = get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.app_name,
        docs_url="/api/v1/docs",
        redoc_url="/api/v1/redoc",
        openapi_url="/api/v1/openapi.json",
    )
    app.state.settings = settings

    # Middlewares
    app.add_middleware(RequestIDMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Handlers de erro globais
    register_error_handlers(app)

    # Rotas
    @app.get("/api/v1/health", tags=["infra"])
    async def health() -> dict:
        factory = get_session_factory()
        async with factory() as session:
            await session.execute(text("SELECT 1"))
        return {"status": "ok"}

    return app
