"""Stubs para testar o módulo de ponta a ponta sem as outras frentes.

``EchoInboundHandler`` ocupa o lugar do ``ConversationService`` até ele existir.
"""

from app.schemas.channel import InboundMessage, OutboundMessage
from app.services.whatsapp.registry import GatewayRegistry

# Resposta sugerida para mensagens não textuais (o ConversationService pode reutilizar)
UNSUPPORTED_MESSAGE_REPLY = "No momento só consigo entender mensagens de texto."


class EchoInboundHandler:
    def __init__(self, registry: GatewayRegistry) -> None:
        self._registry = registry

    async def handle_incoming(self, msg: InboundMessage) -> None:
        text = f"Recebido: {msg.text}" if msg.type == "text" else UNSUPPORTED_MESSAGE_REPLY
        await self._registry.send(
            OutboundMessage(channel=msg.channel, to_phone=msg.from_phone, text=text, sender="ai")
        )
