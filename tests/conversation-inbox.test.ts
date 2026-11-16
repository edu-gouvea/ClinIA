import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { closedInfo, formatElapsed, inboxCounts, matchesFilters, previewPrefix, resolveInbox, waitingSince } from '../src/lib/conversation-inbox';

const state = createDemoState('2026-11-09');
const resolve = (query: string) => resolveInbox(new URLSearchParams(query), state.conversations, state.currentUserId);

test('URL: view explícita, links antigos e conversa aberta resolvem a aba e o filtro', () => {
  assert.deepEqual(resolve('view=finalizadas'), { view: 'finalizadas', status: '', assignee: '', reason: '' });
  assert.deepEqual(resolve('status=aguardando'), { view: 'pendentes', status: '', assignee: '', reason: '' });
  assert.deepEqual(resolve('status=ia'), { view: 'atendimento', status: 'ia', assignee: '', reason: '' });
  assert.deepEqual(resolve('status=encerrada'), { view: 'finalizadas', status: '', assignee: '', reason: '' });
  assert.deepEqual(resolve('assignee=me'), { view: 'atendimento', status: '', assignee: 'me', reason: '' });
  // Ana's reschedule request is pending in the seed, so the legacy link opens "Pendentes".
  assert.deepEqual(resolve('reason=remarcacao'), { view: 'pendentes', status: '', assignee: '', reason: 'remarcacao' });
  assert.equal(resolve('id=conversation-6').view, 'finalizadas');
  assert.equal(resolve('id=conversation-3').view, 'atendimento');
  assert.equal(resolve('').view, 'pendentes');
  // A status filter only narrows "Em atendimento".
  assert.equal(resolve('view=pendentes&status=ia').status, '');
});

test('reason=remarcacao segue a conversa quando ela sai da fila', () => {
  const claimed = structuredClone(state);
  const ana = claimed.conversations.find(c => c.id === 'conversation-1')!;
  ana.status = 'humano'; ana.assigneeId = claimed.currentUserId;
  assert.equal(resolveInbox(new URLSearchParams('reason=remarcacao'), claimed.conversations, claimed.currentUserId).view, 'atendimento');
});

test('contagens por aba e filtros equivalentes aos selects anteriores', () => {
  assert.deepEqual(inboxCounts(state.conversations, state.currentUserId), { pendentes: 2, atendimento: 4, finalizadas: 2, mine: 1, ai: 2 });
  const inService = state.conversations.filter(c => matchesFilters(c, { view: 'atendimento', status: '', assignee: 'me', reason: '' }, state.currentUserId));
  assert.deepEqual(inService.map(c => c.id), ['conversation-3']);
  const other = state.conversations.filter(c => matchesFilters(c, { view: 'atendimento', status: '', assignee: 'other', reason: '' }, state.currentUserId));
  assert.deepEqual(other.map(c => c.id), ['conversation-4']);
  const reschedule = state.conversations.filter(c => matchesFilters(c, { view: 'pendentes', status: '', assignee: '', reason: 'remarcacao' }, state.currentUserId));
  assert.deepEqual(reschedule.map(c => c.id), ['conversation-1']);
});

test('"aguarda há" usa o último encaminhamento, ou a última mensagem do paciente', () => {
  const ana = state.conversations.find(c => c.id === 'conversation-1')!;
  assert.equal(waitingSince(ana), ana.events.find(e => e.type === 'conversation.request')!.at);
  assert.equal(formatElapsed(waitingSince(ana)!, state.now), 'há 58 min');
  const noEvents = { ...ana, events: [] };
  assert.equal(waitingSince(noEvents), ana.messages.filter(m => m.author === 'paciente').at(-1)!.at);
  assert.equal(formatElapsed('2026-11-09T08:00:00-03:00', '2026-11-09T10:15:00-03:00'), 'há 2 h');
  assert.equal(formatElapsed('2026-11-09T10:15:00-03:00', '2026-11-09T10:15:20-03:00'), 'há menos de 1 min');
  assert.equal(formatElapsed('2026-11-09T11:00:00-03:00', '2026-11-09T10:15:00-03:00'), 'há menos de 1 min');
});

test('prefixo da prévia e encerramento identificam autor sem inventar nomes', () => {
  const base = { id: 'm', text: 't', at: state.now, delivery: 'enviada' as const, sessionId: 's' };
  assert.equal(previewPrefix({ ...base, author: 'paciente' }, state), '');
  assert.equal(previewPrefix({ ...base, author: 'ia' }, state), 'IA: ');
  assert.equal(previewPrefix({ ...base, author: 'humano', authorId: state.currentUserId }, state), 'Você: ');
  assert.equal(previewPrefix({ ...base, author: 'humano', authorId: 'user-rafael' }, state), 'Rafael: ');
  assert.equal(previewPrefix({ ...base, author: 'humano', authorId: 'desconhecido' }, state), 'Atendente: ');
  const closed = state.conversations.find(c => c.id === 'conversation-6')!;
  assert.deepEqual(closedInfo(closed, state), { when: 'hoje às 09:43', by: 'você' });
  assert.equal(closedInfo(state.conversations.find(c => c.id === 'conversation-1')!, state), undefined);
});
