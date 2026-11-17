# Mapeamento CRM → API

Cada tela do CRM com os endpoints que consome e os eventos WebSocket que a mantém atualizada.

---

## Telas do CRM

### 1. Início (`/inicio`)

**Descrição:** Dashboard do dia a dia — KPIs do período selecionado, fila de pendências, próximas consultas e horários livres.

**Dados exibidos:**
- Consultas realizadas, ocupação, taxa de faltas, em aberto (período)
- Consultas pendentes de hoje com horário e profissional
- Horários livres hoje
- Contagens de conversas: aguardando atendente, com IA, em atendimento humano
- Pedidos de remarcação em conversas abertas
- Confirmações de hoje pendentes
- Gráfico diário (realizadas / faltas / canceladas / em aberto)

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/dashboard/summary?days=7` | KPIs, `today`, `professionals`, `dailyBreakdown` |
| GET | `/slots?dateFrom=hoje&dateTo=hoje` | contagem de horários livres |
| GET | `/appointments?dateFrom=hoje&status=pending&status=confirmed` | lista "próximos de hoje" |

**Eventos WebSocket (`/ws/events`):**
- `appointment.created` / `appointment.updated` — atualiza KPIs e lista do dia
- `conversation.updated` / `handoff.requested` — atualiza contagens de fila

---

### 2. Conversas (`/conversas`)

**Descrição:** Inbox em três colunas — lista de conversas com filtros, histórico de mensagens, painel contextual (paciente + assistente IA).

**Dados exibidos:**
- Lista de conversas com tabs: Pendentes / Em atendimento / Finalizadas
- Filtro por motivo (remarcação) e responsável
- Histórico de mensagens com indicador de entrega
- Próximas consultas do paciente no painel contextual
- Dados cadastrais do paciente (nome, telefone, convênio, observações)
- Horários livres sugeridos pelo assistente
- Histórico de handoffs da conversa

**Ações:**
- Assumir conversa (`assign`)
- Devolver à IA (`release`)
- Encerrar conversa (`close`)
- Enviar mensagem
- Remarcar consulta (abre agenda)

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/conversations?status=waiting_human` | aba Pendentes |
| GET | `/conversations?status=human,bot` | aba Em atendimento |
| GET | `/conversations?status=closed` | aba Finalizadas |
| GET | `/conversations/{id}/messages` | histórico de mensagens |
| POST | `/conversations/{id}/messages` | enviar mensagem |
| POST | `/conversations/{id}/assign` | assumir conversa |
| POST | `/conversations/{id}/release` | devolver à IA |
| POST | `/conversations/{id}/close` | encerrar |
| GET | `/patients/{id}` | dados do paciente no painel |
| GET | `/appointments?patientId={id}&status=pending,confirmed` | próximas consultas no painel |
| GET | `/slots?patientId={id}&dateFrom=hoje` | horários livres para o assistente |

**Eventos WebSocket (`/ws/events`):**
- `message.created` — nova mensagem aparece em tempo real
- `conversation.created` — nova conversa entra na lista
- `conversation.updated` — mudança de status atualiza badge e posição na lista
- `handoff.requested` — entra na aba Pendentes com notificação

---

### 3. Agenda (`/gestao/agenda`)

**Descrição:** Calendário com visão diária (todos os profissionais em colunas) ou semanal (profissional selecionado). Grade proporcional por horário, consultas simultâneas lado a lado.

**Dados exibidos:**
- Consultas por profissional com status colorido
- Horários livres para agendamento
- Bloqueios do dia/semana
- Detalhes da consulta selecionada
- Painel de bloqueios laterais

**Ações:**
- Novo agendamento (modal de booking)
- Remarcar consulta
- Confirmar / cancelar / registrar realizada / registrar falta
- Adicionar bloqueio
- Filtros por profissional, especialidade, status, data

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/appointments?dateFrom=&dateTo=&professionalId=` | grade de agendamentos |
| GET | `/slots?professionalId=&dateFrom=&dateTo=` | horários livres na grade e no modal |
| POST | `/appointments` | novo agendamento |
| POST | `/appointments/{id}/confirm` | confirmar |
| POST | `/appointments/{id}/cancel` | cancelar |
| POST | `/appointments/{id}/complete` | registrar realizada |
| POST | `/appointments/{id}/no-show` | registrar falta |
| POST | `/appointments/{id}/reschedule` | remarcar |
| GET | `/availability-blocks?professionalId=&from=&to=` | bloqueios exibidos |
| POST | `/availability-blocks` | novo bloqueio |
| DELETE | `/availability-blocks/{id}` | remover bloqueio |
| GET | `/professionals?isActive=true` | lista de profissionais para filtro |

**Eventos WebSocket (`/ws/events`):**
- `appointment.created` / `appointment.updated` — atualiza grade em tempo real

---

### 4. Pacientes (`/gestao/pacientes`)

**Descrição:** Lista com busca/filtros e ficha completa do paciente com abas (Atividade, Consultas, Conversas, Anotações).

**Dados exibidos:**
- Lista: nome, telefone, convênio
- Ficha: dados cadastrais, pendências, próximas consultas, histórico de conversas, anotações administrativas de consultas

**Ações:**
- Cadastrar / editar paciente
- Ver agenda do paciente
- Remarcar consulta diretamente da ficha
- Confirmar consulta da ficha

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/patients?q=&insuranceId=&page=` | listagem |
| POST | `/patients` | cadastrar |
| GET | `/patients/{id}` | ficha completa |
| PATCH | `/patients/{id}` | editar |
| GET | `/patients/{id}/appointments` | aba Consultas |
| GET | `/conversations?patientId={id}` | aba Conversas |
| GET | `/insurances?isActive=true` | dropdown de convênios no formulário |

---

### 5. Equipe (`/gestao/equipe`)

**Descrição:** Lista de profissionais com métricas de período e detalhamento individual (atividade, agenda, disponibilidade).

**Dados exibidos (lista):**
- Nome, especialidades, carga semanal, ocupação, consultas previstas/realizadas
- Badge ativo/inativo

**Dados exibidos (detalhe do profissional):**
- Métricas: consultas assumidas, encerradas, em atendimento (para atendentes)
- Tempo médio de assumir / responder
- Histórico de eventos de conversa e agendamento
- Disponibilidade semanal editável

**Ações:**
- Cadastrar / editar profissional (nome, especialidades, disponibilidade, cor, duração padrão)
- Inativar profissional (preserva histórico, sinaliza consultas futuras)
- Editar disponibilidade semanal

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/professionals?page=` | listagem de profissionais |
| POST | `/professionals` | cadastrar |
| GET | `/professionals/{id}` | detalhe |
| PATCH | `/professionals/{id}` | editar |
| DELETE | `/professionals/{id}` | desativar |
| PUT | `/professionals/{id}/specialties` | atualizar especialidades |
| GET | `/professionals/{id}/availability-rules` | regras de disponibilidade |
| PUT | `/professionals/{id}/availability-rules` | atualizar disponibilidade |
| GET | `/dashboard/summary?professionalId=&days=` | métricas individuais |
| GET | `/specialties?isActive=true` | dropdown de especialidades |
| GET | `/users?role=attendant` | lista de atendentes (aba Equipe) |

---

### 6. Configurações (`/gestao/configuracoes`)

**Descrição:** Dados da clínica, horário de funcionamento, convênios, especialidades, disponibilidade de profissionais, bloqueios e base de conhecimento administrativa.

**Dados exibidos:**
- Formulário da clínica: nome, telefone, endereço, timezone
- Horário de funcionamento (grade por dia da semana)
- Listas: convênios, especialidades
- Disponibilidade por profissional
- Bloqueios por profissional (data, horário, motivo)
- Documentos de base de conhecimento com título, categoria e conteúdo

**Ações:**
- Salvar dados da clínica
- Editar horário de funcionamento
- CRUD de convênios
- CRUD de especialidades
- Editar disponibilidade por profissional
- CRUD de bloqueios
- CRUD de documentos de conhecimento
- Arquivar (desativar) documento

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/clinics/me` | dados da clínica e settings |
| PATCH | `/clinics/me` | salvar dados e horário de funcionamento |
| GET | `/insurances` | lista de convênios |
| POST | `/insurances` | criar convênio |
| PATCH | `/insurances/{id}` | editar |
| DELETE | `/insurances/{id}` | desativar |
| GET | `/specialties` | lista de especialidades |
| POST | `/specialties` | criar |
| PATCH | `/specialties/{id}` | editar |
| DELETE | `/specialties/{id}` | desativar |
| GET | `/professionals/{id}/availability-rules` | disponibilidade do profissional |
| PUT | `/professionals/{id}/availability-rules` | atualizar disponibilidade |
| GET | `/availability-blocks?professionalId=` | bloqueios |
| POST | `/availability-blocks` | novo bloqueio |
| DELETE | `/availability-blocks/{id}` | remover bloqueio |
| GET | `/knowledge-documents` | lista de documentos |
| POST | `/knowledge-documents` | criar documento |
| PATCH | `/knowledge-documents/{id}` | editar |
| DELETE | `/knowledge-documents/{id}` | arquivar |

---

### 7. Visão Gerencial (`/gestao/visao-gerencial`)

**Descrição:** Dashboard gerencial com comparação de períodos, breakdown por profissional/especialidade e tabela de atividade.

**Dados exibidos:**
- Mesmos KPIs do Início + comparação com período anterior
- Tabela por profissional: realizadas, ocupação, faltas, canceladas, em aberto
- Gráfico diário empilhado
- Breakdown de resultados (realizadas / faltas / canceladas)

**Ações:**
- Filtrar por período (1/7/30 dias)
- Filtrar por profissional ou especialidade
- Ordenar tabela

**Endpoints:**
| Método | Rota | Uso |
|--------|------|-----|
| GET | `/dashboard/summary?days=&professionalId=&specialtyId=` | todos os dados da tela |

**Eventos WebSocket:** não usa (dados de período fechado; pode usar polling em futuras versões).

---

## Resumo de eventos WebSocket por tela

| Tela | Eventos consumidos |
|------|--------------------|
| Início | `appointment.created`, `appointment.updated`, `conversation.updated`, `handoff.requested` |
| Conversas | `message.created`, `conversation.created`, `conversation.updated`, `handoff.requested` |
| Agenda | `appointment.created`, `appointment.updated` |
| Pacientes | `appointment.updated` (atualiza status na ficha) |
| Equipe | — (dados históricos; não requer tempo real) |
| Configurações | — |
| Visão Gerencial | — |
