import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../src/lib/demo-data';
import { getMetrics, getPeriod } from '../src/lib/metrics';
import { professionalMetrics } from '../src/lib/management-presentation';

test('professional breakdown matches aggregate scope after specialty change and inactivation', () => {
  const state = createDemoState('2026-11-09');
  const period = getPeriod(state.referenceDate, 7);
  const professional = state.professionals.find(p => p.id === 'pro-clara')!;
  professional.specialties = ['Dermatologia']; professional.active = false;
  const rows = professionalMetrics(state, period, '', 'Cardiologia');
  const historical = rows.find(row => row.professional.id === professional.id)!;
  assert.ok(historical);
  assert.ok(historical.metrics.total > 0);
  assert.ok(historical.metrics.availableMinutes > 0);
  const aggregate = getMetrics(state, period, '', 'Cardiologia');
  for (const key of ['planned', 'completed', 'cancelled', 'missed', 'availableMinutes', 'bookedMinutes'] as const) {
    assert.equal(rows.reduce((sum, row) => sum + row.metrics[key], 0), aggregate[key]);
  }
});

test('ordering keeps undefined rates last in either direction without changing source records', () => {
  const state = createDemoState('2026-11-09');
  const period = getPeriod(state.referenceDate, 1);
  state.professionals[0].availability = [];
  const original = JSON.stringify(state);
  for (const order of ['asc', 'desc'] as const) {
    const rows = professionalMetrics(state, period, '', '', 'occupancy', order);
    assert.equal(rows.at(-1)!.professional.id, state.professionals[0].id);
    const rates = rows.map(row => row.metrics.occupancy).filter((value): value is number => value !== null);
    assert.deepEqual(rates, [...rates].sort((a, b) => order === 'asc' ? a - b : b - a));
  }
  assert.equal(JSON.stringify(state), original);
});

test('professional filters respect selected records and unknown filters return an empty breakdown', () => {
  const state = createDemoState('2026-11-09');
  const period = getPeriod(state.referenceDate, 30);
  const id = state.professionals[0].id;
  assert.equal(professionalMetrics(state, period, id).length, 1);
  assert.equal(professionalMetrics(state, period, 'missing').length, 0);
  assert.equal(professionalMetrics(state, period, '', 'Especialidade inexistente').length, 0);
});
