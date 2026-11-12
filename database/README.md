# Banco ClinIA — entrega do integrante 5

Proposta inicial baseada no planejamento e em `src/lib/types.ts` da main d530b1b. PostgreSQL 16+, extensão `btree_gist`. Não altera o frontend. Os tipos da demonstração não são um contrato de API.

## Subir localmente

Requisitos: Docker com Compose e Python 3.10+ para os testes.

```bash
# Na raiz do repositório. Escolha uma senha exclusiva para desenvolvimento.
export CLINIA_DB_PASSWORD='troque-esta-senha-local'
docker compose -f database/compose.yaml up -d --wait
# Executar apenas em uma base nova, uma única vez:
docker compose -f database/compose.yaml exec -T db psql -X -U postgres -d clinia -v ON_ERROR_STOP=1 < database/schema.sql
docker compose -f database/compose.yaml exec -T db psql -X -U postgres -d clinia -v ON_ERROR_STOP=1 < database/seed.sql
```

Conexão de desenvolvimento: host `localhost`, porta `5433`, banco `clinia`, usuário `postgres`, senha definida acima. O serviço escuta somente em localhost. `CLINIA_DB_PORT` permite escolher outra porta. O volume persiste entre reinícios. Os scripts usam transações e falham se a estrutura/dados já existirem; não apagam dados existentes.

Datas do seed são fixas em novembro de 2030, independentes do relógio da demonstração do frontend. Telefones compartilhados são intencionais. Não há senha de aplicação nem login utilizável no seed (`password_hash` nulo).

## Executar testes

```bash
container_id=$(docker compose -f database/compose.yaml ps -q db)
python3 database/tests/run.py --container "$container_id"
```

O runner cria uma base com nome aleatório, aplica schema/seed, testa integridade e concorrência e remove exclusivamente essa base no `finally`. Nunca aponta os testes à base `clinia`. Execute em instância dedicada ao desenvolvimento: o usuário precisa criar bancos e papéis para verificar RLS como usuário sem privilégios. O teste SQL reverte suas alterações. Não há dependência Python externa. A automação está em `.github/workflows/database.yml`.

## Papel da aplicação e isolamento

`postgres` é somente proprietário/teste local. Nunca use superusuário, proprietário com privilégios administrativos ou `BYPASSRLS` na API. Criar o papel de aplicação é tarefa do provisionamento; senhas vêm do ambiente/gerenciador de segredos.

Exemplo de privilégios a executar pelo administrador (papel previamente provisionado):

```sql
GRANT USAGE ON SCHEMA clinia TO clinia_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA clinia TO clinia_app;
REVOKE UPDATE ON clinia.audit_events FROM clinia_app;
-- Não conceder DELETE, TRUNCATE, DDL ou BYPASSRLS.
```

Em CADA transação do backend, obter a clínica da sessão autenticada e parametrizar:

```sql
BEGIN;
SELECT set_config('clinia.clinic_id', :clinic_id, true);
SELECT * FROM clinia.appointments ORDER BY starts_at;
COMMIT;
```

`:clinic_id` é parâmetro do cliente SQL, não sintaxe para colar diretamente no psql. `true` limita o contexto à transação e evita vazamento em pool de conexões. Sem contexto, RLS nega os registros. A API não deve aceitar a clínica enviada pelo cliente sem verificar autorização. RLS limita clínicas, não implementa perfis/identidade; o backend implementa isso. As views usam `security_invoker=true`.

## Integração e evolução

Veja [modelo](../docs/banco/modelo-er.md), [dicionário](../docs/banco/dicionario-dados.md), [decisões](../docs/banco/decisoes-e-integracao.md), [testes](../docs/banco/testes.md) e [próximas tarefas](../docs/banco/entrega-integrante-5.md).

`schema.sql` é a versão inicial executável, não um gerenciador de migrations. Quando o backend Alembic existir, incorporar esta baseline em uma revisão transacional (sem os BEGIN/COMMIT externos), conferir o schema gerado e adotar apenas Alembic para evoluções. Não aplicar ambos na mesma base. Não foi criado um segundo backend ou ORM concorrente ao integrante 1.

## Parar e backup

```bash
docker compose -f database/compose.yaml exec -T db pg_dump -U postgres -d clinia -Fc > clinia-backup.dump
docker compose -f database/compose.yaml stop
```

Não versionar dumps. Testar restauração em base separada antes de depender do backup. Não usar `down -v` se quiser manter os dados. O Compose entregue é para desenvolvimento; TLS, credenciais, backups agendados e implantação dependem do ambiente de produção.
