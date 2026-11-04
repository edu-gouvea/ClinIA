"""Montagem do módulo WhatsApp a partir das configurações.

Quando o ``ConversationService`` existir, basta passar ``handler_factory``::

    build_whatsapp_module(settings, handler_factory=lambda registry: ConversationService(...))
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import Settings, WhatsAppMode
from app.schemas.channel import Channel, InboundHandler
from app.services.whatsapp.cloud_gateway import WhatsAppCloudGateway
from app.services.whatsapp.dispatcher import InboundDispatcher
from app.services.whatsapp.registry import GatewayRegistry
from app.services.whatsapp.store import ChannelMessageStore, InMemoryChannelMessageStore
from app.services.whatsapp.stubs import EchoInboundHandler

HandlerFactory = Callable[[GatewayRegistry], InboundHandler]


@dataclass
class WhatsAppModule:
    settings: Settings
    store: ChannelMessageStore
    registry: GatewayRegistry
    dispatcher: InboundDispatcher
    cloud_gateway: WhatsAppCloudGateway | None = None
    _owned_http_client: httpx.AsyncClient | None = None

    async def aclose(self) -> None:
        if self._owned_http_client is not None:
            await self._owned_http_client.aclose()


def build_whatsapp_module(
    settings: Settings,
    *,
    handler_factory: HandlerFactory | None = None,
    store: ChannelMessageStore | None = None,
    http_client: httpx.AsyncClient | None = None,
    cloud_gateway_options: dict[str, Any] | None = None,
) -> WhatsAppModule:
    """``http_client`` permite injetar um ``httpx.MockTransport`` nos testes."""
    store = store or InMemoryChannelMessageStore()
    registry = GatewayRegistry()

    cloud_gateway = None
    owned_client = None
    if settings.whatsapp_mode is WhatsAppMode.CLOUD:
        if http_client is None:
            http_client = owned_client = httpx.AsyncClient(
                timeout=httpx.Timeout(settings.whatsapp_http_timeout_seconds)
            )
        cloud_gateway = WhatsAppCloudGateway.from_settings(
            settings, client=http_client, store=store, **(cloud_gateway_options or {})
        )
        registry.register(Channel.WHATSAPP, cloud_gateway)

    handler = (handler_factory or EchoInboundHandler)(registry)
    return WhatsAppModule(
        settings=settings,
        store=store,
        registry=registry,
        dispatcher=InboundDispatcher(handler, store),
        cloud_gateway=cloud_gateway,
        _owned_http_client=owned_client,
    )
