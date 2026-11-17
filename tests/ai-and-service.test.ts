import test from 'node:test';
import assert from 'node:assert/strict';
import { aiTools, humanOnlyCommands, toolsFor } from '../src/lib/ai-tools';
import { createDemoState } from '../src/lib/demo-data';
import { getPeriod } from '../src/lib/metrics';
import { serviceMetrics } from '../src/lib/service-analysis';
import { runCommand } from '../src/lib/services';
import type { Command } from '../src/lib/types';

// Compile-time exhaustive: adding a Command type without listing it here fails typecheck.
const allCommands = {
  'appointment.save': true, 'appointment.status': true, 'patient.save': true, 'professional.save': true, 'clinic.save': true,
  'block.save': true, 'block.delete': true, 'knowledge.save': true, 'conversation.claim': true, 'conversation.return': true,
  'conversation.close': true, 'conversation.send': true, 'conversation.delivery': true, 'conversation.receive': true,
  'conversation.ai_reply': true, 'assistant.add': true,
} satisfies Record<Command['type'], true>;

test('catálogo de ferramentas: cada comando é de uma ferramenta ou só de pessoas, nunca dos dois', () => {
  const used = new Set(aiTools.flatMap(tool => tool.command ? [tool.command] : []));
  for (const command of Object.keys(allCommands) as Command['type'][]) {
    assert.ok(used.has(command) !== humanOnlyCommands.includes(command), `${command}: exatamente um dos dois`);
  }
  assert.equal(new Set(aiTools.map(tool => tool.name)).size, aiTools.length, 'nomes únicos');
});

test('escopos: o agente do paciente só escreve nas consultas dele; o assistente interno só propõe', () => {
  for (const tool of toolsFor('patient').filter(tool => tool.kind === 'write')) {
    assert.ok(tool.command === 'conversation.ai_reply' || tool.scope?.includes('patientId'), `${tool.name} precisa de escopo do paciente`);
  }
  for (const tool of toolsFor('internal').filter(tool => tool.kind === 'write')) assert.equal(tool.requiresConfirmation, true, tool.name);
  for (const tool of aiTools) {
    assert.equal(tool.kind === 'write', !!tool.command, `${tool.name}: escrita ⇔ comando`);
    assert.ok(!tool.command || !humanOnlyCommands.includes(tool.command), tool.name);
  }
});

test('atendimento no WhatsApp: sessões, resolvidas pela IA, encaminhamentos e tempo até assumir', async () => {
  let state = createDemoState('2026-11-09');
  const week = getPeriod(state.referenceDate, 7);
  const seed = serviceMetrics(state, week);
  assert.deepEqual([seed.sessions, seed.aiOnly, seed.handoffs, seed.aiShare, seed.claimMinutes, seed.claimBase], [8, 2, 6, 25, 3, 4]);
  assert.deepEqual(serviceMetrics(state, { start: '2026-10-01', end: '2026-10-07' }), { sessions: 0, aiOnly: 0, handoffs: 0, aiShare: null, claimMinutes: null, claimBase: 0 });
  // A new session that the AI resolves alone raises the AI share.
  const closed = state.conversations.find(c => c.status === 'encerrada')!;
  state = await runCommand(state, { type: 'conversation.receive', id: closed.id, text: 'Qual o endereço?' });
  state = await runCommand(state, { type: 'conversation.ai_reply', id: closed.id, text: 'Rua das Acácias, 120.' });
  const after = serviceMetrics(state, week);
  assert.deepEqual([after.sessions, after.aiOnly, after.handoffs], [9, 3, 6]);
});
