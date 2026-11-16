import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { dayMonth, daysBetween, monthYearShort, relativeAgo, clinicDate } from '../src/lib/date';
import { rescheduleRequestIds } from '../src/lib/agenda-presentation';
import {
  appointmentWhen, buildPatientTimeline, filterPatients, lastAppointment, latestConversation, longDayLabel, monthTitle, nextAppointment, paginate,
  parseOrder, parseSort, parseView, patientAppointmentsSplit, patientNotes, patientPendencies, patientSessions, patientSummary, sortPatients, viewCounts,
} from '../src/lib/patient-presentation';
import type { Appointment, DemoState } from '../src/lib/types';

const NOW = '2026-11-09T10:15:00-03:00';
function blank(): DemoState {
  const state = createDemoState('2026-11-09');
  return { ...state, appointments: [], conversations: [] };
}
const appt = (id: string, date: string, start: string, status: Appointment['status'], extra: Partial<Appointment> = {}): Appointment =>
  ({ id, patientId: 'patient-1', professionalId: 'pro-clara', specialty: 'Cardiologia', date, start, duration: 30, status, events: [], ...extra });

test('rótulos de tempo relativo e datas curtas', () => {
  assert.equal(daysBetween('2026-10-28', '2026-11-09'), 12);
  assert.equal(relativeAgo('2026-11-09', '2026-11-09'), 'hoje');
  assert.equal(relativeAgo('2026-11-08', '2026-11-09'), 'ontem');
  assert.equal(relativeAgo('2026-10-28', '2026-11-09'), 'há 12 dias');
  assert.equal(relativeAgo('2026-10-05', '2026-11-09'), 'há 1 mês');
  assert.equal(relativeAgo('2026-08-01', '2026-11-09'), 'há 3 meses');
  assert.equal(relativeAgo('2025-10-01', '2026-11-09'), 'há 1 ano');
  assert.equal(dayMonth('2026-10-29'), '29 out.');
  assert.equal(dayMonth('2026-11-03'), '3 nov.');
  assert.equal(monthYearShort('2026-09-14'), 'set. 2026');
  assert.equal(clinicDate('2026-11-10T01:30:00Z'), '2026-11-09');
  assert.equal(appointmentWhen('2026-11-09', '11:30', '2026-11-09'), 'Hoje · 11:30');
  assert.equal(appointmentWhen('2026-11-10', '14:00', '2026-11-09'), 'Amanhã · 14:00');
  assert.equal(appointmentWhen('2026-11-12', '09:00', '2026-11-09'), 'Qui, 12 nov. · 09:00');
  assert.equal(longDayLabel('2026-11-10'), 'Terça, 10 de nov.');
  assert.equal(monthTitle('2026-10', NOW), 'Outubro');
  assert.equal(monthTitle('2025-09', NOW), 'Setembro de 2025');
});

test('nextAppointment: primeira futura não cancelada a partir de state.now', () => {
  const state = blank();
  state.appointments = [
    appt('past-open', '2026-11-09', '09:00', 'agendada'),
    appt('future-cancel', '2026-11-09', '11:00', 'cancelada'),
    appt('later', '2026-11-12', '09:00', 'confirmada'),
    appt('soon', '2026-11-09', '14:00', 'agendada'),
    appt('other', '2026-11-09', '10:30', 'agendada', { patientId: 'patient-2' }),
  ];
  assert.equal(nextAppointment(state, 'patient-1')?.id, 'soon');
  assert.equal(nextAppointment(state, 'patient-3'), undefined);
  // Exactly at "now" still counts as upcoming.
  state.appointments.push(appt('now', '2026-11-09', '10:15', 'confirmada'));
  assert.equal(nextAppointment(state, 'patient-1')?.id, 'now');
});

test('lastAppointment: última passada realizada ou falta', () => {
  const state = blank();
  state.appointments = [
    appt('done', '2026-11-02', '09:00', 'realizada'),
    appt('miss', '2026-11-05', '09:00', 'falta'),
    appt('cancel', '2026-11-08', '09:00', 'cancelada'),
    appt('open-past', '2026-11-08', '10:00', 'agendada'),
    appt('future', '2026-11-10', '10:00', 'confirmada'),
  ];
  assert.equal(lastAppointment(state, 'patient-1')?.id, 'miss');
  assert.equal(lastAppointment(blank(), 'patient-1'), undefined);
});

test('patientPendencies: prioridade, deduplicação e tons', () => {
  const seed = createDemoState('2026-11-09');
  const ana = patientPendencies(seed, 'patient-1');
  assert.deepEqual(ana.map(p => p.kind), ['remarcacao', 'confirmar']);
  // Same derivation as Início/Agenda: the flagged appointment is the one the Agenda marks.
  assert.equal(ana[0].appointmentId, 'appt-ana');
  assert.ok(rescheduleRequestIds(seed).has(ana[0].appointmentId!));
  assert.equal(ana[0].conversationId, 'conversation-1');
  assert.deepEqual(ana.map(p => [p.label, p.tone, p.icon]), [['Pediu remarcação', 'warning', 'repeat'], ['A confirmar', 'warning', 'clock']]);

  const state = blank();
  state.appointments = [appt('miss', '2026-11-05', '09:00', 'falta'), appt('next', '2026-11-10', '09:00', 'agendada')];
  state.conversations = [{ id: 'c1', patientId: 'patient-1', status: 'aguardando', assigneeId: null, reason: 'Dúvida', sessionId: 's1', messages: [], events: [] }];
  const list = patientPendencies(state, 'patient-1');
  assert.deepEqual(list.map(p => p.kind), ['conversa', 'confirmar', 'falta']);
  assert.equal(list[2].tone, 'danger');
  assert.equal(list[2].label, 'Faltou na última');
  assert.equal(list[0].label, 'Conversa aguardando');
  // A waiting reschedule conversation is reported once, as "remarcacao".
  state.conversations[0].reason = 'Pedido de remarcação';
  assert.deepEqual(patientPendencies(state, 'patient-1').map(p => p.kind), ['remarcacao', 'confirmar', 'falta']);
  // Closed conversations do not count; a confirmed next appointment does not either.
  state.conversations[0].status = 'encerrada';
  state.appointments[1].status = 'confirmada';
  assert.deepEqual(patientPendencies(state, 'patient-1').map(p => p.kind), ['falta']);
});

test('patientSummary: contagens, desde e profissionais por realizadas', () => {
  const state = blank();
  assert.deepEqual(patientSummary(state, 'patient-1'), { realizadas: 0, proximas: 0, faltas: 0, canceladas: 0, desde: null, profissionais: [] });
  state.appointments = [
    appt('a', '2026-09-14', '09:00', 'realizada'),
    appt('b', '2026-10-01', '09:00', 'realizada', { professionalId: 'pro-lucas' }),
    appt('c', '2026-10-02', '09:00', 'realizada', { professionalId: 'pro-lucas' }),
    appt('d', '2026-10-03', '09:00', 'falta'),
    appt('e', '2026-10-04', '09:00', 'cancelada'),
    appt('f', '2026-11-10', '09:00', 'agendada'),
    appt('g', '2026-11-11', '09:00', 'cancelada'),
  ];
  const summary = patientSummary(state, 'patient-1');
  assert.deepEqual({ ...summary, profissionais: undefined }, { realizadas: 3, proximas: 1, faltas: 1, canceladas: 2, desde: 'set. 2026', profissionais: undefined });
  assert.deepEqual(summary.profissionais.map(p => [p.professionalId, p.realizadas]), [['pro-lucas', 2], ['pro-clara', 1]]);
  const seed = createDemoState('2026-11-09');
  assert.ok(patientSummary(seed, 'patient-1').profissionais.length <= 4);
});

test('buildPatientTimeline: grupos, ordem, sessões e meses carregados', () => {
  const state = blank();
  state.appointments = [
    appt('f2', '2026-11-12', '09:00', 'confirmada'),
    appt('f1', '2026-11-09', '11:30', 'agendada'),
    appt('w1', '2026-11-08', '09:00', 'realizada', { notes: [{ id: 'n1', text: 'v1', professionalId: 'pro-clara', recordedByUserId: 'user-marina', at: '2026-11-08T10:00:00-03:00' }, { id: 'n2', text: 'v2', professionalId: 'pro-clara', recordedByUserId: 'user-marina', at: '2026-11-08T11:00:00-03:00' }] }),
    appt('w2', '2026-11-03', '09:00', 'cancelada', { cancelReason: 'Viagem' }),
    appt('m1', '2026-11-01', '09:00', 'realizada'),
    appt('o1', '2026-10-20', '09:00', 'falta'),
    appt('s1', '2026-09-20', '09:00', 'realizada'),
    appt('y1', '2025-08-20', '09:00', 'realizada'),
  ];
  state.conversations = [{
    id: 'c1', patientId: 'patient-1', status: 'humano', assigneeId: 'user-rafael', reason: 'Pedido de remarcação', sessionId: 's-2', events: [],
    messages: [
      { id: 'm1', author: 'paciente', text: 'Antiga', at: '2026-10-21T09:00:00-03:00', delivery: 'enviada', sessionId: 's-1' },
      { id: 'm2', author: 'paciente', text: 'Oi', at: '2026-11-09T09:00:00-03:00', delivery: 'enviada', sessionId: 's-2' },
      { id: 'm3', author: 'humano', text: 'Olá, posso ajudar', at: '2026-11-09T09:05:00-03:00', delivery: 'enviada', sessionId: 's-2' },
      { id: 'm4', author: 'evento', text: 'Evento', at: '2026-11-09T09:06:00-03:00', delivery: 'enviada', sessionId: 's-2' },
    ],
  }];
  const timeline = buildPatientTimeline(state, 'patient-1', NOW, 2);
  assert.deepEqual(timeline.groups.map(g => g.title), ['Próximas', 'Esta semana', 'Novembro', 'Outubro']);
  assert.deepEqual(timeline.groups[0].items.map(i => i.id), ['f1', 'f2']);
  assert.deepEqual(timeline.groups[1].items.map(i => i.id), ['c1:s-2', 'w1', 'w2']);
  assert.deepEqual(timeline.groups[3].items.map(i => i.id), ['c1:s-1', 'o1']);
  assert.equal(timeline.nextMonth, 'Setembro');
  const session = timeline.groups[1].items[0];
  assert.ok(session.type === 'conversation');
  if (session.type === 'conversation') {
    assert.deepEqual([session.status, session.assignee, session.reason, session.messageCount, session.preview, session.sessionNumber, session.at], ['humano', 'Rafael Melo', 'Pedido de remarcação', 3, 'Olá, posso ajudar', 2, '2026-11-09T09:06:00-03:00']);
  }
  const old = timeline.groups[3].items[0];
  assert.ok(old.type === 'conversation' && old.status === 'encerrada' && old.reason === undefined);
  const noted = timeline.groups[1].items[1];
  assert.ok(noted.type === 'appointment' && noted.latestNote?.text === 'v2' && noted.latestNote.version === 2 && noted.latestNote.author === 'Dra. Clara Mendes');
  const cancelled = timeline.groups[1].items[2];
  assert.ok(cancelled.type === 'appointment' && cancelled.cancelReason === 'Viagem');
  const more = buildPatientTimeline(state, 'patient-1', NOW, 3);
  assert.equal(more.groups.at(-1)?.title, 'Setembro');
  assert.equal(more.nextMonth, 'Agosto de 2025');
  assert.equal(buildPatientTimeline(state, 'patient-1', NOW, 4).nextMonth, null);
  assert.deepEqual(buildPatientTimeline(blank(), 'patient-1', NOW).groups, []);
});

test('filterPatients, viewCounts e sortPatients', () => {
  const seed = createDemoState('2026-11-09');
  assert.equal(filterPatients(seed, {}).length, seed.patients.length);
  assert.deepEqual(filterPatients(seed, { q: 'ana beatriz' }).map(r => r.patient.id), ['patient-1']);
  assert.deepEqual(filterPatients(seed, { q: '90000-0104' }).map(r => r.patient.id), ['patient-4']);
  assert.ok(filterPatients(seed, { insurance: 'Viva Saúde' }).every(r => r.patient.insurance === 'Viva Saúde'));
  assert.ok(filterPatients(seed, { insurance: 'particular' }).every(r => !r.patient.insurance || r.patient.insurance === 'Particular'));
  const pending = filterPatients(seed, { view: 'pendencias' });
  assert.ok(pending.length > 0 && pending.every(r => r.pendencies.length > 0));
  const withoutNext = filterPatients(seed, { view: 'sem-proxima' });
  assert.ok(withoutNext.every(r => !r.next));
  const counts = viewCounts(seed, {});
  assert.deepEqual(counts, { todos: seed.patients.length, pendencias: pending.length, 'sem-proxima': withoutNext.length });
  assert.equal(viewCounts(seed, { q: 'ana beatriz' }).pendencias, 1);

  const rows = filterPatients(seed, {});
  const byNext = sortPatients(rows, 'proxima', 'asc');
  assert.equal(byNext.at(-1)?.next, undefined);
  for (let i = 1; i < byNext.length && byNext[i].next; i++) assert.ok(`${byNext[i - 1].next!.date}${byNext[i - 1].next!.start}` <= `${byNext[i].next!.date}${byNext[i].next!.start}`);
  assert.equal(sortPatients(rows, 'proxima', 'desc').at(-1)?.next, undefined, 'sem próxima vai para o fim nas duas direções');
  const names = sortPatients(rows, 'nome', 'asc').map(r => r.patient.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b, 'pt-BR')));
  assert.deepEqual(sortPatients(rows, 'nome', 'desc').map(r => r.patient.name), [...names].reverse());
  const byLast = sortPatients(rows, 'ultima', 'desc');
  for (let i = 1; i < byLast.length && byLast[i].last; i++) assert.ok(`${byLast[i - 1].last!.date}${byLast[i - 1].last!.start}` >= `${byLast[i].last!.date}${byLast[i].last!.start}`);
  assert.deepEqual([parseView('x'), parseView('pendencias'), parseSort(null), parseSort('nome'), parseOrder('desc'), parseOrder('x')], ['todos', 'pendencias', 'proxima', 'nome', 'desc', 'asc']);
});

test('paginate: 12 por página, limites e posições', () => {
  const rows = Array.from({ length: 25 }, (_, i) => i + 1);
  assert.deepEqual({ ...paginate(rows, 1), items: undefined }, { items: undefined, page: 1, pages: 3, from: 1, to: 12, total: 25 });
  assert.deepEqual(paginate(rows, 3).items, [25]);
  assert.equal(paginate(rows, 9).page, 3);
  assert.equal(paginate(rows, 0).page, 1);
  assert.equal(paginate(rows, Number.NaN).page, 1);
  assert.deepEqual({ ...paginate([], 1), items: undefined }, { items: undefined, page: 1, pages: 1, from: 0, to: 0, total: 0 });
});

test('consultas próximas/anteriores, anotações, sessões e conversa mais recente', () => {
  const state = blank();
  state.appointments = [
    appt('a', '2026-11-01', '09:00', 'realizada', { notes: [{ id: 'n', text: 'Nota A', professionalId: 'pro-clara', recordedByUserId: 'user-marina', at: '2026-11-01T10:00:00-03:00' }] }),
    appt('b', '2026-11-05', '09:00', 'realizada', { professionalId: 'pro-lucas', notes: [{ id: 'n2', text: 'Nota B', professionalId: 'pro-lucas', recordedByUserId: 'user-marina', at: '2026-11-05T10:00:00-03:00' }] }),
    appt('c', '2026-11-10', '09:00', 'agendada'),
    appt('d', '2026-11-11', '09:00', 'cancelada', { professionalId: 'pro-lucas' }),
  ];
  const split = patientAppointmentsSplit(state, 'patient-1');
  assert.deepEqual(split.proximas.map(a => a.id), ['c', 'd']);
  assert.deepEqual(split.anteriores.map(a => a.id), ['b', 'a']);
  assert.deepEqual(patientAppointmentsSplit(state, 'patient-1', 'pro-lucas').proximas.map(a => a.id), ['d']);
  assert.deepEqual(patientNotes(state, 'patient-1').map(n => [n.appointmentId, n.text, n.version, n.author]), [['b', 'Nota B', 1, 'Dr. Lucas Vieira'], ['a', 'Nota A', 1, 'Dra. Clara Mendes']]);
  const seed = createDemoState('2026-11-09');
  assert.equal(latestConversation(seed, 'patient-1')?.id, 'conversation-1');
  assert.equal(latestConversation(seed, 'patient-24'), undefined);
  const sessions = patientSessions(seed, 'patient-1');
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].status, 'aguardando');
  assert.equal(sessions[0].reason, 'Pedido de remarcação');
});
