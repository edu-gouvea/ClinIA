from datetime import UTC, datetime, timedelta

from app.schemas.channel import Channel, DeliveryStatus, DeliveryStatusUpdate, InboundMessage
from app.services.whatsapp.store import InMemoryChannelMessageStore

NOW = datetime(2026, 11, 4, 12, 0, tzinfo=UTC)


def inbound(external_id: str, received_at: datetime = NOW, channel: Channel = Channel.WHATSAPP) -> InboundMessage:
    return InboundMessage(
        channel=channel,
        external_id=external_id,
        from_phone="558399990001",
        contact_name=None,
        type="text",
        text="oi",
        received_at=received_at,
    )


def status(external_id: str, value: DeliveryStatus) -> DeliveryStatusUpdate:
    return DeliveryStatusUpdate(
        channel=Channel.WHATSAPP, external_id=external_id, status=value, recipient_phone=None, timestamp=NOW
    )


async def test_claim_inbound_is_idempotent_per_channel():
    store = InMemoryChannelMessageStore()

    assert await store.claim_inbound(inbound("id-1"))
    assert not await store.claim_inbound(inbound("id-1"))
    assert await store.claim_inbound(inbound("id-1", channel=Channel.SIMULATOR))


async def test_last_inbound_keeps_the_most_recent_timestamp():
    store = InMemoryChannelMessageStore()
    await store.claim_inbound(inbound("id-1", NOW))
    await store.claim_inbound(inbound("id-2", NOW - timedelta(hours=1)))  # chegou fora de ordem

    assert await store.last_inbound_at(Channel.WHATSAPP, "558399990001") == NOW


async def test_delivery_status_never_regresses_but_failed_always_applies():
    store = InMemoryChannelMessageStore()
    await store.register_outbound(Channel.WHATSAPP, "out-1")

    await store.update_delivery_status(status("out-1", DeliveryStatus.READ))
    await store.update_delivery_status(status("out-1", DeliveryStatus.DELIVERED))
    assert await store.get_delivery_status(Channel.WHATSAPP, "out-1") is DeliveryStatus.READ

    await store.update_delivery_status(status("out-1", DeliveryStatus.FAILED))
    assert await store.get_delivery_status(Channel.WHATSAPP, "out-1") is DeliveryStatus.FAILED


async def test_unknown_outbound_status_is_reported_as_unmatched():
    store = InMemoryChannelMessageStore()
    assert not await store.update_delivery_status(status("desconhecido", DeliveryStatus.SENT))


async def test_store_is_bounded():
    store = InMemoryChannelMessageStore(max_tracked=2)
    for i in range(3):
        await store.claim_inbound(inbound(f"id-{i}"))

    assert await store.claim_inbound(inbound("id-0"))  # o mais antigo foi descartado
