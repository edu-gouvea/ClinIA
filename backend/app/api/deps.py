"""Dependências FastAPI compartilhadas entre rotas."""

from fastapi import Request

from app.core.config import Settings
from app.services.whatsapp.container import WhatsAppModule


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


# --- WhatsApp / Integrações ---
def get_whatsapp_module(request: Request) -> WhatsAppModule:
    return request.app.state.whatsapp
