'use client';
import { useState, type KeyboardEvent } from 'react';

/** One stacked component, bottom to top in array order. `color` is a CSS value
 * (normally a token such as `var(--data-realizadas)`). */
export type StackedSeries = { key: string; label: string; unit: string; color: string; outlined?: boolean };
export type StackedDatum = { id: string; label: string; shortLabel?: string; fullLabel: string; highlight?: boolean; showLabel?: boolean; values: Record<string, number> };
/** Optional comparison series (Visão gerencial): one value per column drawn as a dashed
 * marker, `details[i]` names the matching day ("seg., 02 nov."). The legend item toggles
 * `visible`; the column label, tooltip and data table always carry the value. With a
 * single column, the legend shows `singleLabel` ("Ontem: 12") instead of a marker. */
export type ChartReference = { label: string; values: number[]; details?: string[]; visible: boolean; onToggle: () => void; singleLabel?: string };

const niceStep = (value: number) => {
  if (value <= 1) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return ([1, 2, 5, 10].map(m => m * power).find(step => step >= value) ?? 10 * power);
};

/** Hand-made stacked columns (HTML/CSS, no library). One tab stop with roving
 * focus (←/→, Home/End); every slot carries a complete aria-label and a data
 * table fallback is rendered in a <details>. A single datum renders as one
 * horizontal stacked bar with values in the legend. */
export function StackedBarChart({ series, data, label, tableCaption, firstColumn = 'Dia', format = (value: number) => value.toLocaleString('pt-BR'), reference }: {
  series: StackedSeries[]; data: StackedDatum[]; label: string; tableCaption: string; firstColumn?: string; format?: (value: number) => string; reference?: ChartReference;
}) {
  const total = (datum: StackedDatum) => series.reduce((sum, s) => sum + (datum.values[s.key] ?? 0), 0);
  const [active, setActive] = useState(Math.max(0, data.length - 1));
  const [shown, setShown] = useState<number | null>(null);
  const current = Math.min(active, Math.max(0, data.length - 1));
  // The axis covers columns and reference markers alike (stable when the marker toggles).
  const step = niceStep(Math.max(...data.map(total), ...(reference?.values ?? []), 0) / 3);
  const top = step * 3;
  const refAt = (index: number) => reference?.values[index];
  const describe = (datum: StackedDatum, index = 0) => `${datum.fullLabel}: ${series.map(s => `${format(datum.values[s.key] ?? 0)} ${s.unit}`).join(', ')}, total ${format(total(datum))}${refAt(index) !== undefined ? `. Período anterior: ${format(refAt(index)!)}` : ''}`;

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = event.key === 'ArrowRight' ? current + 1 : event.key === 'ArrowLeft' ? current - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? data.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    const index = Math.min(data.length - 1, Math.max(0, next));
    setActive(index); setShown(index);
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('.stacked-slot')[index]?.focus();
  }

  const legend = (values?: Record<string, number>) => <ul className="stacked-legend">{series.map(s => <li key={s.key}><i className={s.outlined ? 'outlined' : undefined} style={{ background: s.color }} aria-hidden="true" />{s.label}{values && <strong className="tabular">{format(values[s.key] ?? 0)}</strong>}</li>)}
    {reference && (values ? reference.singleLabel && <li className="stacked-legend-reference-text">{reference.singleLabel}</li>
      : <li><button type="button" className="stacked-legend-reference" aria-pressed={reference.visible} onClick={reference.onToggle}><i className="reference-swatch" aria-hidden="true" />{reference.label}</button></li>)}</ul>;
  const table = <details className="chart-data"><summary>Ver dados do gráfico</summary><div className="table-wrap"><table data-density="compact" className="data-table"><caption className="sr-only">{tableCaption}</caption>
    <thead><tr><th scope="col">{firstColumn}</th>{series.map(s => <th scope="col" key={s.key} className="numeric">{s.label}</th>)}<th scope="col" className="numeric">Total</th>{reference && <th scope="col" className="numeric">Período anterior</th>}</tr></thead>
    <tbody>{data.map((datum, index) => <tr key={datum.id}><th scope="row">{datum.fullLabel}</th>{series.map(s => <td key={s.key} className="numeric">{format(datum.values[s.key] ?? 0)}</td>)}<td className="numeric">{format(total(datum))}</td>{reference && <td className="numeric">{refAt(index) === undefined ? '—' : format(refAt(index)!)}</td>}</tr>)}</tbody></table></div></details>;

  if (data.length === 1) {
    const datum = data[0]; const sum = total(datum);
    return <div className="stacked-chart stacked-chart-single">
      {legend(datum.values)}
      <div className="stacked-hbar" role="img" aria-label={`${label} ${describe(datum, 0)}.`}>
        {sum === 0 ? <span className="stacked-hbar-empty" /> : series.map(s => (datum.values[s.key] ?? 0) > 0 && <span key={s.key} className={s.outlined ? 'outlined' : undefined} style={{ flexGrow: datum.values[s.key], background: s.color }} />)}
      </div>
      {table}
    </div>;
  }

  const tooltipIndex = shown ?? null;
  const tooltipDatum = tooltipIndex === null ? null : data[tooltipIndex];
  const flip = tooltipIndex !== null && tooltipIndex >= data.length * 0.6;
  return <div className="stacked-chart" data-reference={reference ? (reference.visible ? 'shown' : 'hidden') : undefined}>
    {legend()}
    <div className="stacked-plot" data-columns={data.length}>
      <div className="stacked-axis" aria-hidden="true">{[3, 2, 1, 0].map(i => <span key={i} style={{ bottom: `${i / 3 * 100}%` }}>{format(step * i)}</span>)}</div>
      <div className="stacked-area">
        <div className="stacked-grid" aria-hidden="true">{[3, 2, 1].map(i => <i key={i} style={{ bottom: `${i / 3 * 100}%` }} />)}</div>
        <div className="stacked-slots" role="group" aria-label={label}>
          {data.map((datum, index) => {
            const sum = total(datum);
            return <button key={datum.id} type="button" className="stacked-slot" data-highlight={datum.highlight || undefined} data-active={tooltipIndex === index || undefined}
              tabIndex={index === current ? 0 : -1} aria-label={describe(datum, index)}
              onKeyDown={onKeyDown} onFocus={() => { setActive(index); setShown(index); }} onBlur={() => setShown(null)}
              onMouseEnter={() => setShown(index)} onMouseLeave={() => setShown(null)}>
              <span className="stacked-column" style={{ height: `${top ? sum / top * 100 : 0}%` }}>
                {series.map(s => (datum.values[s.key] ?? 0) > 0 && <span key={s.key} className={s.outlined ? 'outlined' : undefined} style={{ flexGrow: datum.values[s.key], background: s.color }} />)}
              </span>
              {refAt(index) !== undefined && <span className="stacked-reference" aria-hidden="true" style={{ bottom: `${top ? refAt(index)! / top * 100 : 0}%` }} />}
              <span className={`stacked-label${datum.showLabel === false ? ' is-hidden' : ''}`} aria-hidden="true"><span className="stacked-label-long">{datum.label}</span>{datum.shortLabel && <span className="stacked-label-short">{datum.shortLabel}</span>}</span>
            </button>;
          })}
        </div>
        {tooltipDatum && <div className="stacked-tooltip" aria-hidden="true" data-flip={flip || undefined}
          style={{ left: `${(tooltipIndex! + (flip ? 0 : 1)) / data.length * 100}%` }}>
          <strong>{tooltipDatum.fullLabel}</strong>
          <ul>{[...series].reverse().map(s => <li key={s.key}><i className={s.outlined ? 'outlined' : undefined} style={{ background: s.color }} />{s.label}<span className="tabular">{format(tooltipDatum.values[s.key] ?? 0)}</span></li>)}</ul>
          <p>Total<span className="tabular">{format(total(tooltipDatum))}</span></p>
          {refAt(tooltipIndex!) !== undefined && <p className="stacked-tooltip-reference">Mesmo dia do período anterior{reference?.details?.[tooltipIndex!] ? ` (${reference.details[tooltipIndex!]})` : ''}<span className="tabular">{format(refAt(tooltipIndex!)!)}</span></p>}
        </div>}
      </div>
    </div>
    {table}
  </div>;
}
