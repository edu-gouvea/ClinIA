import os

import pytest


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch):
    """Garante que variáveis do ambiente do desenvolvedor não vazem para os testes."""
    for name in list(os.environ):
        if name.startswith(("WHATSAPP_", "SIMULATOR_")):
            monkeypatch.delenv(name, raising=False)
