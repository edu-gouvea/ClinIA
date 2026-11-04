"""Validação da assinatura ``X-Hub-Signature-256`` dos webhooks da Meta."""

import hashlib
import hmac

SIGNATURE_PREFIX = "sha256="


def sign_body(raw_body: bytes, app_secret: str) -> str:
    """Gera o header ``sha256=<hex>`` para um corpo (usado em testes e no script de demo)."""
    digest = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return f"{SIGNATURE_PREFIX}{digest}"


def verify_signature(raw_body: bytes, header: str | None, app_secret: str) -> bool:
    """Confere o HMAC-SHA256 do corpo **bruto** (antes do parse do JSON).

    Header ausente, malformado ou segredo vazio retornam ``False``.
    """
    if not app_secret or not header or not header.startswith(SIGNATURE_PREFIX):
        return False
    received = header[len(SIGNATURE_PREFIX) :].strip().lower()
    if not received:
        return False
    expected = sign_body(raw_body, app_secret)[len(SIGNATURE_PREFIX) :]
    # Compara bytes: header pode trazer caracteres não ASCII
    return hmac.compare_digest(expected.encode(), received.encode("utf-8", errors="replace"))
