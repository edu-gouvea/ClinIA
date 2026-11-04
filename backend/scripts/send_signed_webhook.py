"""Envia um payload no formato real da Cloud API, com assinatura válida, ao webhook local.

Prova na demonstração que o caminho real (assinatura → parser → handler) funciona
sem depender da Meta. Uso, a partir de ``backend/`` e com o servidor rodando::

    WHATSAPP_APP_SECRET=<o mesmo do servidor> python -m scripts.send_signed_webhook
    python -m scripts.send_signed_webhook --fixture multi_entry_messages --tamper

``--tamper`` altera o corpo depois de assinado: o servidor deve responder 401.
Os timestamps são trocados por "agora" para a mensagem cair na janela de 24h.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import httpx

from app.services.whatsapp.signature import sign_body

FIXTURES = Path(__file__).resolve().parents[1] / "app" / "tests" / "fixtures" / "whatsapp"


def build_body(fixture: str) -> bytes:
    payload = json.loads((FIXTURES / f"{fixture}.json").read_text(encoding="utf-8"))
    now = str(int(time.time()))
    for entry in payload["entry"]:
        for change in entry["changes"]:
            value = change["value"]
            for message in value.get("messages", []):
                message["timestamp"] = now
                message["id"] = f"{message['id']}.{now}"  # novo wamid a cada execução (idempotência)
            for status in value.get("statuses", []):
                status["timestamp"] = now
    return json.dumps(payload, ensure_ascii=False).encode()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://localhost:8000/api/webhooks/whatsapp")
    parser.add_argument("--fixture", default="text_message", help="nome em app/tests/fixtures/whatsapp/")
    parser.add_argument("--secret", default=os.environ.get("WHATSAPP_APP_SECRET", ""))
    parser.add_argument("--tamper", action="store_true", help="altera o corpo depois de assinar")
    args = parser.parse_args()

    if not args.secret:
        print("Defina WHATSAPP_APP_SECRET (ou --secret) com o mesmo valor do servidor.", file=sys.stderr)
        return 2

    body = build_body(args.fixture)
    signature = sign_body(body, args.secret)
    if args.tamper:
        body = body.replace(b"consulta", b"CONSULTA")

    response = httpx.post(
        args.url, content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": signature}
    )
    expected = 401 if args.tamper else 200
    print(f"{args.fixture}: HTTP {response.status_code} (esperado {expected})")
    return 0 if response.status_code == expected else 1


if __name__ == "__main__":
    raise SystemExit(main())
