import logging

from app.services.whatsapp.dispatcher import InboundDispatcher
from app.services.whatsapp.parser import parse_webhook
from app.services.whatsapp.store import InMemoryChannelMessageStore

from .whatsapp_helpers import RecordingHandler, load_fixture


class FailingFirstHandler(RecordingHandler):
    async def handle_incoming(self, msg):
        if not self.received:
            self.received.append(msg)
            raise RuntimeError(f"erro contendo texto do paciente: {msg.text}")
        self.received.append(msg)


async def test_handler_failure_does_not_stop_other_messages_nor_leak_text(caplog):
    handler = FailingFirstHandler()
    dispatcher = InboundDispatcher(handler, InMemoryChannelMessageStore())

    with caplog.at_level(logging.INFO, logger="clinia.whatsapp"):
        await dispatcher.process_webhook(parse_webhook(load_fixture("multi_entry_messages")))

    assert len(handler.received) == 3
    assert '"event": "handler_failed"' in caplog.text
    assert '"error": "RuntimeError"' in caplog.text
    assert "horário" not in caplog.text
