"""Logs estruturados da integração (RNF08) respeitando a LGPD (RNF02).

Regras: nunca registrar conteúdo de mensagem, corpo de webhook ou tokens.
Telefones passados em ``phone=`` são mascarados automaticamente.
"""

import json
import logging
from typing import Any

logger = logging.getLogger("clinia.whatsapp")


def mask_phone(phone: str | None) -> str | None:
    """``5583999991234`` → ``5583*****1234``. Números curtos são totalmente mascarados."""
    if phone is None:
        return None
    if len(phone) < 9:
        return "*" * len(phone)
    return f"{phone[:4]}{'*' * (len(phone) - 8)}{phone[-4:]}"


def log_event(event: str, level: int = logging.INFO, **fields: Any) -> None:
    """Emite uma linha JSON: ``{"event": ..., "channel": ..., "external_id": ..., ...}``."""
    if "phone" in fields:
        fields["phone"] = mask_phone(fields["phone"])
    record = {"event": event, **{k: _plain(v) for k, v in fields.items() if v is not None}}
    logger.log(level, json.dumps(record, ensure_ascii=False))


def _plain(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)):
        return value
    if hasattr(value, "value"):  # Enums
        return value.value
    return str(value)
