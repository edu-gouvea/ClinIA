'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { Avatar, Badge, Button, EmptyState, SearchInput } from '@/components/ui';
import { formatPeriod } from '@/lib/date';
import { teamRoster, teamSorts, type TeamSort } from '@/lib/team-presentation';
import type { DemoState, Period } from '@/lib/types';

const rate = (value: number | null) => value === null ? 'Sem dados' : `${Math.round(value)}%`;
const hours = (value: number) => `${(value / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
const sorts: { key: TeamSort; label: string }[] = [{ key: 'name', label: 'Nome' }, { key: 'weeklyMinutes', label: 'Carga semanal' }, { key: 'planned', label: 'Previstas' }, { key: 'completed', label: 'Realizadas' }, { key: 'occupancy', label: 'Ocupação' }];

function Occupancy({ value }: { value: number | null }) {
  return <div className="team-occupancy"><strong>{rate(value)}</strong>{value !== null && <span aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>}</div>;
}

export function TeamRoster({ state, period }: { state: DemoState; period: Period }) {
  const params = useSearchParams(); const router = useRouter();
  const query = params.get('q') ?? ''; const specialty = params.get('specialty') ?? ''; const active = params.get('active') ?? '';
  const view = params.get('view') === 'table' ? 'table' : 'cards';
  const sortValue = params.get('sort'); const sort: TeamSort = teamSorts.includes(sortValue as TeamSort) ? sortValue as TeamSort : 'name';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';
  const rows = teamRoster(state, period, query, specialty, active, sort, order);
  const pages = Math.max(1, Math.ceil(rows.length / 12));
  const rawPage = Number(params.get('page') ?? 1);
  const page = Math.min(pages, Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1));
  const displayed = rows.slice((page - 1) * 12, page * 12);
  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); }
    return `/gestao/equipe${next.size ? `?${next}` : ''}`;
  }
  function update(changes: Record<string, string | null>) {
    router.replace(href({ page: null, ...changes }), { scroll: false });
  }
  function sortIndicator(key: TeamSort) {
    return sort === key ? order === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" /> : <ArrowUpDown size={13} aria-hidden="true" />;
  }
  const filtered = !!(query || specialty || active);

  return <section className="team-roster" aria-label="Profissionais de saúde">
    <div className="team-filters">
      <SearchInput aria-label="Buscar profissional" placeholder="Buscar profissional" value={query} onChange={e => update({ q: e.target.value })} />
      <select aria-label="Filtrar especialidade" value={specialty} onChange={e => update({ specialty: e.target.value })}><option value="">Todas as especialidades</option>{Array.from(new Set([...state.clinic.specialties, ...state.professionals.flatMap(p => p.specialties)])).sort().map(s => <option key={s}>{s}</option>)}</select>
      <select aria-label="Filtrar profissionais ativos" value={active} onChange={e => update({ active: e.target.value })}><option value="">Todos os cadastros</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
      {filtered && <Button variant="ghost" onClick={() => update({ q: null, specialty: null, active: null })}>Limpar filtros</Button>}
    </div>
    <div className="team-list-controls"><p>{rows.length} de {state.professionals.length} profissionais · <span>{formatPeriod(period)}</span></p><div className="team-view-controls">
      <select aria-label="Ordenar profissionais" value={sort} onChange={e => update({ sort: e.target.value })}>{sorts.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
      <Button variant="secondary" size="icon" aria-label={order === 'asc' ? 'Ordenar em ordem decrescente' : 'Ordenar em ordem crescente'} onClick={() => update({ order: order === 'asc' ? 'desc' : 'asc' })}>{order === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</Button>
      <div className="segmented" role="group" aria-label="Visualização dos profissionais"><button type="button" aria-pressed={view === 'cards'} className={view === 'cards' ? 'active' : ''} onClick={() => update({ view: null })}><LayoutGrid size={15} />Cards</button><button type="button" aria-pressed={view === 'table'} className={view === 'table' ? 'active' : ''} onClick={() => update({ view: 'table' })}><List size={15} />Tabela</button></div>
    </div></div>
    {!rows.length ? <EmptyState title="Nenhum profissional encontrado" description={filtered ? 'Ajuste a busca ou os filtros de cadastro.' : 'Cadastre um profissional para disponibilizar sua agenda.'} /> : view === 'cards' ? <div className="team-roster-grid">{displayed.map(({ professional: p, metrics, weeklyMinutes, future }) => <article className="card team-person-card" key={p.id} data-professional-id={p.id}>
      <div className="team-person-heading"><Avatar name={p.name} color={p.color} size="sm" /><h2>{p.name}</h2><Badge tone={p.active ? 'green' : 'gray'}>Cadastro {p.active ? 'ativo' : 'inativo'}</Badge></div>
      <p className="team-specialties">{p.specialties.join(' · ')}</p><p className="team-weekly">{hours(weeklyMinutes)}/semana cadastradas · {new Set(p.availability.map(slot => slot.day)).size} dia(s)</p>
      <dl className="team-person-metrics"><div><dt>Previstas</dt><dd>{metrics.planned}</dd></div><div><dt>Realizadas</dt><dd>{metrics.completed}</dd></div><div><dt>Ocupação</dt><dd><Occupancy value={metrics.occupancy} /></dd></div></dl>
      {!p.active && future > 0 && <p className="team-review">{future} consulta(s) futura(s) para revisar</p>}
      <div className="team-person-links"><Link href={href({ id: p.id, attendant: null })} className="text-link">Atividade e agenda<ArrowUpRight size={14} /></Link><Link href={`/gestao/agenda?professional=${p.id}&date=${state.referenceDate}`} className="text-link" aria-label={`Abrir agenda de ${p.name}`}><CalendarDays size={14} />Agenda</Link></div>
    </article>)}</div> : <div className="table-wrap team-roster-table" role="region" aria-label="Tabela de profissionais" tabIndex={0}><table className="data-table" data-density="compact"><caption className="sr-only">Cadastro, carga semanal e resumo operacional dos profissionais. Indicadores no período selecionado.</caption><thead><tr>
      <th scope="col" aria-sort={sort === 'name' ? order === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => update({ sort: 'name', order: sort === 'name' && order === 'asc' ? 'desc' : 'asc' })}>Profissional {sortIndicator('name')}</button></th><th scope="col">Cadastro</th>
      {sorts.slice(1).map(column => <th key={column.key} scope="col" className="numeric" aria-sort={sort === column.key ? order === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => update({ sort: column.key, order: sort === column.key && order === 'desc' ? 'asc' : 'desc' })}>{column.label}{sortIndicator(column.key)}</button></th>)}<th scope="col">Ações</th>
    </tr></thead><tbody>{displayed.map(({ professional: p, metrics, weeklyMinutes, future }) => <tr key={p.id} data-professional-id={p.id}><th scope="row"><Link className="text-link" href={href({ id: p.id, attendant: null })}>{p.name}<ArrowUpRight size={13} /></Link><small>{p.specialties.join(' · ')}</small>{!p.active && future > 0 && <small className="team-review">{future} consulta(s) futura(s) para revisar</small>}</th><td><Badge tone={p.active ? 'green' : 'gray'}>{p.active ? 'Ativo' : 'Inativo'}</Badge></td><td className="numeric">{hours(weeklyMinutes)}</td><td className="numeric">{metrics.planned}</td><td className="numeric">{metrics.completed}</td><td className="numeric"><Occupancy value={metrics.occupancy} /></td><td><Link className="text-link" href={`/gestao/agenda?professional=${p.id}&date=${state.referenceDate}`} aria-label={`Abrir agenda de ${p.name}`}>Agenda<ArrowUpRight size={13} /></Link></td></tr>)}</tbody></table></div>}
    {rows.length > 0 && <nav className="team-pagination" aria-label="Paginação dos profissionais"><span>Exibindo {(page - 1) * 12 + 1}–{Math.min(page * 12, rows.length)} de {rows.length}</span><div><Button variant="secondary" disabled={page === 1} aria-label="Página anterior de profissionais" onClick={() => update({ page: String(page - 1) })}><ChevronLeft size={14} /></Button><span>Página {page} de {pages}</span><Button variant="secondary" disabled={page === pages} aria-label="Próxima página de profissionais" onClick={() => update({ page: String(page + 1) })}><ChevronRight size={14} /></Button></div></nav>}
    <p className="informative-note">Carga semanal cadastrada é a soma dos intervalos informados. A ocupação do período considera funcionamento da clínica e bloqueios. Detalhes e resultados completos estão na atividade individual; comparações gerais, na visão gerencial.</p>
  </section>;
}
