# ClinIA — backend

Monólito modular em Python + FastAPI + Pydantic. Este é um **esqueleto mínimo**: cada
frente acrescenta seus módulos seguindo a estrutura abaixo.

```
backend/app/
├── main.py            # create_app(): registra as rotas
├── api/routes/        # um arquivo de rotas por área
├── core/              # config.py (Pydantic Settings); security.py e database.py a criar
├── models/            # SQLAlchemy (frente Banco/Testes)
├── schemas/           # contratos Pydantic
├── services/          # um subpacote por frente (whatsapp, conversations, appointments, ai)
├── repositories/      # acesso a dados (frente Banco/Testes)
└── tests/             # Pytest
```

## Rodando localmente

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env        # ajuste os valores; .env nunca é commitado

uvicorn app.main:create_app --factory --reload
pytest
```

Ainda não existem SQLAlchemy, Alembic, PostgreSQL nem Docker. Essas partes ficam com as
frentes de Banco/Testes e DevOps.

---

## Fase 1 — Contrato da API

**Branch:** `feature/api-contract` | **Escopo:** somente documentação — nenhum código de aplicação foi alterado.

### Documentos criados

| Arquivo | Conteúdo |
|---------|----------|
| [`docs/data-model.md`](docs/data-model.md) | Modelo de dados completo (13 tabelas), diagrama ER em Mermaid, ajustes identificados no CRM e 9 perguntas em aberto (D1–D9) |
| [`docs/api-contract.md`](docs/api-contract.md) | Contrato completo de todos os endpoints REST + eventos WebSocket, com exemplos JSON e mapeamento de status |
| [`docs/crm-mapping.md`](docs/crm-mapping.md) | Mapeamento tela→endpoint→evento WebSocket para as 7 telas do CRM |

### Convenção de nomes escolhida

- **camelCase** em todas as respostas e corpos de requisição, pois o CRM (Next.js/TypeScript) usa camelCase nativamente em todos os seus tipos (`src/lib/types.ts`).
- Implementação via Pydantic v2: `model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)`.
- Datas: sempre UTC em ISO 8601 (`2025-01-15T14:30:00Z`). Fuso da clínica fica em `settings.timezone`.

### Telas do CRM mapeadas

| # | Tela | Rota | Eventos WebSocket |
|---|------|------|-------------------|
| 1 | Início | `/inicio` | `appointment.*`, `conversation.updated`, `handoff.requested` |
| 2 | Conversas | `/conversas` | `message.created`, `conversation.*`, `handoff.requested` |
| 3 | Agenda | `/gestao/agenda` | `appointment.*` |
| 4 | Pacientes | `/gestao/pacientes` | `appointment.updated` |
| 5 | Equipe | `/gestao/equipe` | — |
| 6 | Configurações | `/gestao/configuracoes` | — |
| 7 | Visão Gerencial | `/gestao/visao-gerencial` | — |

### Ajustes propostos ao modelo (CRM → backend)

- `professionals.color VARCHAR(7)` — cor do profissional para a grade da agenda
- `patients.notes TEXT` — anotações administrativas visíveis na ficha do paciente
- `appointments.specialty_name VARCHAR(100)` — nome desnormalizado para evitar JOIN em listagens
- `clinics.settings JSONB` inclui `clinicHours: WeekSlot[]` — grade de horários de funcionamento da clínica
- Semanas: convenção **0 = Segunda … 6 = Domingo** (igual ao CRM; diferente do JavaScript padrão)
- Mapeamento de status: `agendada→pending`, `confirmada→confirmed`, `realizada→completed`, `falta→no_show`, `ia→bot`, `aguardando→waiting_human`, `humano→human`, `encerrada→closed`

### Decisões arquiteturais tomadas (D1–D9)

Ver detalhes completos em [`docs/data-model.md § Decisões arquiteturais`](docs/data-model.md).

| # | Decisão |
|---|---------|
| D1 | Fuso fixo `America/Sao_Paulo` (Brasília) no MVP |
| D2 | `is_active BOOLEAN` sem soft-delete; `patients` usa `anonymized_at` (LGPD) |
| D3 | Profissionais e usuários separados; vínculo 1:1 opcional via `professionals.user_id` |
| D4 | Duração por profissional (`appointment_duration_minutes INT DEFAULT 30`) |
| D5 | Remarcação por cadeia `rescheduled_from_id`; 409 se já existe uma pending |
| D6 | Full-text search PostgreSQL (`pt_unaccent`); sem embeddings no MVP |
| D7 | Limites da Meta — sem rate-limiter próprio no MVP |
| D8 | Auditoria de acesso, admin, agendamentos, conversas e LGPD (actor_type = user\|agent\|system) |
| D9 | Simulador usa número fictício E.164; `channel = simulator` |

Restam 5 perguntas do lado do CRM (CQ1–CQ5) detalhadas em `docs/data-model.md`.
