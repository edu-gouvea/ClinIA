/** Comparisons describe direction separately from whether a change is desirable.
 * Counts compare by absolute difference (a zero baseline has no comparison); rates use points. */
export function metricComparison(current: number | null, previous: number | null, rate = false, preference: 'higher' | 'lower' | 'neutral' = 'neutral') {
  if (current === null || previous === null) return { text: 'Sem dados para comparar', direction: 'none', tone: 'neutral' } as const;
  if (!rate && previous === 0) return { text: 'Sem base de comparação', direction: 'none', tone: 'neutral' } as const;
  const delta = current - previous;
  const tone = delta === 0 || preference === 'neutral' ? 'neutral' : (delta > 0) === (preference === 'higher') ? 'positive' : 'negative';
  const direction = delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  // Counts: absolute difference (decision D3), e.g. "-17 no período"; rates: points.
  if (!rate) return { text: delta === 0 ? 'Sem variação' : `${delta > 0 ? '+' : '-'}${Math.abs(delta).toLocaleString('pt-BR')} no período`, direction, tone } as const;
  return { text: `${delta >= 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')} p.p. no período`, direction, tone } as const;
}

/** Counts compare by absolute difference (D3): "▲ 19", "▼ 17", "Sem variação", or
 * "Sem base de comparação" when the previous value is 0. Rates keep points (above). */
export type CountDelta = { kind: 'up' | 'down' | 'equal' | 'no-base'; abs: number };
export function countDelta(current: number, previous: number): CountDelta {
  if (previous === 0) return { kind: 'no-base', abs: current };
  const delta = current - previous;
  return { kind: delta > 0 ? 'up' : delta < 0 ? 'down' : 'equal', abs: Math.abs(delta) };
}
/** "▲ 19" · "▼ 17" · "Sem variação" · "Sem base de comparação". */
export function formatCountDelta(delta: CountDelta): string {
  if (delta.kind === 'no-base') return 'Sem base de comparação';
  if (delta.kind === 'equal') return 'Sem variação';
  return `${delta.kind === 'up' ? '▲' : '▼'} ${delta.abs.toLocaleString('pt-BR')}`;
}
/** Signed difference for tables: "+19", "−17", "0" (a zero base still shows the raw difference). */
export function signedCountDelta(current: number, previous: number): string {
  const delta = current - previous;
  return delta > 0 ? `+${delta.toLocaleString('pt-BR')}` : delta < 0 ? `−${Math.abs(delta).toLocaleString('pt-BR')}` : '0';
}
