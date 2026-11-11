import test from 'node:test';
import assert from 'node:assert/strict';
import { answerQuestion, assistantSuggestions, describeAssistantContext } from '../src/lib/assistant';
import { createDemoState } from '../src/lib/demo-data';
import { getMetrics } from '../src/lib/metrics';

const state = createDemoState('2026-11-09');
test('all five supported intents answer using local records and navigable links', () => {
  for (const question of assistantSuggestions) {
    const response = answerQuestion(state, question, 'Conversa com Ana', '/conversas?id=conversation-1');
    assert.ok(response.answer.length > 30);
    assert.ok(response.links.length > 0);
    assert.ok(response.links.every(link => /^\/(conversas|gestao\/)/.test(link.href)));
    assert.equal(response.context, 'Conversa com Ana');
  }
});
test('unsupported questions are explicitly limited and removed context is respected', () => {
  assert.match(answerQuestion(state, 'Qual será o clima?', '', '/inicio').answer, /apenas cinco intenções/);
  const response = answerQuestion(state, 'Resuma esta conversa.', '', '/conversas?id=conversation-1');
  assert.match(response.answer, /Selecione uma conversa/);
  assert.equal(response.context, 'Sem contexto da página');
});
test('cancellation answers preserve current period, professional and specialty filters', () => {
  const response = answerQuestion(state, 'Como foram os cancelamentos?', 'Visão gerencial', '/gestao/visao-gerencial?period=7&professional=pro-clara&specialty=Cardiologia');
  const m = getMetrics(state, { start: '2026-11-03', end: '2026-11-09' }, 'pro-clara', 'Cardiologia');
  assert.match(response.answer, new RegExp(`${m.cancelled} foram canceladas`));
  const link = new URL(response.links[0].href, 'https://clinia.local');
  assert.equal(link.searchParams.get('professional'), 'pro-clara');
  assert.equal(link.searchParams.get('specialty'), 'Cardiologia');
  assert.equal(link.searchParams.get('from'), '2026-11-03');
  assert.equal(link.searchParams.get('to'), '2026-11-09');
});
test('agenda context uses its day and historical answers retain their snapshot', () => {
  const response = answerQuestion(state, 'Cancelamentos no período', 'Agenda', '/gestao/agenda?date=2026-11-10');
  const link = new URL(response.links[0].href, 'https://clinia.local');
  assert.equal(link.searchParams.get('from'), '2026-11-10');
  const previous = response.answer;
  const changed = structuredClone(state);
  changed.appointments.filter(a => a.date === '2026-11-10').forEach(a => { a.status = 'cancelada'; });
  const current = answerQuestion(changed, 'Cancelamentos no período', 'Agenda', '/gestao/agenda?date=2026-11-10');
  assert.notEqual(current.answer, previous);
  assert.equal(response.answer, previous);
});
test('context is human-readable and malformed URL periods fall back safely', () => {
  const description = describeAssistantContext(state, '/conversas', new URLSearchParams('id=conversation-1'));
  assert.match(description, /Ana Beatriz Santos/);
  assert.doesNotMatch(description, /conversation-1|id=/);
  for (const url of ['/inicio?period=Infinity', '/gestao/agenda?date=2026-02-31', '/inicio?from=bad&to=bad', '/inicio?from=2020-01-01&to=2030-01-01']) {
    assert.doesNotThrow(() => answerQuestion(state, 'Cancelamentos', 'Página', url));
  }
});
