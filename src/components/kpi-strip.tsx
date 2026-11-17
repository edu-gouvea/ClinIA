import Link from 'next/link';
import type { metricComparison } from '@/lib/metric-comparison';

export type MetricChangeValue = ReturnType<typeof metricComparison>;
/** `href` makes the cell a link to the records behind the number; `change` adds the
 * comparison with the previous period. Both are optional: a plain cell just states a value. */
export type KpiItem = { title: string; value: string; detail: string; href?: string; change?: MetricChangeValue; reference?: string };

/** The KPI strip shared by Início, Visão gerencial and Equipe: one container with 1 px
 * dividers, `metric-card`/`metric-value` cells, no decorative icons. `reference` names
 * the previous value ("vs. 119"); without it the line reads "vs. anterior". */
export function KpiStrip({ items, className = '' }: { items: KpiItem[]; className?: string }) {
  return <div className={`kpi-strip ${className}`}>{items.map(kpi => {
    const content = <>
      <span className="metric-label">{kpi.title}</span>
      <span className={`metric-value tabular${kpi.value === 'Sem dados' ? ' no-data' : ''}`}>{kpi.value}</span>
      {kpi.change && <MetricChange change={kpi.change} reference={kpi.reference} />}
      <span className="metric-detail">{kpi.detail}</span>
    </>;
    return kpi.href
      ? <Link href={kpi.href} className="metric-card" key={kpi.title}>{content}</Link>
      : <div className="metric-card" key={kpi.title}>{content}</div>;
  })}</div>;
}

/** Symmetric delta: ▲/▼ + magnitude (absolute for counts, p.p. for rates) + "vs. …";
 * the tone comes from `metricComparison` (favorability). */
export function MetricChange({ change, reference }: { change: MetricChangeValue; reference?: string }) {
  const ref = reference ? `vs. ${reference}` : 'vs. anterior';
  if (change.direction === 'none') return <span className="metric-change" data-tone="neutral">{change.text}{reference && change.text === 'Sem base de comparação' && <span className="metric-ref"> · anterior: {reference}</span>}</span>;
  if (change.text === 'Sem variação') return <span className="metric-change" data-tone="neutral"><strong>Sem variação</strong> <span className="metric-ref">{ref}</span></span>;
  const magnitude = change.text.replace(/^[+-]/, '').replace(/ no período$/, '');
  return <span className="metric-change" data-tone={change.tone}>
    {change.direction !== 'flat' && <span className="metric-arrow" aria-hidden="true">{change.direction === 'up' ? '▲' : '▼'}</span>}
    <span className="sr-only">{change.direction === 'up' ? 'Alta de ' : change.direction === 'down' ? 'Queda de ' : 'Sem variação: '}</span>
    <strong className="tabular">{magnitude}</strong> <span className="metric-ref">{ref}</span>
    <span className="sr-only">{change.tone === 'positive' ? ' · Variação favorável' : change.tone === 'negative' ? ' · Variação desfavorável' : ''}</span>
  </span>;
}
