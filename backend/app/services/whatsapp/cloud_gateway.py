"""Envio de mensagens de texto pela WhatsApp Cloud API.

``POST {BASE_URL}/{GRAPH_VERSION}/{PHONE_NUMBER_ID}/messages``. Faz retry com
backoff exponencial só para erro de rede, 5xx e 429; demais 4xx falham na hora.
Texto livre só pode ser enviado até 24h após a última mensagem do paciente:
fora da janela não enviamos (templates ficam como trabalho futuro).
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from app.core.config import Settings
from app.schemas.channel import Channel, OutboundMessage, SendResult
from app.services.whatsapp.observability import log_event
from app.services.whatsapp.store import ChannelMessageStore

MAX_TEXT_LENGTH = 4096
CUSTOMER_SERVICE_WINDOW = timedelta(hours=24)

# Do mais forte para o mais fraco: parágrafo, linha, frase, palavra
_BREAKPOINTS = ("\n\n", "\n", ". ", "! ", "? ", "; ", " ")


def split_text(text: str, limit: int = MAX_TEXT_LENGTH) -> list[str]:
    """Divide em partes de até ``limit`` caracteres, preferindo fim de parágrafo ou frase."""
    parts: list[str] = []
    remaining = text.strip()
    while len(remaining) > limit:
        cut = _best_cut(remaining[:limit])
        part = remaining[:cut].rstrip()
        if part:
            parts.append(part)
        remaining = remaining[cut:].lstrip()
    if remaining:
        parts.append(remaining)
    return parts


def _best_cut(window: str) -> int:
    # Só aceita um ponto de quebra na segunda metade, para não gerar partes minúsculas
    for separator in _BREAKPOINTS:
        index = window.rfind(separator)
        if index >= len(window) // 2:
            return index + len(separator)
    return len(window)


class WhatsAppCloudGateway:
    channel = Channel.WHATSAPP

    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        store: ChannelMessageStore,
        access_token: str,
        phone_number_id: str,
        graph_version: str,
        base_url: str,
        max_attempts: int = 3,
        backoff_seconds: float = 0.5,
        sleep: Callable[[float], Awaitable[Any]] = asyncio.sleep,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._client = client
        self._store = store
        self._access_token = access_token
        self._url = f"{base_url.rstrip('/')}/{graph_version}/{phone_number_id}/messages"
        self._max_attempts = max(1, max_attempts)
        self._backoff_seconds = backoff_seconds
        self._sleep = sleep
        self._clock = clock

    @classmethod
    def from_settings(
        cls, settings: Settings, *, client: httpx.AsyncClient, store: ChannelMessageStore, **kwargs: Any
    ) -> "WhatsAppCloudGateway":
        return cls(
            client=client,
            store=store,
            access_token=settings.whatsapp_access_token.get_secret_value(),
            phone_number_id=settings.whatsapp_phone_number_id,
            graph_version=settings.whatsapp_graph_version,
            base_url=settings.whatsapp_api_base_url,
            max_attempts=settings.whatsapp_send_max_attempts,
            **kwargs,
        )

    @property
    def url(self) -> str:
        return self._url

    async def send_text(self, msg: OutboundMessage) -> SendResult:
        parts = split_text(msg.text)
        if not parts:
            return SendResult(ok=False, reason="empty_text")

        if not await self._window_open(msg.to_phone):
            log_event("window_closed", logging.WARNING, channel=self.channel, phone=msg.to_phone)
            return SendResult(ok=False, reason="window_closed")

        external_ids: list[str] = []
        for part in parts:
            result = await self._post_with_retry(msg.to_phone, part)
            if not result.ok:
                # Partes já enviadas continuam em external_ids para casar com os statuses
                return result.model_copy(update={"external_ids": external_ids})
            external_ids.extend(result.external_ids)
        return SendResult(ok=True, external_ids=external_ids)

    async def _window_open(self, phone: str) -> bool:
        last_inbound = await self._store.last_inbound_at(self.channel, phone)
        return last_inbound is not None and self._clock() - last_inbound < CUSTOMER_SERVICE_WINDOW

    async def _post_with_retry(self, to_phone: str, text: str) -> SendResult:
        body = {
            "messaging_product": "whatsapp",
            "to": to_phone,
            "type": "text",
            "text": {"body": text},
        }
        headers = {"Authorization": f"Bearer {self._access_token}"}

        result = SendResult(ok=False, reason="not_attempted")
        for attempt in range(1, self._max_attempts + 1):
            try:
                response = await self._client.post(self._url, json=body, headers=headers)
            except httpx.TransportError as exc:
                result = SendResult(ok=False, reason="network_error")
                retry_reason = type(exc).__name__
            else:
                if response.is_success:
                    return await self._on_success(response)
                result = SendResult(ok=False, reason="http_error", error_code=_meta_error_code(response))
                if response.status_code != 429 and response.status_code < 500:
                    log_event(
                        "send_rejected",
                        logging.WARNING,
                        channel=self.channel,
                        status=response.status_code,
                        error_code=result.error_code,
                    )
                    return result
                retry_reason = str(response.status_code)

            if attempt < self._max_attempts:
                log_event(
                    "send_retry", logging.WARNING, channel=self.channel, attempt=attempt, reason=retry_reason
                )
                await self._sleep(self._backoff_seconds * 2 ** (attempt - 1))
        return result

    async def _on_success(self, response: httpx.Response) -> SendResult:
        try:
            ids = [m["id"] for m in response.json().get("messages", []) if isinstance(m.get("id"), str)]
        except (ValueError, AttributeError, TypeError):
            ids = []
        for external_id in ids:
            await self._store.register_outbound(self.channel, external_id)
        return SendResult(ok=True, external_ids=ids)


def _meta_error_code(response: httpx.Response) -> int | None:
    """``{"error": {"code": 131047, ...}}`` → ``131047``. Só o código é logado."""
    try:
        code = response.json().get("error", {}).get("code")
    except (ValueError, AttributeError):
        return None
    return code if isinstance(code, int) else None
