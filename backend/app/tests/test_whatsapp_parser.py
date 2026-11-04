from datetime import UTC, datetime

from app.schemas.channel import Channel, DeliveryStatus
from app.services.whatsapp.parser import parse_webhook

from .whatsapp_helpers import load_fixture


def test_text_message_extracts_phone_name_wamid_and_text():
    parsed = parse_webhook(load_fixture("text_message"))

    assert len(parsed.messages) == 1
    msg = parsed.messages[0]
    assert msg.channel is Channel.WHATSAPP
    assert msg.external_id == "wamid.TEXT0001"
    assert msg.from_phone == "558399990001"
    assert msg.contact_name == "Maria Teste"
    assert msg.type == "text"
    assert msg.text == "Olá, quero marcar uma consulta"
    assert msg.received_at == datetime.fromtimestamp(1762250400, tz=UTC)
    assert parsed.statuses == []


def test_wa_id_is_kept_exactly_as_received():
    # Número sem o nono dígito: não pode ser "corrigido"
    msg = parse_webhook(load_fixture("text_message")).messages[0]
    assert msg.from_phone == "558399990001"


def test_image_becomes_unsupported_without_text():
    msg = parse_webhook(load_fixture("image_message")).messages[0]

    assert msg.type == "unsupported"
    assert msg.text is None
    assert msg.external_id == "wamid.IMAGE0001"


def test_audio_becomes_unsupported():
    msg = parse_webhook(load_fixture("audio_message")).messages[0]

    assert msg.type == "unsupported"
    assert msg.text is None


def test_multiple_entries_and_messages_generate_multiple_inbound_messages():
    parsed = parse_webhook(load_fixture("multi_entry_messages"))

    assert [m.external_id for m in parsed.messages] == [
        "wamid.MULTI0001",
        "wamid.MULTI0002",
        "wamid.MULTI0003",
    ]
    assert [m.type for m in parsed.messages] == ["text", "unsupported", "text"]
    assert [m.contact_name for m in parsed.messages] == ["Maria Teste", "João Teste", "Ana Teste"]


def test_statuses_only_payload_generates_no_inbound_message():
    parsed = parse_webhook(load_fixture("status_delivered"))

    assert parsed.messages == []
    assert len(parsed.statuses) == 1
    status = parsed.statuses[0]
    assert status.external_id == "wamid.OUT0001"
    assert status.status is DeliveryStatus.DELIVERED
    assert status.error_code is None


def test_failed_status_carries_meta_error_code():
    status = parse_webhook(load_fixture("status_failed")).statuses[0]

    assert status.status is DeliveryStatus.FAILED
    assert status.error_code == 131047


def test_other_objects_are_ignored():
    payload = load_fixture("text_message") | {"object": "page"}
    assert parse_webhook(payload).messages == []


def test_malformed_items_are_skipped():
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            "lixo",
            {"changes": [{"value": None}, {"value": {"messages": [{"type": "text"}, 42], "contacts": "x"}}]},
            {"changes": [{"value": {"messages": [{"id": "wamid.OK", "from": "5583", "type": "text", "text": "x"}]}}]},
            {"changes": [{"value": {"statuses": [{"id": "wamid.S", "status": ["sent"]}, {"id": "wamid.S2", "status": "deleted"}]}}]},
        ],
    }

    parsed = parse_webhook(payload)

    assert [m.external_id for m in parsed.messages] == ["wamid.OK"]
    assert parsed.messages[0].type == "unsupported"
    assert parsed.statuses == []


def test_non_dict_payload_is_ignored():
    assert parse_webhook([1, 2, 3]).messages == []
