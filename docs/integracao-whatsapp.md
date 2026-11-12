# Integração WhatsApp — contratos para a equipe

> Frente: **WhatsApp / Integrações** · Código: `backend/app/services/whatsapp/`, `backend/app/schemas/channel.py`, `backend/app/api/routes/{whatsapp,simulator}.py`
> Requisitos atendidos: RF05, RF06, RF13/RF15, RF16, RNF01, RNF02, RNF07, RNF08

Este documento é o que as outras frentes precisam saber para conversar com o módulo de WhatsApp.
A regra principal: **para o restante do backend, a origem da mensagem não importa.**

```
WhatsApp real  → Webhook (Cloud API) ─┐
                                      ├→ InboundMessage → InboundHandler (ConversationService)
Simulador web  → API do simulador ────┘

ConversationService → OutboundMessage → GatewayRegistry → WhatsAppCloudGateway | SimulatorGateway
```

---

## 1. Contratos (`app/schemas/channel.py`)

```python
class Channel(str, Enum):
    WHATSAPP = "whatsapp"
    SIMULATOR = "simulator"

class InboundMessage(BaseModel):
    channel: Channel
    external_id: str          # wamid da Meta, ou UUID gerado no simulador
    from_phone: str           # wa_id / telefone do paciente, exatamente como recebido
    contact_name: str | None  # nome do perfil do WhatsApp (pode ser None)
    type: Literal["text", "unsupported"]
    text: str | None          # None quando type == "unsupported"
    received_at: datetime     # UTC; na Cloud API é o timestamp da Meta

class OutboundMessage(BaseModel):
    channel: Channel
    to_phone: str
    text: str
    sender: Literal["ai", "attendant"]

class SendResult(BaseModel):
    ok: bool
    external_ids: list[str]   # um id por parte enviada (textos > 4096 caracteres são divididos)
    reason: str | None        # window_closed | http_error | network_error | channel_unavailable | empty_text
    error_code: int | None    # código de erro da Meta, quando houver

class ChannelGateway(Protocol):
    async def send_text(self, msg: OutboundMessage) -> SendResult: ...

class InboundHandler(Protocol):
    async def handle_incoming(self, msg: InboundMessage) -> None: ...
```

### O que cada frente faz com isso

| Quem | Faz o quê |
|---|---|
| **Conversas** (`ConversationService`) | Implementa `InboundHandler.handle_incoming(msg)`: registra a mensagem (RF06/RF16), decide se vai para a IA (`status == "bot"`) ou só fica registrada (`status == "human"`), e responde com `await registry.send(OutboundMessage(...))`. |
| **Conversas** | Implementa `ConversationLookup.get_contact(conversation_id) -> ConversationContact(channel, phone)`, usado no `send_to_patient`. |
| **Frontend / dashboard** | A rota de resposta do atendente chama `send_to_patient` (seção 4). A tela do simulador usa a API da seção 3. |
| **Banco** | Cria em `Message` os campos da seção 6. |
| **Todos** | **Nunca** chamar a API da Meta diretamente. Toda saída passa pelo `GatewayRegistry`. Existe um teste que falha se outro módulo montar requisições da Graph API. |

### Como plugar o `ConversationService`

Em `app/main.py`, troque o stub `EchoInboundHandler` pela implementação real:

```python
from app.services.whatsapp.container import build_whatsapp_module

whatsapp_module = build_whatsapp_module(
    settings,
    handler_factory=lambda registry: ConversationService(..., registry=registry),
    conversation_lookup=SqlConversationLookup(...),
)
app = create_app(settings, whatsapp_module=whatsapp_module)
```

O `registry` é um `GatewayRegistry`. Responder é só:

```python
await registry.send(OutboundMessage(channel=msg.channel, to_phone=msg.from_phone, text=resposta, sender="ai"))
```

Mensagens com `type == "unsupported"` (imagem, áudio, localização, figurinha...) devem receber uma resposta
amigável. Sugestão pronta: `app.services.whatsapp.stubs.UNSUPPORTED_MESSAGE_REPLY`.

O `handle_incoming` pode lançar exceção sem derrubar as outras mensagens do mesmo webhook: o
dispatcher registra `handler_failed` (só o tipo da exceção) e segue.

---

## 2. Webhook da Cloud API

### `GET /api/webhooks/whatsapp` — handshake de verificação

A Meta chama uma vez, ao cadastrar a URL.

```
GET /api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=1158201444
→ 200 text/plain
1158201444
```

O status é 403 se o token estiver errado, se `hub.mode` for diferente de `subscribe` ou se `WHATSAPP_VERIFY_TOKEN` não estiver configurado.

### `POST /api/webhooks/whatsapp` — eventos

Não exige autenticação de usuário (quem chama é a Meta), mas **todo** POST passa pela validação de
assinatura `X-Hub-Signature-256: sha256=<HMAC-SHA256 do corpo bruto com WHATSAPP_APP_SECRET>`.

| Situação | Resposta |
|---|---|
| Assinatura ausente ou inválida | `401`, sem processar nada |
| Assinatura válida, JSON inválido | `400` |
| Assinatura válida | `200` imediato; processamento em `BackgroundTasks` |

O processamento em segundo plano:

1. Cada item de `messages[]` (de todas as `entry[]`/`changes[]`) vira um `InboundMessage`. `type == "text"` usa `text.body`; qualquer outro tipo vira `unsupported`.
2. Um `wamid` já visto é ignorado (`duplicate_ignored`), porque a Meta pode reenviar.
3. Cada item de `statuses[]` (`sent`, `delivered`, `read`, `failed`) atualiza o `delivery_status` da mensagem de saída correspondente. Em `failed`, o código de erro da Meta vai para o log.

Exemplo de payload (texto):

```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "200000000000001",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {"display_phone_number": "15550001111", "phone_number_id": "100000000000001"},
        "contacts": [{"profile": {"name": "Maria Teste"}, "wa_id": "558399990001"}],
        "messages": [{
          "from": "558399990001", "id": "wamid.TEXT0001", "timestamp": "1762250400",
          "type": "text", "text": {"body": "Olá, quero marcar uma consulta"}
        }]
      }
    }]
  }]
}
```

Mais exemplos (imagem, áudio, statuses, várias entradas): `backend/app/tests/fixtures/whatsapp/`.

### Envio pela Cloud API (interno, só o `WhatsAppCloudGateway` faz)

`POST {WHATSAPP_API_BASE_URL}/{WHATSAPP_GRAPH_VERSION}/{WHATSAPP_PHONE_NUMBER_ID}/messages`, com
`Authorization: Bearer <WHATSAPP_ACCESS_TOKEN>`, corpo `{"messaging_product":"whatsapp","to":"<wa_id>","type":"text","text":{"body":"..."}}`.

- Retry com backoff exponencial (0,5 s, 1 s, 2 s...) só para erro de rede, 5xx e 429. Outros 4xx falham na hora com `reason="http_error"` e `error_code`.
- O `wamid` devolvido é registrado como `pending` para casar com os statuses do webhook.
- Textos acima de 4096 caracteres são divididos, de preferência em fim de parágrafo ou de frase.
- **Janela de 24h**: se a última mensagem do paciente tem mais de 24h, não envia e devolve `reason="window_closed"`.

---

## 3. API do simulador (para a frente de Frontend)

Ativa quando `WHATSAPP_MODE=simulator` (padrão) ou `SIMULATOR_ENABLED=true`. Em outros casos as rotas não existem (404).
A mensagem do simulador passa **pelo mesmo** `InboundHandler` do webhook. O que muda é só `channel = "simulator"`.

### `POST /api/simulator/messages` — paciente envia

```http
POST /api/simulator/messages
Content-Type: application/json

{ "phone": "5583999990001", "name": "Maria Teste", "text": "Quero marcar uma consulta" }
```

```http
201 Created
{ "external_id": "2dd3ea7b-b0bc-411c-9d23-e01c301ba3cd" }
```

Validação: `phone` só dígitos (8 a 15), `text` com 1 a 4096 caracteres, `name` opcional (até 100). Fora disso, 422.
A chamada só retorna depois que o handler processou a mensagem, então a resposta já pode estar disponível no polling.

### `GET /api/simulator/messages?phone=...&after=<id>` — respostas para o paciente (polling)

```http
GET /api/simulator/messages?phone=5583999990001&after=0
```

```json
{
  "messages": [
    { "id": 1, "phone": "5583999990001", "text": "Recebido: Quero marcar uma consulta",
      "sender": "ai", "sent_at": "2026-11-04T18:48:45.603320Z" }
  ]
}
```

- `id` é crescente. Guarde o maior recebido e mande em `after` na próxima consulta.
- `sender` é `ai` ou `attendant`. Use para diferenciar o balão na tela.
- Polling simples (ex.: a cada 1–2 s). O MVP não tem WebSocket nem SSE.
- As mensagens do próprio paciente não voltam aqui. A tela já sabe o que enviou.
- Tudo fica em memória: some ao reiniciar o servidor.

---

## 4. Atendimento humano — `send_to_patient` (RF13/RF15)

```python
from app.api.deps import get_patient_messenger
from app.services.whatsapp.outbound import ConversationNotFoundError, PatientMessenger

@router.post("/api/conversations/{conversation_id}/reply")          # rota da frente de Conversas/Dashboard
async def reply(conversation_id: int, body: ReplyIn,
                messenger: PatientMessenger = Depends(get_patient_messenger)):
    try:
        result = await messenger.send_to_patient(conversation_id, body.text, sender="attendant")
    except ConversationNotFoundError:
        raise HTTPException(404)
    if not result.ok:
        ...  # ex.: result.reason == "window_closed" → avisar o atendente
    # registrar a Message de saída (sender="attendant", external_id=result.external_ids)
```

- Resolve canal e telefone da conversa via `ConversationLookup` e envia pelo gateway certo.
- Respeita a janela de 24h no WhatsApp real.
- A regra "conversa em `human` não vai para a IA" é do `ConversationService`, não deste módulo.

---

## 5. Configuração (`backend/.env.example`)

| Variável | Uso |
|---|---|
| `WHATSAPP_MODE` | `simulator` (padrão) ou `cloud`. Em `cloud`, a aplicação **não inicia** se faltar credencial |
| `WHATSAPP_ACCESS_TOKEN` | Token Bearer da Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID do número de envio |
| `WHATSAPP_APP_SECRET` | Chave HMAC para validar o webhook |
| `WHATSAPP_VERIFY_TOKEN` | Token do handshake (valor aleatório nosso) |
| `WHATSAPP_GRAPH_VERSION` | Versão da Graph API, ex.: `v23.0` |
| `WHATSAPP_API_BASE_URL` | Padrão `https://graph.facebook.com` |
| `WHATSAPP_HTTP_TIMEOUT_SECONDS` | Timeout do cliente HTTP (padrão 10) |
| `WHATSAPP_SEND_MAX_ATTEMPTS` | Tentativas de envio com retry (padrão 3) |
| `SIMULATOR_ENABLED` | Vazio = só em modo simulator; `true`/`false` força |

Segredos só por variável de ambiente. `.env` está no `.gitignore`.

---

## 6. Dados — pedido para a frente de Banco

Quando o modelo `Message` for criado, ele precisa destes campos de integração:

| Campo | Tipo | Observação |
|---|---|---|
| `channel` | enum `whatsapp \| simulator` | |
| `direction` | enum `inbound \| outbound` | |
| `external_id` | string, **único por (`channel`, `external_id`)** | base da idempotência (wamid) |
| `delivery_status` | enum `pending \| sent \| delivered \| read \| failed`, nulo para entrada | só para saída |

Telefones: guardar o `wa_id` **exatamente como a Meta envia** para responder ao paciente.
Não "corrigir" esse valor: no Brasil o `wa_id` pode vir sem o nono dígito, e a Meta só entrega para o formato
que ela mesma enviou.

> **Atualização (2026-11-12):** o `database/schema.sql` e o frontend guardam o telefone do paciente no formato
> local (DDD + número, 10 ou 11 dígitos, ex.: `81999990001`), e um mesmo telefone pode pertencer a vários
> pacientes. Portanto a busca do paciente não pode comparar o `wa_id` diretamente: ela precisa gerar candidatos
> (sem o `55`, com e sem o nono dígito) e tratar mais de um resultado. Ver lacunas em
> [`contexto-whatsapp.md`](contexto-whatsapp.md), seção 1.

Hoje o módulo usa `ChannelMessageStore` (interface) com uma implementação em memória. Quando `Message`
existir, uma implementação SQL substitui a de memória, sem mudar o restante do módulo.

---

## 7. Segurança, privacidade e logs (RNF01, RNF02, RNF08)

- Assinatura HMAC validada em todo POST do webhook, com `hmac.compare_digest` sobre o corpo bruto.
- Logs **nunca** contêm conteúdo de mensagem, corpo de webhook, nome do paciente ou tokens. Telefones aparecem mascarados (`5583*****1234`).
- Cada log é uma linha JSON no logger `clinia.whatsapp`, com evento, canal, `external_id`, status e duração.

| Evento | Quando |
|---|---|
| `webhook_received` | POST aceito (com contagem de mensagens/statuses) |
| `signature_invalid` | POST com assinatura inválida (401) |
| `webhook_malformed` | JSON inválido com assinatura válida (400) |
| `webhook_verified` / `webhook_verification_failed` | handshake GET |
| `message_dispatched` | mensagem entregue ao handler |
| `duplicate_ignored` | wamid repetido |
| `handler_failed` | handler lançou exceção (só o tipo) |
| `message_sent` / `send_failed` | resultado de `registry.send` |
| `send_retry` / `send_rejected` | retry de rede/5xx/429, ou 4xx da Meta |
| `window_closed` | envio bloqueado pela janela de 24h |
| `status_updated` / `status_unmatched` / `delivery_failed` | statuses do webhook |

---

## 8. Testando com o WhatsApp real (desenvolvimento)

1. **App na Meta**: em developers.facebook.com, crie um app do tipo *Business* e adicione o produto **WhatsApp**. O painel fornece um número de teste, o `Phone number ID` e um token temporário. Cadastre seu celular como destinatário de teste.
2. **`.env`** em `backend/`:
   ```
   WHATSAPP_MODE=cloud
   WHATSAPP_ACCESS_TOKEN=<token do painel>
   WHATSAPP_PHONE_NUMBER_ID=<phone number id>
   WHATSAPP_APP_SECRET=<Configurações do app > Básico > Chave secreta do app>
   WHATSAPP_VERIFY_TOKEN=<gere: python -c "import secrets; print(secrets.token_urlsafe(32))">
   WHATSAPP_GRAPH_VERSION=v23.0
   SIMULATOR_ENABLED=true   # opcional: manter o simulador junto
   ```
3. **Suba a API**: `cd backend && uvicorn app.main:create_app --factory --port 8000`
4. **Túnel HTTPS** (a Meta exige HTTPS público):
   - `ngrok http 8000`, ou
   - `cloudflared tunnel --url http://localhost:8000`
5. **Cadastre o webhook** no painel (WhatsApp > Configuração): URL de callback `https://<túnel>/api/webhooks/whatsapp` e o mesmo `WHATSAPP_VERIFY_TOKEN`. A Meta faz o GET do handshake; o log mostra `webhook_verified`.
6. **Assine o campo `messages`** na lista de campos do webhook.
7. **Mande uma mensagem** do seu celular para o número de teste. Com o stub, a resposta é `Recebido: <texto>`.

Sem celular e sem Meta, é possível provar o caminho real com um payload assinado:

```bash
cd backend
WHATSAPP_APP_SECRET=<mesmo do servidor> python -m scripts.send_signed_webhook            # → 200
WHATSAPP_APP_SECRET=<mesmo do servidor> python -m scripts.send_signed_webhook --tamper   # → 401
```

Em modo `simulator`, a resposta para o canal `whatsapp` não tem para onde ir. O log registra
`send_failed reason=channel_unavailable`, que é o esperado. O teste `test_whatsapp_end_to_end.py` cobre o
caminho completo com uma Graph API falsa.

---

## 9. Limitações conhecidas (MVP)

- **Janela de 24h**: só respondemos dentro dela. Mensagens iniciadas pela clínica (ex.: lembrete de consulta) exigem **templates aprovados** pela Meta. Isso fica como trabalho futuro.
- **Só texto**: imagem, áudio, documento, localização, figurinha, botões e listas viram `unsupported`.
- **`BackgroundTasks`** roda no mesmo processo. Se o servidor reiniciar durante o processamento, a mensagem se perde, e a Meta não reenvia porque já recebeu 200.
- **Estado em memória** (idempotência, status de entrega, última mensagem do paciente, respostas do simulador): some ao reiniciar e não é compartilhado entre processos. Vale para um único worker até existir o modelo `Message`. Depois de um reinício, a janela de 24h fica "fechada" para quem escreveu antes.
- **Token temporário** do painel da Meta expira em cerca de 24h. Em produção, use token de usuário do sistema.
