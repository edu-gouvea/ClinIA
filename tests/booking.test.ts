import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { getFreeSlots } from '../src/lib/metrics';
import { validateAppointment } from '../src/lib/services';
import { appointmentDayLine, appointmentEventLine, appointmentSummaryLine, availableDaysInMonth, availableSlots, durationOptions, firstAvailableDay, startTimeIssue } from '../src/lib/booking';
import type { DemoState } from '../src/lib/types';

const seed = createDemoState('2026-11-09');
function emptyDay(): DemoState { return { ...structuredClone(seed), appointments: [] }; }

test('availableSlots usa getFreeSlots (granularidade de 30 min) e acrescenta a sobreposição do paciente', () => {
  const state = emptyDay();
  const base = getFreeSlots(state, 'pro-clara', '2026-11-10', 30);
  assert.deepEqual(availableSlots(state, { professionalId: 'pro-clara', duration: 30, date: '2026-11-10' }), base);
  assert.ok(base.includes('08:00') && base.includes('08:30'));
  // The patient is busy with another professional at 09:00–10:00.
  state.appointments.push({ id: 'busy', patientId: 'patient-1', professionalId: 'pro-lucas', specialty: 'Dermatologia', date: '2026-11-10', start: '09:00', duration: 60, status: 'confirmada', events: [] });
  const withPatient = availableSlots(state, { professionalId: 'pro-clara', duration: 30, patientId: 'patient-1', date: '2026-11-10' });
  assert.ok(!withPatient.includes('09:00') && !withPatient.includes('09:30'));
  assert.ok(withPatient.includes('08:30') && withPatient.includes('10:00'));
  // 45 min starting 08:30 would end 09:15, overlapping.
  assert.ok(!availableSlots(state, { professionalId: 'pro-clara', duration: 45, patientId: 'patient-1', date: '2026-11-10' }).includes('08:30'));
  // Every offered slot passes the same validation as the save command.
  for (const start of withPatient) assert.doesNotThrow(() => validateAppointment(state, { patientId: 'patient-1', professionalId: 'pro-clara', specialty: 'Cardiologia', date: '2026-11-10', start, duration: 30, status: 'agendada' }));
  assert.deepEqual(availableSlots(state, { professionalId: '', duration: 30, date: '2026-11-10' }), []);
});

test('availableSlots: excludeAppointmentId libera o horário da própria consulta na remarcação', () => {
  const ana = seed.appointments.find(a => a.id === 'appt-ana')!;
  const query = { professionalId: ana.professionalId, duration: 30, patientId: ana.patientId, date: ana.date };
  assert.ok(!availableSlots(seed, query).includes(ana.start));
  assert.ok(availableSlots(seed, { ...query, excludeAppointmentId: ana.id }).includes(ana.start));
  // Past times today are never offered (now = 10:15).
  assert.ok(availableSlots(seed, { ...query, excludeAppointmentId: ana.id }).every(slot => slot > '10:15'));
});

test('availableDaysInMonth: um valor por dia, passado e clínica fechada sem horários', () => {
  const query = { professionalId: 'pro-lucas', duration: 30, patientId: 'patient-2', month: '2026-11' };
  const days = availableDaysInMonth(seed, query);
  assert.equal(Object.keys(days).length, 30);
  assert.equal(days['2026-11-08'], 0);
  assert.equal(days['2026-11-15'], 0, 'domingo: Dr. Lucas não atende');
  for (const [date, count] of Object.entries(days)) assert.equal(count, date < '2026-11-09' ? 0 : availableSlots(seed, { ...query, date }).length, date);
  assert.ok(days['2026-11-10'] > 0);
  assert.equal(Object.keys(availableDaysInMonth(seed, { ...query, month: '2027-02' })).length, 28);
  assert.equal(firstAvailableDay(seed, query, '2026-11-15'), '2026-11-16');
});

test('appointmentSummaryLine, appointmentDayLine e durações', () => {
  assert.equal(appointmentSummaryLine({ date: '2026-11-10', start: '10:30', duration: 30, professional: 'Dra. Clara Mendes', specialty: 'Cardiologia' }), 'Terça, 10 de nov. · 10:30–11:00 · Dra. Clara Mendes · Cardiologia');
  assert.equal(appointmentSummaryLine({ date: '2026-11-10', start: '09:45', duration: 45 }), 'Terça, 10 de nov. · 09:45–10:30');
  assert.equal(appointmentDayLine({ date: '2026-10-29', start: '16:00', duration: 30 }), 'Quinta, 29 de outubro · 16:00–16:30');
  assert.deepEqual(durationOptions(30), [15, 30, 45, 60, 90, 120]);
  assert.deepEqual(durationOptions(75), [15, 30, 45, 60, 75, 90, 120]);
});

test('appointmentEventLine: ação e família do evento', () => {
  const base = { id: 'e', at: '2026-11-09T10:00:00-03:00', authorId: 'user-marina', description: 'Descrição livre.' };
  assert.deepEqual(appointmentEventLine({ ...base, type: 'appointment.create' }), { action: 'agendou a consulta', tone: 'neutral' });
  assert.deepEqual(appointmentEventLine({ ...base, type: 'appointment.reschedule', previousStart: '2026-11-09 11:30', newStart: '2026-11-10 14:00' }), { action: 'remarcou de 9/11 11:30 para 10/11 14:00', tone: 'warning' });
  assert.equal(appointmentEventLine({ ...base, type: 'appointment.falta' }).tone, 'danger');
  assert.equal(appointmentEventLine({ ...base, type: 'appointment.realizada' }).tone, 'success');
  assert.equal(appointmentEventLine({ ...base, type: 'appointment.confirmada' }).tone, 'info');
  assert.deepEqual(appointmentEventLine({ ...base, type: 'outro' }), { action: 'Descrição livre.', tone: 'neutral' });
});

test('startTimeIssue aplica as regras do salvamento, com ou sem paciente', () => {
  const state = emptyDay();
  const query = { professionalId: 'pro-clara', specialty: 'Cardiologia', duration: 30, date: '2026-11-10' };
  assert.equal(startTimeIssue(state, query, '09:30'), '');
  assert.match(startTimeIssue(state, query, '07:00'), /fora da disponibilidade/);
  assert.match(startTimeIssue(state, { ...query, date: '2026-11-09' }, '09:00'), /horário futuro/);
  state.appointments.push({ id: 'busy', patientId: 'patient-1', professionalId: 'pro-lucas', specialty: 'Dermatologia', date: '2026-11-10', start: '09:30', duration: 30, status: 'confirmada', events: [] });
  assert.equal(startTimeIssue(state, query, '09:30'), '');
  assert.match(startTimeIssue(state, { ...query, patientId: 'patient-1' }, '09:30'), /paciente já tem/);
  assert.equal(startTimeIssue(state, { ...query, patientId: 'patient-1', excludeAppointmentId: 'busy' }, '09:30'), '');
});
