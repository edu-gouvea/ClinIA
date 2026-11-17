import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../src/lib/demo-data';
import { CommandError, commandErrorFrom, httpStatus, isCommandError } from '../src/lib/errors';
import { getFreeSlots } from '../src/lib/metrics';
import { failNextRequest, runDemoCommand } from '../src/lib/demo/demo-adapter';
import { runCommand } from '../src/lib/services';
import type { Command, DemoState } from '../src/lib/types';

const seed = () => createDemoState('2026-11-09');
async function failure(state: DemoState, command: Command): Promise<CommandError> {
  try { await runCommand(state, command); } catch (cause) { assert.ok(isCommandError(cause), 'every rejection is a CommandError'); return cause; }
  assert.fail('the command should have been rejected');
}

test('agenda: sobreposição é conflito no horário; consulta inexistente é not_found', async () => {
  const state = seed();
  const taken = state.appointments.find(a => a.date > state.referenceDate && a.status !== 'cancelada')!;
  const other = state.patients.find(p => p.id !== taken.patientId)!;
  const overlap = await failure(state, { type: 'appointment.save', input: { patientId: other.id, professionalId: taken.professionalId, specialty: taken.specialty, date: taken.date, start: taken.start, duration: 30, status: 'agendada' } });
  assert.equal(overlap.code, 'conflict');
  assert.equal(overlap.field, 'start');
  assert.equal(httpStatus[overlap.code], 409);
  const missing = await failure(state, { type: 'appointment.status', id: 'nao-existe', status: 'confirmada' });
  assert.deepEqual([missing.code, missing.field], ['not_found', undefined]);
});

test('transições e posse: estado inválido e conversa de outro atendente', async () => {
  const state = seed();
  const done = state.appointments.find(a => a.status === 'realizada')!;
  assert.equal((await failure(state, { type: 'appointment.status', id: done.id, status: 'cancelada' })).code, 'invalid_state');
  const conversation = state.conversations.find(c => c.status === 'humano' && c.assigneeId !== state.currentUserId)!;
  assert.equal((await failure(state, { type: 'conversation.send', id: conversation.id, text: 'Oi', messageId: 'm-x' })).code, 'forbidden');
});

test('cadastro: o erro nomeia o campo; telefone duplicado é conflito', async () => {
  const state = seed();
  const phone = await failure(state, { type: 'patient.save', input: { name: 'Pessoa Fictícia', phone: '123', insurance: '', notes: '' } });
  assert.deepEqual([phone.code, phone.field], ['validation', 'phone']);
  const duplicate = await failure(state, { type: 'patient.save', input: { name: 'Pessoa Fictícia', phone: state.patients[0].phone, insurance: '', notes: '' } });
  assert.deepEqual([duplicate.code, duplicate.field], ['conflict', 'phone']);
});

test('falha temporária é unavailable e pode ser repetida sem mudanças', async () => {
  const state = seed();
  const professional = state.professionals.find(p => p.active)!;
  const date = state.referenceDate;
  const start = getFreeSlots(state, professional.id, date)[0];
  const command: Command = { type: 'appointment.save', input: { patientId: state.patients[0].id, professionalId: professional.id, specialty: professional.specialties[0], date, start, duration: 30, status: 'agendada' } };
  failNextRequest();
  let error: CommandError | undefined;
  try { await runDemoCommand(state, command); } catch (cause) { if (isCommandError(cause)) error = cause; }
  assert.ok(error);
  assert.equal(error.code, 'unavailable');
  assert.equal(error.retryable, true);
  await runDemoCommand(state, command);
});

test('a resposta da API vira o mesmo erro; códigos desconhecidos são tratados como indisponibilidade', () => {
  const fromApi = commandErrorFrom({ code: 'conflict', message: 'Horário ocupado.', field: 'start' });
  assert.deepEqual([fromApi.code, fromApi.message, fromApi.field], ['conflict', 'Horário ocupado.', 'start']);
  const unknown = commandErrorFrom({ code: 'teapot' });
  assert.equal(unknown.code, 'unavailable');
  assert.equal(unknown.message, 'Não foi possível concluir. Tente novamente.');
  assert.equal(commandErrorFrom(null).code, 'unavailable');
});
