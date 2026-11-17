"""Dependências compartilhadas das rotas FastAPI.

Autenticação e extração de clinic_id serão implementadas na Fase 1.
"""



from app.core.database import get_db as _get_db

# Re-exporta get_db para que as rotas importem apenas de api.deps
get_db = _get_db
