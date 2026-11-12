# Entrega do integrante 5 — banco, testes e qualidade

## Entregue nesta proposta

- Modelo ER, dicionário extraído do PostgreSQL e decisões de integração.
- Baseline SQL transacional, 16 tabelas, duas views e dados administrativos fictícios.
- Isolamento por clínica com FKs compostas e RLS, preservação de histórico e proteção de agenda por exclusão GiST.
- Testes executáveis de integridade, idempotência, RLS e concorrência real.
- Ambiente Docker Compose local, instruções de backup e workflow de CI.
- Matriz de cobertura com resultados executados e limitações.

## Próximas ações compartilhadas

| Pessoa | Alinhamento necessário | Critério de conclusão |
|---|---|---|
| 1 — backend | Incorporar schema como baseline Alembic, mapear ORM e implementar transações | Banco gerado por migration e testes de integração aprovados |
| 2 — IA | Definir tools usando serviços autorizados de agenda | Agente não escreve SQL diretamente e respeita contexto da clínica |
| 3 — WhatsApp | Definir identidade externa, idempotência e tentativas de envio | Webhook repetido não duplica mensagem nem agendamento |
| 4 — frontend | Adaptar tipos, datas/fuso e respostas da API | Fluxo paciente → consulta → agenda usa persistência real |
| 5 — banco/qualidade | Ampliar testes para API e revisar planos de consulta | Casos críticos com evidência automatizada |
| 6 — DevOps/documentação | Provisionar papel restrito, segredos, backup e implantação | API não usa superusuário e restauração é demonstrada |

## Tarefas que ainda podem ser adiantadas individualmente

- Revisar a proposta com os requisitos oficiais após eventuais alterações do professor.
- Preparar cenários de API para profissional inativo, expediente, futuro, remarcação e disputa para assumir conversa.
- Analisar índices com EXPLAIN usando volume fictício representativo depois de conhecidos filtros e consultas reais.

Não há publicação ou push automático nesta entrega. As alterações estão na branch local `feature/database-foundation`. Sugestão de PR: **Adiciona proposta PostgreSQL do ClinIA com testes de integridade e concorrência**.
