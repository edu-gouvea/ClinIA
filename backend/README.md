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
