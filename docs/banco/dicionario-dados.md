# Dicionário de dados — PostgreSQL

Extraído do catálogo de um PostgreSQL 16 após aplicar `database/schema.sql`. Tipos, nulabilidade, defaults e constraints abaixo refletem a estrutura validada. UUIDs são globais; `UNIQUE(clinic_id,id)` permite FKs compostas. `created_at` é imutável por convenção do serviço, não por trigger.

## `audit_events`

Eventos de auditoria; detalhes mínimos sem conteúdo clínico.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `actor_id` | `uuid` | YES | `—` |
| `event_type` | `text` | NO | `—` |
| `entity_type` | `text` | NO | `—` |
| `entity_id` | `uuid` | NO | `—` |
| `details` | `jsonb` | NO | `'{}'::jsonb` |

Restrições:

- `audit_events_clinic_id_actor_id_fkey`: `FOREIGN KEY (clinic_id, actor_id) REFERENCES clinia.users(clinic_id, id)`
- `audit_events_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `audit_events_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `audit_events_details_check`: `CHECK ((jsonb_typeof(details) = 'object'::text))`
- `audit_events_pkey`: `PRIMARY KEY (id)`

## `calendar_entries`

Consultas e bloqueios; origem das duas views da agenda.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `professional_id` | `uuid` | NO | `—` |
| `patient_id` | `uuid` | YES | `—` |
| `specialty_id` | `uuid` | YES | `—` |
| `kind` | `text` | NO | `—` |
| `starts_at` | `timestamp with time zone` | NO | `—` |
| `ends_at` | `timestamp with time zone` | NO | `—` |
| `status` | `text` | NO | `—` |
| `reason` | `text` | NO | `''::text` |
| `created_by` | `uuid` | YES | `—` |

Restrições:

- `calendar_entries_check`: `CHECK ((ends_at > starts_at))`
- `calendar_entries_check1`: `CHECK ((((kind = 'block'::text) AND (patient_id IS NULL) AND (specialty_id IS NULL) AND (status = ANY (ARRAY['bloqueado'::text, 'cancelada'::text]))) OR ((kind = 'appointment'::text) AND (patient_id IS NOT NULL) AND (specialty_id IS NOT NULL) AND (status <> 'bloqueado'::text))))`
- `calendar_entries_check2`: `CHECK (((kind = 'block'::text) OR (((ends_at - starts_at) >= '00:15:00'::interval) AND ((ends_at - starts_at) <= '04:00:00'::interval))))`
- `calendar_entries_clinic_id_created_by_fkey`: `FOREIGN KEY (clinic_id, created_by) REFERENCES clinia.users(clinic_id, id)`
- `calendar_entries_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `calendar_entries_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `calendar_entries_clinic_id_patient_id_fkey`: `FOREIGN KEY (clinic_id, patient_id) REFERENCES clinia.patients(clinic_id, id)`
- `calendar_entries_clinic_id_professional_id_fkey`: `FOREIGN KEY (clinic_id, professional_id) REFERENCES clinia.professionals(clinic_id, id)`
- `calendar_entries_clinic_id_professional_id_specialty_id_fkey`: `FOREIGN KEY (clinic_id, professional_id, specialty_id) REFERENCES clinia.professional_specialties(clinic_id, professional_id, specialty_id)`
- `calendar_entries_kind_check`: `CHECK ((kind = ANY (ARRAY['appointment'::text, 'block'::text])))`
- `calendar_entries_pkey`: `PRIMARY KEY (id)`
- `calendar_entries_status_check`: `CHECK ((status = ANY (ARRAY['agendada'::text, 'confirmada'::text, 'cancelada'::text, 'realizada'::text, 'falta'::text, 'bloqueado'::text])))`
- `patient_no_overlap`: `EXCLUDE USING gist (clinic_id WITH =, patient_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE (((kind = 'appointment'::text) AND (status <> 'cancelada'::text)))`
- `professional_no_overlap`: `EXCLUDE USING gist (clinic_id WITH =, professional_id WITH =, tstzrange(starts_at, ends_at, '[)'::text) WITH &&) WHERE ((status <> 'cancelada'::text))`

## `clinic_hours`

Faixas semanais de funcionamento.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `weekday` | `smallint` | NO | `—` |
| `starts_at` | `time without time zone` | NO | `—` |
| `ends_at` | `time without time zone` | NO | `—` |

Restrições:

- `clinic_hours_check`: `CHECK ((starts_at < ends_at))`
- `clinic_hours_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `clinic_hours_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `clinic_hours_pkey`: `PRIMARY KEY (id)`
- `clinic_hours_weekday_check`: `CHECK (((weekday >= 0) AND (weekday <= 6)))`

## `clinics`

Dados administrativos da clínica e fuso de apresentação.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `name` | `text` | NO | `—` |
| `address` | `text` | NO | `''::text` |
| `phone` | `text` | NO | `''::text` |
| `timezone` | `text` | NO | `'America/Recife'::text` |
| `created_at` | `timestamp with time zone` | NO | `now()` |

Restrições:

- `clinics_name_check`: `CHECK ((btrim(name) <> ''::text))`
- `clinics_pkey`: `PRIMARY KEY (id)`

## `conversation_sessions`

Sessões de atendimento e reabertura.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `conversation_id` | `uuid` | NO | `—` |
| `opened_at` | `timestamp with time zone` | NO | `now()` |
| `closed_at` | `timestamp with time zone` | YES | `—` |

Restrições:

- `conversation_sessions_check`: `CHECK (((closed_at IS NULL) OR (closed_at >= opened_at)))`
- `conversation_sessions_clinic_id_conversation_id_fkey`: `FOREIGN KEY (clinic_id, conversation_id) REFERENCES clinia.conversations(clinic_id, id)`
- `conversation_sessions_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `conversation_sessions_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `conversation_sessions_pkey`: `PRIMARY KEY (id)`

## `conversations`

Atendimento e responsável atual.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `patient_id` | `uuid` | NO | `—` |
| `status` | `text` | NO | `'ia'::text` |
| `assignee_id` | `uuid` | YES | `—` |

Restrições:

- `conversations_check`: `CHECK ((((status = 'humano'::text) AND (assignee_id IS NOT NULL)) OR ((status <> 'humano'::text) AND (assignee_id IS NULL))))`
- `conversations_clinic_id_assignee_id_fkey`: `FOREIGN KEY (clinic_id, assignee_id) REFERENCES clinia.users(clinic_id, id)`
- `conversations_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `conversations_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `conversations_clinic_id_patient_id_fkey`: `FOREIGN KEY (clinic_id, patient_id) REFERENCES clinia.patients(clinic_id, id)`
- `conversations_pkey`: `PRIMARY KEY (id)`
- `conversations_status_check`: `CHECK ((status = ANY (ARRAY['ia'::text, 'aguardando'::text, 'humano'::text, 'encerrada'::text])))`

## `human_handoffs`

Solicitações e acompanhamento de atendimento humano.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `session_id` | `uuid` | NO | `—` |
| `reason` | `text` | NO | `—` |
| `requested_at` | `timestamp with time zone` | NO | `now()` |
| `claimed_at` | `timestamp with time zone` | YES | `—` |
| `resolved_at` | `timestamp with time zone` | YES | `—` |
| `assignee_id` | `uuid` | YES | `—` |

Restrições:

- `human_handoffs_check`: `CHECK (((claimed_at IS NULL) OR (claimed_at >= requested_at)))`
- `human_handoffs_check1`: `CHECK (((resolved_at IS NULL) OR (resolved_at >= COALESCE(claimed_at, requested_at))))`
- `human_handoffs_clinic_id_assignee_id_fkey`: `FOREIGN KEY (clinic_id, assignee_id) REFERENCES clinia.users(clinic_id, id)`
- `human_handoffs_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `human_handoffs_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `human_handoffs_clinic_id_session_id_fkey`: `FOREIGN KEY (clinic_id, session_id) REFERENCES clinia.conversation_sessions(clinic_id, id)`
- `human_handoffs_pkey`: `PRIMARY KEY (id)`

## `insurances`

Convênios aceitos.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `name` | `text` | NO | `—` |
| `active` | `boolean` | NO | `true` |

Restrições:

- `insurances_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `insurances_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `insurances_clinic_id_name_key`: `UNIQUE (clinic_id, name)`
- `insurances_name_check`: `CHECK ((btrim(name) <> ''::text))`
- `insurances_pkey`: `PRIMARY KEY (id)`

## `knowledge_documents`

Base de conhecimento administrativa.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `title` | `text` | NO | `—` |
| `category` | `text` | NO | `'FAQ'::text` |
| `content` | `text` | NO | `—` |
| `archived` | `boolean` | NO | `false` |

Restrições:

- `knowledge_documents_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `knowledge_documents_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `knowledge_documents_content_check`: `CHECK ((btrim(content) <> ''::text))`
- `knowledge_documents_pkey`: `PRIMARY KEY (id)`
- `knowledge_documents_title_check`: `CHECK ((btrim(title) <> ''::text))`

## `messages`

Mensagens, estado de entrega e idempotência.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `session_id` | `uuid` | NO | `—` |
| `author` | `text` | NO | `—` |
| `user_id` | `uuid` | YES | `—` |
| `body` | `text` | NO | `—` |
| `delivery` | `text` | NO | `'pendente'::text` |
| `external_id` | `text` | YES | `—` |
| `idempotency_key` | `text` | NO | `—` |

Restrições:

- `messages_author_check`: `CHECK ((author = ANY (ARRAY['paciente'::text, 'ia'::text, 'humano'::text, 'evento'::text])))`
- `messages_body_check`: `CHECK ((btrim(body) <> ''::text))`
- `messages_check`: `CHECK (((author <> 'humano'::text) OR (user_id IS NOT NULL)))`
- `messages_clinic_id_external_id_key`: `UNIQUE (clinic_id, external_id)`
- `messages_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `messages_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `messages_clinic_id_idempotency_key_key`: `UNIQUE (clinic_id, idempotency_key)`
- `messages_clinic_id_session_id_fkey`: `FOREIGN KEY (clinic_id, session_id) REFERENCES clinia.conversation_sessions(clinic_id, id)`
- `messages_clinic_id_user_id_fkey`: `FOREIGN KEY (clinic_id, user_id) REFERENCES clinia.users(clinic_id, id)`
- `messages_delivery_check`: `CHECK ((delivery = ANY (ARRAY['pendente'::text, 'enviada'::text, 'falha'::text])))`
- `messages_idempotency_key_check`: `CHECK ((btrim(idempotency_key) <> ''::text))`
- `messages_pkey`: `PRIMARY KEY (id)`

## `patients`

Cadastro administrativo, inclusive telefone compartilhado.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `name` | `text` | NO | `—` |
| `phone` | `text` | NO | `—` |
| `insurance` | `text` | NO | `''::text` |
| `administrative_notes` | `text` | NO | `''::text` |
| `active` | `boolean` | NO | `true` |

Restrições:

- `patients_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `patients_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `patients_name_check`: `CHECK ((btrim(name) <> ''::text))`
- `patients_phone_check`: `CHECK ((phone ~ '^[0-9]{10,15}$'::text))`
- `patients_pkey`: `PRIMARY KEY (id)`

## `professional_availability`

Faixas semanais dos profissionais.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `professional_id` | `uuid` | NO | `—` |
| `weekday` | `smallint` | NO | `—` |
| `starts_at` | `time without time zone` | NO | `—` |
| `ends_at` | `time without time zone` | NO | `—` |

Restrições:

- `professional_availability_check`: `CHECK ((starts_at < ends_at))`
- `professional_availability_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `professional_availability_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `professional_availability_clinic_id_professional_id_fkey`: `FOREIGN KEY (clinic_id, professional_id) REFERENCES clinia.professionals(clinic_id, id)`
- `professional_availability_pkey`: `PRIMARY KEY (id)`
- `professional_availability_weekday_check`: `CHECK (((weekday >= 0) AND (weekday <= 6)))`

## `professional_specialties`

Vínculos de profissionais com especialidades.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `clinic_id` | `uuid` | NO | `—` |
| `professional_id` | `uuid` | NO | `—` |
| `specialty_id` | `uuid` | NO | `—` |

Restrições:

- `professional_specialties_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `professional_specialties_clinic_id_professional_id_fkey`: `FOREIGN KEY (clinic_id, professional_id) REFERENCES clinia.professionals(clinic_id, id)`
- `professional_specialties_clinic_id_specialty_id_fkey`: `FOREIGN KEY (clinic_id, specialty_id) REFERENCES clinia.specialties(clinic_id, id)`
- `professional_specialties_pkey`: `PRIMARY KEY (clinic_id, professional_id, specialty_id)`

## `professionals`

Profissionais e estado de atividade.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `name` | `text` | NO | `—` |
| `active` | `boolean` | NO | `true` |
| `color` | `text` | NO | `'#2563eb'::text` |

Restrições:

- `professionals_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `professionals_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `professionals_color_check`: `CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text))`
- `professionals_name_check`: `CHECK ((btrim(name) <> ''::text))`
- `professionals_pkey`: `PRIMARY KEY (id)`

## `specialties`

Especialidades oferecidas.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `name` | `text` | NO | `—` |
| `active` | `boolean` | NO | `true` |

Restrições:

- `specialties_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `specialties_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `specialties_clinic_id_name_key`: `UNIQUE (clinic_id, name)`
- `specialties_name_check`: `CHECK ((btrim(name) <> ''::text))`
- `specialties_pkey`: `PRIMARY KEY (id)`

## `users`

Usuários administrativos; sem login ativo até provisionamento.

| Campo | Tipo | Aceita NULL | Default |
|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `clinic_id` | `uuid` | NO | `—` |
| `created_at` | `timestamp with time zone` | NO | `now()` |
| `name` | `text` | NO | `—` |
| `email` | `text` | NO | `—` |
| `password_hash` | `text` | YES | `—` |
| `role` | `text` | NO | `—` |
| `active` | `boolean` | NO | `true` |

Restrições:

- `users_clinic_id_email_key`: `UNIQUE (clinic_id, email)`
- `users_clinic_id_fkey`: `FOREIGN KEY (clinic_id) REFERENCES clinia.clinics(id)`
- `users_clinic_id_id_key`: `UNIQUE (clinic_id, id)`
- `users_email_check`: `CHECK ((POSITION(('@'::text) IN (email)) > 1))`
- `users_name_check`: `CHECK ((btrim(name) <> ''::text))`
- `users_pkey`: `PRIMARY KEY (id)`
- `users_role_check`: `CHECK ((role = ANY (ARRAY['admin'::text, 'attendant'::text])))`

## Views e índices

`appointments`: entradas `kind=appointment`. `calendar_blocks`: entradas `kind=block`. Ambas têm as mesmas colunas de `calendar_entries` e `security_invoker=true`. Para mutações, preferir explicitamente a tabela base com discriminador validado pelo serviço.

Índices adicionais: e-mail sem distinção de caixa por clínica; sessão aberta única por conversa; busca de pacientes por telefone; agenda por início; fila por status/data; mensagens por sessão/data/ID; auditoria por entidade/data. Índices GiST das exclusões protegem concorrência. Todas as políticas RLS filtram o contexto transacional da clínica.
