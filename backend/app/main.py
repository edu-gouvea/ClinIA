"""Ponto de entrada da aplicação.

Execução local (a partir de ``backend/``)::

    uvicorn app.main:create_app --factory --reload

A fábrica evita que a configuração seja lida no import, o que facilita os testes.
"""

from fastapi import FastAPI

from app.core.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(title=settings.app_name)
    app.state.settings = settings

    @app.get("/api/health", tags=["health"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app
