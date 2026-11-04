from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app(Settings(_env_file=None)))

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
