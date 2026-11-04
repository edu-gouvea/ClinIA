"""Montagem do módulo WhatsApp a partir das configurações.

Quando as outras frentes existirem, basta trocar os stubs::

    build_whatsapp_module(
        settings,
        handler_factory=lambda registry: ConversationService(..., registry=registry),
        conversation_lookup=SqlConversationLookup(...),
    )
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import Settings, WhatsAppMode
from app.schemas.channel import Channel, InboundHandler
from app.services.whatsapp.cloud_gateway import WhatsAppCloudGateway
from app.services.whatsapp.dispatcher import InboundDispatcher
from app.services.whatsapp.outbound import ConversationLookup, PatientMessenger
from app.services.whatsapp.registry import GatewayRegistry
from app.services.whatsapp.simulator_gateway import SimulatorGateway
from app.services.whatsapp.store import ChannelMessageStore, InMemoryChannelMessageStore
from app.services.whatsapp.stubs import EchoInboundHandler, InMemoryConversationDirectory

HandlerFactory = Callable[[GatewayRegistry], InboundHandler]


@dataclass
class WhatsAppModule:
    settings: Settings
    store: ChannelMessageStore
    registry: GatewayRegistry
    dispatcher: InboundDispatcher
    messenger: PatientMessenger
    cloud_gateway: WhatsAppCloudGateway | None = None
    simulator: SimulatorGateway | None = None
    _owned_http_client: httpx.AsyncClient | None = None

    async def aclose(self) -> None:
        if self._owned_http_client is not None:
            await self._owned_http_client.aclose()


def build_whatsapp_module(
    settings: Settings,
    *,
    handler_factory: HandlerFactory | None = None,
    conversation_lookup: ConversationLookup | None = None,
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

    simulator = None
    if settings.simulator_active:
        simulator = SimulatorGateway()
        registry.register(Channel.SIMULATOR, simulator)

    # Stubs enquanto ConversationService e Conversation não existem
    directory = InMemoryConversationDirectory()
    if handler_factory is None:
        handler = EchoInboundHandler(registry, directory)
    else:
        handler = handler_factory(registry)

    return WhatsAppModule(
        settings=settings,
        store=store,
        registry=registry,
        dispatcher=InboundDispatcher(handler, store),
        messenger=PatientMessenger(conversation_lookup or directory, registry),
        cloud_gateway=cloud_gateway,
        simulator=simulator,
        _owned_http_client=owned_client,
    )
