"""Webhook da WhatsApp Cloud API.

Sem autenticação de usuário (quem chama é a Meta), mas **todo** POST passa pela
validação de assinatura. O processamento roda em ``BackgroundTasks`` para
responder 200 rapidamente; a Meta reenvia entregas lentas ou com falha.
"""

import hmac
import json
import logging
import time
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from fastapi.responses import PlainTextResponse

from app.api.deps import get_app_settings, get_whatsapp_module
from app.core.config import Settings
from app.schemas.channel import Channel
from app.services.whatsapp.container import WhatsAppModule
from app.services.whatsapp.observability import log_event
from app.services.whatsapp.parser import parse_webhook
from app.services.whatsapp.signature import verify_signature

router = APIRouter(prefix="/api/webhooks/whatsapp", tags=["whatsapp"])

SIGNATURE_HEADER = "X-Hub-Signature-256"


@router.get("", response_class=PlainTextResponse)
async def verify_webhook(
    settings: Annotated[Settings, Depends(get_app_settings)],
    mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    verify_token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
) -> PlainTextResponse:
    """Handshake de verificação: devolve ``hub.challenge`` em texto puro."""
    expected = settings.whatsapp_verify_token.get_secret_value()
    if (
        mode == "subscribe"
        and expected
        and verify_token is not None
        and challenge is not None
        and hmac.compare_digest(verify_token.encode(), expected.encode())
    ):
        log_event("webhook_verified", channel=Channel.WHATSAPP)
        return PlainTextResponse(challenge)

    log_event("webhook_verification_failed", logging.WARNING, channel=Channel.WHATSAPP)
    return PlainTextResponse("Forbidden", status_code=403)


@router.post("")
async def receive_webhook(
    request: Request,
    background: BackgroundTasks,
    module: Annotated[WhatsAppModule, Depends(get_whatsapp_module)],
) -> Response:
    started = time.perf_counter()
    raw_body = await request.body()
    secret = module.settings.whatsapp_app_secret.get_secret_value()
    if not verify_signature(raw_body, request.headers.get(SIGNATURE_HEADER), secret):
        log_event("signature_invalid", logging.WARNING, channel=Channel.WHATSAPP, status=401)
        return Response(status_code=401)

    try:
        payload = json.loads(raw_body)
    except ValueError:
        log_event("webhook_malformed", logging.WARNING, channel=Channel.WHATSAPP, status=400)
        return Response(status_code=400)

    parsed = parse_webhook(payload)
    background.add_task(module.dispatcher.process_webhook, parsed)
    log_event(
        "webhook_received",
        channel=Channel.WHATSAPP,
        status=200,
        messages=len(parsed.messages),
        statuses=len(parsed.statuses),
        duration_ms=round((time.perf_counter() - started) * 1000),
    )
    return Response(status_code=200)
