"""Testes unitários para o EventBus."""

import pytest

from app.core.events import DomainEvent, EventBus


@pytest.mark.asyncio
async def test_publish_calls_subscriber():
    bus = EventBus()
    received: list[DomainEvent] = []

    async def handler(event: DomainEvent) -> None:
        received.append(event)

    bus.subscribe("test.event", handler)
    await bus.publish(DomainEvent("test.event", {"key": "val"}))

    assert len(received) == 1
    assert received[0].payload == {"key": "val"}


@pytest.mark.asyncio
async def test_publish_no_subscribers_is_noop():
    bus = EventBus()
    await bus.publish(DomainEvent("orphan.event"))


@pytest.mark.asyncio
async def test_handler_exception_does_not_propagate():
    bus = EventBus()

    async def bad_handler(event: DomainEvent) -> None:
        raise ValueError("boom")

    bus.subscribe("bad.event", bad_handler)
    await bus.publish(DomainEvent("bad.event"))
