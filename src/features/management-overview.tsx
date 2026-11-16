'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Calendar, Check, ChevronDown, ChevronRight, Clock, Info, Plus, X } from 'lucide-react';
import { Badge, Button, EmptyState, Menu, PageHeading, Popover } from '@/components/ui';
import { KpiStrip, type KpiItem } from '@/components/kpi-strip';
import { StackedBarChart } from '@/components/stacked-bar-chart';
import { formatPeriod } from '@/lib/date';
import { countDelta, formatCountDelta, metricComparison, signedCountDelta } from '@/lib/metric-comparison';
import { managementSorts, type ManagementSort } from '@/lib/management-presentation';
import { outcomeBreakdown, previousDailyTotals, professionalActivity, resolveSort, type ActivityRow } from '@/lib/management-analysis';
import type { DemoState, Metrics, Period } from '@/lib/types';
import { ProfessionalAvatar } from './agenda/professional-avatar';
import { chartSeries, dailyChartData, shortPeriod } from './home-operations';

const ratio = (value: number | null) => value === null ? 'Sem dados' : `${value.toFixed(1).replace('.', ',')}%`;
const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;
const periodOptions = [{ value: 1, label: 'Hoje' }, { value: 7, label: 'Últimos 7 dias' }, { value: 30, label: 'Últimos 30 dias' }];
const weekdaysShort = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
/** "seg., 02 nov." */
const dayDetail = (date: string) => `${weekdaysShort[new Date(`${date}T12:00:00Z`).getUTCDay()]}, ${date.slice(8, 10)} ${months[Number(date.slice(5, 7)) - 1]}`;
type Preference = 'higher' | 'lower' | 'neutral';
const deltaTone = (current: number, previous: number, preference: Preference) => metricComparison(current, previous, false, preference).tone;

const columns: { key: ManagementSort; label: string; numeric: boolean }[] = [
  { key: 'name', label: 'Profissional', numeric: false }, { key: 'completed', label: 'Realizadas', numeric: true },
  { key: 'occupancy', label: 'Ocupação da agenda', numeric: false }, { key: 'missed', label: 'Faltas', numeric: true },
  { key: 'cancelled', label: 'Canceladas', numeric: true }, { key: 'planned', label: 'Em aberto', numeric: true },
];

export function ManagementOverview({ state, period, previous, metrics, before, days, professionalId, specialty }: {
  state: DemoState; period: Period; previous: Period; metrics: Metrics; before: Metrics; days: number; professionalId: string; specialty: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const definitions = useRef<HTMLDetailsElement>(null);
  const sortValue = params.get('sort');
  const sort: ManagementSort = managementSorts.includes(sortValue as ManagementSort) ? sortValue as ManagementSort : 'completed';
  const activeColumn = resolveSort(sort);
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const compare = params.get('compare') !== '0';
  const filters = { professionalId, specialty };
  const { rows, total } = professionalActivity(state, filters, period, previous, sort, order);
  const outcome = outcomeBreakdown(state, filters, period, previous);
  const pending = outcome.emAbertoEncerradas;
  const professional = state.professionals.find(p => p.id === professionalId);
  const specialties = Array.from(new Set([...state.clinic.specialties, ...state.appointments.map(a => a.specialty)])).sort();

  function filter(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    router.push(`/gestao/visao-gerencial${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function agendaHref(status?: string, id = professionalId) {
    const query = new URLSearchParams({ from: period.start, to: period.end });
    if (status) query.set('status', status);
    if (id) query.set('professional', id);
    if (specialty) query.set('specialty', specialty);
    return `/gestao/agenda?${query}`;
  }
  // Equipe accepts `days` = 7 or 30; "Hoje" opens the default week.
  const teamHref = (id: string) => `/gestao/equipe?id=${id}${days === 30 ? '&days=30' : ''}`;
  function openDefinitions() {
    const element = definitions.current; if (!element) return;
    element.open = true; element.querySelector('summary')?.focus();
  }

  const results = metrics.completed + metrics.missed;
  const kpis: KpiItem[] = [
    { title: 'Consultas realizadas', value: String(metrics.completed), detail: 'Resultados registrados no período', href: agendaHref('realizada'), change: metricComparison(metrics.completed, before.completed, false, 'higher'), reference: String(before.completed) },
    { title: 'Ocupação da agenda', value: ratio(metrics.occupancy), detail: `${decimal(metrics.bookedMinutes / 60)} h ocupadas de ${decimal(metrics.availableMinutes / 60)} h disponíveis`, href: agendaHref(), change: metricComparison(metrics.occupancy, before.occupancy, true, 'neutral'), reference: ratio(before.occupancy) },
    { title: 'Taxa de faltas', value: ratio(metrics.absenceRate), detail: `${plural(metrics.missed, 'falta', 'faltas')} em ${plural(results, 'resultado', 'resultados')}`, href: agendaHref('falta'), change: metricComparison(metrics.absenceRate, before.absenceRate, true, 'lower'), reference: ratio(before.absenceRate) },
    { title: 'Canceladas', value: String(metrics.cancelled), detail: metrics.total ? `${(metrics.cancelled / metrics.total * 100).toFixed(1).replace('.', ',')}% das consultas previstas` : 'Sem dados', href: agendaHref('cancelada'), change: metricComparison(metrics.cancelled, before.cancelled, false, 'lower'), reference: String(before.cancelled) },
  ];

  const chartData = dailyChartData(state, period, days, professionalId, specialty);
  const previousDays = previousDailyTotals(state, filters, period);
  const reference = {
    label: 'Total do período anterior', values: previousDays.map(d => d.total), details: previousDays.map(d => dayDetail(d.date)),
    visible: compare, onToggle: () => filter({ compare: compare ? '0' : null }), singleLabel: `Ontem: ${previousDays[0]?.total ?? 0}`,
  };

  const outcomeRows = [
    { key: 'realizadas', label: 'Realizadas', color: 'var(--data-realizadas)', preference: 'higher' },
    { key: 'faltas', label: 'Faltas', color: 'var(--data-faltas)', preference: 'lower' },
    { key: 'canceladas', label: 'Canceladas', color: 'var(--data-canceladas)', preference: 'lower' },
    { key: 'emAberto', label: 'Em aberto', color: 'var(--data-em-aberto)', preference: 'neutral' },
  ] as const;
  const share = (value: number) => outcome.current.total ? Math.round(value / outcome.current.total * 100) : 0;

  const filtered = !!(professionalId || specialty);
  const professionalOptions = [{ id: '', label: 'Todos os profissionais' }, ...state.professionals.map(p => ({ id: p.id, label: p.name, sub: `${p.specialties.join(', ')}${p.active ? '' : ' · Inativo'}`, professional: p }))];
  const specialtyOptions = [{ id: '', label: 'Todas as especialidades' }, ...specialties.map(s => ({ id: s, label: s }))];

  return <div className="management-overview">
    <PageHeading trail={['Gestão', 'Visão gerencial']} title="Visão gerencial" />

    <div className="management-bar" role="toolbar" aria-label="Recorte da análise">
      <Menu label={`Período dos indicadores: ${periodOptions.find(o => o.value === days)?.label}`} icon={<Calendar size={16} aria-hidden="true" />}
        text={<><span>{periodOptions.find(o => o.value === days)?.label}</span><ChevronDown size={14} aria-hidden="true" /></>}
        triggerClassName="btn btn-secondary management-period-trigger" className="management-period-menu"
        items={periodOptions.map(o => ({ label: o.label, checked: o.value === days, onSelect: () => filter({ period: String(o.value) }) }))}
        footer="Sempre comparado ao período anterior de mesma duração." />
      <p className="management-interval tabular"><span>{shortPeriod(period)}</span> <span className="management-interval-ref">· comparado a {shortPeriod(previous)}</span></p>
      <span className="management-divider" aria-hidden="true" />
      <div className="management-chips">
        <FilterChip name="Profissional" removeLabel="Remover filtro de profissional" value={professionalId} valueLabel={professional?.name ?? (professionalId ? 'Profissional removido' : '')}
          options={professionalOptions} onChange={id => filter({ professional: id || null })} />
        <FilterChip name="Especialidade" removeLabel="Remover filtro de especialidade" value={specialty} valueLabel={specialty}
          options={specialtyOptions} onChange={value => filter({ specialty: value || null })} />
        {filtered && <Button variant="ghost" className="management-clear" onClick={() => filter({ professional: null, specialty: null })}>Limpar filtros</Button>}
      </div>
      <span className="management-spacer" />
      <Button variant="ghost" size="icon" className="management-info" aria-label="Como calculamos estes indicadores" onClick={openDefinitions}><Info size={16} /></Button>
    </div>

    {pending > 0 && <div className="management-pending" role="status">
      <Clock size={16} aria-hidden="true" />
      <p><strong>{plural(pending, 'consulta', 'consultas')}</strong> já {pending === 1 ? 'passou' : 'passaram'} do horário e {pending === 1 ? 'está' : 'estão'} sem resultado. Realizadas, faltas e ocupação mudam quando forem registradas.</p>
      <Link className="btn btn-secondary management-pending-action" href={agendaHref('pendente')}>Registrar resultados<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>}

    <KpiStrip className="management-kpis" items={kpis} />

    <div className="management-analysis-grid">
      <section className="card management-chart" aria-labelledby="management-chart-title">
        <div className="management-card-head">
          <div><h2 id="management-chart-title">Consultas por dia</h2><p>Pela data prevista · composição por resultado</p></div>
          <Link className="management-link" href={agendaHref()}>{plural(metrics.total, 'consulta', 'consultas')} · Ver na agenda<ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <StackedBarChart series={chartSeries} data={chartData} reference={reference} label={`Consultas por dia e resultado, ${formatPeriod(period)}. Dados completos na tabela abaixo.`} tableCaption={`Consultas por dia e resultado, ${formatPeriod(period)}, com o total do período anterior`} />
      </section>

      <section className="card management-outcomes" aria-labelledby="management-outcomes-title">
        <div className="management-card-head"><div><h2 id="management-outcomes-title">Desfecho das consultas</h2><p>{plural(outcome.current.total, 'consulta prevista', 'consultas previstas')} no período</p></div></div>
        <div className="outcome-bar" role="img" aria-label={`Desfecho: ${outcomeRows.map(r => `${r.label} ${share(outcome.current[r.key])}%`).join(', ')}`}>
          {outcome.current.total === 0 ? <span className="outcome-bar-empty" /> : outcomeRows.map(r => outcome.current[r.key] > 0 && <span key={r.key} style={{ flexGrow: outcome.current[r.key], background: r.color }} />)}
        </div>
        <table className="outcome-table">
          <caption className="sr-only">Desfecho das consultas comparado ao período anterior</caption>
          <thead><tr><th scope="col">Situação</th><th scope="col">Atual</th><th scope="col">Anterior</th><th scope="col">Diferença</th></tr></thead>
          <tbody>{outcomeRows.map(r => {
            const current = outcome.current[r.key]; const before = outcome.previous[r.key];
            const tone = deltaTone(current, before, r.preference);
            return <tr key={r.key} data-outcome={r.key}>
              <th scope="row"><i className="outcome-swatch" style={{ background: r.color }} aria-hidden="true" />{r.label}{r.key === 'emAberto' && outcome.emAbertoEncerradas > 0 && <small>{outcome.emAbertoEncerradas} já {outcome.emAbertoEncerradas === 1 ? 'passou' : 'passaram'} do horário</small>}</th>
              <td className="tabular">{current}</td><td className="tabular outcome-previous">{before}</td>
              <td className="tabular outcome-delta" data-tone={tone}>{signedCountDelta(current, before)}{tone !== 'neutral' && <span className="sr-only"> · Variação {tone === 'positive' ? 'favorável' : 'desfavorável'}</span>}</td>
            </tr>;
          })}</tbody>
          <tfoot><tr data-outcome="total"><th scope="row">Total</th><td className="tabular">{outcome.current.total}</td><td className="tabular outcome-previous">{outcome.previous.total}</td><td className="tabular outcome-delta" data-tone="neutral">{signedCountDelta(outcome.current.total, outcome.previous.total)}</td></tr></tfoot>
        </table>
        <p className="management-footnote">Cancelamentos contam pela data prevista da consulta, não pela data em que foram feitos.</p>
      </section>
    </div>

    <section className="card management-professionals" aria-labelledby="management-professionals-title">
      <div className="management-card-head management-professionals-head">
        <div><h2 id="management-professionals-title">Atividade por profissional</h2><p>Disponibilidade já desconta bloqueios. Os números comparam agenda, não qualidade clínica.</p></div>
        <Badge>{plural(rows.length, 'profissional', 'profissionais')}</Badge>
      </div>
      {rows.length ? <>
        <div className="table-wrap management-table-wrap" tabIndex={0} role="region" aria-label="Tabela de atividade por profissional">
          <table className="data-table activity-table"><caption className="sr-only">Todos os profissionais do recorte. Selecione um cabeçalho para ordenar.</caption>
            <thead><tr>{columns.map(column => {
              const active = activeColumn === column.key;
              return <th key={column.key} scope="col" className={`${column.numeric ? 'numeric' : ''}${active ? ' is-sorted' : ''}`} aria-sort={active ? order === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button className="management-sort" type="button" aria-label={`Ordenar por ${column.label}`} onClick={() => filter({ sort: column.key, order: active ? order === 'asc' ? 'desc' : 'asc' : column.key === 'name' ? 'asc' : 'desc' })}>
                  {column.label}{active && order === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
                </button>
              </th>;
            })}<th scope="col" className="activity-chevron"><span className="sr-only">Abrir</span></th></tr></thead>
            <tbody>{rows.map(row => <ActivityTableRow key={row.professional.id} row={row} specialty={specialty} href={teamHref(row.professional.id)} onOpen={href => router.push(href)} />)}</tbody>
            <tfoot><tr><th scope="row">Total do recorte</th><ActivityCells row={total} /><td className="activity-chevron" /></tr></tfoot>
          </table>
        </div>
        <p className="management-table-note">Taxas do total usam os denominadores somados, não a média das taxas individuais.</p>
      </> : <EmptyState title="Nenhum profissional neste recorte" description="Ajuste os filtros para comparar os registros."><Button variant="secondary" onClick={() => filter({ professional: null, specialty: null })}>Limpar filtros</Button></EmptyState>}
    </section>

    <details className="card metric-definitions management-definitions" ref={definitions}>
      <summary><Info size={13} aria-hidden="true" />Como calculamos estes indicadores</summary>
      <p>Em aberto: agendadas e confirmadas, ainda sem resultado. Taxa de faltas: faltas ÷ (realizadas + faltas). Ocupação: duração das consultas não canceladas ÷ disponibilidade efetiva, descontando bloqueios. Canceladas: percentual sobre o total de consultas previstas no período. Contagens comparam pela diferença absoluta; as taxas variam em pontos percentuais. Base anterior zero: sem base de comparação. Sem disponibilidade ou resultados: sem dados. Períodos históricos preservam a disponibilidade registrada. Fuso: America/Recife.</p>
      <p>O marcador tracejado do gráfico compara cada dia com o dia na mesma posição do período anterior.</p>
    </details>
  </div>;
}

function ActivityCells({ row }: { row: Omit<ActivityRow, 'professional'> }) {
  const delta = countDelta(row.realizadas, row.realizadasAnterior);
  const tone = deltaTone(row.realizadas, row.realizadasAnterior, 'higher');
  const occupancy = row.ocupacao;
  return <>
    <td className="numeric"><span className="cell-strong">{row.realizadas}</span><small className="activity-delta" data-tone={delta.kind === 'no-base' ? 'neutral' : tone}>{delta.kind === 'no-base' ? `Sem base · anterior: ${row.realizadasAnterior}` : `${formatCountDelta(delta)} vs. ${row.realizadasAnterior}`}{tone !== 'neutral' && delta.kind !== 'no-base' && <span className="sr-only"> · Variação {tone === 'positive' ? 'favorável' : 'desfavorável'}</span>}</small></td>
    <td className="activity-occupancy"><span className="activity-occupancy-line"><strong>{ratio(occupancy)}</strong><small>{decimal(row.horasOcupadas)} de {decimal(row.horasDisponiveis)} h</small></span><span className="activity-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, occupancy ?? 0))}%` }} /></span></td>
    <td className="numeric"><span className="cell-strong">{row.faltas}</span><small>{ratio(row.taxaFaltas)}</small></td>
    <td className="numeric">{row.canceladas}</td>
    <td className="numeric activity-open">{row.emAberto}</td>
  </>;
}

function ActivityTableRow({ row, specialty, href, onOpen }: { row: ActivityRow; specialty: string; href: string; onOpen: (href: string) => void }) {
  const { professional } = row;
  return <tr className="activity-row" data-professional-id={professional.id} onClick={event => { if (!(event.target as HTMLElement).closest('a')) onOpen(href); }}>
    <th scope="row">
      <Link className="activity-row-link" href={href} aria-label={`Abrir ${professional.name} na Equipe`}>
        <ProfessionalAvatar professional={professional} size={32} />
        <span className="activity-person"><span className="activity-name">{professional.name}</span><small>{professional.specialties.join(', ')}{!professional.active && ' · Inativo'}{specialty && !professional.specialties.includes(specialty) && ` · Histórico: ${specialty}`}</small></span>
      </Link>
    </th>
    <ActivityCells row={row} />
    <td className="activity-chevron"><ChevronRight size={16} aria-hidden="true" /></td>
  </tr>;
}

type ChipOption = { id: string; label: string; sub?: string; professional?: { name: string; color: string } };
/** Filter chip (Pacientes pattern): dashed when empty, solid with "Nome: valor" and a
 * separate "×" when applied; opens a single-choice list in a `Popover`. */
function FilterChip({ name, value, valueLabel, options, onChange, removeLabel }: { name: string; value: string; valueLabel: string; options: ChipOption[]; onChange: (value: string) => void; removeLabel: string }) {
  const applied = !!value;
  function onKey(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'));
    const index = items.indexOf(document.activeElement as HTMLElement);
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }[event.key];
    if (target !== undefined) { event.preventDefault(); items[Math.max(0, Math.min(items.length - 1, target))]?.focus(); return; }
    if ((event.key === 'Enter' || event.key === ' ') && index >= 0) { event.preventDefault(); onChange(items[index].dataset.value ?? ''); close(); }
  }
  return <div className={`recorte-chip-group${applied ? ' is-applied' : ''}`}>
    <Popover label={`Filtrar por ${name.toLocaleLowerCase('pt-BR')}`} triggerClassName="recorte-chip" className="chip-popover"
      triggerLabel={applied ? `${name}: ${valueLabel}` : `Filtrar por ${name.toLocaleLowerCase('pt-BR')}`}
      triggerContent={applied ? <><span className="recorte-chip-prefix">{name}:</span> <span className="recorte-chip-value">{valueLabel}</span></> : <><Plus size={14} aria-hidden="true" />{name}</>}>
      {close => <div role="listbox" aria-label={name} className="chip-options" onKeyDown={event => onKey(event, close)}>
        {options.map((option, index) => <div key={option.id || 'all'} role="option" tabIndex={(value ? option.id === value : index === 0) ? 0 : -1} aria-selected={option.id === value} data-value={option.id} className={`chip-option${index === 0 ? ' is-all' : ''}`} onClick={() => { onChange(option.id); close(); }}>
            <span className="chip-option-check" aria-hidden="true">{option.id === value && <Check size={14} />}</span>
            {option.professional && <ProfessionalAvatar professional={option.professional} size={26} />}
            <span className="chip-option-text"><span>{option.label}</span>{option.sub && <small>{option.sub}</small>}</span>
          </div>)}
      </div>}
    </Popover>
    {applied && <button type="button" className="recorte-chip-remove" aria-label={removeLabel} onClick={() => onChange('')}><X size={14} aria-hidden="true" /></button>}
  </div>;
}
