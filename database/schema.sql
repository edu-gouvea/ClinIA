-- ClinIA: proposta inicial PostgreSQL 16+. Aplicar em banco vazio.
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE SCHEMA clinia;
SET search_path TO clinia, public;
CREATE TABLE clinics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK (btrim(name) <> ''),
 address text NOT NULL DEFAULT '', phone text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'America/Recife',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 name text NOT NULL CHECK (btrim(name) <> ''), email text NOT NULL CHECK (position('@' in email)>1), password_hash text, role text NOT NULL CHECK (role IN ('admin','attendant')), active boolean NOT NULL DEFAULT true, UNIQUE(clinic_id,email)
);
CREATE TABLE patients (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 name text NOT NULL CHECK (btrim(name) <> ''), phone text NOT NULL CHECK (phone ~ '^[0-9]{10,15}$'), insurance text NOT NULL DEFAULT '', administrative_notes text NOT NULL DEFAULT '', active boolean NOT NULL DEFAULT true
);
CREATE TABLE professionals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true, color text NOT NULL DEFAULT '#2563eb' CHECK (color ~ '^#[0-9a-fA-F]{6}$')
);
CREATE TABLE specialties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true, UNIQUE(clinic_id,name)
);
CREATE TABLE insurances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 name text NOT NULL CHECK (btrim(name) <> ''), active boolean NOT NULL DEFAULT true, UNIQUE(clinic_id,name)
);
CREATE TABLE clinic_hours (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), starts_at time NOT NULL, ends_at time NOT NULL, CHECK (starts_at < ends_at)
);
CREATE TABLE professional_availability (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 professional_id uuid NOT NULL, weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), starts_at time NOT NULL, ends_at time NOT NULL, CHECK (starts_at < ends_at), FOREIGN KEY(clinic_id,professional_id) REFERENCES professionals(clinic_id,id)
);
CREATE TABLE professional_specialties (
 clinic_id uuid NOT NULL REFERENCES clinics(id), professional_id uuid NOT NULL, specialty_id uuid NOT NULL,
 PRIMARY KEY(clinic_id,professional_id,specialty_id),
 FOREIGN KEY(clinic_id,professional_id) REFERENCES professionals(clinic_id,id),
 FOREIGN KEY(clinic_id,specialty_id) REFERENCES specialties(clinic_id,id)
);
CREATE TABLE calendar_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 professional_id uuid NOT NULL, patient_id uuid, specialty_id uuid,
 kind text NOT NULL CHECK (kind IN ('appointment','block')),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 status text NOT NULL CHECK (status IN ('agendada','confirmada','cancelada','realizada','falta','bloqueado')),
 reason text NOT NULL DEFAULT '', created_by uuid,
 CHECK (ends_at > starts_at),
 CHECK ((kind='block' AND patient_id IS NULL AND specialty_id IS NULL AND status IN ('bloqueado','cancelada')) OR
        (kind='appointment' AND patient_id IS NOT NULL AND specialty_id IS NOT NULL AND status <> 'bloqueado')),
 CHECK (kind='block' OR ends_at-starts_at BETWEEN interval '15 minutes' AND interval '240 minutes'),
 FOREIGN KEY(clinic_id,professional_id) REFERENCES professionals(clinic_id,id),
 FOREIGN KEY(clinic_id,patient_id) REFERENCES patients(clinic_id,id),
 FOREIGN KEY(clinic_id,created_by) REFERENCES users(clinic_id,id),
 FOREIGN KEY(clinic_id,professional_id,specialty_id) REFERENCES professional_specialties(clinic_id,professional_id,specialty_id),
 CONSTRAINT professional_no_overlap EXCLUDE USING gist
 (clinic_id WITH =, professional_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (status <> 'cancelada'),
 CONSTRAINT patient_no_overlap EXCLUDE USING gist
 (clinic_id WITH =, patient_id WITH =, tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE (kind='appointment' AND status <> 'cancelada')
);
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 patient_id uuid NOT NULL, status text NOT NULL DEFAULT 'ia' CHECK (status IN ('ia','aguardando','humano','encerrada')), assignee_id uuid,
 CHECK ((status='humano' AND assignee_id IS NOT NULL) OR (status<>'humano' AND assignee_id IS NULL)),
 FOREIGN KEY(clinic_id,patient_id) REFERENCES patients(clinic_id,id), FOREIGN KEY(clinic_id,assignee_id) REFERENCES users(clinic_id,id)
);
CREATE TABLE conversation_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 conversation_id uuid NOT NULL, opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, CHECK (closed_at IS NULL OR closed_at >= opened_at), FOREIGN KEY(clinic_id,conversation_id) REFERENCES conversations(clinic_id,id)
);
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 session_id uuid NOT NULL, author text NOT NULL CHECK (author IN ('paciente','ia','humano','evento')), user_id uuid,
 body text NOT NULL CHECK (btrim(body) <> ''), delivery text NOT NULL DEFAULT 'pendente' CHECK (delivery IN ('pendente','enviada','falha')),
 external_id text, idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''), UNIQUE(clinic_id,idempotency_key), UNIQUE(clinic_id,external_id),
 CHECK (author <> 'humano' OR user_id IS NOT NULL), FOREIGN KEY(clinic_id,session_id) REFERENCES conversation_sessions(clinic_id,id), FOREIGN KEY(clinic_id,user_id) REFERENCES users(clinic_id,id)
);
CREATE TABLE human_handoffs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 session_id uuid NOT NULL, reason text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, resolved_at timestamptz, assignee_id uuid, CHECK (claimed_at IS NULL OR claimed_at >= requested_at), CHECK (resolved_at IS NULL OR resolved_at >= COALESCE(claimed_at,requested_at)), FOREIGN KEY(clinic_id,session_id) REFERENCES conversation_sessions(clinic_id,id), FOREIGN KEY(clinic_id,assignee_id) REFERENCES users(clinic_id,id)
);
CREATE TABLE knowledge_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 title text NOT NULL CHECK (btrim(title) <> ''), category text NOT NULL DEFAULT 'FAQ', content text NOT NULL CHECK (btrim(content) <> ''), archived boolean NOT NULL DEFAULT false
);
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL REFERENCES clinics(id),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(clinic_id,id),
 actor_id uuid, event_type text NOT NULL, entity_type text NOT NULL, entity_id uuid NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details)='object'), FOREIGN KEY(clinic_id,actor_id) REFERENCES users(clinic_id,id)
);
-- Histórico de auditoria é somente acréscimo pelo caminho normal de DML.
CREATE FUNCTION reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Eventos de auditoria não podem ser alterados ou excluídos' USING ERRCODE='23514'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit_change();
CREATE UNIQUE INDEX user_email_case_insensitive ON users(clinic_id,lower(email));
CREATE UNIQUE INDEX one_open_session ON conversation_sessions(clinic_id,conversation_id) WHERE closed_at IS NULL;
CREATE INDEX patients_phone ON patients(clinic_id,phone);
CREATE INDEX calendar_by_start ON calendar_entries(clinic_id,starts_at);
CREATE INDEX conversation_queue ON conversations(clinic_id,status,created_at);
CREATE INDEX message_history ON messages(clinic_id,session_id,created_at,id);
CREATE INDEX audit_history ON audit_events(clinic_id,entity_type,entity_id,created_at);
CREATE VIEW appointments WITH (security_invoker=true) AS SELECT * FROM calendar_entries WHERE kind='appointment';
CREATE VIEW calendar_blocks WITH (security_invoker=true) AS SELECT * FROM calendar_entries WHERE kind='block';
-- Defence in depth: the API must SET LOCAL clinia.clinic_id inside every transaction.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON users USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON patients USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON professionals USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE specialties FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON specialties USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE insurances ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurances FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON insurances USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE clinic_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_hours FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON clinic_hours USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE professional_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_availability FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON professional_availability USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON calendar_entries USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON conversations USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE conversation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON conversation_sessions USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON messages USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE human_handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_handoffs FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON human_handoffs USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON knowledge_documents USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON audit_events USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE professional_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_specialties FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON professional_specialties USING (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (clinic_id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinics FORCE ROW LEVEL SECURITY;
CREATE POLICY clinic_isolation ON clinics USING (id = nullif(current_setting('clinia.clinic_id',true),'')::uuid) WITH CHECK (id = nullif(current_setting('clinia.clinic_id',true),'')::uuid);
COMMIT;
