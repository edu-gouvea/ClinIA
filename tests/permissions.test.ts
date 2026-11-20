import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../src/lib/demo-data';
import { isCommandError } from '../src/lib/errors';
import { can, currentUser, routePermissions } from '../src/lib/permissions';
import { runCommand } from '../src/lib/services';
import { isDemoState, upgradeStoredState } from '../src/lib/state-validation';

test('administração acessa a gestão; recepção opera agenda, pacientes e conversas', () => {
  const state = createDemoState('2026-11-09');
  const admin = currentUser(state)!;
  const attendant = state.users.find(user => user.access === 'attendant')!;
  for (const permission of Object.values(routePermissions)) {
    assert.equal(can(admin, permission), true);
    assert.equal(can(attendant, permission), false);
  }
  assert.equal(can(undefined, 'reports.view'), false);
});

test('o domínio recusa alterações administrativas da recepção com forbidden', async () => {
  const state = createDemoState('2026-11-09');
  state.currentUserId = state.users.find(user => user.access === 'attendant')!.id;
  for (const command of [
    { type: 'clinic.save', input: state.clinic },
    { type: 'knowledge.save', input: { title: 'T', category: 'C', content: 'X', archived: false } },
    { type: 'professional.save', id: state.professionals[0].id, input: { ...state.professionals[0], active: false } },
  ] as const) {
    await assert.rejects(runCommand(state, command), (cause: unknown) => isCommandError(cause) && cause.code === 'forbidden');
  }
  // Reception work is unaffected.
  const open = state.appointments.find(a => a.status === 'agendada' && a.date > state.referenceDate)!;
  const next = await runCommand(state, { type: 'appointment.status', id: open.id, status: 'confirmada' });
  assert.equal(next.appointments.find(a => a.id === open.id)?.status, 'confirmada');
});

test('bases salvas sem nível de acesso ganham um, inferido do cargo', () => {
  const stored = JSON.parse(JSON.stringify(createDemoState('2026-11-09')));
  for (const user of stored.users) delete user.access;
  assert.equal(isDemoState(stored), false, 'the current shape requires access');
  assert.equal(upgradeStoredState(stored), true);
  assert.equal(isDemoState(stored), true);
  assert.deepEqual(stored.users.map((user: { access: string }) => user.access), ['admin', 'attendant', 'attendant']);
  assert.equal(upgradeStoredState('não é um estado'), false);
});
