import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoState } from '../src/lib/demo-data';
import { getMetrics, getPeriod } from '../src/lib/metrics';
import { professionalMetrics } from '../src/lib/management-presentation';
import { countDelta, formatCountDelta, metricComparison, signedCountDelta } from '../src/lib/metric-comparison';
import { dailyBreakdown, outcomeBreakdown, pendingResults, previousDailyTotals, previousRange, professionalActivity, resolveSort } from '../src/lib/management-analysis';

const seed = createDemoState('2026-11-09');
const week = getPeriod(seed.referenceDate, 7);
const month = getPeriod(seed.referenceDate, 30);
const today = getPeriod(seed.referenceDate, 1);

test('countDelta e formatadores: diferença absoluta, igualdade e base zero', () => {
  assert.deepEqual(countDelta(102, 119), { kind: 'down', abs: 17 });
  assert.deepEqual(countDelta(27, 8), { kind: 'up', abs: 19 });
  assert.deepEqual(countDelta(11, 11), { kind: 'equal', abs: 0 });
  assert.deepEqual(countDelta(3, 0), { kind: 'no-base', abs: 3 });
  assert.deepEqual(countDelta(0, 0), { kind: 'no-base', abs: 0 });
  assert.equal(formatCountDelta(countDelta(102, 119)), '▼ 17');
  assert.equal(formatCountDelta(countDelta(27, 8)), '▲ 19');
  assert.equal(formatCountDelta(countDelta(11, 11)), 'Sem variação');
  assert.equal(formatCountDelta(countDelta(3, 0)), 'Sem base de comparação');
  assert.equal(formatCountDelta(countDelta(1500, 100)), '▲ 1.400');
  assert.deepEqual([signedCountDelta(102, 119), signedCountDelta(12, 12), signedCountDelta(27, 8), signedCountDelta(3, 0)], ['−17', '0', '+19', '+3']);
  // Shared KPI comparison: counts now absolute, tone unchanged.
  assert.deepEqual(metricComparison(102, 119, false, 'higher'), { text: '-17 no período', direction: 'down', tone: 'negative' });
  assert.deepEqual(metricComparison(11, 11, false, 'lower'), { text: 'Sem variação', direction: 'flat', tone: 'neutral' });
});

test('previousRange: mesma duração imediatamente antes, inclusive um dia e virada de mês', () => {
  assert.deepEqual(previousRange({ start: '2026-11-03', end: '2026-11-09' }), { start: '2026-10-27', end: '2026-11-02' });
  assert.deepEqual(previousRange({ start: '2026-11-09', end: '2026-11-09' }), { start: '2026-11-08', end: '2026-11-08' });
  assert.deepEqual(previousRange({ start: '2026-03-01', end: '2026-03-30' }), { start: '2026-01-30', end: '2026-02-28' });
});

test('dailyBreakdown soma o total do período; previousDailyTotals alinha por posição', () => {
  const days = dailyBreakdown(seed, {}, week);
  assert.equal(days.length, 7);
  assert.equal(days.reduce((sum, d) => sum + d.total, 0), getMetrics(seed, week).total);
  for (const d of days) assert.equal(d.total, d.completed + d.missed + d.cancelled + d.planned);
  const previous = previousDailyTotals(seed, {}, week);
  assert.equal(previous.length, 7);
  assert.equal(previous[0].date, '2026-10-27');
  assert.equal(previous[6].date, '2026-11-02');
  assert.equal(previous.reduce((sum, d) => sum + d.total, 0), getMetrics(seed, previousRange(week)).total);
  // Position alignment across months (30 days: Oct 11 → Nov 9 vs Sep 11 → Oct 10).
  const long = previousDailyTotals(seed, { professionalId: 'pro-clara' }, month);
  assert.equal(long.length, 30);
  assert.deepEqual([long[0].date, long[29].date], ['2026-09-11', '2026-10-10']);
  const single = previousDailyTotals(seed, {}, today);
  assert.deepEqual(single.map(d => d.date), ['2026-11-08']);
  assert.equal(single[0].total, getMetrics(seed, { start: '2026-11-08', end: '2026-11-08' }).total);
});

test('pendingResults é a lista por trás de getMetrics().pending, com filtros', () => {
  for (const filters of [{}, { professionalId: 'pro-clara' }, { specialty: 'Dermatologia' }]) {
    for (const range of [today, week, month]) {
      const list = pendingResults(seed, filters, range);
      assert.equal(list.length, getMetrics(seed, range, filters.professionalId, filters.specialty).pending);
      assert.ok(list.every(a => a.status === 'agendada' || a.status === 'confirmada'));
    }
  }
  const empty = { ...seed, appointments: [] };
  assert.deepEqual(pendingResults(empty, {}, week), []);
});

test('professionalActivity: mesmas colunas de hoje + realizadas anteriores e em aberto; total agregado', () => {
  const previous = previousRange(week);
  const { rows, total } = professionalActivity(seed, {}, week, previous);
  const base = professionalMetrics(seed, week, '', '', 'completed', 'desc');
  assert.deepEqual(rows.map(r => r.professional.id), base.map(r => r.professional.id));
  for (const row of rows) {
    const current = getMetrics(seed, week, row.professional.id);
    assert.equal(row.realizadas, current.completed);
    assert.equal(row.realizadasAnterior, getMetrics(seed, previous, row.professional.id).completed);
    assert.equal(row.emAberto, current.planned);
    assert.equal(row.ocupacao, current.occupancy);
    assert.equal(row.horasDisponiveis, current.availableMinutes / 60);
  }
  const aggregate = getMetrics(seed, week);
  assert.equal(total.realizadas, aggregate.completed);
  assert.equal(total.taxaFaltas, aggregate.absenceRate, 'denominadores somados, não média das taxas');
  assert.equal(total.realizadas, rows.reduce((sum, r) => sum + r.realizadas, 0));
  // Legacy sort keys map onto the column that now holds the data.
  assert.equal(resolveSort('availableMinutes'), 'occupancy');
  assert.equal(resolveSort('absenceRate'), 'missed');
  assert.equal(resolveSort('planned'), 'planned');
  const byOccupancy = professionalActivity(seed, {}, week, previous, 'availableMinutes', 'desc').rows.map(r => r.ocupacao ?? -1);
  assert.deepEqual(byOccupancy, [...byOccupancy].sort((a, b) => b - a));
  const filtered = professionalActivity(seed, { professionalId: 'pro-clara' }, week, previous);
  assert.deepEqual(filtered.rows.map(r => r.professional.id), ['pro-clara']);
});

test('outcomeBreakdown bate com os KPIs, o gráfico e as pendências', () => {
  const previous = previousRange(week);
  const result = outcomeBreakdown(seed, {}, week, previous);
  const m = getMetrics(seed, week);
  assert.deepEqual(result.current, { realizadas: m.completed, faltas: m.missed, canceladas: m.cancelled, emAberto: m.planned, total: m.total });
  assert.equal(result.current.total, result.current.realizadas + result.current.faltas + result.current.canceladas + result.current.emAberto);
  assert.equal(result.current.total, dailyBreakdown(seed, {}, week).reduce((sum, d) => sum + d.total, 0));
  assert.equal(result.previous.total, getMetrics(seed, previous).total);
  assert.equal(result.emAbertoEncerradas, m.pending);
});
