import asyncio
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas.channel import Channel, InboundMessage
from app.services.whatsapp.container import build_whatsapp_module
from app.services.whatsapp.outbound import ConversationContact, ConversationNotFoundError

from .whatsapp_helpers import FakeMeta, cloud_settings


class FakeLookup:
    """Como a frente de Conversas implementará: id da conversa → canal + telefone."""

    def __init__(self, contacts: dict[int, ConversationContact]) -> None:
        self._contacts = contacts

    async def get_contact(self, conversation_id):
        return self._contacts.get(conversation_id)


async def test_attendant_reply_reaches_patient_through_the_conversation_channel():
    lookup = FakeLookup({42: ConversationContact(channel=Channel.SIMULATOR, phone="5583999990001")})
    module = build_whatsapp_module(Settings(_env_file=None), conversation_lookup=lookup)

    result = await module.messenger.send_to_patient(42, "Olá, sou a atendente Ana.")

    assert result.ok
    [reply] = module.simulator.list_replies("5583999990001")
    assert reply.text == "Olá, sou a atendente Ana."
    assert reply.sender == "attendant"


async def test_unknown_conversation_raises():
    module = build_whatsapp_module(Settings(_env_file=None), conversation_lookup=FakeLookup({}))

    with pytest.raises(ConversationNotFoundError):
        await module.messenger.send_to_patient(999, "oi")


async def test_attendant_reply_over_cloud_api_respects_24h_window():
    meta = FakeMeta()
    phone = "558399990001"
    lookup = FakeLookup({1: ConversationContact(channel=Channel.WHATSAPP, phone=phone)})
    module = build_whatsapp_module(cloud_settings(), conversation_lookup=lookup, http_client=meta.client())

    closed = await module.messenger.send_to_patient(1, "Retornando seu contato")
    assert closed.reason == "window_closed"
    assert meta.requests == []

    await module.store.claim_inbound(
        InboundMessage(
            channel=Channel.WHATSAPP,
            external_id="wamid.IN",
            from_phone=phone,
            contact_name=None,
            type="text",
            text="oi",
            received_at=datetime.now(UTC),
        )
    )
    opened = await module.messenger.send_to_patient(1, "Retornando seu contato")
    assert opened.ok
    assert meta.bodies()[0]["to"] == phone


def test_simulator_conversation_can_be_taken_over_by_attendant():
    # Com os stubs: paciente fala pelo simulador, atendente responde pela conversa criada
    app = create_app(Settings(_env_file=None))
    module = app.state.whatsapp
    client = TestClient(app)
    client.post("/api/simulator/messages", json={"phone": "5583999990001", "text": "Quero falar com alguém"})

    result = asyncio.run(module.messenger.send_to_patient("simulator:5583999990001", "Oi! Sou o Carlos."))

    assert result.ok
    texts = [m["text"] for m in client.get("/api/simulator/messages", params={"phone": "5583999990001"}).json()["messages"]]
    assert texts == ["Recebido: Quero falar com alguém", "Oi! Sou o Carlos."]
