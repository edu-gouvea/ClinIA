/** Comparisons describe direction separately from whether a change is desirable.
 * Counts with a zero baseline have no relative comparison; rates use points. */
export function metricComparison(current: number | null, previous: number | null, rate = false, preference: 'higher' | 'lower' | 'neutral' = 'neutral') {
  if (current === null || previous === null) return { text: 'Sem dados para comparar', direction: 'none', tone: 'neutral' } as const;
  if (!rate && previous === 0) return { text: 'Sem base de comparação', direction: 'none', tone: 'neutral' } as const;
  const delta = current - previous;
  const value = rate ? delta.toFixed(1).replace('.', ',') : (delta / previous * 100).toFixed(0);
  const tone = delta === 0 || preference === 'neutral' ? 'neutral' : (delta > 0) === (preference === 'higher') ? 'positive' : 'negative';
  return { text: `${delta >= 0 ? '+' : ''}${value}${rate ? ' p.p.' : '%'} no período`, direction: delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down', tone } as const;
}
