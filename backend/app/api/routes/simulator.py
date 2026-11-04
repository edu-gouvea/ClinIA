"""API do simulador de WhatsApp (canal da apresentação).

Registrada só quando ``WHATSAPP_MODE=simulator`` ou ``SIMULATOR_ENABLED=true``.
A mensagem passa pelo mesmo ``InboundDispatcher``/``InboundHandler`` do webhook.
"""

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.deps import get_whatsapp_module
from app.schemas.channel import Channel, InboundMessage
from app.services.whatsapp.container import WhatsAppModule
from app.services.whatsapp.simulator_gateway import SimulatorReply

router = APIRouter(prefix="/api/simulator", tags=["simulator"])

PHONE_PATTERN = r"^\d{8,15}$"


class SimulatorMessageIn(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN, examples=["5583999990001"])
    name: str | None = Field(default=None, max_length=100, examples=["Maria Teste"])
    text: str = Field(min_length=1, max_length=4096, examples=["Quero marcar uma consulta"])


class SimulatorMessageAccepted(BaseModel):
    external_id: str


class SimulatorReplies(BaseModel):
    messages: list[SimulatorReply]


def _simulator(module: WhatsAppModule):
    if module.simulator is None:
        raise HTTPException(status_code=404, detail="Simulador desabilitado")
    return module.simulator


@router.post("/messages", status_code=201)
async def send_simulated_message(
    body: SimulatorMessageIn,
    module: Annotated[WhatsAppModule, Depends(get_whatsapp_module)],
) -> SimulatorMessageAccepted:
    _simulator(module)
    msg = InboundMessage(
        channel=Channel.SIMULATOR,
        external_id=str(uuid.uuid4()),
        from_phone=body.phone,
        contact_name=body.name,
        type="text",
        text=body.text,
        received_at=datetime.now(UTC),
    )
    await module.dispatcher.dispatch(msg)
    return SimulatorMessageAccepted(external_id=msg.external_id)


@router.get("/messages")
async def list_simulated_replies(
    module: Annotated[WhatsAppModule, Depends(get_whatsapp_module)],
    phone: Annotated[str, Query(pattern=PHONE_PATTERN)],
    after: Annotated[int | None, Query(ge=0)] = None,
) -> SimulatorReplies:
    return SimulatorReplies(messages=_simulator(module).list_replies(phone, after))
