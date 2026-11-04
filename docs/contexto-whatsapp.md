# Contexto de desenvolvimento — frente WhatsApp / Integrações

> **Para que serve:** retomar o trabalho em sessões futuras (com ou sem IA) e alimentar o relatório final
> (seções de Integrações, Testes e Implantação). Atualize a seção 1 e o checklist da seção 7 a cada sessão.
>
> - Contrato para a equipe: [`integracao-whatsapp.md`](integracao-whatsapp.md)
> - Especificação original da tarefa: documento "Tarefa: Módulo de Integração WhatsApp — ClinIA" (fora do repositório)

---

## 1. Estado atual (atualizado em 2026-11-04)

**O repositório estava vazio** (só README e LICENSE) quando a frente começou. Nenhuma outra frente tinha
código. Por isso o módulo foi feito para funcionar sozinho, com stubs e estado em memória atrás de interfaces.

| Branch | Conteúdo | Situação |
|---|---|---|
| `main` | Commit inicial | intocada |
| `develop` | Esqueleto mínimo do backend (`884362e`) | **só local**, ainda não enviada ao GitHub |
| `feature/whatsapp` | Módulo completo, 5 commits, um por fase | **só local**; PR para `develop` ainda não aberto |

Commits da `feature/whatsapp` (em ordem):

1. `feat(whatsapp): configuração, contratos do canal e validação de assinatura` — Fase 1
2. `feat(whatsapp): webhook da Cloud API com idempotência e processamento em segundo plano` — Fase 2
3. `feat(whatsapp): envio pela Cloud API com retry, divisão de texto e janela de 24h` — Fase 3
4. `feat(whatsapp): simulador de WhatsApp para a apresentação` — Fase 4
5. `feat(whatsapp): send_to_patient para resposta do atendente` — Fase 5
6. `docs(whatsapp): ...` — esta documentação

**Testes:** 89 passando, sem internet (`cd backend && pytest`). Ambiente usado: Python 3.13, FastAPI 0.162,
Pydantic 2.14, httpx 0.28.

**Ainda não existe** (outras frentes): `models/`, `core/database.py`, `core/security.py`, SQLAlchemy/Alembic,
PostgreSQL, Docker, `services/conversations|appointments|ai`, frontend.

---

## 2. Mapa do código

```
backend/
├── pyproject.toml                 # dependências; pytest com asyncio_mode=auto
├── .env.example                   # todas as variáveis WHATSAPP_* documentadas
├── scripts/send_signed_webhook.py # demo: payload real assinado → webhook local
└── app/
    ├── main.py                    # create_app(settings, whatsapp_module=...) — usar com --factory
    ├── core/config.py             # Settings + validação "modo cloud exige credenciais"
    ├── api/deps.py                # get_app_settings, get_whatsapp_module, get_patient_messenger
    ├── api/routes/whatsapp.py     # GET handshake / POST webhook
    ├── api/routes/simulator.py    # POST/GET /api/simulator/messages
    ├── schemas/channel.py         # CONTRATOS: Channel, InboundMessage, OutboundMessage, SendResult,
    │                              #   DeliveryStatus(Update), ChannelGateway, InboundHandler
    ├── services/whatsapp/
    │   ├── signature.py           # verify_signature, sign_body
    │   ├── parser.py              # parse_webhook (funções puras) → ParsedWebhook(messages, statuses)
    │   ├── dispatcher.py          # InboundDispatcher: idempotência + handler + statuses
    │   ├── store.py               # ChannelMessageStore (Protocol) + InMemoryChannelMessageStore
    │   ├── registry.py            # GatewayRegistry.send(): único caminho de saída
    │   ├── cloud_gateway.py       # WhatsAppCloudGateway + split_text
    │   ├── simulator_gateway.py   # SimulatorGateway (respostas em memória p/ polling)
    │   ├── outbound.py            # PatientMessenger.send_to_patient, ConversationLookup (Protocol)
    │   ├── stubs.py               # EchoInboundHandler, InMemoryConversationDirectory
    │   ├── observability.py       # log_event (JSON), mask_phone, configure_logging
    │   └── container.py           # build_whatsapp_module(): monta tudo a partir de Settings
    └── tests/
        ├── whatsapp_helpers.py    # cloud_settings, load_fixture, signed_request, FakeMeta, RecordingHandler
        ├── fixtures/whatsapp/     # payloads no formato real da Cloud API
        └── test_whatsapp_*.py
```

**Fluxo de entrada:** `POST /api/webhooks/whatsapp` → `verify_signature` → `parse_webhook` →
`BackgroundTasks(dispatcher.process_webhook)` → `store.claim_inbound` (idempotência) → `handler.handle_incoming`.
O simulador entra direto em `dispatcher.dispatch`.

**Fluxo de saída:** `registry.send(OutboundMessage)` → gateway do canal → (cloud) janela de 24h → `split_text` →
POST com retry → `store.register_outbound(wamid)`. Depois, os `statuses[]` do webhook chegam a
`store.update_delivery_status`.

---

## 3. Decisões tomadas (e por quê)

Use estas justificativas no relatório. Elas complementam a arquitetura fixada pela equipe (monólito modular,
FastAPI, SQLAlchemy/Alembic, PostgreSQL, Docker, Pytest).

| # | Decisão | Motivo |
|---|---|---|
| D1 | Criar `develop` com um esqueleto mínimo e ramificar `feature/whatsapp` dela | O repositório estava vazio. Assim o PR do WhatsApp mostra só código da frente, e as outras frentes partem da mesma base. |
| D2 | `create_app()` como fábrica (`uvicorn app.main:create_app --factory`) | Configuração não é lida no import. Testes montam apps com configurações diferentes sem variáveis globais. |
| D3 | Estado da integração atrás de `Protocol` (`ChannelMessageStore`, `ConversationLookup`) com implementação em memória | O modelo `Message`/`Conversation` não existe e `models/` é de outra frente. Trocar por SQL depois não mexe no restante do módulo. |
| D4 | `verify_signature` em `services/whatsapp/signature.py`, não em `core/security.py` | `core/` é da frente de Backend. A assinatura da Meta só interessa a este módulo. |
| D5 | `SendResult(ok, external_ids, reason, error_code)` | A especificação citava `SendResult` sem definir. `external_ids` é lista porque textos longos viram várias mensagens, cada uma com seu wamid. |
| D6 | `DeliveryStatus` nunca regride (`read` não volta para `delivered`); `failed` sempre vale | A Meta pode entregar statuses fora de ordem. |
| D7 | Janela de 24h calculada pelo **timestamp da Meta** da última mensagem do paciente | É a regra oficial. O efeito colateral é que um webhook reenviado muito tempo depois cai fora da janela (há teste para isso). |
| D8 | Paciente que nunca escreveu = janela fechada | Sem mensagem do paciente, a Meta só aceita template. |
| D9 | Retry só para rede/5xx/429, com backoff 0,5 s × 2ⁿ; `sleep` e `clock` injetáveis | Requisito da tarefa. A injeção deixa os testes instantâneos e determinísticos. |
| D10 | `POST /api/simulator/messages` é síncrono (responde depois do handler) | A resposta já está disponível no primeiro polling, o que simplifica a demonstração e os testes. O webhook continua assíncrono, porque a Meta exige resposta rápida. |
| D11 | Webhook com JSON inválido mas assinatura válida → 400 | É um erro real a investigar. A assinatura garante que veio da Meta. |
| D12 | Logs como uma linha JSON via `log_event`; `phone=` é mascarado automaticamente | Logs estruturados sem depender de biblioteca externa. Mascarar por padrão evita vazamento por esquecimento (LGPD). |
| D13 | `configure_logging()` chamado em `create_app` | Sem ele, os eventos INFO não aparecem no uvicorn. É provisório até a frente de Backend definir o logging global. |
| D14 | Testes em `backend/app/tests/` (como na árvore da especificação), com prefixo `test_whatsapp_` | Segue a estrutura definida e evita colisão com testes das outras frentes. |
| D15 | Simulador habilitado por padrão só em `WHATSAPP_MODE=simulator`; `SIMULATOR_ENABLED` força | O simulador não tem autenticação, então não deve ficar exposto em produção por acidente. |
| D16 | Teste de fronteira (`test_whatsapp_boundaries.py`) | Automatiza o critério "nenhum outro módulo chama a API da Meta". Falha se outro arquivo montar `messaging_product` ou importar `httpx`/`requests`. |

### Diferença em relação ao diagrama de classes

O diagrama define `WhatsAppGateway` com `receive_webhook(data)` e `send_message(to, text)`. A implementação
separa essas responsabilidades:

| Diagrama | Implementação |
|---|---|
| `WhatsAppGateway.receive_webhook(data)` | rota `POST /api/webhooks/whatsapp` + `parse_webhook` + `InboundDispatcher` |
| `WhatsAppGateway.send_message(to, text)` | `ChannelGateway.send_text(OutboundMessage)`, com `WhatsAppCloudGateway` e `SimulatorGateway`, chamados via `GatewayRegistry` |
| — | `PatientMessenger.send_to_patient(conversation_id, text, sender)` |

**Sugestão para o relatório:** atualizar o diagrama com a interface `ChannelGateway` e as duas implementações, e
mostrar `ConversationService` implementando `InboundHandler`. É um exemplo do princípio da inversão de
dependência e do padrão Strategy (um gateway por canal) com Registry.

---

## 4. Rastreabilidade: requisitos → código → testes

| Requisito | Implementação | Testes |
|---|---|---|
| RF05 Receber mensagens | `routes/whatsapp.py`, `parser.py`, `routes/simulator.py` | `test_whatsapp_parser`, `test_whatsapp_webhook`, `test_whatsapp_simulator` |
| RF06 Registrar conversas | Entrega `InboundMessage` ao `InboundHandler` (o registro é do `ConversationService`) | `test_whatsapp_simulator::...same_contract_to_the_same_handler` |
| RF13/RF15 Atendimento humano | `outbound.py` (`send_to_patient`) | `test_whatsapp_send_to_patient` |
| RF16 Histórico | Toda entrada passa pelo handler; toda saída devolve `external_ids` e tem status rastreado | `test_whatsapp_end_to_end::...status_arrives_later...`, `test_whatsapp_store` |
| RNF01 Segurança | `signature.py`, `config.py` (segredos via env, `SecretStr`, falha no boot) | `test_whatsapp_signature`, `test_whatsapp_config`, `test_whatsapp_webhook` |
| RNF02 LGPD | `observability.py` (`mask_phone`, nunca loga conteúdo) | `test_whatsapp_observability`, `test_whatsapp_webhook::test_logs_never_contain...`, `test_whatsapp_dispatcher` |
| RNF07 Testabilidade | `httpx.MockTransport` (`FakeMeta`), injeção via `build_whatsapp_module` | todos (nenhum acessa a internet) |
| RNF08 Observabilidade | `log_event` com eventos padronizados | asserts de eventos em vários testes |

### Critérios de aceitação da tarefa

- [x] `GET /api/webhooks/whatsapp` passa no handshake (testado localmente; **falta validar no painel da Meta**)
- [x] `POST` rejeita assinaturas inválidas e processa mensagens válidas em segundo plano
- [x] Mensagens duplicadas não são processadas duas vezes (em memória; definitivo com `UNIQUE` no banco)
- [x] Mensagens não textuais recebem resposta amigável (no stub; **o `ConversationService` precisa repetir isso**)
- [x] Simulador e webhook entregam o mesmo `InboundMessage` ao mesmo `InboundHandler`
- [x] Nenhum outro módulo chama a API da Meta diretamente (teste de fronteira)
- [x] Todos os testes passam com `pytest`, sem internet
- [x] Nenhum segredo, conteúdo de mensagem ou telefone completo em logs ou commits
- [x] `.env.example` e `docs/integracao-whatsapp.md` atualizados

---

## 5. Dependências de outras frentes (o que pedir a cada uma)

| Frente | Pedido | Bloqueia |
|---|---|---|
| Backend/Arquitetura | Validar o esqueleto da `develop` (estrutura, `create_app --factory`, `api/deps.py`). Definir o logging global (aí `configure_logging` sai). | Merge da `develop` |
| Banco/Testes | Modelo `Message` com `channel`, `direction`, `external_id` (`UNIQUE(channel, external_id)`), `delivery_status`. `Patient.find_by_phone` usando o `wa_id` sem normalizar. Tipo do id de `Conversation` (int ou UUID). | `SqlChannelMessageStore` e a migration dos campos de integração |
| Conversas | `ConversationService` implementando `InboundHandler`, respondendo via `GatewayRegistry` e tratando `unsupported`. Implementar `ConversationLookup.get_contact`. Definir quem grava a `Message` de saída (sugestão: o `ConversationService`, usando `SendResult.external_ids`). | Troca do `EchoInboundHandler` |
| Frontend | Tela estilo WhatsApp usando a API do simulador (polling com `after`). Botão de resposta do atendente chamando a rota que usa `send_to_patient`; tratar `reason == "window_closed"`. | Demonstração |
| DevOps | Dockerfile/compose rodando `uvicorn app.main:create_app --factory`, com variáveis de ambiente injetadas (nunca `.env` na imagem). CI rodando `pytest`. Túnel HTTPS ou domínio para o webhook. | Implantação |

---

## 6. Próximos passos quando o backend existir

Em ordem sugerida. Cada item cita os arquivos afetados.

1. **Publicar as branches** (`git push -u origin develop feature/whatsapp`) e abrir o PR `feature/whatsapp → develop` (descrição na seção 9).
2. **Migration dos campos de integração** em `Message`. Avisar a equipe antes, como combinado. Criar o índice único `(channel, external_id)`.
3. **`SqlChannelMessageStore`** em `services/whatsapp/store.py` (ou `repositories/`, combinar com a frente de Banco):
   - `claim_inbound` → `INSERT` respeitando o `UNIQUE`; conflito = duplicata (idempotência real, entre processos);
   - `last_inbound_at` → `MAX(received_at)` de entrada por canal + telefone;
   - `register_outbound` / `update_delivery_status` → coluna `delivery_status`, mantendo a regra "não regride" (D6).
   - Atenção: se o `ConversationService` também grava a `Message` de entrada, combinar quem insere primeiro para não duplicar. Sugestão: o dispatcher só *consulta*, e o `ConversationService` insere dentro da mesma transação.
4. **Plugar o `ConversationService`** via `build_whatsapp_module(handler_factory=..., conversation_lookup=...)` em `main.py`. Apagar o uso de `EchoInboundHandler` e `InMemoryConversationDirectory` (manter os stubs para testes).
5. **Rota de resposta do atendente** (frente de Conversas/Frontend) usando `get_patient_messenger`. Exemplo em `integracao-whatsapp.md`, seção 4.
6. **Validar com a Meta real** (passo a passo em `integracao-whatsapp.md`, seção 8) e registrar prints para o relatório: handshake, mensagem recebida, resposta, status `delivered`/`read`.
7. **Docker**: garantir que `WHATSAPP_MODE`, segredos e `SIMULATOR_ENABLED` venham de variáveis de ambiente do container.
8. **Melhorias pós-MVP** (fora do escopo atual):
   - templates aprovados para mensagens fora da janela (lembretes de consulta);
   - fila durável no lugar de `BackgroundTasks`, para não perder mensagens em reinícios (sem Kafka/RabbitMQ: pode ser uma tabela `pending_jobs` no PostgreSQL);
   - mídia (baixar imagem/áudio pela Graph API), botões e listas interativas;
   - marcar como lida (`status: read`) e indicador de digitação;
   - token de usuário do sistema (o token do painel expira).

---

## 7. Como rodar

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

pytest                                              # 89 testes, sem internet
uvicorn app.main:create_app --factory --reload      # modo simulator por padrão

# simulador
curl -X POST localhost:8000/api/simulator/messages -H 'content-type: application/json' \
     -d '{"phone":"5583999990001","name":"Maria","text":"Quero marcar consulta"}'
curl "localhost:8000/api/simulator/messages?phone=5583999990001&after=0"

# caminho real com payload assinado (servidor precisa do mesmo WHATSAPP_APP_SECRET)
WHATSAPP_APP_SECRET=dev python -m scripts.send_signed_webhook
```

Documentação interativa (OpenAPI): `http://localhost:8000/docs`.

---

## 8. Material para o relatório final

### Integrações

O ClinIA recebe mensagens de pacientes por dois canais: a **WhatsApp Cloud API** da Meta, via webhook, e um
**simulador web** usado na apresentação. Os dois convergem para um contrato único, `InboundMessage`, entregue a
um `InboundHandler`, papel do `ConversationService`. As respostas saem como `OutboundMessage` por um
`GatewayRegistry`, que escolhe a implementação de `ChannelGateway` adequada ao canal. Assim, o restante do
sistema não depende da origem da mensagem nem da API da Meta, que fica isolada em uma única classe
(`WhatsAppCloudGateway`).

O webhook valida a assinatura HMAC-SHA256 (`X-Hub-Signature-256`) sobre o corpo bruto, responde 200
imediatamente e processa em segundo plano, porque a Meta reenvia entregas lentas. A idempotência usa o
identificador da mensagem (`wamid`). O envio trata as regras da plataforma: limite de 4096 caracteres por
mensagem (com divisão em fim de frase), janela de 24 horas para texto livre e retry com backoff exponencial
apenas para falhas transitórias (rede, 5xx, 429). Os statuses de entrega (`sent`, `delivered`, `read`, `failed`)
atualizam a mensagem de saída correspondente.

### Testes

Os 89 testes do módulo (Pytest) rodam **sem acesso à internet**: a Graph API é substituída por um
`httpx.MockTransport`, e os payloads de entrada são fixtures no formato real da Cloud API (texto, imagem,
áudio, statuses e várias entradas em um mesmo POST). A cobertura inclui assinatura (corpo alterado, header
ausente ou malformado, segredo vazio), handshake, parser, idempotência, retry (5xx/429 repetem, 4xx não),
divisão de texto, janela de 24h, simulador ponta a ponta, atendimento humano e privacidade (asserts de que os
logs não contêm texto nem telefone completo). Um teste de fronteira garante que nenhum outro módulo monta
requisições para a Meta.

### Implantação

Toda a configuração vem de variáveis de ambiente (Pydantic Settings), com `.env.example` versionado e `.env`
ignorado. Em `WHATSAPP_MODE=cloud`, a aplicação não inicia se faltar alguma credencial. No modo `simulator`
(padrão), nenhuma credencial é exigida. Em desenvolvimento, a API local é exposta à Meta por um túnel HTTPS
(ngrok ou cloudflared). Limitações conhecidas: estado de integração em memória até a criação do modelo
`Message`, `BackgroundTasks` não sobrevive a reinícios e mensagens fora da janela de 24h exigem templates
(trabalho futuro).

---

## 9. Rascunho da descrição do PR (`feature/whatsapp → develop`)

```markdown
## O que foi feito
Camada de canal do ClinIA (frente WhatsApp / Integrações):
- Contratos `InboundMessage`, `OutboundMessage`, `SendResult`, `ChannelGateway`, `InboundHandler` (`app/schemas/channel.py`)
- Webhook da Cloud API: handshake (GET) e eventos (POST) com validação HMAC, processamento em segundo plano,
  idempotência por wamid e atualização de status de entrega
- `WhatsAppCloudGateway`: envio com retry/backoff (rede, 5xx, 429), divisão em partes de 4096 caracteres e janela de 24h
- Simulador (`/api/simulator/messages`) passando pelo mesmo handler do webhook
- `send_to_patient` para a resposta do atendente
- Logs estruturados com telefone mascarado; nenhum conteúdo de mensagem em log
- Stubs (`EchoInboundHandler`, `InMemoryConversationDirectory`) e estado em memória enquanto as outras frentes não existem

## Como testar
    cd backend && pip install -e ".[dev]" && pytest          # 89 testes, sem internet
    uvicorn app.main:create_app --factory --reload
    # simulador e payload assinado: ver docs/integracao-whatsapp.md

## Requisitos
RF05, RF06, RF13/RF15, RF16, RNF01, RNF02, RNF07, RNF08 (rastreabilidade em docs/contexto-whatsapp.md §4)

## Depende de outras frentes
- Banco: campos de integração em `Message` (+ migration) e `Patient.find_by_phone`
- Conversas: `ConversationService` implementando `InboundHandler`; `ConversationLookup`
- Frontend: tela do simulador e botão de resposta do atendente
- DevOps: Docker/CI e URL HTTPS para o webhook

## Limitações
Estado em memória (idempotência/status/janela), BackgroundTasks não durável, só texto, sem templates.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

## 10. Regras para as próximas sessões

- Trabalhar na branch `feature/whatsapp`. Commits no padrão Conventional Commits (`feat(whatsapp): ...`, `test(whatsapp): ...`, `docs(whatsapp): ...`).
- **Não alterar** `services/conversations/`, `services/ai/`, `services/appointments/` nem o frontend. Se precisar de algo deles, parar e descrever exatamente o pedido.
- Mudanças em `models/` só para os campos de integração, sempre com migration Alembic e com aviso prévio.
- Em `core/config.py`, `main.py` e `api/deps.py` (compartilhados), mexer só nos blocos marcados como WhatsApp.
- Nenhum teste pode acessar a Meta. Usar `FakeMeta`/`httpx.MockTransport`.
- Nunca logar texto de mensagem, corpo de webhook, nome ou token. Telefone sempre via `log_event(..., phone=...)`.
- Manter nomes e decisões consistentes com este documento e com `integracao-whatsapp.md`, que entram no relatório.
