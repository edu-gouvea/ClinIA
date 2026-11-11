import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoState } from '../src/lib/demo-data';
import { getMetrics, getPeriod } from '../src/lib/metrics';
import { teamRoster } from '../src/lib/team-presentation';

test('roster combines current registration filters with unchanged period metrics', () => {
  const state = createDemoState('2026-11-09'); const period = getPeriod(state.referenceDate, 30);
  const professional = state.professionals[0]; professional.name = 'Médica Fictícia'; professional.active = false;
  const rows = teamRoster(state, period, 'medica ficticia', professional.specialties[0], 'inactive');
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].metrics, getMetrics(state, period, professional.id));
  assert.equal(rows[0].weeklyMinutes, professional.availability.reduce((sum, slot) => { const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)); return sum + minute(slot.end) - minute(slot.start); }, 0));
  assert.equal(teamRoster(state, period, 'medica', '', 'active').length, 0);
});

test('roster ordering leaves missing occupancy last and never mutates registrations', () => {
  const state = createDemoState('2026-11-09'); const period = getPeriod(state.referenceDate, 1);
  state.professionals[0].availability = []; const original = JSON.stringify(state);
  for (const order of ['asc', 'desc'] as const) {
    const rows = teamRoster(state, period, '', '', '', 'occupancy', order);
    assert.equal(rows.at(-1)!.professional.id, state.professionals[0].id);
    const values = rows.map(row => row.metrics.occupancy).filter((value): value is number => value !== null);
    assert.deepEqual(values, [...values].sort((a, b) => order === 'asc' ? a - b : b - a));
  }
  assert.equal(JSON.stringify(state), original);
});
