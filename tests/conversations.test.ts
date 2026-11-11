import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { orderConversations } from '../src/lib/conversation-presentation';

test('operational ordering prioritizes waiting and owned threads without changing records', () => {
  const state = createDemoState('2026-11-09');
  const before = JSON.stringify(state.conversations);
  const ordered = orderConversations(state.conversations, state.currentUserId);
  assert.equal(ordered[0].status, 'aguardando');
  const owned = ordered.findIndex(c => c.status === 'humano' && c.assigneeId === state.currentUserId);
  assert.ok(ordered.slice(0, owned).every(c => c.status === 'aguardando'));
  assert.equal(ordered.at(-1)?.status, 'encerrada');
  assert.equal(JSON.stringify(state.conversations), before);
});

test('waiting queue follows oldest request even when another thread has a newer message', () => {
  const state = createDemoState('2026-11-09');
  const [a, b] = state.conversations.filter(c => c.status === 'aguardando');
  a.requestedAt = '2026-11-09T08:00:00-03:00';
  b.requestedAt = '2026-11-09T09:00:00-03:00';
  assert.equal(orderConversations([b, a], state.currentUserId)[0].id, a.id);
});
