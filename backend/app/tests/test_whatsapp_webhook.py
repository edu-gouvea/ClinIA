import logging

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas.channel import Channel, DeliveryStatus
from app.services.whatsapp.container import build_whatsapp_module

from .whatsapp_helpers import (
    VERIFY_TOKEN,
    RecordingHandler,
    cloud_settings,
    load_fixture,
    signed_request,
)

URL = "/api/webhooks/whatsapp"


@pytest.fixture
def handler():
    return RecordingHandler()


@pytest.fixture
def module(handler):
    return build_whatsapp_module(cloud_settings(), handler_factory=lambda _registry: handler)


@pytest.fixture
def client(module):
    with TestClient(create_app(module.settings, whatsapp_module=module)) as client:
        yield client


# --- Handshake ---------------------------------------------------------------


def test_handshake_with_correct_token_returns_challenge_as_plain_text(client):
    response = client.get(
        URL, params={"hub.mode": "subscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1158201444"}
    )

    assert response.status_code == 200
    assert response.text == "1158201444"
    assert response.headers["content-type"].startswith("text/plain")


@pytest.mark.parametrize(
    "params",
    [
        {"hub.mode": "subscribe", "hub.verify_token": "errado", "hub.challenge": "1"},
        {"hub.mode": "unsubscribe", "hub.verify_token": VERIFY_TOKEN, "hub.challenge": "1"},
        {"hub.mode": "subscribe", "hub.challenge": "1"},
        {},
    ],
    ids=["token-errado", "modo-diferente", "sem-token", "sem-parametros"],
)
def test_handshake_rejects_wrong_token_or_mode(client, params):
    assert client.get(URL, params=params).status_code == 403


def test_handshake_rejects_when_verify_token_is_not_configured():
    from app.core.config import Settings

    app = create_app(Settings(_env_file=None))
    response = TestClient(app).get(URL, params={"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1"})
    assert response.status_code == 403


# --- POST --------------------------------------------------------------------


def test_valid_signature_delivers_inbound_message(client, handler):
    body, headers = signed_request(load_fixture("text_message"))

    response = client.post(URL, content=body, headers=headers)

    assert response.status_code == 200
    assert [m.external_id for m in handler.received] == ["wamid.TEXT0001"]
    assert handler.received[0].channel is Channel.WHATSAPP


def test_invalid_signature_returns_401_and_handler_is_not_called(client, handler, caplog):
    body, headers = signed_request(load_fixture("text_message"), secret="segredo-errado")

    with caplog.at_level(logging.WARNING, logger="clinia.whatsapp"):
        response = client.post(URL, content=body, headers=headers)

    assert response.status_code == 401
    assert handler.received == []
    assert '"event": "signature_invalid"' in caplog.text
    assert "consulta" not in caplog.text  # corpo não é logado


def test_missing_signature_returns_401(client, handler):
    body, _ = signed_request(load_fixture("text_message"))

    assert client.post(URL, content=body).status_code == 401
    assert handler.received == []


def test_same_wamid_delivered_twice_is_processed_once(client, handler, caplog):
    body, headers = signed_request(load_fixture("text_message"))

    with caplog.at_level(logging.INFO, logger="clinia.whatsapp"):
        first = client.post(URL, content=body, headers=headers)
        second = client.post(URL, content=body, headers=headers)

    assert first.status_code == second.status_code == 200
    assert len(handler.received) == 1
    assert '"event": "duplicate_ignored"' in caplog.text


def test_payload_with_several_entries_delivers_every_message(client, handler):
    body, headers = signed_request(load_fixture("multi_entry_messages"))

    client.post(URL, content=body, headers=headers)

    assert len(handler.received) == 3


async def test_delivery_status_updates_known_outbound_message(client, module, handler):
    await module.store.register_outbound(Channel.WHATSAPP, "wamid.OUT0001")
    body, headers = signed_request(load_fixture("status_delivered"))

    response = client.post(URL, content=body, headers=headers)

    assert response.status_code == 200
    assert handler.received == []
    assert await module.store.get_delivery_status(Channel.WHATSAPP, "wamid.OUT0001") is DeliveryStatus.DELIVERED


async def test_failed_status_logs_error_code(client, module, caplog):
    await module.store.register_outbound(Channel.WHATSAPP, "wamid.OUT0002")
    body, headers = signed_request(load_fixture("status_failed"))

    with caplog.at_level(logging.INFO, logger="clinia.whatsapp"):
        client.post(URL, content=body, headers=headers)

    assert await module.store.get_delivery_status(Channel.WHATSAPP, "wamid.OUT0002") is DeliveryStatus.FAILED
    assert '"error_code": 131047' in caplog.text
    assert "24 hours" not in caplog.text  # detalhes do erro não são logados


def test_malformed_json_with_valid_signature_returns_400(client, handler):
    from app.services.whatsapp.signature import sign_body

    from .whatsapp_helpers import APP_SECRET

    body = b"{nao e json"
    response = client.post(URL, content=body, headers={"X-Hub-Signature-256": sign_body(body, APP_SECRET)})

    assert response.status_code == 400
    assert handler.received == []


def test_logs_never_contain_message_text_or_full_phone(client, caplog):
    body, headers = signed_request(load_fixture("multi_entry_messages"))

    with caplog.at_level(logging.DEBUG, logger="clinia.whatsapp"):
        client.post(URL, content=body, headers=headers)

    assert caplog.records
    for secret_value in ("horário", "cancelar", "558399990001", "5583999990003", "Maria Teste"):
        assert secret_value not in caplog.text
