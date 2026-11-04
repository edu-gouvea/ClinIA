"""Canal simulado para demonstração e desenvolvimento.

As respostas ficam em memória para o frontend buscá-las por polling em
``GET /api/simulator/messages``. Não há janela de 24h nem limite de tamanho.
"""

import itertools
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.channel import Channel, OutboundMessage, SendResult


class SimulatorReply(BaseModel):
    id: int  # crescente: o frontend usa como cursor em ?after=<id>
    phone: str
    text: str
    sender: Literal["ai", "attendant"]
    sent_at: datetime


class SimulatorGateway:
    channel = Channel.SIMULATOR

    def __init__(self, max_per_phone: int = 500) -> None:
        self._ids = itertools.count(1)
        self._replies: defaultdict[str, deque[SimulatorReply]] = defaultdict(lambda: deque(maxlen=max_per_phone))

    async def send_text(self, msg: OutboundMessage) -> SendResult:
        if not msg.text.strip():
            return SendResult(ok=False, reason="empty_text")
        reply = SimulatorReply(
            id=next(self._ids),
            phone=msg.to_phone,
            text=msg.text,
            sender=msg.sender,
            sent_at=datetime.now(UTC),
        )
        self._replies[msg.to_phone].append(reply)
        return SendResult(ok=True, external_ids=[f"sim-{reply.id}"])

    def list_replies(self, phone: str, after: int | None = None) -> list[SimulatorReply]:
        replies = self._replies.get(phone, ())
        return [r for r in replies if after is None or r.id > after]
