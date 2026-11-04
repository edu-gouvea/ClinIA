"""Montagem do módulo WhatsApp a partir das configurações.

Quando o ``ConversationService`` existir, basta passar ``handler_factory``::

    build_whatsapp_module(settings, handler_factory=lambda registry: ConversationService(...))
"""

from collections.abc import Callable
from dataclasses import dataclass

from app.core.config import Settings
from app.schemas.channel import InboundHandler
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

    async def aclose(self) -> None:
        pass


def build_whatsapp_module(
    settings: Settings,
    *,
    handler_factory: HandlerFactory | None = None,
    store: ChannelMessageStore | None = None,
) -> WhatsAppModule:
    store = store or InMemoryChannelMessageStore()
    registry = GatewayRegistry()
    handler = (handler_factory or EchoInboundHandler)(registry)
    return WhatsAppModule(
        settings=settings,
        store=store,
        registry=registry,
        dispatcher=InboundDispatcher(handler, store),
    )
