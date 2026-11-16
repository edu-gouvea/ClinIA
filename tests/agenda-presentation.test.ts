import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import {
  avatarSurfaces, contrastRatio, countByStatus, formatDayTitle, formatMonthTitle, formatWeekTitle, matchesAgendaStatus, offHoursBands,
  closedDaysNote, isClinicClosed, professionalAvatarColors, rangeTitle, rescheduleRequestIds, resolveAgendaView,
} from '../src/lib/agenda-presentation';
import type { Appointment } from '../src/lib/types';

const params = (query: string) => new URLSearchParams(query);
const appointment = (id: string, status: Appointment['status'], date = '2026-11-10', start = '10:00'): Appointment =>
  ({ id, patientId: 'patient-1', professionalId: 'pro-clara', specialty: 'Cardiologia', date, start, duration: 30, status, events: [] });

test('resolveAgendaView: view explícita vence; sem view, profissional abre a semana; semana exige profissional', () => {
  assert.equal(resolveAgendaView(params('')), 'dia');
  assert.equal(resolveAgendaView(params('professional=pro-clara')), 'semana');
  assert.equal(resolveAgendaView(params('view=dia&professional=pro-clara')), 'dia');
  assert.equal(resolveAgendaView(params('view=semana&professional=pro-clara')), 'semana');
  assert.equal(resolveAgendaView(params('view=semana')), 'dia');
  // Legacy English values (assistant links, old bookmarks) keep the historical rule.
  assert.equal(resolveAgendaView(params('view=week')), 'dia');
  assert.equal(resolveAgendaView(params('view=day&professional=pro-clara')), 'semana');
  assert.equal(resolveAgendaView(params('view=week&professional=pro-clara')), 'semana');
});

test('contagens por situação e correspondência de status, inclusive legados', () => {
  const list = [appointment('a', 'agendada'), appointment('b', 'confirmada'), appointment('c', 'confirmada'), appointment('d', 'cancelada'), appointment('e', 'realizada'), appointment('f', 'falta')];
  assert.deepEqual(countByStatus(list), { todas: 6, agendada: 1, confirmada: 2, realizada: 1, falta: 1, cancelada: 1 });
  assert.deepEqual(countByStatus([]), { todas: 0, agendada: 0, confirmada: 0, realizada: 0, falta: 0, cancelada: 0 });
  const now = '2026-11-10T12:00:00-03:00';
  assert.equal(matchesAgendaStatus(list[0], '', now), true);
  assert.equal(matchesAgendaStatus(list[1], 'confirmada', now), true);
  assert.equal(matchesAgendaStatus(list[0], 'confirmada', now), false);
  assert.deepEqual(list.filter(a => matchesAgendaStatus(a, 'previstas', now)).map(a => a.id), ['a', 'b', 'c']);
  assert.equal(matchesAgendaStatus(appointment('late', 'agendada', '2026-11-10', '13:00'), 'pendente', now), false);
  assert.equal(matchesAgendaStatus(appointment('past', 'agendada', '2026-11-10', '09:00'), 'pendente', now), true);
});

test('títulos: só a primeira letra em maiúscula; semana no mesmo mês e entre meses', () => {
  assert.equal(formatDayTitle('2026-11-10'), 'Terça-feira, 10 de novembro');
  assert.equal(formatMonthTitle('2026-11-10'), 'Novembro 2026');
  assert.deepEqual(formatWeekTitle('2026-11-09', '2026-11-13'), { title: '9 – 13 de novembro', year: '2026' });
  assert.deepEqual(formatWeekTitle('2026-11-30', '2026-12-04'), { title: '30 de nov. – 4 de dez.', year: '2026' });
  assert.deepEqual(formatWeekTitle('2026-12-28', '2027-01-01'), { title: '28 de dez. – 1 de jan.', year: '2026–2027' });
});

test('título do recorte do modo lista deriva de from/to/status', () => {
  assert.equal(rangeTitle('2026-11-01', '2026-11-15', 'cancelada'), 'Cancelamentos · 1 a 15 de nov.');
  assert.equal(rangeTitle('2026-11-01', '2026-11-15', 'agendada'), 'Consultas a confirmar · 1 a 15 de nov.');
  assert.equal(rangeTitle('2026-11-30', '2026-12-04'), 'Consultas · 30 de nov. a 4 de dez.');
  assert.equal(rangeTitle('2026-11-10', '2026-11-10', 'previstas'), 'Consultas previstas · 10 de nov.');
  assert.equal(rangeTitle('2026-12-30', '2027-01-02', 'status-desconhecido'), 'Consultas · 30 de dez. de 2026 a 2 de jan. de 2027');
});

test('avatar do profissional: fundo ~14% da cor e iniciais com contraste ≥ 4,5:1 nos dois temas', () => {
  const state = createDemoState('2026-11-09');
  const colors = [...state.professionals.map(p => p.color), '#ffeb3b', '#000000', '#ffffff', '#00ff00', '#123', 'cor-invalida'];
  for (const color of colors) for (const theme of ['light', 'dark'] as const) {
    const { background, ink } = professionalAvatarColors(color, theme);
    assert.match(background, /^#[0-9a-f]{6}$/); assert.match(ink, /^#[0-9a-f]{6}$/);
    assert.ok(contrastRatio(ink, background) >= 4.5, `${color} ${theme}: ${contrastRatio(ink, background).toFixed(2)}`);
    // The tint stays close to the surface, so the avatar never reads as a status colour.
    assert.ok(contrastRatio(background, avatarSurfaces[theme]) < 1.6, `${color} ${theme} tint too strong`);
  }
  assert.equal(professionalAvatarColors('#266b53', 'light').background, '#e1eae7');
  assert.equal(contrastRatio('#000000', '#ffffff').toFixed(1), '21.0');
});

test('faixas fora do expediente: pontas, intervalo e clínica fechada', () => {
  const bounds = { start: 480, end: 1080 };
  assert.deepEqual(offHoursBands(bounds, [{ start: '08:00', end: '12:00' }, { start: '13:00', end: '17:00' }], true), [
    { start: 720, end: 780, label: 'Intervalo' }, { start: 1020, end: 1080, label: 'Fora do expediente' },
  ]);
  assert.deepEqual(offHoursBands(bounds, [{ start: '09:00', end: '18:00' }], true), [{ start: 480, end: 540, label: 'Fora do expediente' }]);
  assert.deepEqual(offHoursBands(bounds, [], true), [{ start: 480, end: 1080, label: 'Fora do expediente' }]);
  assert.deepEqual(offHoursBands(bounds, [{ start: '08:00', end: '12:00' }], false), [{ start: 480, end: 1080, label: 'Clínica fechada' }]);
});

test('dias fechados são indicados de forma simples, nunca escondidos', () => {
  const state = createDemoState('2026-11-09');
  const week = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
  assert.equal(closedDaysNote(state, week), ''); // the demo clinic opens on weekends
  state.clinic.hours = state.clinic.hours.filter(slot => slot.day >= 1 && slot.day <= 5);
  assert.equal(isClinicClosed(state, '2026-11-14'), true);
  assert.equal(isClinicClosed(state, '2026-11-13'), false);
  assert.equal(closedDaysNote(state, week), 'Sábado e domingo: clínica fechada');
  state.clinic.hours = state.clinic.hours.filter(slot => slot.day !== 3);
  assert.equal(closedDaysNote(state, week), 'Quarta-feira, sábado e domingo: clínica fechada');
});

test('pedido de remarcação usa a mesma derivação do Início (conversa aberta + consulta-alvo)', () => {
  const state = createDemoState('2026-11-09');
  assert.deepEqual([...rescheduleRequestIds(state)], ['appt-ana']);
  state.conversations.find(c => c.id === 'conversation-1')!.status = 'encerrada';
  assert.equal(rescheduleRequestIds(state).size, 0);
});
