"""Parser do payload de webhook da WhatsApp Cloud API (funções puras).

Formato: ``object == "whatsapp_business_account"`` → ``entry[]`` → ``changes[]``
→ ``value`` com ``messages[]``, ``contacts[]`` e/ou ``statuses[]``. Um mesmo POST
pode trazer várias entradas e várias mensagens. Itens malformados são ignorados.
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from app.schemas.channel import Channel, DeliveryStatus, DeliveryStatusUpdate, InboundMessage

WHATSAPP_OBJECT = "whatsapp_business_account"

# "pending" é estado interno nosso; a Meta só envia estes
_META_STATUSES = {
    "sent": DeliveryStatus.SENT,
    "delivered": DeliveryStatus.DELIVERED,
    "read": DeliveryStatus.READ,
    "failed": DeliveryStatus.FAILED,
}


@dataclass(frozen=True)
class ParsedWebhook:
    messages: list[InboundMessage] = field(default_factory=list)
    statuses: list[DeliveryStatusUpdate] = field(default_factory=list)


def parse_webhook(payload: Any) -> ParsedWebhook:
    if not isinstance(payload, dict) or payload.get("object") != WHATSAPP_OBJECT:
        return ParsedWebhook()

    messages: list[InboundMessage] = []
    statuses: list[DeliveryStatusUpdate] = []
    for value in _change_values(payload):
        names = contact_names(value.get("contacts"))
        for raw in _dicts(value.get("messages")):
            message = parse_message(raw, names)
            if message is not None:
                messages.append(message)
        for raw in _dicts(value.get("statuses")):
            status = parse_status(raw)
            if status is not None:
                statuses.append(status)
    return ParsedWebhook(messages=messages, statuses=statuses)


def parse_message(raw: dict[str, Any], names: dict[str, str] | None = None) -> InboundMessage | None:
    external_id = raw.get("id")
    from_phone = raw.get("from")
    if not isinstance(external_id, str) or not isinstance(from_phone, str):
        return None

    text = raw.get("text")
    body = text.get("body") if raw.get("type") == "text" and isinstance(text, dict) else None
    is_text = isinstance(body, str) and body != ""
    # wa_id é guardado exatamente como a Meta envia (sem "corrigir" o nono dígito)
    return InboundMessage(
        channel=Channel.WHATSAPP,
        external_id=external_id,
        from_phone=from_phone,
        contact_name=(names or {}).get(from_phone),
        type="text" if is_text else "unsupported",
        text=body if is_text else None,
        received_at=parse_timestamp(raw.get("timestamp")),
    )


def parse_status(raw: dict[str, Any]) -> DeliveryStatusUpdate | None:
    external_id = raw.get("id")
    raw_status = raw.get("status")
    status = _META_STATUSES.get(raw_status) if isinstance(raw_status, str) else None
    if not isinstance(external_id, str) or status is None:
        return None

    error_code = None
    errors = list(_dicts(raw.get("errors")))
    if errors and isinstance(errors[0].get("code"), int):
        error_code = errors[0]["code"]
    recipient = raw.get("recipient_id")
    return DeliveryStatusUpdate(
        channel=Channel.WHATSAPP,
        external_id=external_id,
        status=status,
        recipient_phone=recipient if isinstance(recipient, str) else None,
        timestamp=parse_timestamp(raw.get("timestamp")),
        error_code=error_code,
    )


def contact_names(contacts: Any) -> dict[str, str]:
    """``contacts[]`` → ``{wa_id: profile.name}``."""
    names: dict[str, str] = {}
    for contact in _dicts(contacts):
        wa_id = contact.get("wa_id")
        profile = contact.get("profile")
        name = profile.get("name") if isinstance(profile, dict) else None
        if isinstance(wa_id, str) and isinstance(name, str):
            names[wa_id] = name
    return names


def parse_timestamp(value: Any) -> datetime:
    """Timestamp Unix (string, em segundos) da Meta → ``datetime`` UTC. Inválido → agora."""
    try:
        return datetime.fromtimestamp(int(value), tz=UTC)
    except (TypeError, ValueError, OverflowError, OSError):
        return datetime.now(UTC)


def _change_values(payload: dict[str, Any]):
    for entry in _dicts(payload.get("entry")):
        for change in _dicts(entry.get("changes")):
            value = change.get("value")
            if isinstance(value, dict):
                yield value


def _dicts(items: Any):
    if isinstance(items, list):
        yield from (item for item in items if isinstance(item, dict))
