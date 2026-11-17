'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
import { FilterChip } from '@/components/filter-chip';
import { ProfessionalAvatar } from '@/components/professional-avatar';
import { Badge, Button, EmptyState, SearchInput } from '@/components/ui';
import { formatPeriod } from '@/lib/date';
import { formatRate, plural } from '@/lib/format';
import { teamRoster, teamSorts, type TeamSort } from '@/lib/team-presentation';
import type { DemoState, Period } from '@/lib/types';

const PAGE_SIZE = 12;
const hours = (value: number) => `${(value / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
const sorts: { key: TeamSort; label: string }[] = [
  { key: 'name', label: 'Nome' }, { key: 'weeklyMinutes', label: 'Carga semanal' }, { key: 'planned', label: 'Previstas' },
  { key: 'completed', label: 'Realizadas' }, { key: 'occupancy', label: 'Ocupação' },
];
const activeLabels: Record<string, string> = { active: 'Ativos', inactive: 'Inativos' };

function Occupancy({ value }: { value: number | null }) {
  return <div className="team-occupancy">
    <strong>{formatRate(value)}</strong>
    {value !== null && <span aria-hidden="true"><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>}
  </div>;
}

/** Health professionals as cards or a sortable table: search, registration filters,
 * ordering and pages of 12, all kept in the URL. */
export function TeamRoster({ state, period }: { state: DemoState; period: Period }) {
  const params = useSearchParams();
  const router = useRouter();
  const query = params.get('q') ?? '';
  const specialty = params.get('specialty') ?? '';
  const active = params.get('active') ?? '';
  const view = params.get('view') === 'table' ? 'table' : 'cards';
  const sortValue = params.get('sort');
  const sort: TeamSort = teamSorts.includes(sortValue as TeamSort) ? sortValue as TeamSort : 'name';
  const order = params.get('order') === 'desc' ? 'desc' : 'asc';
  const rows = teamRoster(state, period, query, specialty, active, sort, order);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const rawPage = Number(params.get('page') ?? 1);
  const page = Math.min(pages, Math.max(1, Number.isFinite(rawPage) ? Math.floor(rawPage) : 1));
  const displayed = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const filtered = !!(query || specialty || active);
  const specialties = Array.from(new Set([...state.clinic.specialties, ...state.professionals.flatMap(p => p.specialties)])).sort();

  function href(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/gestao/equipe${next.size ? `?${next}` : ''}`;
  }
  /** Any change of filter or ordering goes back to the first page. */
  function update(changes: Record<string, string | null>) {
    router.replace(href({ page: null, ...changes }), { scroll: false });
  }
  const ariaSort = (key: TeamSort) => sort === key ? order === 'asc' ? 'ascending' : 'descending' : 'none';
  const sortIndicator = (key: TeamSort) => sort !== key ? <ArrowUpDown size={13} aria-hidden="true" />
    : order === 'asc' ? <ArrowUp size={13} aria-hidden="true" /> : <ArrowDown size={13} aria-hidden="true" />;
  const agendaHref = (id: string) => `/gestao/agenda?professional=${id}&date=${state.referenceDate}`;
  const review = (future: number) => `${plural(future, 'consulta futura', 'consultas futuras')} para revisar`;

  return <section className="team-roster" aria-label="Profissionais de saúde">
    <div className="team-filters">
      <SearchInput aria-label="Buscar profissional" placeholder="Buscar profissional" value={query} onChange={event => update({ q: event.target.value })} />
      <FilterChip name="Especialidade" removeLabel="Remover filtro de especialidade" value={specialty} valueLabel={specialty}
        options={[{ id: '', label: 'Todas as especialidades' }, ...specialties.map(item => ({ id: item, label: item }))]}
        onChange={value => update({ specialty: value || null })} />
      <FilterChip name="Cadastro" removeLabel="Remover filtro de cadastro" value={active} valueLabel={activeLabels[active] ?? active}
        options={[{ id: '', label: 'Todos os cadastros' }, { id: 'active', label: 'Ativos' }, { id: 'inactive', label: 'Inativos' }]}
        onChange={value => update({ active: value || null })} />
      {filtered && <Button variant="ghost" onClick={() => update({ q: null, specialty: null, active: null })}>Limpar filtros</Button>}
    </div>

    <div className="team-list-controls">
      <p>{rows.length} de {state.professionals.length} profissionais · <span>{formatPeriod(period)}</span></p>
      <div className="team-view-controls">
        <select aria-label="Ordenar profissionais" value={sort} onChange={event => update({ sort: event.target.value })}>
          {sorts.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
        </select>
        <Button variant="secondary" size="icon" aria-label={order === 'asc' ? 'Ordenar em ordem decrescente' : 'Ordenar em ordem crescente'}
          onClick={() => update({ order: order === 'asc' ? 'desc' : 'asc' })}>{order === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}</Button>
        <div className="segmented" role="group" aria-label="Visualização dos profissionais">
          <button type="button" aria-pressed={view === 'cards'} onClick={() => update({ view: null })}><LayoutGrid size={16} />Cards</button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => update({ view: 'table' })}><List size={16} />Tabela</button>
        </div>
      </div>
    </div>

    {!rows.length ? <EmptyState title="Nenhum profissional encontrado" description={filtered ? 'Ajuste a busca ou os filtros de cadastro.' : 'Cadastre um profissional para disponibilizar sua agenda.'} />
      : view === 'cards' ? <div className="team-roster-grid">
        {displayed.map(({ professional: p, metrics, weeklyMinutes, future }) => <article className="card team-person-card" key={p.id} data-professional-id={p.id}>
          <div className="team-person-heading">
            <ProfessionalAvatar professional={p} size={32} />
            <h2>{p.name}</h2>
            <Badge tone={p.active ? 'success' : 'neutral'}>Cadastro {p.active ? 'ativo' : 'inativo'}</Badge>
          </div>
          <p className="team-specialties">{p.specialties.join(' · ')}</p>
          <p className="team-weekly">{hours(weeklyMinutes)}/semana cadastradas · {plural(new Set(p.availability.map(slot => slot.day)).size, 'dia', 'dias')}</p>
          <dl className="team-person-metrics">
            <div><dt>Previstas</dt><dd>{metrics.planned}</dd></div>
            <div><dt>Realizadas</dt><dd>{metrics.completed}</dd></div>
            <div><dt>Ocupação</dt><dd><Occupancy value={metrics.occupancy} /></dd></div>
          </dl>
          {!p.active && future > 0 && <p className="team-review">{review(future)}</p>}
          <div className="team-person-links">
            <Link href={href({ id: p.id, attendant: null })} className="text-link">Atividade e agenda<ArrowUpRight size={14} /></Link>
            <Link href={agendaHref(p.id)} className="text-link" aria-label={`Abrir agenda de ${p.name}`}><CalendarDays size={14} />Agenda</Link>
          </div>
        </article>)}
      </div> : <div className="table-wrap team-roster-table" role="region" aria-label="Tabela de profissionais" tabIndex={0}>
        <table className="data-table" data-density="compact">
          <caption className="sr-only">Cadastro, carga semanal e resumo operacional dos profissionais. Indicadores no período selecionado.</caption>
          <thead><tr>
            <th scope="col" aria-sort={ariaSort('name')}>
              <button type="button" onClick={() => update({ sort: 'name', order: sort === 'name' && order === 'asc' ? 'desc' : 'asc' })}>Profissional {sortIndicator('name')}</button>
            </th>
            <th scope="col">Cadastro</th>
            {sorts.slice(1).map(column => <th key={column.key} scope="col" className="numeric" aria-sort={ariaSort(column.key)}>
              <button type="button" onClick={() => update({ sort: column.key, order: sort === column.key && order === 'desc' ? 'asc' : 'desc' })}>{column.label}{sortIndicator(column.key)}</button>
            </th>)}
            <th scope="col">Ações</th>
          </tr></thead>
          <tbody>{displayed.map(({ professional: p, metrics, weeklyMinutes, future }) => <tr key={p.id} data-professional-id={p.id}>
            <th scope="row">
              <Link className="text-link" href={href({ id: p.id, attendant: null })}>{p.name}<ArrowUpRight size={13} /></Link>
              <small>{p.specialties.join(' · ')}</small>
              {!p.active && future > 0 && <small className="team-review">{review(future)}</small>}
            </th>
            <td><Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? 'Ativo' : 'Inativo'}</Badge></td>
            <td className="numeric">{hours(weeklyMinutes)}</td>
            <td className="numeric">{metrics.planned}</td>
            <td className="numeric">{metrics.completed}</td>
            <td className="numeric"><Occupancy value={metrics.occupancy} /></td>
            <td><Link className="text-link" href={agendaHref(p.id)} aria-label={`Abrir agenda de ${p.name}`}>Agenda<ArrowUpRight size={13} /></Link></td>
          </tr>)}</tbody>
        </table>
      </div>}

    {rows.length > 0 && <nav className="team-pagination" aria-label="Paginação dos profissionais">
      <span>Exibindo {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, rows.length)} de {rows.length}</span>
      <div>
        <Button variant="secondary" disabled={page === 1} aria-label="Página anterior de profissionais" onClick={() => update({ page: String(page - 1) })}><ChevronLeft size={14} /></Button>
        <span>Página {page} de {pages}</span>
        <Button variant="secondary" disabled={page === pages} aria-label="Próxima página de profissionais" onClick={() => update({ page: String(page + 1) })}><ChevronRight size={14} /></Button>
      </div>
    </nav>}
    <p className="informative-note">Carga semanal cadastrada é a soma dos intervalos informados. A ocupação do período considera funcionamento da clínica e bloqueios. Detalhes e resultados completos estão na atividade individual; comparações gerais, na visão gerencial.</p>
  </section>;
}
