"""Envio iniciado pelo sistema a partir de uma conversa (RF13/RF15).

``send_to_patient`` é o ponto de integração da rota de resposta do atendente
no dashboard: resolve canal e telefone da conversa e envia pelo gateway certo.
A regra "conversa em modo human não vai para a IA" é do ``ConversationService``.
"""

from typing import Literal, Protocol

from pydantic import BaseModel

from app.schemas.channel import Channel, OutboundMessage, SendResult
from app.services.whatsapp.registry import GatewayRegistry

# Tipo do id ainda não definido pela frente de Banco (int ou UUID)
ConversationId = int | str


class ConversationContact(BaseModel):
    channel: Channel
    phone: str  # wa_id exatamente como recebido


class ConversationLookup(Protocol):
    """A implementar pela frente de Conversas sobre ``Conversation`` + ``Patient``."""

    async def get_contact(self, conversation_id: ConversationId) -> ConversationContact | None: ...


class ConversationNotFoundError(LookupError):
    pass


class PatientMessenger:
    def __init__(self, lookup: ConversationLookup, registry: GatewayRegistry) -> None:
        self._lookup = lookup
        self._registry = registry

    async def send_to_patient(
        self,
        conversation_id: ConversationId,
        text: str,
        sender: Literal["ai", "attendant"] = "attendant",
    ) -> SendResult:
        """Envia ``text`` ao paciente da conversa. Fora da janela de 24h devolve ``window_closed``."""
        contact = await self._lookup.get_contact(conversation_id)
        if contact is None:
            raise ConversationNotFoundError(conversation_id)
        return await self._registry.send(
            OutboundMessage(channel=contact.channel, to_phone=contact.phone, text=text, sender=sender)
        )
