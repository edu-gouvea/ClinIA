"""Testes unitários para a hierarquia de erros."""

from app.core.errors import (
    BusinessRuleError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)


def test_not_found_error_status():
    err = NotFoundError("não achei")
    resp = err.to_response()
    assert resp.status_code == 404


def test_conflict_error_code():
    err = ConflictError()
    resp = err.to_response()
    import json
    body = json.loads(resp.body)
    assert body["error"]["code"] == "CONFLICT"


def test_business_rule_error_with_details():
    err = BusinessRuleError("regra violada", details={"campo": "data"})
    resp = err.to_response()
    import json
    body = json.loads(resp.body)
    assert body["error"]["details"] == {"campo": "data"}


def test_forbidden_error_status():
    err = ForbiddenError()
    assert err.status_code == 403
