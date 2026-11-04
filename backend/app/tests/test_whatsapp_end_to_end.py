"""Caminho real completo, sem internet: payload da Cloud API assinado → webhook →
EchoInboundHandler → GatewayRegistry → WhatsAppCloudGateway → Graph API falsa."""

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.channel import Channel, DeliveryStatus
from app.services.whatsapp.container import build_whatsapp_module
from app.services.whatsapp.stubs import UNSUPPORTED_MESSAGE_REPLY

from .whatsapp_helpers import FakeMeta, cloud_settings, load_fixture, signed_request

URL = "/api/webhooks/whatsapp"


@pytest.fixture
def meta():
    return FakeMeta()


@pytest.fixture
def module(meta):
    return build_whatsapp_module(
        cloud_settings(), http_client=meta.client(), cloud_gateway_options={"sleep": _no_sleep}
    )


async def _no_sleep(_: float) -> None:
    return None


@pytest.fixture
def client(module):
    with TestClient(create_app(module.settings, whatsapp_module=module)) as client:
        yield client


def test_signed_text_message_gets_echo_reply_through_cloud_api(client, meta):
    body, headers = signed_request(load_fixture("text_message", fresh=True))

    assert client.post(URL, content=body, headers=headers).status_code == 200

    assert meta.bodies() == [
        {
            "messaging_product": "whatsapp",
            "to": "558399990001",
            "type": "text",
            "text": {"body": "Recebido: Olá, quero marcar uma consulta"},
        }
    ]


def test_non_text_message_gets_friendly_reply(client, meta):
    body, headers = signed_request(load_fixture("audio_message", fresh=True))

    client.post(URL, content=body, headers=headers)

    assert meta.bodies()[0]["text"]["body"] == UNSUPPORTED_MESSAGE_REPLY


async def test_reply_status_arrives_later_and_is_matched(client, module, meta):
    body, headers = signed_request(load_fixture("text_message", fresh=True))
    client.post(URL, content=body, headers=headers)

    status_payload = load_fixture("status_delivered")
    status_payload["entry"][0]["changes"][0]["value"]["statuses"][0]["id"] = "wamid.SENT0001"
    body, headers = signed_request(status_payload)
    client.post(URL, content=body, headers=headers)

    assert await module.store.get_delivery_status(Channel.WHATSAPP, "wamid.SENT0001") is DeliveryStatus.DELIVERED


def test_old_message_redelivered_after_24h_gets_no_reply(client, meta):
    # Fixture com timestamp de 2025: a janela já fechou
    body, headers = signed_request(load_fixture("text_message"))

    client.post(URL, content=body, headers=headers)

    assert meta.requests == []
