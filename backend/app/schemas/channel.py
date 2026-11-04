"""Contratos da camada de canal (WhatsApp real ou simulador).

Para o restante do backend a origem da mensagem não importa: toda entrada
chega como ``InboundMessage`` a um ``InboundHandler`` e toda saída sai como
``OutboundMessage`` por um ``ChannelGateway`` (via ``GatewayRegistry``).
Documentação para a equipe: ``docs/integracao-whatsapp.md``.
"""

from datetime import datetime
from enum import Enum
from typing import Literal, Protocol, runtime_checkable

from pydantic import BaseModel, Field


class Channel(str, Enum):
    WHATSAPP = "whatsapp"
    SIMULATOR = "simulator"


class InboundMessage(BaseModel):
    channel: Channel
    external_id: str  # wamid da Meta, ou UUID gerado no simulador
    from_phone: str  # wa_id / telefone do paciente, como recebido
    contact_name: str | None
    type: Literal["text", "unsupported"]
    text: str | None
    received_at: datetime


class OutboundMessage(BaseModel):
    channel: Channel
    to_phone: str
    text: str
    sender: Literal["ai", "attendant"]


class SendResult(BaseModel):
    ok: bool
    # Um id por parte enviada (textos longos são divididos). Na Cloud API é o wamid.
    external_ids: list[str] = Field(default_factory=list)
    # Ex.: "window_closed", "http_error", "network_error", "channel_unavailable", "empty_text"
    reason: str | None = None
    # Código de erro da Meta (``error.code``), quando houver
    error_code: int | None = None


class DeliveryStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class DeliveryStatusUpdate(BaseModel):
    """Atualização de entrega de uma mensagem de saída (``statuses[]`` do webhook)."""

    channel: Channel
    external_id: str
    status: DeliveryStatus
    recipient_phone: str | None
    timestamp: datetime
    error_code: int | None = None


@runtime_checkable
class ChannelGateway(Protocol):
    async def send_text(self, msg: OutboundMessage) -> SendResult: ...


@runtime_checkable
class InboundHandler(Protocol):
    async def handle_incoming(self, msg: InboundMessage) -> None: ...
