"""Utilitários compartilhados pelos testes do módulo WhatsApp."""

import json
import time
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from app.schemas.channel import InboundMessage
from app.services.whatsapp.signature import sign_body

FIXTURES = Path(__file__).parent / "fixtures" / "whatsapp"

APP_SECRET = "app-secret-de-teste"
VERIFY_TOKEN = "verify-token-de-teste"
ACCESS_TOKEN = "access-token-de-teste"
PHONE_NUMBER_ID = "100000000000001"
GRAPH_VERSION = "v23.0"


def cloud_settings(**overrides: Any) -> Settings:
    values = {
        "whatsapp_mode": "cloud",
        "whatsapp_access_token": ACCESS_TOKEN,
        "whatsapp_phone_number_id": PHONE_NUMBER_ID,
        "whatsapp_app_secret": APP_SECRET,
        "whatsapp_verify_token": VERIFY_TOKEN,
        "whatsapp_graph_version": GRAPH_VERSION,
        **overrides,
    }
    return Settings(_env_file=None, **values)


def load_fixture(name: str, *, fresh: bool = False) -> dict[str, Any]:
    """Carrega ``fixtures/whatsapp/<name>.json``. ``fresh`` troca os timestamps por agora."""
    payload = json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))
    if fresh:
        now = str(int(time.time()))
        for entry in payload["entry"]:
            for change in entry["changes"]:
                for item in change["value"].get("messages", []) + change["value"].get("statuses", []):
                    item["timestamp"] = now
    return payload


def signed_request(payload: dict[str, Any], secret: str = APP_SECRET) -> tuple[bytes, dict[str, str]]:
    body = json.dumps(payload).encode()
    return body, {"X-Hub-Signature-256": sign_body(body, secret), "Content-Type": "application/json"}


class RecordingHandler:
    def __init__(self) -> None:
        self.received: list[InboundMessage] = []

    async def handle_incoming(self, msg: InboundMessage) -> None:
        self.received.append(msg)


class FakeMeta:
    """Servidor falso da Graph API via ``httpx.MockTransport``: nenhuma chamada sai para a internet."""

    def __init__(self, *responses: "httpx.Response | Exception") -> None:
        self._responses = list(responses)
        self.requests: list[httpx.Request] = []
        self._counter = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self._responses:
            response = self._responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        self._counter += 1
        return httpx.Response(200, json=meta_success(f"wamid.SENT{self._counter:04d}"))

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self))

    def bodies(self) -> list[dict[str, Any]]:
        return [json.loads(r.content) for r in self.requests]


def meta_success(wamid: str) -> dict[str, Any]:
    return {
        "messaging_product": "whatsapp",
        "contacts": [{"input": "558399990001", "wa_id": "558399990001"}],
        "messages": [{"id": wamid}],
    }


def meta_error(code: int, message: str = "erro") -> dict[str, Any]:
    return {"error": {"message": message, "type": "OAuthException", "code": code, "fbtrace_id": "TRACE"}}
