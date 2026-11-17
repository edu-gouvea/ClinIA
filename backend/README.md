# ClinIA — Backend

Monólito modular em **Python 3.12 + FastAPI + SQLAlchemy 2.0 + PostgreSQL**.

Alimenta o painel CRM (Next.js) e conecta o agente de IA aos canais de mensagem (WhatsApp). Escopo: **atendimento administrativo** — nunca prontuário.

---

## Pré-requisitos

- Python 3.12+
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Docker + Docker Compose (para banco de dados)

---

## Rodar com Docker

```bash
cd backend

# Subir banco e API
cp .env.example .env     # ajuste os valores; .env nunca é commitado
make up                  # sobe postgres + api com reload
```

Acesse: `http://localhost:8000/api/v1/health`

---

## Rodar localmente (sem Docker)

```bash
cd backend

uv venv --python 3.12
source .venv/bin/activate
uv pip install -e ".[dev]"

cp .env.example .env     # ajuste DATABASE_URL para apontar ao postgres local

make migrate             # aplica as migrações
make dev                 # inicia uvicorn com reload
```

---

## Variáveis de ambiente

Veja `.env.example` para a lista completa. Variáveis obrigatórias em produção:

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | URL asyncpg do PostgreSQL principal |
| `TEST_DATABASE_URL` | URL asyncpg do PostgreSQL de testes |
| `JWT_SECRET` | Segredo para assinar tokens JWT |
| `CORS_ORIGINS` | Origens permitidas (separadas por vírgula) |
| `CAMINHO_DO_CRM` | Caminho/URL do CRM externo |

---

## Comandos do Makefile

| Comando | O que faz |
|---------|-----------|
| `make up` | Sobe todos os serviços Docker |
| `make down` | Para os serviços Docker |
| `make dev` | Inicia a API com uvicorn --reload |
| `make migrate` | Aplica migrações Alembic (`upgrade head`) |
| `make revision m="..."` | Cria nova revisão Alembic com autogenerate |
| `make seed` | Executa script de seed |
| `make test` | Roda a suíte de testes |
| `make test-cov` | Testes com relatório de cobertura |
| `make lint` | Verifica código com ruff |
| `make format` | Formata código com ruff |

---

## Rodar os testes

Testes unitários (sem banco):

```bash
make test
# ou apenas unitários:
.venv/bin/pytest tests/unit -v
```

Testes de integração (requerem `db_test` do Docker):

```bash
make up
make test
```

---

## Estrutura do projeto

```
backend/
├── app/
│   ├── main.py                   # create_app() — fábrica da aplicação
│   ├── api/
│   │   ├── deps.py               # dependências compartilhadas (get_db, auth)
│   │   └── routes/               # um arquivo por área de negócio
│   ├── core/
│   │   ├── config.py             # Settings (Pydantic Settings)
│   │   ├── database.py           # engine async, sessionmaker, get_db
│   │   ├── security.py           # JWT e hashing (Fase 1)
│   │   ├── logging.py            # structlog JSON + middleware request_id
│   │   ├── errors.py             # hierarquia de erros e handlers
│   │   └── events.py             # event bus em memória
│   ├── models/                   # SQLAlchemy 2.0 Mapped
│   ├── schemas/                  # Pydantic v2
│   ├── repositories/             # SQL — sempre filtrado por clinic_id
│   └── services/
│       ├── scheduling/
│       ├── conversations/
│       ├── channels/
│       ├── ai/
│       ├── realtime/
│       └── audit/
├── alembic/                      # migrações
├── tests/
│   ├── conftest.py               # fixtures: banco isolado por transação
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── scripts/                      # seed e utilitários
├── docs/                         # contratos de API e decisões
├── Dockerfile                    # multi-stage com uv, usuário não-root
├── docker-compose.yml            # db, db_test, api
├── Makefile
├── pyproject.toml
├── alembic.ini
└── CLAUDE.md                     # convenções para todas as fases
```

---

## Fases de implementação

### Fase 0 — Fundação do repositório

**Branch:** `feature/setup` | **Data:** 2026-11-17

#### O que foi implementado

**Configuração do projeto**
- `pyproject.toml` com Python 3.12, dependências de produção (`fastapi`, `uvicorn[standard]`, `pydantic`, `pydantic-settings`, `sqlalchemy[asyncio]`, `asyncpg`, `alembic`, `pyjwt`, `pwdlib[argon2]`, `email-validator`, `phonenumbers`, `httpx`, `structlog`) e de desenvolvimento (`pytest`, `pytest-asyncio`, `pytest-cov`, `ruff`, `respx`).
- `uv` como gerenciador de pacotes e ambientes virtuais.

**Módulos core**
- `core/config.py` — `Settings` com Pydantic Settings: `APP_ENV`, `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `JWT_ACCESS_MINUTES`, `JWT_REFRESH_DAYS`, `CORS_ORIGINS`, `LOG_LEVEL`, `CAMINHO_DO_CRM`, `SIMULATOR_ENABLED`, `AGENT_PROVIDER`. Validadores para parsear lista CORS e garantir driver asyncpg.
- `core/database.py` — engine assíncrono com `asyncpg`, `async_sessionmaker`, `get_db` (uma sessão por requisição), `Base` com naming convention de constraints.
- `core/logging.py` — logs JSON com `structlog`, `RequestIDMiddleware` que gera `request_id`, injeta no contexto e devolve no header `X-Request-ID`.
- `core/errors.py` — `AppError` base + `NotFoundError` (404), `ConflictError` (409), `ForbiddenError` (403), `BusinessRuleError` (422). Handlers globais para `AppError`, `RequestValidationError` e exceções não tratadas; formato sempre `{"error": {"code", "message", "details"}}`, sem vazar stack trace.
- `core/events.py` — `EventBus` com `subscribe`/`publish` assíncronos; erros de handlers logados, sem propagar.
- `core/security.py` — placeholder (implementado na Fase 1).

**API**
- `main.py` — `create_app()` com prefixo `/api/v1`, CORS de `CORS_ORIGINS`, middleware de log, handlers de erro e `GET /api/v1/health` (testa banco com `SELECT 1`).
- `api/deps.py` — re-exporta `get_db`; auth virá na Fase 1.

**Alembic**
- `alembic.ini` configurado.
- `alembic/env.py` — async com asyncpg, lê `DATABASE_URL` do `Settings`, naming convention no metadata.
- `alembic/script.py.mako` — template de revisão.

**Docker**
- `Dockerfile` — multi-stage com `uv`, imagem final com usuário não-root (`app`).
- `docker-compose.yml` — serviços: `db` (postgres:16, volume persistente, porta 5432), `db_test` (postgres:16, sem volume, porta 5433), `api` (com reload).

**Makefile**
- Comandos: `up`, `down`, `dev`, `migrate`, `revision m=...`, `seed`, `test`, `test-cov`, `lint`, `format`.

**Testes**
- `tests/conftest.py` — `test_settings` (session), `db_engine` cria/destrói schema uma vez por sessão, `db_session` isola cada teste em transação revertida, `client` sobrescreve `get_db`.
- `tests/unit/test_errors.py` — 4 testes na hierarquia de erros (sem banco).
- `tests/unit/test_events.py` — 3 testes no EventBus (sem banco).
- `tests/integration/test_health.py` — 3 testes no endpoint `/api/v1/health` (status 200, header `X-Request-ID`, propagação de ID personalizado).

**CI**
- `.github/workflows/backend.yml` — dispara em push/PR para `develop` e `main` em arquivos `backend/**`; jobs: `ruff check` e `pytest` com serviço `postgres:16`.

**Convenções**
- `CLAUDE.md` — convenções de camadas, multi-clínica, datas, LGPD, API, testes e commits para todas as fases.
- `.env.example` — todas as variáveis comentadas com descrição.
- `.gitignore` — `.env`, caches Python, artefatos de build.

#### Decisões tomadas

- **uv** em vez de pip/poetry: instalação reproduzível e mais rápida.
- **`create_app()` como fábrica**: evita leitura de `.env` no import, facilita testes com `Settings` personalizados.
- **Isolamento por transação** nos testes: `db_engine` escopo session (roda migrações uma vez), `db_session` escopo function (rollback automático).
- **`CAMINHO_DO_CRM` como variável de ambiente**: nunca hardcoded; preenchida pelo responsável.
- **Naming convention de constraints** no `Base.metadata`: compatível com autogenerate do Alembic em fases futuras.
