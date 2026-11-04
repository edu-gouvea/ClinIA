"""Ponto de entrada da aplicação.

Execução local (a partir de ``backend/``)::

    uvicorn app.main:create_app --factory --reload

A fábrica evita que a configuração seja lida no import, o que facilita os testes.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import whatsapp
from app.core.config import Settings, get_settings
from app.services.whatsapp.container import WhatsAppModule, build_whatsapp_module
from app.services.whatsapp.observability import configure_logging


def create_app(
    settings: Settings | None = None,
    *,
    whatsapp_module: WhatsAppModule | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging()
    whatsapp_module = whatsapp_module or build_whatsapp_module(settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await whatsapp_module.aclose()

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.state.settings = settings
    app.state.whatsapp = whatsapp_module

    @app.get("/api/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(whatsapp.router)
    return app
