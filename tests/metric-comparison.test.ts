import test from 'node:test';
import assert from 'node:assert/strict';
import { metricComparison } from '../src/lib/metric-comparison';

test('comparison distinguishes direction from favorable outcomes and neutral volume', () => {
  assert.equal(metricComparison(12, 10, false, 'higher').tone, 'positive');
  assert.equal(metricComparison(8, 10, false, 'higher').tone, 'negative');
  assert.deepEqual(metricComparison(5, 10, true, 'lower'), { text: '-5,0 p.p. no período', direction: 'down', tone: 'positive' });
  assert.equal(metricComparison(10, 5, true, 'lower').tone, 'negative');
  assert.equal(metricComparison(12, 10).tone, 'neutral');
  assert.equal(metricComparison(10, 10, false, 'higher').direction, 'flat');
});

test('missing denominators never imply an upward trend; a zero rate remains comparable', () => {
  assert.deepEqual(metricComparison(null, 10), { text: 'Sem dados para comparar', direction: 'none', tone: 'neutral' });
  assert.equal(metricComparison(10, null).direction, 'none');
  assert.deepEqual(metricComparison(10, 0), { text: 'Sem base de comparação', direction: 'none', tone: 'neutral' });
  assert.deepEqual(metricComparison(2, 0, true, 'lower'), { text: '+2,0 p.p. no período', direction: 'up', tone: 'negative' });
});
