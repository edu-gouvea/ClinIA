"""Estado da integração: idempotência, status de entrega e janela de 24h.

``ChannelMessageStore`` é a interface; ``InMemoryChannelMessageStore`` é a
implementação do MVP, enquanto o modelo ``Message`` não existe. Ela não
sobrevive a reinícios e não é compartilhada entre processos. A versão
definitiva usa a tabela de mensagens: ``external_id`` único por canal,
``direction`` e ``delivery_status`` (ver ``docs/integracao-whatsapp.md``).
"""

from collections import OrderedDict
from datetime import datetime
from typing import Protocol

from app.schemas.channel import Channel, DeliveryStatus, DeliveryStatusUpdate, InboundMessage

# Status nunca "regride" (ex.: um "delivered" atrasado depois de "read"); "failed" sempre vale
_STATUS_RANK = {
    DeliveryStatus.PENDING: 0,
    DeliveryStatus.SENT: 1,
    DeliveryStatus.DELIVERED: 2,
    DeliveryStatus.READ: 3,
}


class ChannelMessageStore(Protocol):
    async def claim_inbound(self, msg: InboundMessage) -> bool:
        """Marca a mensagem como processada. ``False`` se o ``external_id`` já foi visto."""
        ...

    async def last_inbound_at(self, channel: Channel, phone: str) -> datetime | None: ...

    async def register_outbound(self, channel: Channel, external_id: str) -> None: ...

    async def update_delivery_status(self, update: DeliveryStatusUpdate) -> bool:
        """``False`` se a mensagem de saída não é conhecida."""
        ...

    async def get_delivery_status(self, channel: Channel, external_id: str) -> DeliveryStatus | None: ...


class InMemoryChannelMessageStore:
    def __init__(self, max_tracked: int = 10_000) -> None:
        self._max_tracked = max_tracked
        self._seen_inbound: OrderedDict[tuple[Channel, str], None] = OrderedDict()
        self._last_inbound: dict[tuple[Channel, str], datetime] = {}
        self._outbound: OrderedDict[tuple[Channel, str], DeliveryStatus] = OrderedDict()

    async def claim_inbound(self, msg: InboundMessage) -> bool:
        key = (msg.channel, msg.external_id)
        if key in self._seen_inbound:
            return False
        self._seen_inbound[key] = None
        self._trim(self._seen_inbound)

        phone_key = (msg.channel, msg.from_phone)
        previous = self._last_inbound.get(phone_key)
        if previous is None or msg.received_at > previous:
            self._last_inbound[phone_key] = msg.received_at
        return True

    async def last_inbound_at(self, channel: Channel, phone: str) -> datetime | None:
        return self._last_inbound.get((channel, phone))

    async def register_outbound(self, channel: Channel, external_id: str) -> None:
        self._outbound.setdefault((channel, external_id), DeliveryStatus.PENDING)
        self._trim(self._outbound)

    async def update_delivery_status(self, update: DeliveryStatusUpdate) -> bool:
        key = (update.channel, update.external_id)
        current = self._outbound.get(key)
        if current is None:
            return False
        if _should_apply(current, update.status):
            self._outbound[key] = update.status
        return True

    async def get_delivery_status(self, channel: Channel, external_id: str) -> DeliveryStatus | None:
        return self._outbound.get((channel, external_id))

    def _trim(self, items: OrderedDict) -> None:
        while len(items) > self._max_tracked:
            items.popitem(last=False)


def _should_apply(current: DeliveryStatus, new: DeliveryStatus) -> bool:
    if new is DeliveryStatus.FAILED:
        return True
    if current is DeliveryStatus.FAILED:
        return False
    return _STATUS_RANK[new] > _STATUS_RANK[current]
