"""Critério de aceitação: nenhum outro módulo chama a API da Meta diretamente."""

from pathlib import Path

APP = Path(__file__).resolve().parents[1]


def _source_files():
    for path in APP.rglob("*.py"):
        if "tests" not in path.relative_to(APP).parts:
            yield path, path.read_text(encoding="utf-8")


def test_only_the_cloud_gateway_builds_graph_api_requests():
    # "messaging_product" é obrigatório em todo envio para a Cloud API
    builders = {
        str(path.relative_to(APP)) for path, source in _source_files() if '"messaging_product"' in source
    }
    assert builders == {"services/whatsapp/cloud_gateway.py"}


def test_http_client_is_used_only_inside_the_whatsapp_module():
    offenders = [
        str(path.relative_to(APP))
        for path, source in _source_files()
        if ("import httpx" in source or "import requests" in source)
        and path.relative_to(APP).parts[:2] != ("services", "whatsapp")
    ]
    assert offenders == []
