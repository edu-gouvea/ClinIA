# Decisões e integração com o backend

## Decisões implementadas

- UUID como identificador. IDs textuais da demonstração não são migrados automaticamente.
- Clínica em todas as tabelas subordinadas, FKs compostas e RLS; views respeitam o usuário chamador.
- Telefone não é único: familiares podem compartilhar contato. A confirmação do vínculo pertence ao fluxo da aplicação.
- Especialidades são normalizadas; profissional/especialidade é N:N. Cadastro de paciente guarda o convênio informado como texto; `insurances` lista os aceitos pela clínica, preservando histórico se a lista mudar.
- Consultas e bloqueios na mesma tabela. Exclusão GiST impede sobreposição por profissional; uma segunda exclusão impede sobreposição por paciente. Canceladas não ocupam agenda; realizadas e faltas preservam ocupação histórica.
- Exclusão física de entidades relacionadas é restrita por FKs. Preferir inativação, cancelamento e arquivamento.
- Auditoria admite acréscimo e rejeita UPDATE/DELETE por trigger. O papel da API não deve receber TRUNCATE. Administradores continuam tendo capacidade de alterar a infraestrutura; não é trilha inviolável contra superusuário.
- Mensagens têm chave de idempotência por clínica e ID externo único quando presente. Tentativa de envio deve reutilizar a mesma chave e atualizar status, sem inserir outra mensagem.
- Uma sessão aberta por conversa. Sessões e mensagens preservam os atendimentos anteriores.
- Não há prontuário, diagnóstico, exames ou anotações clínicas. `administrative_notes` é exclusivamente administrativo. O frontend contém anotações de consulta que precisam ser revistas pelo grupo antes da persistência real.

## Mapeamento do frontend

| Frontend | Persistência / adaptação |
|---|---|
| `Clinic` | `clinics`, `clinic_hours`, `insurances`, `specialties` |
| `DemoUser` | `users`; identidade vem da autenticação real |
| `Patient` | `patients`; `notes` vira `administrative_notes` |
| `Professional.specialties` | join em `professional_specialties` e `specialties` |
| `Professional.availability` | `professional_availability` |
| `Block` | `calendar_entries(kind='block')` / view `calendar_blocks` |
| `Appointment` | `calendar_entries(kind='appointment')` / view `appointments` |
| `date`, `start`, `duration` | converter no fuso da clínica para `starts_at`/`ends_at`; retornar no formato combinado |
| `Conversation.sessionId` | sessão aberta em `conversation_sessions` |
| `Message` | `messages`; `authorId` humano vira `user_id` |
| `Knowledge` | `knowledge_documents` |
| `AdminEvent` | `audit_events`, com entidade/tipo e detalhes mínimos |
| histórico do assistente global | continua local até necessidade definida; não é agente de paciente |
| `ConsultationNote` | sem tabela nesta proposta; excede escopo administrativo inicial |

## Transações que o backend deve implementar

1. Autenticar, verificar perfil e estabelecer `set_config` local por transação.
2. Agendar/remarcar: validar profissional ativo, funcionamento, disponibilidade e futuro; gravar agenda + auditoria na mesma transação. Mapear `23P01` para conflito de horário (HTTP 409 recomendado), `23503` para relacionamento inválido e `23514` para dados incompatíveis.
3. Mudanças de disponibilidade/inativação: bloquear linha do profissional (`SELECT ... FOR UPDATE`) e revisar consultas afetadas. Usar a mesma ordem de locks nos fluxos concorrentes que alteram essas regras.
4. Assumir conversa: UPDATE condicional quando aguardando e sem responsável, testar retorno de uma linha, registrar encaminhamento/auditoria. Não fazer read-then-write sem condição/lock.
5. Encerrar/reabrir: bloquear conversa, fechar sessão e atualizar estado; reabertura cria sessão nova em transação. Mensagem referencia sessão, nunca uma sessão de outra clínica.
6. Salvar mensagem de saída de forma idempotente. Integração WhatsApp precisa estratégia de outbox/retry; o banco não promete envio externo exatamente uma vez.

## Limites deliberados

O banco não valida sozinho expediente, profissional ativo, horário futuro, transições de status, consistência do fechamento com status da conversa, autorização por perfil ou geração automática de eventos. São regras transacionais do serviço e precisam de testes quando a API existir. Não alegar que as FKs/RLS substituem essas regras.

Validar nome de fuso com biblioteca/IANA no backend. Normalizar e-mail e telefone antes de gravar; os CHECKs não substituem validação completa. `password_hash` nulo significa login não habilitado; só armazenar hash de senha com algoritmo adequado, nunca senha em texto.

Pendências para alinhar: contratos JSON, estados/transições oficiais, duração e fuso, provedor de autenticação, retenção/LGPD e quem incorpora a baseline no Alembic. Cada mudança posterior requer migration revisada, não edição retroativa de uma baseline aplicada.
