"""Configuração da aplicação via variáveis de ambiente (Pydantic Settings)."""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Aplicação
    app_name: str = "ClinIA"
    app_env: Literal["development", "staging", "production", "test"] = "development"

    # Banco de dados
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/clinia"
    test_database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5433/clinia_test"

    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_access_minutes: int = 30
    jwt_refresh_days: int = 7

    # CORS
    cors_origins: list[str] = ["http://localhost:3000"]

    # Log
    log_level: str = "INFO"

    # CRM externo
    caminho_do_crm: str = ""

    # Feature flags
    simulator_enabled: bool = True
    agent_provider: Literal["fake", "openai", "anthropic"] = "fake"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors(cls, v: object) -> list[str]:
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v  # type: ignore[return-value]

    @field_validator("database_url", "test_database_url", mode="before")
    @classmethod
    def _ensure_asyncpg(cls, v: str) -> str:
        if v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
