import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { addDays, dateTime, formatTime, weekStart } from '../src/lib/date';
import { getAvailability, getFreeSlots, getMetrics, getPeriod } from '../src/lib/metrics';
import { failNextRequest, runCommand } from '../src/lib/services';
import { isDemoState } from '../src/lib/state-validation';
import type { AppointmentInput, DemoState } from '../src/lib/types';

Object.assign(process.env, { NODE_ENV: 'test' });

function cleanState(): DemoState {
  const state = createDemoState('2026-11-09');
  state.appointments = [];
  state.blocks = [];
  return state;
}
function input(overrides: Partial<AppointmentInput> = {}): AppointmentInput {
  return { patientId: 'patient-1', professionalId: 'pro-clara', specialty: 'Cardiologia', date: '2026-11-10', start: '10:00', duration: 30, status: 'agendada', ...overrides };
}

test('date helpers preserve Recife date, weekday and clock', () => {
  assert.equal(addDays('2026-11-09', -1), '2026-11-08');
  assert.equal(weekStart('2026-11-08'), '2026-11-02');
  assert.equal(formatTime('2026-11-09T13:15:00Z'), '10:15');
  assert.equal(dateTime('2026-11-09', '10:15'), '2026-11-09T10:15:00-03:00');
  assert.deepEqual(getPeriod('2026-11-09', 7), { start: '2026-11-03', end: '2026-11-09' });
});

test('seed is deterministic, relational, valid and populated on all weekdays', () => {
  assert.deepEqual(createDemoState('2026-11-09'), createDemoState('2026-11-09'));
  for (let day = 0; day < 7; day++) {
    const state = createDemoState(addDays('2026-11-09', day));
    assert.ok(state.appointments.some((appointment) => appointment.date === state.referenceDate));
    assert.ok(state.appointments.every((appointment) => state.patients.some((patient) => patient.id === appointment.patientId) && state.professionals.some((professional) => professional.id === appointment.professionalId)));
    assert.ok(state.appointments.every((appointment) => getAvailability(state, appointment.professionalId, appointment.date).some((slot) => appointment.start >= slot.start && Number(appointment.start.slice(0, 2)) * 60 + Number(appointment.start.slice(3)) + appointment.duration <= Number(slot.end.slice(0, 2)) * 60 + Number(slot.end.slice(3)))));
  }
});

test('full interval overlaps are rejected while touching boundaries are accepted', async () => {
  const first = await runCommand(cleanState(), { type: 'appointment.save', input: input({ duration: 60 }) });
  await assert.rejects(runCommand(first, { type: 'appointment.save', input: input({ patientId: 'patient-2', start: '10:30' }) }), /já tem uma consulta/);
  await assert.rejects(runCommand(first, { type: 'appointment.save', input: input({ patientId: 'patient-2', start: '09:45' }) }), /já tem uma consulta/);
  const next = await runCommand(first, { type: 'appointment.save', input: input({ patientId: 'patient-2', start: '11:00' }) });
  assert.equal(next.appointments.length, 2);
  assert.equal(first.appointments.length, 1, 'mutations never modify the previous snapshot');
});

test('patient cannot be double booked across different professionals', async () => {
  const state = await runCommand(cleanState(), { type: 'appointment.save', input: input() });
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input({ professionalId: 'pro-lucas', specialty: 'Dermatologia' }) }), /paciente já tem/);
});

test('availability subtracts full blocks and clinic hours, including partial overlap', async () => {
  let state = cleanState();
  state = await runCommand(state, { type: 'block.save', input: { professionalId: 'pro-clara', date: '2026-11-10', start: '10:00', end: '11:00', reason: 'Reunião' } });
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input({ start: '09:45', duration: 30 }) }), /bloqueio/);
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input({ start: '11:45', duration: 30 }) }), /disponibilidade/);
  assert.deepEqual(getAvailability(state, 'pro-clara', '2026-11-10'), [{ start: '08:00', end: '10:00' }, { start: '11:00', end: '12:00' }, { start: '13:00', end: '17:00' }]);
  assert.ok(!getFreeSlots(state, 'pro-clara', '2026-11-10', 30).includes('10:30'));
});

test('block edits are atomic and cannot cover existing consultations', async () => {
  let state = await runCommand(cleanState(), { type: 'appointment.save', input: input() });
  await assert.rejects(runCommand(state, { type: 'block.save', input: { professionalId: 'pro-clara', date: '2026-11-10', start: '10:15', end: '11:00', reason: 'Reunião' } }), /Existem consultas/);
  state = await runCommand(state, { type: 'block.save', input: { professionalId: 'pro-clara', date: '2026-11-10', start: '11:00', end: '12:00', reason: 'Reunião' } });
  const original = state.blocks[0];
  await assert.rejects(runCommand(state, { type: 'block.save', id: original.id, input: { ...original, start: '10:00' } }), /Existem consultas/);
  assert.equal(state.blocks[0].start, '11:00');
  const result = await runCommand(state, { type: 'block.save', id: original.id, input: { ...original, start: '11:30' } });
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].id, original.id);
});

test('past dates, invalid calendar values and inactive professionals are rejected', async () => {
  const state = cleanState();
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input({ date: '2026-11-09', start: '10:00' }) }), /horário futuro/);
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input({ date: '2027-02-31' }) }), /data e horário/);
  state.professionals[0].active = false;
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input() }), /profissional ativo/);
});

test('rescheduling retains identity and records old/new schedule', async () => {
  const state = await runCommand(cleanState(), { type: 'appointment.save', input: input() });
  const original = state.appointments[0];
  const result = await runCommand(state, { type: 'appointment.save', id: original.id, input: input({ start: '11:00' }) });
  assert.equal(result.appointments[0].id, original.id);
  assert.equal(result.appointments[0].events.at(-1)?.previousStart, '2026-11-10 10:00');
  assert.equal(result.appointments[0].events.at(-1)?.newStart, '2026-11-10 11:00');
});

test('outcomes allow any hour today but never later dates; final states cannot be reopened', async () => {
  const state = await runCommand(cleanState(), { type: 'appointment.save', input: input() });
  const appointmentId = state.appointments[0].id;
  await assert.rejects(runCommand(state, { type: 'appointment.status', id: appointmentId, status: 'realizada' }), /dias futuros/);
  state.referenceDate = '2026-11-10';
  state.now = dateTime('2026-11-10', '08:00');
  const done = await runCommand(state, { type: 'appointment.status', id: appointmentId, status: 'realizada' });
  assert.equal(done.appointments[0].status, 'realizada');
  const missed = await runCommand(state, { type: 'appointment.status', id: appointmentId, status: 'falta' });
  assert.equal(missed.appointments[0].status, 'falta');
  await assert.rejects(runCommand(done, { type: 'appointment.status', id: appointmentId, status: 'cancelada' }), /resultado final/);
});

test('cancellation records administrative author and reason, freeing the slot', async () => {
  const state = await runCommand(cleanState(), { type: 'appointment.save', input: input() });
  const result = await runCommand(state, { type: 'appointment.status', id: state.appointments[0].id, status: 'cancelada', reason: 'Solicitação do paciente' });
  assert.equal(result.appointments[0].cancelReason, 'Solicitação do paciente');
  assert.equal(result.appointments[0].events.at(-1)?.authorId, result.currentUserId);
  assert.ok(getFreeSlots(result, 'pro-clara', '2026-11-10').includes('10:00'));
});

test('metrics use explicit outcomes and scheduled date, preserving missing denominators', () => {
  const state = cleanState();
  state.appointments = ['realizada', 'realizada', 'falta', 'cancelada', 'agendada'].map((status, index) => ({ ...input({ date: '2026-11-08', start: `0${8 + index % 4}:00` }), id: `test-${index}`, status: status as DemoState['appointments'][number]['status'], events: [] }));
  const metric = getMetrics(state, { start: '2026-11-08', end: '2026-11-08' }, 'pro-clara');
  assert.equal(metric.completed, 2);
  assert.equal(metric.missed, 1);
  assert.ok(Math.abs(metric.absenceRate! - 100 / 3) < 1e-10);
  assert.equal(metric.planned, 1);
  assert.equal(metric.pending, 1);
  assert.equal(metric.bookedMinutes, 120);
  assert.equal(metric.occupancy, 50);
  const absent = getMetrics(state, { start: '2026-11-08', end: '2026-11-08' }, 'does-not-exist');
  assert.equal(absent.occupancy, null);
  assert.equal(absent.absenceRate, null);
  assert.equal(absent.total, 0);
});

test('historic capacity survives availability edits and inactivation', async () => {
  const state = createDemoState('2026-11-09');
  const period = { start: '2026-11-02', end: '2026-11-08' };
  const before = getMetrics(state, period, 'pro-clara');
  const professional = state.professionals[0];
  const after = await runCommand(state, { type: 'professional.save', id: professional.id, input: { ...professional, active: false, availability: [] } });
  assert.equal(getMetrics(after, period, professional.id).availableMinutes, before.availableMinutes);
  assert.deepEqual(getFreeSlots(after, professional.id, '2026-11-10'), []);
  assert.equal(after.appointments.length, state.appointments.length);
});

test('phone duplication requires explicit shared-contact acknowledgement', async () => {
  const state = cleanState();
  const patient = { name: 'Contato fictício', phone: '+55 81 90000-0101', insurance: '', notes: '' };
  await assert.rejects(runCommand(state, { type: 'patient.save', input: patient }), /telefone já está vinculado/);
  const result = await runCommand(state, { type: 'patient.save', input: patient, allowSharedPhone: true });
  assert.equal(result.patients.length, state.patients.length + 1);
});

test('conversation ownership is checked by the service, not only UI', async () => {
  const state = cleanState();
  await assert.rejects(runCommand(state, { type: 'conversation.send', id: 'conversation-1', text: 'Olá', messageId: 'x' }), /Assuma/);
  await assert.rejects(runCommand(state, { type: 'conversation.claim', id: 'conversation-4' }), /Outro atendente/);
  await assert.rejects(runCommand(state, { type: 'conversation.return', id: 'conversation-4' }), /outro atendente/);
  const claimed = await runCommand(state, { type: 'conversation.claim', id: 'conversation-1' });
  assert.equal(claimed.conversations[0].assigneeId, claimed.currentUserId);
});

test('failed message retries preserve one identity without duplication', async () => {
  let state = await runCommand(cleanState(), { type: 'conversation.claim', id: 'conversation-1' });
  state = await runCommand(state, { type: 'conversation.send', id: 'conversation-1', text: 'Olá, vou ajudar!', messageId: 'retry-message', fail: true });
  assert.equal(state.conversations[0].messages.at(-1)?.delivery, 'falha');
  state = await runCommand(state, { type: 'conversation.send', id: 'conversation-1', text: 'Olá, vou ajudar!', messageId: 'retry-message' });
  state = await runCommand(state, { type: 'conversation.send', id: 'conversation-1', text: 'Olá, vou ajudar!', messageId: 'retry-message' });
  assert.equal(state.conversations[0].messages.filter((message) => message.id === 'retry-message').length, 1);
  assert.equal(state.conversations[0].messages.at(-1)?.delivery, 'enviada');
});

test('return waits for patient; closed sessions reopen without losing messages or events', async () => {
  let state = await runCommand(cleanState(), { type: 'conversation.claim', id: 'conversation-1' });
  const previousAI = state.conversations[0].messages.filter((message) => message.author === 'ia').length;
  state = await runCommand(state, { type: 'conversation.return', id: 'conversation-1' });
  assert.equal(state.conversations[0].messages.filter((message) => message.author === 'ia').length, previousAI);
  state = await runCommand(state, { type: 'conversation.receive', id: 'conversation-1', text: 'Obrigada' });
  assert.equal(state.conversations[0].messages.filter((message) => message.author === 'ia').length, previousAI + 1);
  state = await runCommand(state, { type: 'conversation.claim', id: 'conversation-1' });
  state = await runCommand(state, { type: 'conversation.close', id: 'conversation-1' });
  const previousSession = state.conversations[0].sessionId;
  const previousMessages = state.conversations[0].messages.length;
  const previousEvents = state.conversations[0].events.length;
  state = await runCommand(state, { type: 'conversation.receive', id: 'conversation-1', text: 'Olá novamente' });
  assert.notEqual(state.conversations[0].sessionId, previousSession);
  assert.equal(state.conversations[0].status, 'ia');
  assert.ok(state.conversations[0].messages.length > previousMessages);
  assert.ok(state.conversations[0].events.length > previousEvents);
  assert.ok(state.conversations[0].messages.some((message) => message.sessionId === previousSession));
});

test('recoverable failure preserves state and succeeds on next attempt', async () => {
  const state = cleanState();
  failNextRequest();
  await assert.rejects(runCommand(state, { type: 'appointment.save', input: input() }), /Falha simulada/);
  assert.equal(state.appointments.length, 0);
  const next = await runCommand(state, { type: 'appointment.save', input: input() });
  assert.equal(next.appointments.length, 1);
});

test('full service flow: claim → patient context → reschedule → agenda and metrics agree', async () => {
  let state = createDemoState('2026-11-09');
  state = await runCommand(state, { type: 'conversation.claim', id: 'conversation-1' });
  const conversation = state.conversations[0];
  const appointment = state.appointments.find((item) => item.id === 'appt-ana')!;
  assert.equal(appointment.patientId, conversation.patientId);
  const originalDay = getMetrics(state, { start: state.referenceDate, end: state.referenceDate });
  const targetDate = '2026-11-10';
  const slots = getFreeSlots(state, appointment.professionalId, targetDate).filter((slot) => !state.appointments.some((item) => item.patientId === appointment.patientId && item.date === targetDate && item.start === slot && item.status !== 'cancelada'));
  assert.ok(slots.length > 0);
  state = await runCommand(state, { type: 'appointment.save', id: appointment.id, input: { ...appointment, date: targetDate, start: slots[0] } });
  assert.equal(state.appointments.find((item) => item.id === appointment.id)?.date, targetDate);
  assert.equal(getMetrics(state, { start: state.referenceDate, end: state.referenceDate }).planned, originalDay.planned - 1);
  assert.equal(state.appointments.filter((item) => item.id === appointment.id).length, 1);
  assert.equal(state.appointments.find((item) => item.id === appointment.id)?.events.at(-1)?.type, 'appointment.reschedule');
});

test('seed supports two complete 30-day intervals and never records future administrative events', () => {
  const state = createDemoState('2026-11-10');
  for (let offset = -59; offset <= 0; offset++) {
    const day = addDays(state.referenceDate, offset);
    assert.ok(state.appointments.some((appointment) => appointment.date === day));
    if (offset < 0) assert.ok(state.availabilityHistory?.[day]);
  }
  assert.ok(state.appointments.flatMap((appointment) => appointment.events).every((event) => new Date(event.at).getTime() <= new Date(state.now).getTime()));
});

test('new professional capacity is not projected into historical periods', async () => {
  const state = createDemoState('2026-11-10');
  const period = { start: '2026-10-12', end: '2026-11-09' };
  const before = getMetrics(state, period).availableMinutes;
  const professional = state.professionals[0];
  const next = await runCommand(state, { type: 'professional.save', input: { name: 'Profissional fictícia nova', active: true, specialties: professional.specialties, color: professional.color, availability: professional.availability } });
  assert.equal(getMetrics(next, period).availableMinutes, before);
  assert.deepEqual(getAvailability(next, next.professionals.at(-1)!.id, '2026-11-09'), []);
});

test('historical specialty metrics retain consultations after professional specialty edits', async () => {
  const state = createDemoState('2026-11-10');
  const period = { start: '2026-11-01', end: '2026-11-09' };
  const before = getMetrics(state, period, 'pro-clara', 'Cardiologia');
  const professional = state.professionals[0];
  const next = await runCommand(state, { type: 'professional.save', id: professional.id, input: { ...professional, specialties: ['Dermatologia'] } });
  assert.deepEqual(getMetrics(next, period, 'pro-clara', 'Cardiologia'), before);
});

test('malformed metric intervals yield no data without throwing', () => {
  const state = cleanState();
  for (const period of [{ start: '2026-99-31', end: '2027-01-01' }, { start: '2026-02-31', end: '2026-03-01' }, { start: '2026-11-11', end: '2026-11-10' }]) {
    const result = getMetrics(state, period);
    assert.equal(result.total, 0);
    assert.equal(result.occupancy, null);
  }
  assert.deepEqual(getPeriod('2026-11-10', Number.NaN), getPeriod('2026-11-10', 7));
});

test('persisted state validation rejects malformed records, duplicate IDs and broken relations', () => {
  const state = createDemoState('2026-11-10');
  assert.equal(isDemoState(JSON.parse(JSON.stringify(state))), true);
  assert.equal(isDemoState({ ...state, version: 99 }), false);
  assert.equal(isDemoState({ ...state, referenceDate: '2026-02-31' }), false);
  assert.equal(isDemoState({ ...state, patients: [null] }), false);
  assert.equal(isDemoState({ ...state, patients: [state.patients[0], state.patients[0]] }), false);
  assert.equal(isDemoState({ ...state, professionals: [{ ...state.professionals[0], availability: [{ day: 9, start: '25:00', end: '12:00' }] }] }), false);
  assert.equal(isDemoState({ ...state, appointments: [{ ...state.appointments[0], patientId: 'missing-patient' }] }), false);
  assert.equal(isDemoState({ ...state, conversations: [{ ...state.conversations[0], status: 'humano', assigneeId: 'missing-user' }] }), false);
  assert.equal(isDemoState({ ...state, knowledge: [{ ...state.knowledge[0], content: undefined }] }), false);
});

test('clinic validation rejects invalid contact length and blank specialties', async () => {
  const state = cleanState();
  await assert.rejects(runCommand(state, { type: 'clinic.save', input: { ...state.clinic, phone: '123456789012345' } }), /telefone/);
  await assert.rejects(runCommand(state, { type: 'clinic.save', input: { ...state.clinic, specialties: [' '] } }), /especialidade/);
});

test('service preserves old and new ownership events through return and escalation', async () => {
  let state = await runCommand(cleanState(), { type: 'conversation.claim', id: 'conversation-1' });
  state = await runCommand(state, { type: 'conversation.return', id: 'conversation-1' });
  state = await runCommand(state, { type: 'conversation.receive', id: 'conversation-1', text: 'Preciso de um atendente' });
  const conversation = state.conversations[0];
  assert.equal(conversation.status, 'aguardando');
  assert.equal(conversation.assigneeId, null);
  assert.equal(conversation.events.at(-1)?.authorId, 'ia');
  assert.equal(conversation.messages.at(-1)?.authorId, 'ia');
  assert.equal(conversation.events.find((event) => event.type === 'conversation.claim')?.authorId, state.currentUserId);
});
