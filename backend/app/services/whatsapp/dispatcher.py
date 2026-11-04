"""Entrega das mensagens normalizadas ao ``InboundHandler``.

Webhook e simulador passam pelo mesmo ``InboundDispatcher``: é ele que garante
idempotência e registra os eventos de integração.
"""

import logging
import time

from app.schemas.channel import DeliveryStatus, DeliveryStatusUpdate, InboundHandler, InboundMessage
from app.services.whatsapp.observability import log_event
from app.services.whatsapp.parser import ParsedWebhook
from app.services.whatsapp.store import ChannelMessageStore


class InboundDispatcher:
    def __init__(self, handler: InboundHandler, store: ChannelMessageStore) -> None:
        self.handler = handler
        self._store = store

    async def dispatch(self, msg: InboundMessage) -> bool:
        """Entrega a mensagem ao handler. ``False`` se for duplicada ou se o handler falhar."""
        if not await self._store.claim_inbound(msg):
            log_event("duplicate_ignored", channel=msg.channel, external_id=msg.external_id)
            return False

        started = time.perf_counter()
        try:
            await self.handler.handle_incoming(msg)
        except Exception as exc:  # noqa: BLE001 — uma mensagem com erro não derruba as demais
            # Só o tipo da exceção: a mensagem de erro pode conter texto do paciente
            log_event(
                "handler_failed",
                logging.ERROR,
                channel=msg.channel,
                external_id=msg.external_id,
                error=type(exc).__name__,
                duration_ms=_elapsed_ms(started),
            )
            return False

        log_event(
            "message_dispatched",
            channel=msg.channel,
            external_id=msg.external_id,
            phone=msg.from_phone,
            type=msg.type,
            duration_ms=_elapsed_ms(started),
        )
        return True

    async def apply_status(self, update: DeliveryStatusUpdate) -> None:
        found = await self._store.update_delivery_status(update)
        if update.status is DeliveryStatus.FAILED:
            log_event(
                "delivery_failed",
                logging.WARNING,
                channel=update.channel,
                external_id=update.external_id,
                status=update.status,
                error_code=update.error_code,
            )
        log_event(
            "status_updated" if found else "status_unmatched",
            logging.INFO if found else logging.DEBUG,
            channel=update.channel,
            external_id=update.external_id,
            status=update.status,
        )

    async def process_webhook(self, parsed: ParsedWebhook) -> None:
        for msg in parsed.messages:
            await self.dispatch(msg)
        for update in parsed.statuses:
            await self.apply_status(update)


def _elapsed_ms(started: float) -> int:
    return round((time.perf_counter() - started) * 1000)
