import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { runCommand } from '../src/lib/services';
import { agendaProfessionals, agendaView, calendarBounds, calendarColumns, canRecordOutcome, getBlockConflicts, layoutAppointments } from '../src/lib/scheduling';
import { parseDateInput, parseTimeInput } from '../src/components/date-time-fields';
import { isDemoState } from '../src/lib/state-validation';
import type { Appointment, AppointmentInput } from '../src/lib/types';
Object.assign(process.env, { NODE_ENV: 'test' });
const seed = () => createDemoState('2026-11-09');
const input = (override: Partial<AppointmentInput> = {}): AppointmentInput => ({ patientId: 'patient-1', professionalId: 'pro-clara', specialty: 'Cardiologia', date: '2026-11-10', start: '10:00', duration: 30, status: 'agendada', ...override });
const event = (id: string, start: string, duration: number): Appointment => ({ ...input({ start, duration }), id, events: [] });

test('rescheduling fixes patient/specialty and permits a replacement in the same specialty', async () => {
  let state = seed(); state.appointments = []; state.blocks = [];
  state.professionals.push({ ...state.professionals[0], id: 'same-specialty', name: 'Dra. Beatriz Demo' });
  state = await runCommand(state, { type: 'appointment.save', input: input() });
  const appointment = state.appointments[0];
  await assert.rejects(runCommand(state, { type: 'appointment.save', id: appointment.id, input: input({ patientId: 'patient-2' }) }), /paciente não pode/);
  await assert.rejects(runCommand(state, { type: 'appointment.save', id: appointment.id, input: input({ professionalId: 'pro-lucas', specialty: 'Dermatologia' }) }), /manter a especialidade/);
  await assert.rejects(runCommand(state, { type: 'appointment.save', id: appointment.id, input: input({ professionalId: 'pro-lucas' }) }), /mesma especialidade/);
  const changed = await runCommand(state, { type: 'appointment.save', id: appointment.id, input: input({ professionalId: 'same-specialty' }) });
  assert.equal(changed.appointments[0].professionalId, 'same-specialty');
  assert.equal(changed.appointments[0].patientId, appointment.patientId);
});

test('all of today is recordable, tomorrow is blocked and unresolved past appointments stay recordable', async () => {
  const state = seed();
  const late = { ...event('late', '23:00', 30), date: state.referenceDate };
  const tomorrow = { ...late, id: 'tomorrow', date: '2026-11-10' };
  const past = { ...late, id: 'past', date: '2026-11-08' };
  state.appointments = [late, tomorrow, past];
  for (const status of ['realizada', 'falta'] as const) {
    assert.equal(canRecordOutcome(late, state.referenceDate), true);
    assert.equal((await runCommand(state, { type: 'appointment.status', id: late.id, status })).appointments[0].status, status);
    await assert.rejects(runCommand(state, { type: 'appointment.status', id: tomorrow.id, status }), /dias futuros/);
    assert.equal((await runCommand(state, { type: 'appointment.status', id: past.id, status })).appointments[2].status, status);
  }
});

test('consultation notes only follow completion and retain prior versions, author and persisted schema', async () => {
  let state = seed(); state.appointments = [{ ...event('notes', '14:00', 30), date: state.referenceDate }];
  await assert.rejects(runCommand(state, { type: 'appointment.note', id: 'notes', text: 'Nota fictícia.' }), /após registrar a realização/);
  state = await runCommand(state, { type: 'appointment.status', id: 'notes', status: 'realizada' });
  state = await runCommand(state, { type: 'appointment.note', id: 'notes', text: 'Primeira anotação fictícia.' });
  state = await runCommand(state, { type: 'appointment.note', id: 'notes', text: 'Segunda anotação fictícia.' });
  const notes = state.appointments[0].notes!;
  assert.equal(notes.length, 2); assert.equal(notes[0].text, 'Primeira anotação fictícia.');
  assert.equal(notes[1].professionalId, 'pro-clara'); assert.equal(notes[1].recordedByUserId, state.currentUserId);
  assert.equal(isDemoState(JSON.parse(JSON.stringify(state))), true);
  const repeated = await runCommand(state, { type: 'appointment.note', id: 'notes', text: notes[1].text });
  assert.equal(repeated.appointments[0].notes?.length, 2);
  await assert.rejects(runCommand(state, { type: 'appointment.note', id: 'notes', text: '  ' }), /Escreva uma anotação/);
});

test('block conflicts can be cancelled/rescheduled before final service revalidation', async () => {
  let state = seed(); state.appointments = [event('first', '10:00', 30), { ...event('second', '10:30', 30), patientId: 'patient-2' }]; state.blocks = [];
  const block = { professionalId: 'pro-clara', date: '2026-11-10', start: '10:00', end: '11:00', reason: 'Reunião' };
  assert.equal(getBlockConflicts(state, block).length, 2);
  await assert.rejects(runCommand(state, { type: 'block.save', input: block }), /Existem consultas/);
  state = await runCommand(state, { type: 'appointment.status', id: 'first', status: 'cancelada', reason: 'Reorganização solicitada' });
  state = await runCommand(state, { type: 'appointment.save', id: 'second', input: input({ patientId: 'patient-2', start: '11:00' }) });
  assert.equal(getBlockConflicts(state, block).length, 0);
  state = await runCommand(state, { type: 'block.save', input: block });
  assert.equal(state.blocks.length, 1);
  assert.equal(state.appointments[0].cancelReason, 'Reorganização solicitada');
});

test('calendar bounds come from exact opening/closing across the displayed weekdays', () => {
  const state = seed(); state.clinic.hours = [{ day: 1, start: '08:15', end: '16:45' }, { day: 2, start: '07:45', end: '20:15' }];
  assert.deepEqual(calendarBounds(state, ['2026-11-09']), { start: 495, end: 1005 });
  assert.deepEqual(calendarBounds(state, ['2026-11-09', '2026-11-10']), { start: 465, end: 1215 });
  assert.equal(calendarBounds(state, ['2026-11-11']), null);
});

test('interval layout handles simultaneous and chained overlaps with exact duration and adjacent boundaries', () => {
  const layout = layoutAppointments([event('a', '09:00', 60), event('b', '09:15', 30), event('c', '09:45', 60), event('d', '10:45', 15)]);
  for (const item of layout) assert.equal(item.end - item.start, item.appointment.duration);
  for (const a of layout) for (const b of layout) {
    if (a.appointment.id !== b.appointment.id && a.start < b.end && b.start < a.end) assert.notEqual(a.lane, b.lane);
  }
  assert.equal(layout.find(i => i.appointment.id === 'c')?.lanes, 2);
  assert.equal(layout.find(i => i.appointment.id === 'd')?.lanes, 1);
});

test('typed dates/hours accept pasted ISO, Brazilian separators and unmasked numbers without invalid dates', () => {
  assert.equal(parseDateInput('10112026'), '2026-11-10');
  assert.equal(parseDateInput('10/11/2026'), '2026-11-10');
  assert.equal(parseDateInput('2026-11-10'), '2026-11-10');
  assert.equal(parseDateInput('31/02/2026'), null);
  assert.equal(parseDateInput('10/11/20'), null);
  assert.equal(parseTimeInput('0930'), '09:30');
  assert.equal(parseTimeInput('930'), '09:30');
  assert.equal(parseTimeInput('9:30'), '09:30');
  assert.equal(parseTimeInput('25:00'), null);
  assert.equal(parseTimeInput('12:75'), null);
});

test('agenda mode is determined exclusively by professional selection', () => {
  assert.equal(agendaView(''), 'day');
  assert.equal(agendaView('pro-clara'), 'week');
});

test('general calendar separates simultaneous professionals and partitions overlapping records within each professional', () => {
  const state = seed();
  const appointments = [event('clara', '09:00', 60), { ...event('lucas', '09:00', 30), professionalId: 'pro-lucas' }];
  const columns = calendarColumns(state, ['2026-11-10'], appointments, state.professionals, true);
  const clara = columns.find(c => c.professional?.id === 'pro-clara')!;
  const lucas = columns.find(c => c.professional?.id === 'pro-lucas')!;
  assert.deepEqual(clara.events.map(e => e.appointment.id), ['clara']);
  assert.deepEqual(lucas.events.map(e => e.appointment.id), ['lucas']);
  assert.equal(clara.events[0].lanes, 1);
  const overlapping = calendarColumns(state, ['2026-11-10'], [...appointments, { ...event('old-cancelled', '09:15', 15), status: 'cancelada' }], state.professionals, true).find(c => c.professional?.id === 'pro-clara')!;
  assert.equal(overlapping.events[0].lanes, 2);
  assert.notEqual(overlapping.events[0].lane, overlapping.events[1].lane);
  assert.ok(overlapping.width / 2 >= clara.width);
  const week = calendarColumns(state, ['2026-11-09', '2026-11-10'], appointments.filter(a => a.professionalId === 'pro-clara'), [state.professionals[0]], false);
  assert.equal(week[0].events.length, 0);
  assert.equal(week[1].events[0].start, 540);
});

test('filtered calendar preserves inactive and reclassified professionals with historical records', () => {
  const state = seed(); state.professionals[0].active = false; state.professionals[0].specialties = ['Outra área'];
  const appointments = [event('history', '09:00', 30)];
  assert.ok(agendaProfessionals(state, appointments, '', 'Cardiologia').some(p => p.id === 'pro-clara'));
  assert.equal(agendaProfessionals(state, [], '', 'Cardiologia').some(p => p.id === 'pro-clara'), false);
  assert.equal(agendaProfessionals(state, [], 'pro-clara', '').length, 1);
});
