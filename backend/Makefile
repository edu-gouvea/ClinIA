.PHONY: up down dev migrate revision seed test test-all test-cov lint format

UV = uv
PYTHON = .venv/bin/python
PYTEST = .venv/bin/pytest
ALEMBIC = .venv/bin/alembic
RUFF = .venv/bin/ruff

up:
	docker compose up -d --wait

down:
	docker compose down

dev:
	$(UV) run uvicorn app.main:create_app --factory --reload --host 0.0.0.0 --port 8000

migrate:
	$(ALEMBIC) upgrade head

revision:
	$(ALEMBIC) revision --autogenerate -m "$(m)"

seed:
	$(PYTHON) scripts/seed.py

test:
	$(PYTEST) -v

test-all:
	$(PYTEST) -v -m ""

test-cov:
	$(PYTEST) --cov=app --cov-report=term-missing --cov-report=html -v

lint:
	$(RUFF) check .

format:
	$(RUFF) format .
	$(RUFF) check --fix .
