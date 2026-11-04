"""Frente WhatsApp / Integrações: camada de canal do ClinIA.

Recebe mensagens (webhook da Cloud API ou simulador), normaliza em
``InboundMessage``, entrega ao ``InboundHandler`` e envia respostas pelo
``GatewayRegistry``. Contratos em ``app.schemas.channel``.
"""
