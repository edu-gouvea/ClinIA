# CLAUDE.md — Convenções do backend ClinIA

Estas convenções valem para **todas as fases** de implementação.

---

## Camadas

| Camada | Responsabilidade |
|--------|-----------------|
| **Rotas** (`app/api/routes/`) | Finas: validam entrada, checam perfil, chamam o service e devolvem a resposta. Sem lógica de negócio. |
| **Services** (`app/services/`) | Regras de negócio, orquestração, publicação de eventos. |
| **Repositories** (`app/repositories/`) | Único lugar com SQL. Sempre recebem `clinic_id`. |
| **Models** (`app/models/`) | SQLAlchemy 2.0 com `Mapped[T]`. |
| **Schemas** (`app/schemas/`) | Pydantic v2 — contratos de entrada/saída da API. |

---

## Multi-clínica

- Toda tabela, exceto `clinics`, tem coluna `clinic_id`.
- Nenhuma consulta de repository sem filtro de `clinic_id`.
- Recurso de outra clínica responde **404** (não 403, para não vazar existência).

---

## Datas e fusos

- Persistir sempre `TIMESTAMPTZ` em UTC.
- Calcular e exibir no fuso da clínica usando `zoneinfo`.
- Nunca usar `datetime.now()` sem `tz`; usar `datetime.now(UTC)`.

---

## LGPD

- **Nunca** guardar diagnóstico, exame, medicamento ou histórico médico.
- Não logar conteúdo de mensagens.
- Mascarar telefone nos logs (ex.: `+55 11 ****-5678`).
- Dados de paciente com retenção mínima necessária.

---

## API

- Prefixo `/api/v1`.
- Paginação padrão: `{"items": [...], "total": N, "page": N, "page_size": N}`.
- Erros sempre no formato de `core/errors.py`: `{"error": {"code", "message", "details"}}`.
- Nomes de campos seguem `docs/api-contract.md` (a criar por fase).

---

## Testes

- Toda funcionalidade nova vem com testes.
- Testes de integração isolados em transação revertida (ver `tests/conftest.py`).
- Rodar `make lint` e `make test` antes de encerrar cada fase.

---

## CRM

- O CRM fica em `[CAMINHO_DO_CRM]` (variável de ambiente `CAMINHO_DO_CRM`).
- É a referência do que as telas precisam; o backend deve alinhar contratos de API com o que o CRM espera.

---

## Commits

- Padrão Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.
- Commits pequenos e atômicos.
- Nunca fazer push/PR — apenas o responsável sobe código.

---

## Encerramento de fase

Ao terminar cada fase:
1. Rodar `make lint` e `make test` — tudo passando.
2. Acrescentar ao `README.md` a seção `## Fase N — <título>` com tudo que foi implementado.
3. Fazer commits no padrão acima na branch da fase.
