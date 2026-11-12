# Testes e evidências — banco

## Resultado executado

Em 12/11/2026, executado `python database/tests/run.py --container clinia-db-validation` em PostgreSQL 16 oficial via Docker. Resultado final: schema, seed, integridade, RLS e concorrência aprovados; banco descartável removido. O dicionário foi extraído de uma segunda base temporária: 16 tabelas, 112 campos e 99 constraints de catálogo (além de índices, políticas, triggers e views).

O teste concorrente abre duas conexões reais. A primeira reserva o intervalo e mantém a transação aberta por dois segundos; a segunda tenta reservar o mesmo intervalo. Uma transação confirma; a outra recebe `23P01`. A contagem final confirma uma única reserva. Não é uma simulação em memória.

## Matriz de cobertura

| Requisito / regra | Verificação | Resultado |
|---|---|---|
| RF01–04: clínicas, profissionais, especialidades, horários | Criação e seed relacional, vínculos obrigatórios | Aprovado no banco; CRUD API pendente |
| RF05–06/RF16: mensagens e histórico | Sessões, FKs, chave de mensagem duplicada, sessão aberta única | Aprovado |
| RF09–10: disponibilidade/agendamento | Conflito parcial por profissional, paciente em outro profissional, bloqueio e duração | Aprovado; cálculo de disponibilidade pendente da API |
| RF10: concorrência | Duas transações reservando mesma vaga | Aprovado |
| RF11: cancelamento | Cancelada não ocupa intervalo; nova reserva aceita | Aprovado |
| RF12: remarcação | UPDATE usa mesmas exclusões; fluxo transacional e auditoria da API ainda não existem | Parcial |
| RF13–15: atendimento humano | Estado humano exige responsável; FK de sessão/atendente | Parcial; disputa para assumir depende da API |
| RF18: conhecimento | Seed e constraints de título/conteúdo | Aprovado no banco |
| RF19: auditoria | Evento de exemplo e rejeição de UPDATE | Aprovado no banco; geração por operação pendente |
| RNF01: segregação | RLS sem contexto, contexto de outra clínica, escrita indevida e view sem contexto | Aprovado com papel sem BYPASSRLS |
| RNF01: vínculos entre clínicas | FK com profissional existente em outra clínica | Aprovado |
| RNF02: minimização | Ausência de tabelas de prontuário; dados fictícios | Revisão estrutural |
| Integridade | Status inválido, fim anterior, telefone inválido e exclusão de paciente referenciado | Aprovado |
| Telefone compartilhado | Dois pacientes com mesmo telefone | Aceito conforme frontend |
| RF07–08: IA e RF20: autenticação | Requerem serviços externos/backend | Não executado |

## Não verificado

Integração FastAPI/SQLAlchemy/Alembic, endpoints, WhatsApp, LLM, autenticação, carga/latência, restauração de backup e interface navegável. A suite frontend existente não foi reexecutada: nenhum código frontend foi alterado. O workflow GitHub foi escrito, mas ainda não foi executado pelo GitHub. Compose foi validado sintaticamente; o teste local usou container isolado sem publicação de porta.

## Como registrar falhas futuras

Informar cenário, versão do PostgreSQL, revisão Git, comando, SQLSTATE, resultado esperado/obtido e passos mínimos. Não anexar dados reais, senhas, dumps de pacientes ou logs com tokens.
