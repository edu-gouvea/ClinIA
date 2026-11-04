import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.schemas.channel import Channel, InboundMessage
from app.services.whatsapp.container import build_whatsapp_module

from .whatsapp_helpers import RecordingHandler, cloud_settings, load_fixture, signed_request

URL = "/api/simulator/messages"
PHONE = "5583999990001"


@pytest.fixture
def client():
    with TestClient(create_app(Settings(_env_file=None))) as client:
        yield client


def test_simulated_message_goes_through_echo_handler_and_reply_is_polled(client):
    sent = client.post(URL, json={"phone": PHONE, "name": "Maria Teste", "text": "Quero marcar uma consulta"})

    assert sent.status_code == 201
    assert sent.json()["external_id"]

    polled = client.get(URL, params={"phone": PHONE})
    assert polled.status_code == 200
    [reply] = polled.json()["messages"]
    assert reply["text"] == "Recebido: Quero marcar uma consulta"
    assert reply["sender"] == "ai"
    assert reply["phone"] == PHONE


def test_polling_with_after_returns_only_new_replies(client):
    client.post(URL, json={"phone": PHONE, "text": "primeira"})
    first_id = client.get(URL, params={"phone": PHONE}).json()["messages"][-1]["id"]
    client.post(URL, json={"phone": PHONE, "text": "segunda"})

    new = client.get(URL, params={"phone": PHONE, "after": first_id}).json()["messages"]

    assert [m["text"] for m in new] == ["Recebido: segunda"]


def test_replies_are_isolated_per_phone(client):
    client.post(URL, json={"phone": PHONE, "text": "oi"})

    assert client.get(URL, params={"phone": "5583999990009"}).json() == {"messages": []}


@pytest.mark.parametrize(
    "body",
    [{"phone": "abc", "text": "oi"}, {"phone": PHONE, "text": ""}, {"phone": PHONE}],
    ids=["telefone-invalido", "texto-vazio", "sem-texto"],
)
def test_invalid_input_is_rejected(client, body):
    assert client.post(URL, json=body).status_code == 422


def test_simulator_routes_are_disabled_in_cloud_mode():
    client = TestClient(create_app(cloud_settings()))

    assert client.post(URL, json={"phone": PHONE, "text": "oi"}).status_code == 404
    assert client.get(URL, params={"phone": PHONE}).status_code == 404


def test_webhook_and_simulator_deliver_the_same_contract_to_the_same_handler():
    handler = RecordingHandler()
    module = build_whatsapp_module(
        cloud_settings(simulator_enabled=True), handler_factory=lambda _registry: handler
    )
    client = TestClient(create_app(module.settings, whatsapp_module=module))

    body, headers = signed_request(load_fixture("text_message"))
    client.post("/api/webhooks/whatsapp", content=body, headers=headers)
    client.post(URL, json={"phone": PHONE, "name": "Maria Teste", "text": "Olá, quero marcar uma consulta"})

    webhook_msg, simulator_msg = handler.received
    assert all(isinstance(m, InboundMessage) for m in handler.received)
    assert (webhook_msg.channel, simulator_msg.channel) == (Channel.WHATSAPP, Channel.SIMULATOR)
    assert webhook_msg.text == simulator_msg.text
    assert webhook_msg.type == simulator_msg.type == "text"
