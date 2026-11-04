"""``GatewayRegistry``: único caminho de saída para qualquer canal.

O restante do backend envia respostas **somente** por ``registry.send(...)``,
nunca chamando a API da Meta diretamente.
"""

import logging
import time

from app.schemas.channel import Channel, ChannelGateway, OutboundMessage, SendResult
from app.services.whatsapp.observability import log_event


class GatewayRegistry:
    def __init__(self) -> None:
        self._gateways: dict[Channel, ChannelGateway] = {}

    def register(self, channel: Channel, gateway: ChannelGateway) -> None:
        self._gateways[channel] = gateway

    def get(self, channel: Channel) -> ChannelGateway | None:
        return self._gateways.get(channel)

    @property
    def channels(self) -> set[Channel]:
        return set(self._gateways)

    async def send(self, msg: OutboundMessage) -> SendResult:
        gateway = self._gateways.get(msg.channel)
        if gateway is None:
            log_event("send_failed", logging.WARNING, channel=msg.channel, reason="channel_unavailable")
            return SendResult(ok=False, reason="channel_unavailable")

        started = time.perf_counter()
        result = await gateway.send_text(msg)
        log_event(
            "message_sent" if result.ok else "send_failed",
            logging.INFO if result.ok else logging.WARNING,
            channel=msg.channel,
            phone=msg.to_phone,
            sender=msg.sender,
            external_id=",".join(result.external_ids) or None,
            reason=result.reason,
            error_code=result.error_code,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        return result
