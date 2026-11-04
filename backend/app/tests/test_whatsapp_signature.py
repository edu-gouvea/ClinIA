import pytest

from app.services.whatsapp.signature import sign_body, verify_signature

SECRET = "app-secret-de-teste"
BODY = b'{"object":"whatsapp_business_account","entry":[]}'


def test_correctly_signed_body_is_accepted():
    assert verify_signature(BODY, sign_body(BODY, SECRET), SECRET)


def test_uppercase_hex_is_accepted():
    header = sign_body(BODY, SECRET)
    assert verify_signature(BODY, "sha256=" + header.removeprefix("sha256=").upper(), SECRET)


def test_body_altered_after_signing_is_rejected():
    header = sign_body(BODY, SECRET)
    assert not verify_signature(BODY.replace(b"[]", b"[{}]"), header, SECRET)


def test_reserialized_json_is_rejected():
    # Re-serializar muda os bytes: a assinatura vale só para o corpo bruto
    header = sign_body(BODY, SECRET)
    assert not verify_signature(BODY.replace(b",", b", "), header, SECRET)


def test_wrong_secret_is_rejected():
    assert not verify_signature(BODY, sign_body(BODY, "outro-segredo"), SECRET)


@pytest.mark.parametrize(
    "header",
    [None, "", "sha256=", "abc123", "sha1=" + "0" * 40, "sha256=não-hex-ç"],
    ids=["ausente", "vazio", "prefixo-sem-hex", "sem-prefixo", "sha1", "nao-ascii"],
)
def test_missing_or_malformed_header_is_rejected(header):
    assert not verify_signature(BODY, header, SECRET)


def test_empty_secret_is_rejected():
    assert not verify_signature(BODY, sign_body(BODY, ""), "")
