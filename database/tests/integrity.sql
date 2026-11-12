-- Executar após schema.sql e seed.sql com usuário proprietário, em base descartável.
\set ON_ERROR_STOP on
BEGIN;
SET search_path TO clinia,public;
CREATE FUNCTION pg_temp.reject(statement text, expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE = expected THEN RETURN; END IF;
  RAISE EXCEPTION 'Esperado SQLSTATE %, recebido %: %', expected, SQLSTATE, SQLERRM;
 END;
 RAISE EXCEPTION 'Operação inválida foi aceita: %',statement;
END $$;
\echo Teste: Conflito parcial do profissional
SELECT pg_temp.reject($case$INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 09:15-03','2030-11-04 09:45-03','agendada')$case$, '23P01');
\echo Teste: Conflito do paciente com outro profissional
SELECT pg_temp.reject($case$INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 09:15-03','2030-11-04 09:45-03','agendada')$case$, '23P01');
\echo Teste: Bloqueio impede consulta
SELECT pg_temp.reject($case$INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 12:15-03','2030-11-04 12:45-03','agendada')$case$, '23P01');
\echo Teste: Fim anterior ao início
SELECT pg_temp.reject($case$INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 15:00-03','2030-11-04 14:00-03','agendada')$case$, '23514');
\echo Teste: Duração menor que quinze minutos
SELECT pg_temp.reject($case$INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 15:00-03','2030-11-04 15:10-03','agendada')$case$, '23514');
\echo Teste: Status inválido
SELECT pg_temp.reject($case$INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 15:00-03','2030-11-04 15:30-03','invalido')$case$, '23514');
\echo Teste: Profissional de outra clínica
SELECT pg_temp.reject($case$INSERT INTO professional_availability(clinic_id,professional_id,weekday,starts_at,ends_at) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000099',1,'08:00','12:00')$case$, '23503');
\echo Teste: Especialidade não vinculada
SELECT pg_temp.reject($case$INSERT INTO specialties(id,clinic_id,name) VALUES ('00000000-0000-0000-0000-000000000055','00000000-0000-0000-0000-000000000001','Odontologia'); INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000055','appointment','2030-11-04 15:00-03','2030-11-04 15:30-03','agendada')$case$, '23503');
\echo Teste: Mensagem duplicada
SELECT pg_temp.reject($case$INSERT INTO messages(clinic_id,session_id,author,body,idempotency_key) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','paciente','Outra','seed-message-1')$case$, '23505');
\echo Teste: Segunda sessão aberta
SELECT pg_temp.reject($case$INSERT INTO conversation_sessions(clinic_id,conversation_id) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000009')$case$, '23505');
\echo Teste: Atendimento humano sem responsável
SELECT pg_temp.reject($case$UPDATE conversations SET status='humano' WHERE id='00000000-0000-0000-0000-000000000009'$case$, '23514');
\echo Teste: Exclusão de paciente com histórico
SELECT pg_temp.reject($case$DELETE FROM patients WHERE id='00000000-0000-0000-0000-000000000003'$case$, '23503');
\echo Teste: Telefone inválido
SELECT pg_temp.reject($case$UPDATE patients SET phone='abc' WHERE id='00000000-0000-0000-0000-000000000003'$case$, '23514');
SELECT pg_temp.reject($case$UPDATE audit_events SET event_type='alterado'$case$,'23514');
INSERT INTO clinics(id,name) VALUES ('00000000-0000-0000-0000-000000000099','Outra clínica');
INSERT INTO professionals(id,clinic_id,name) VALUES ('00000000-0000-0000-0000-000000000098','00000000-0000-0000-0000-000000000099','Outra pessoa');
SELECT pg_temp.reject($case$INSERT INTO professional_availability(clinic_id,professional_id,weekday,starts_at,ends_at) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000098',1,'08:00','12:00')$case$,'23503');
-- Casos aceitos: adjacência e cancelamento liberando horário.
INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 09:30-03','2030-11-04 10:00-03','agendada');
INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 09:15-03','2030-11-04 09:45-03','cancelada');
UPDATE calendar_entries SET status='cancelada' WHERE id='00000000-0000-0000-0000-000000000008';
INSERT INTO calendar_entries(clinic_id,professional_id,patient_id,specialty_id,kind,starts_at,ends_at,status) VALUES ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000007','appointment','2030-11-04 09:00-03','2030-11-04 09:30-03','agendada');
-- Mesmo telefone em pacientes distintos é permitido.
DO $$ BEGIN IF (SELECT count(*) FROM patients WHERE phone='81999990001') <> 2 THEN RAISE EXCEPTION 'Telefone compartilhado'; END IF; END $$;
-- RLS deve ser testada como papel sem BYPASSRLS e não como superusuário.
CREATE ROLE clinia_rls_test NOLOGIN;
GRANT USAGE ON SCHEMA clinia TO clinia_rls_test;
GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA clinia TO clinia_rls_test;
SET LOCAL ROLE clinia_rls_test;
SET LOCAL clinia.clinic_id = '';
DO $$ BEGIN IF (SELECT count(*) FROM patients) <> 0 THEN RAISE EXCEPTION 'RLS sem contexto'; END IF; IF (SELECT count(*) FROM appointments) <> 0 THEN RAISE EXCEPTION 'View vazou dados'; END IF; END $$;
SET LOCAL clinia.clinic_id = '00000000-0000-0000-0000-000000000099';
DO $$ BEGIN IF (SELECT count(*) FROM patients) <> 0 THEN RAISE EXCEPTION 'RLS outra clínica'; END IF; END $$;
SELECT pg_temp.reject($case$INSERT INTO patients(clinic_id,name,phone) VALUES ('00000000-0000-0000-0000-000000000001','Intruso','81999990002')$case$,'42501');
SET LOCAL clinia.clinic_id = '00000000-0000-0000-0000-000000000001';
DO $$ BEGIN IF (SELECT count(*) FROM patients) <> 2 THEN RAISE EXCEPTION 'RLS clínica autorizada'; END IF; END $$;
RESET ROLE;
ROLLBACK;
\echo Todos os testes SQL passaram; alterações revertidas.
