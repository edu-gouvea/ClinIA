import logging
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.schemas.channel import Channel, DeliveryStatus, InboundMessage, OutboundMessage
from app.services.whatsapp.cloud_gateway import MAX_TEXT_LENGTH, WhatsAppCloudGateway, split_text
from app.services.whatsapp.store import InMemoryChannelMessageStore

from .whatsapp_helpers import ACCESS_TOKEN, FakeMeta, cloud_settings, meta_error

PHONE = "558399990001"
NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


class SleepRecorder:
    def __init__(self) -> None:
        self.delays: list[float] = []

    async def __call__(self, delay: float) -> None:
        self.delays.append(delay)


async def open_window(store, at: datetime = NOW - timedelta(minutes=5)) -> None:
    await store.claim_inbound(
        InboundMessage(
            channel=Channel.WHATSAPP,
            external_id=f"wamid.IN-{at.timestamp()}",
            from_phone=PHONE,
            contact_name=None,
            type="text",
            text="oi",
            received_at=at,
        )
    )


@pytest.fixture
def store():
    return InMemoryChannelMessageStore()


@pytest.fixture
def sleep():
    return SleepRecorder()


def make_gateway(meta: FakeMeta, store, sleep, **settings_overrides) -> WhatsAppCloudGateway:
    return WhatsAppCloudGateway.from_settings(
        cloud_settings(**settings_overrides), client=meta.client(), store=store, sleep=sleep, clock=lambda: NOW
    )


def outbound(text: str = "Sua consulta foi confirmada.") -> OutboundMessage:
    return OutboundMessage(channel=Channel.WHATSAPP, to_phone=PHONE, text=text, sender="ai")


# --- Montagem da requisição ---------------------------------------------------


async def test_builds_url_headers_and_body_from_settings(store, sleep):
    meta = FakeMeta()
    gateway = make_gateway(
        meta, store, sleep, whatsapp_graph_version="v99.0", whatsapp_api_base_url="https://graph.exemplo.test/"
    )
    await open_window(store)

    result = await gateway.send_text(outbound())

    assert result.ok
    request = meta.requests[0]
    assert request.method == "POST"
    assert str(request.url) == "https://graph.exemplo.test/v99.0/100000000000001/messages"
    assert request.headers["Authorization"] == f"Bearer {ACCESS_TOKEN}"
    assert meta.bodies()[0] == {
        "messaging_product": "whatsapp",
        "to": PHONE,
        "type": "text",
        "text": {"body": "Sua consulta foi confirmada."},
    }


async def test_returned_wamid_is_kept_for_status_matching(store, sleep):
    gateway = make_gateway(FakeMeta(), store, sleep)
    await open_window(store)

    result = await gateway.send_text(outbound())

    assert result.external_ids == ["wamid.SENT0001"]
    assert await store.get_delivery_status(Channel.WHATSAPP, "wamid.SENT0001") is DeliveryStatus.PENDING


# --- Retry --------------------------------------------------------------------


async def test_5xx_is_retried_with_exponential_backoff_then_succeeds(store, sleep):
    meta = FakeMeta(httpx.Response(500), httpx.Response(503))
    gateway = make_gateway(meta, store, sleep)
    await open_window(store)

    result = await gateway.send_text(outbound())

    assert result.ok
    assert len(meta.requests) == 3
    assert sleep.delays == [0.5, 1.0]


async def test_429_is_retried(store, sleep):
    meta = FakeMeta(httpx.Response(429, json=meta_error(130429)))
    gateway = make_gateway(meta, store, sleep)
    await open_window(store)

    assert (await gateway.send_text(outbound())).ok
    assert len(meta.requests) == 2


async def test_network_error_is_retried(store, sleep):
    meta = FakeMeta(httpx.ConnectError("falha de rede"), httpx.ReadTimeout("timeout"))
    gateway = make_gateway(meta, store, sleep)
    await open_window(store)

    assert (await gateway.send_text(outbound())).ok
    assert len(meta.requests) == 3


async def test_4xx_is_not_retried_and_meta_error_code_is_logged(store, sleep, caplog):
    meta = FakeMeta(httpx.Response(400, json=meta_error(131026, "Message undeliverable para 558399990001")))
    gateway = make_gateway(meta, store, sleep)
    await open_window(store)

    with caplog.at_level(logging.INFO, logger="clinia.whatsapp"):
        result = await gateway.send_text(outbound())

    assert not result.ok
    assert result.reason == "http_error"
    assert result.error_code == 131026
    assert len(meta.requests) == 1
    assert sleep.delays == []
    assert '"error_code": 131026' in caplog.text
    assert PHONE not in caplog.text


async def test_gives_up_after_max_attempts(store, sleep):
    meta = FakeMeta(*[httpx.Response(502)] * 5)
    gateway = make_gateway(meta, store, sleep, whatsapp_send_max_attempts=3)
    await open_window(store)

    result = await gateway.send_text(outbound())

    assert not result.ok
    assert result.reason == "http_error"
    assert len(meta.requests) == 3
    assert sleep.delays == [0.5, 1.0]


# --- Textos longos ------------------------------------------------------------


async def test_text_longer_than_4096_is_split_into_several_messages(store, sleep):
    meta = FakeMeta()
    gateway = make_gateway(meta, store, sleep)
    await open_window(store)
    text = ("Frase de orientação ao paciente. " * 150).strip()  # ~4950 caracteres

    result = await gateway.send_text(outbound(text))

    bodies = [b["text"]["body"] for b in meta.bodies()]
    assert result.ok
    assert len(bodies) == 2
    assert result.external_ids == ["wamid.SENT0001", "wamid.SENT0002"]
    assert all(len(b) <= MAX_TEXT_LENGTH for b in bodies)
    assert bodies[0].endswith(".")  # quebrou em fim de frase
    assert " ".join(bodies) == text


def test_split_prefers_paragraph_breaks():
    first = "a" * 3000
    second = "b" * 3000
    assert split_text(f"{first}\n\n{second}") == [first, second]


def test_split_without_breakpoints_cuts_at_limit():
    parts = split_text("x" * 10_000)
    assert [len(p) for p in parts] == [4096, 4096, 1808]


def test_short_text_is_not_split():
    assert split_text("  Olá!  ") == ["Olá!"]


async def test_empty_text_is_not_sent(store, sleep):
    meta = FakeMeta()
    gateway = make_gateway(meta, store, sleep)
    await open_window(store)

    result = await gateway.send_text(outbound("   "))

    assert result.reason == "empty_text"
    assert meta.requests == []


# --- Janela de 24h ------------------------------------------------------------


async def test_closed_window_does_not_send(store, sleep, caplog):
    meta = FakeMeta()
    gateway = make_gateway(meta, store, sleep)
    await open_window(store, at=NOW - timedelta(hours=24, minutes=1))

    with caplog.at_level(logging.WARNING, logger="clinia.whatsapp"):
        result = await gateway.send_text(outbound())

    assert result.ok is False
    assert result.reason == "window_closed"
    assert meta.requests == []
    assert '"event": "window_closed"' in caplog.text


async def test_patient_who_never_wrote_has_closed_window(store, sleep):
    meta = FakeMeta()
    result = await make_gateway(meta, store, sleep).send_text(outbound())

    assert result.reason == "window_closed"
    assert meta.requests == []
