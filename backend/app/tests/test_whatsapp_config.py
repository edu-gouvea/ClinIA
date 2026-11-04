import pytest
from pydantic import ValidationError

from app.core.config import Settings, WhatsAppMode

CLOUD_CREDENTIALS = {
    "whatsapp_access_token": "token",
    "whatsapp_phone_number_id": "123",
    "whatsapp_app_secret": "secret",
    "whatsapp_verify_token": "verify",
    "whatsapp_graph_version": "v23.0",
}


def test_simulator_mode_requires_no_credentials():
    settings = Settings(_env_file=None)

    assert settings.whatsapp_mode is WhatsAppMode.SIMULATOR
    assert settings.simulator_active


def test_cloud_mode_with_all_credentials_starts():
    settings = Settings(_env_file=None, whatsapp_mode="cloud", **CLOUD_CREDENTIALS)

    assert settings.whatsapp_mode is WhatsAppMode.CLOUD
    assert not settings.simulator_active


@pytest.mark.parametrize("missing", sorted(CLOUD_CREDENTIALS))
def test_cloud_mode_fails_when_a_credential_is_missing(missing):
    values = {**CLOUD_CREDENTIALS, missing: ""}

    with pytest.raises(ValidationError, match=missing.upper()):
        Settings(_env_file=None, whatsapp_mode="cloud", **values)


def test_cloud_mode_reads_from_environment(monkeypatch):
    monkeypatch.setenv("WHATSAPP_MODE", "cloud")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_simulator_can_be_forced_on_in_cloud_mode():
    settings = Settings(
        _env_file=None, whatsapp_mode="cloud", simulator_enabled=True, **CLOUD_CREDENTIALS
    )
    assert settings.simulator_active


def test_secrets_do_not_leak_in_repr():
    settings = Settings(_env_file=None, whatsapp_mode="cloud", **CLOUD_CREDENTIALS)
    assert "secret'" not in repr(settings)
    assert "token'" not in repr(settings)
