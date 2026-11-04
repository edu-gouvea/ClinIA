"""Dependências FastAPI compartilhadas entre rotas."""

from fastapi import Request

from app.core.config import Settings
from app.services.whatsapp.container import WhatsAppModule
from app.services.whatsapp.outbound import PatientMessenger


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


# --- WhatsApp / Integrações ---
def get_whatsapp_module(request: Request) -> WhatsAppModule:
    return request.app.state.whatsapp


def get_patient_messenger(request: Request) -> PatientMessenger:
    """Use na rota de resposta do atendente: ``Depends(get_patient_messenger)``."""
    return request.app.state.whatsapp.messenger
