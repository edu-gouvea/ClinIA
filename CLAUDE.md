# ClinIA — Engenharia de Software (UFPB)

Sistema de atendimento para clínicas via WhatsApp com agente de IA. Equipe dividida em seis frentes
(backend/arquitetura, agente de IA, frontend/dashboard, banco/testes, DevOps, WhatsApp/integrações).

## Arquitetura (fixa, não alterar)
- Monólito modular; sem microsserviços, filas externas ou Kubernetes.
- Python + FastAPI + Pydantic; SQLAlchemy + Alembic; PostgreSQL; Docker; Pytest.
- Código em `backend/app/` (`api/routes`, `core`, `models`, `schemas`, `services/<frente>`, `repositories`, `tests`).

## Comandos (a partir de `backend/`)
- Instalar: `python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"`
- Testes: `.venv/bin/pytest` (nenhum teste acessa a internet)
- Servidor: `.venv/bin/uvicorn app.main:create_app --factory --reload`

## Branches
- `main` → `develop` (esqueleto do backend) → `feature/<frente>`. PRs vão para `develop`.
- Commits em Conventional Commits, com escopo da frente: `feat(whatsapp): ...`.

## Frente WhatsApp / Integrações
- Antes de trabalhar nela, leia `docs/contexto-whatsapp.md` (estado, decisões, próximos passos) e
  `docs/integracao-whatsapp.md` (contratos para a equipe).
- Não alterar `services/conversations/`, `services/ai/`, `services/appointments/` nem o frontend. Se precisar
  de algo deles, pare e descreva o pedido.
- `models/` só para campos de integração, com migration Alembic e aviso prévio.
- Logs: nunca conteúdo de mensagem, corpo de webhook ou tokens; telefone sempre mascarado (`log_event(..., phone=...)`).
