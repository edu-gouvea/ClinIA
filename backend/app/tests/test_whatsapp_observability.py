import json
import logging

from app.schemas.channel import Channel
from app.services.whatsapp.observability import log_event, mask_phone


def test_mask_phone_keeps_only_prefix_and_suffix():
    assert mask_phone("5583999991234") == "5583*****1234"
    assert mask_phone("558399990001") == "5583****0001"


def test_mask_phone_fully_masks_short_numbers():
    assert mask_phone("12345") == "*****"
    assert mask_phone(None) is None


def test_log_event_is_json_and_masks_phone(caplog):
    with caplog.at_level(logging.INFO, logger="clinia.whatsapp"):
        log_event("message_dispatched", channel=Channel.WHATSAPP, phone="5583999991234", external_id="wamid.X")

    record = json.loads(caplog.records[-1].getMessage())
    assert record == {
        "event": "message_dispatched",
        "channel": "whatsapp",
        "phone": "5583*****1234",
        "external_id": "wamid.X",
    }
