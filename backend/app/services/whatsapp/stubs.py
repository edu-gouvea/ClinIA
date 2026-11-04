"""Stubs para testar o módulo de ponta a ponta sem as outras frentes.

``EchoInboundHandler`` ocupa o lugar do ``ConversationService`` e
``InMemoryConversationDirectory`` o do ``ConversationLookup`` até eles existirem.
"""

from app.schemas.channel import Channel, InboundMessage, OutboundMessage
from app.services.whatsapp.outbound import ConversationContact, ConversationId
from app.services.whatsapp.registry import GatewayRegistry

# Resposta sugerida para mensagens não textuais (o ConversationService pode reutilizar)
UNSUPPORTED_MESSAGE_REPLY = "No momento só consigo entender mensagens de texto."


class InMemoryConversationDirectory:
    """Uma "conversa" por (canal, telefone), com id ``"<canal>:<telefone>"``."""

    def __init__(self) -> None:
        self._contacts: dict[str, ConversationContact] = {}

    def ensure(self, channel: Channel, phone: str) -> str:
        conversation_id = f"{channel.value}:{phone}"
        self._contacts.setdefault(conversation_id, ConversationContact(channel=channel, phone=phone))
        return conversation_id

    async def get_contact(self, conversation_id: ConversationId) -> ConversationContact | None:
        return self._contacts.get(str(conversation_id))


class EchoInboundHandler:
    def __init__(self, registry: GatewayRegistry, directory: InMemoryConversationDirectory | None = None) -> None:
        self._registry = registry
        self._directory = directory

    async def handle_incoming(self, msg: InboundMessage) -> None:
        if self._directory is not None:
            self._directory.ensure(msg.channel, msg.from_phone)
        text = f"Recebido: {msg.text}" if msg.type == "text" else UNSUPPORTED_MESSAGE_REPLY
        await self._registry.send(
            OutboundMessage(channel=msg.channel, to_phone=msg.from_phone, text=text, sender="ai")
        )
