"""Configuração da aplicação via variáveis de ambiente (Pydantic Settings).

Esqueleto mínimo: cada frente acrescenta aqui o seu bloco de variáveis,
sempre com entrada correspondente em ``.env.example``.
"""

from enum import Enum
from functools import lru_cache

from pydantic import SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WhatsAppMode(str, Enum):
    SIMULATOR = "simulator"
    CLOUD = "cloud"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "ClinIA"

    # --- WhatsApp / Integrações ---
    whatsapp_mode: WhatsAppMode = WhatsAppMode.SIMULATOR
    whatsapp_access_token: SecretStr = SecretStr("")
    whatsapp_phone_number_id: str = ""
    whatsapp_app_secret: SecretStr = SecretStr("")
    whatsapp_verify_token: SecretStr = SecretStr("")
    whatsapp_graph_version: str = ""
    whatsapp_api_base_url: str = "https://graph.facebook.com"
    whatsapp_http_timeout_seconds: float = 10.0
    whatsapp_send_max_attempts: int = 3
    # None = habilitado apenas quando WHATSAPP_MODE=simulator
    simulator_enabled: bool | None = None

    @property
    def simulator_active(self) -> bool:
        if self.simulator_enabled is not None:
            return self.simulator_enabled
        return self.whatsapp_mode is WhatsAppMode.SIMULATOR

    @model_validator(mode="after")
    def _require_cloud_credentials(self) -> "Settings":
        if self.whatsapp_mode is not WhatsAppMode.CLOUD:
            return self
        required = {
            "WHATSAPP_ACCESS_TOKEN": self.whatsapp_access_token.get_secret_value(),
            "WHATSAPP_PHONE_NUMBER_ID": self.whatsapp_phone_number_id,
            "WHATSAPP_APP_SECRET": self.whatsapp_app_secret.get_secret_value(),
            "WHATSAPP_VERIFY_TOKEN": self.whatsapp_verify_token.get_secret_value(),
            "WHATSAPP_GRAPH_VERSION": self.whatsapp_graph_version,
        }
        missing = [name for name, value in required.items() if not value.strip()]
        if missing:
            raise ValueError(f"WHATSAPP_MODE=cloud exige as variáveis: {', '.join(missing)}")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
