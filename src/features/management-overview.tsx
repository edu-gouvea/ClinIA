'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight, ArrowUpDown } from 'lucide-react';
import { Badge, Button, PageHeading } from '@/components/ui';
import { formatPeriod } from '@/lib/date';
import { metricComparison } from '@/lib/metric-comparison';
import { managementSorts, professionalMetrics, type ManagementSort } from '@/lib/management-presentation';
import type { DemoState, Metrics, Period } from '@/lib/types';

const ratio = (value: number | null) => value === null ? 'Sem dados' : `${value.toFixed(1).replace('.', ',')}%`;
const hours = (value: number) => `${(value / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
const columns: { key: ManagementSort; label: string }[] = [
  { key: 'name', label: 'Profissional' }, { key: 'planned', label: 'Previstas' }, { key: 'completed', label: 'Realizadas' },
  { key: 'availableMinutes', label: 'Disponibilidade' }, { key: 'occupancy', label: 'Ocupação' },
  { key: 'cancelled', label: 'Canceladas' }, { key: 'missed', label: 'Faltas' }, { key: 'absenceRate', label: 'Taxa de faltas' },
];

function Change({ current, previous, rate = false, preference = 'neutral' }: { current: number | null; previous: number | null; rate?: boolean; preference?: 'higher' | 'lower' | 'neutral' }) {
  const change = metricComparison(current, previous, rate, preference);
  return <span className="management-change" data-tone={change.tone}>
    {change.direction === 'up' ? <ArrowUpRight size={13} aria-hidden="true" /> : change.direction === 'down' ? <ArrowDownRight size={13} aria-hidden="true" /> : null}
    {change.text}<span className="sr-only">{change.tone === 'positive' ? ' · Variação favorável' : change.tone === 'negative' ? ' · Variação desfavorável' : ''}</span>
  </span>;
}

function Occupancy({ value }: { value: number | null }) {
  return <div className="management-occupancy"><span>{ratio(value)}</span>{value !== null && <span className="management-meter" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>}</div>;
}

export function ManagementOverview({ state, period, previous, metrics, before, days, professionalId, specialty, chart }: {
  state: DemoState; period: Period; previous: Period; metrics: Metrics; before: Metrics; days: number;
  professionalId: string; specialty: string; chart: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const sortValue = params.get('sort');
  const sort: ManagementSort = managementSorts.includes(sortValue as ManagementSort) ? sortValue as ManagementSort : 'completed';
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';
  const rows = professionalMetrics(state, period, professionalId, specialty, sort, order);
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
  const stats = [
    { key: 'planned', label: 'Consultas previstas', value: String(metrics.planned), baseline: String(before.planned), detail: 'Agendadas e confirmadas', href: agendaHref('previstas'), rate: false, preference: 'neutral' },
    { key: 'completed', label: 'Consultas realizadas', value: String(metrics.completed), baseline: String(before.completed), detail: 'Resultados registrados', href: agendaHref('realizada'), rate: false, preference: 'higher' },
    { key: 'occupancy', label: 'Ocupação da agenda', value: ratio(metrics.occupancy), baseline: ratio(before.occupancy), detail: `${hours(metrics.bookedMinutes)} ocupadas / ${hours(metrics.availableMinutes)} disponíveis`, href: agendaHref(), rate: true, preference: 'neutral' },
    { key: 'absenceRate', label: 'Taxa de faltas', value: ratio(metrics.absenceRate), baseline: ratio(before.absenceRate), detail: `${metrics.missed} falta(s) / ${metrics.completed + metrics.missed} resultados`, href: agendaHref('falta'), rate: true, preference: 'lower' },
  ] as const;
  const outcomes = [
    { label: 'Realizadas', key: 'completed', status: 'realizada', preference: 'higher' },
    { label: 'Canceladas', key: 'cancelled', status: 'cancelada', preference: 'lower' },
    { label: 'Faltas', key: 'missed', status: 'falta', preference: 'lower' },
    { label: 'Agendadas e confirmadas', key: 'planned', status: 'previstas', preference: 'neutral' },
  ] as const;

  return <div className="page-stack management-overview">
    <PageHeading eyebrow="GESTÃO · ANÁLISE" title="Visão gerencial" />
    <div className="management-toolbar" role="group" aria-label="Filtros da análise">
      <label className="field"><span>Período</span><span className="management-period"><select aria-label="Período dos indicadores" value={days} onChange={e => filter({ period: e.target.value })}><option value="1">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select></span></label>
      <label className="field"><span>Profissional</span><select value={professionalId} onChange={e => filter({ professional: e.target.value })}><option value="">Todos os profissionais</option>{state.professionals.map(p => <option key={p.id} value={p.id}>{p.name}{!p.active ? ' · Inativo' : ''}</option>)}</select></label>
      <label className="field"><span>Especialidade</span><select value={specialty} onChange={e => filter({ specialty: e.target.value })}><option value="">Todas as especialidades</option>{Array.from(new Set([...state.clinic.specialties, ...state.appointments.map(a => a.specialty)])).sort().map(s => <option key={s}>{s}</option>)}</select></label>
      {(professionalId || specialty) && <Button variant="ghost" onClick={() => filter({ professional: null, specialty: null })}>Limpar filtros</Button>}
    </div>
    <div className="management-period-caption"><strong>{formatPeriod(period)}</strong><span>Comparado a {formatPeriod(previous)} · {days} dia(s) em cada período</span></div>
    <div className="metric-grid">{stats.map(stat => <Link key={stat.key} href={stat.href} className="metric-card">
      <div className="metric-label">{stat.label}</div><div className={`metric-value ${stat.value === 'Sem dados' ? 'no-data' : ''}`}>{stat.value}</div><div className="metric-detail">{stat.detail}</div>
      <div className="management-baseline">Anterior: {stat.baseline}</div><Change current={metrics[stat.key]} previous={before[stat.key]} rate={stat.rate} preference={stat.preference} />
    </Link>)}</div>

    <div className="management-analysis-grid">
      <section className="card management-trend" aria-labelledby="management-trend-title"><div className="card-header"><div><h2 id="management-trend-title">Evolução das consultas</h2><p>Resultados por data prevista da consulta</p></div><Link className="text-link" href={agendaHref()}>{metrics.total} consultas <ArrowUpRight size={14} /></Link></div>{chart}</section>
      <section className="card management-outcomes" aria-labelledby="management-outcomes-title"><div className="card-header"><div><h2 id="management-outcomes-title">Resultados do período</h2><p>Atual e anterior · mesma duração</p></div></div>
        <div className="table-wrap"><table className="data-table" data-density="compact"><caption className="sr-only">Resultados comparados ao período anterior</caption><thead><tr><th scope="col">Situação</th><th scope="col" className="numeric">Atual</th><th scope="col" className="numeric">Anterior</th></tr></thead><tbody>{outcomes.map(outcome => <tr key={outcome.key}><th scope="row"><Link href={agendaHref(outcome.status)}>{outcome.label}</Link></th><td className="numeric">{metrics[outcome.key]}</td><td className="numeric">{before[outcome.key]}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total de consultas</th><td className="numeric">{metrics.total}</td><td className="numeric">{before.total}</td></tr></tfoot></table></div>
        <p className="management-note">{metrics.pending} consulta(s) com horário encerrado aguardando resultado. Cancelamentos usam a data prevista da consulta.</p>
      </section>
    </div>

    <section className="card management-professionals" aria-labelledby="management-professionals-title">
      <div className="card-header"><div><h2 id="management-professionals-title">Atividade por profissional</h2><p>Disponibilidade efetiva e resultados do período selecionado</p></div><Badge>{rows.length} {rows.length === 1 ? 'profissional' : 'profissionais'}</Badge></div>
      <p className="management-note">Disponibilidade compartilhada entre especialidades, com bloqueios descontados. Comparações não representam qualidade clínica.</p>
      <div className="table-wrap" tabIndex={0} role="region" aria-label="Tabela de atividade por profissional"><table className="data-table" data-density="compact"><caption className="sr-only">Todos os profissionais do recorte. Selecione um cabeçalho para ordenar.</caption>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" className={column.key === 'name' ? '' : 'numeric'} aria-sort={sort === column.key ? order === 'asc' ? 'ascending' : 'descending' : 'none'}><button className="management-sort" type="button" aria-label={`Ordenar por ${column.label}`} onClick={() => filter({ sort: column.key, order: sort === column.key ? order === 'asc' ? 'desc' : 'asc' : column.key === 'name' ? 'asc' : 'desc' })}>{column.label}{sort === column.key ? order === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} />}</button></th>)}</tr></thead>
        <tbody>{rows.map(({ professional, metrics: row }) => <tr key={professional.id} data-professional-id={professional.id}>
          <th scope="row"><Link href={`/gestao/equipe?id=${professional.id}`} className="management-person">{professional.name}<ArrowUpRight size={13} aria-hidden="true" /></Link><small>{professional.specialties.join(', ')}{!professional.active && ' · Inativo'}{specialty && !professional.specialties.includes(specialty) && ` · Histórico: ${specialty}`}</small></th>
          <td className="numeric"><Link href={agendaHref('previstas', professional.id)}>{row.planned}</Link></td><td className="numeric"><Link href={agendaHref('realizada', professional.id)}>{row.completed}</Link></td><td className="numeric">{hours(row.availableMinutes)}</td><td className="numeric"><Occupancy value={row.occupancy} /></td><td className="numeric">{row.cancelled}</td><td className="numeric">{row.missed}</td><td className="numeric">{ratio(row.absenceRate)}</td>
        </tr>)}{!rows.length && <tr><td colSpan={columns.length} className="management-empty">Nenhum profissional neste recorte. Ajuste os filtros para comparar os registros.</td></tr>}</tbody>
        {rows.length > 0 && <tfoot><tr><th scope="row">Total do recorte</th><td className="numeric">{metrics.planned}</td><td className="numeric">{metrics.completed}</td><td className="numeric">{hours(metrics.availableMinutes)}</td><td className="numeric">{ratio(metrics.occupancy)}</td><td className="numeric">{metrics.cancelled}</td><td className="numeric">{metrics.missed}</td><td className="numeric">{ratio(metrics.absenceRate)}</td></tr></tfoot>}
      </table></div>
      <p className="management-note">Exibindo todos os profissionais do recorte ({rows.length}). Taxas totais usam os denominadores agregados, sem média simples das taxas individuais.</p>
    </section>
    <details className="metric-definitions"><summary>Como calculamos estes indicadores</summary><p>Previstas: agendadas e confirmadas. Taxa de faltas: faltas ÷ (realizadas + faltas). Ocupação: duração das consultas não canceladas ÷ disponibilidade efetiva, descontando bloqueios. As taxas variam em pontos percentuais. Sem disponibilidade ou resultados: sem dados. Contagens com base anterior zero não têm comparação relativa. Períodos históricos preservam a disponibilidade registrada. Fuso: America/Recife.</p></details>
  </div>;
}
