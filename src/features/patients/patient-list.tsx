'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpDown, ChevronRight, Filter, Plus, X } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Avatar, Badge, Button, EmptyState, Field, Menu, PageHeading, Popover, SearchInput, type MenuItem } from '@/components/ui';
import { dayMonth, relativeAgo } from '@/lib/date';
import {
  appointmentWhen, filterPatients, paginate, parseOrder, parseSort, parseView, sortPatients, viewCounts,
  type PatientRow, type PatientSort, type PatientView, type SortOrder,
} from '@/lib/patient-presentation';
import { detailHref, PendencyBadge } from './shared';

const PAGE_SIZE = 12;
const sortLabels: Record<PatientSort, string> = { proxima: 'Próxima consulta', nome: 'Nome', ultima: 'Última consulta' };
const defaultOrder: Record<PatientSort, SortOrder> = { proxima: 'asc', nome: 'asc', ultima: 'desc' };
const viewLabels: Record<PatientView, string> = { todos: 'Todos', pendencias: 'Com pendência', 'sem-proxima': 'Sem próxima consulta' };
const isParticularName = (name: string) => /^particular$/i.test(name.trim());

export function PatientList({ onCreate }: { onCreate: () => void }) {
  const { state } = useDemo(); const params = useSearchParams(); const router = useRouter();
  const q = params.get('q') ?? ''; const insurance = params.get('insurance') ?? '';
  const view = parseView(params.get('view')); const sort = parseSort(params.get('sort'));
  const order = params.has('order') ? parseOrder(params.get('order')) : defaultOrder[sort];
  const counts = viewCounts(state, { q, insurance });
  const rows = sortPatients(filterPatients(state, { q, insurance, view }), sort, order);
  const page = paginate(rows, Number(params.get('page') ?? 1), PAGE_SIZE);
  const plans = state.clinic.insurance.filter(name => !isParticularName(name));
  const insuranceName = insurance === 'particular' ? 'Particular' : insurance;

  function update(changes: Record<string, string | null>, resetPage = true) {
    const next = new URLSearchParams(params.toString());
    Object.entries({ ...(resetPage ? { page: null } : {}), ...changes }).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`/gestao/pacientes${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function setSort(next: PatientSort, nextOrder?: SortOrder) {
    const direction = nextOrder ?? (next === sort ? (order === 'asc' ? 'desc' : 'asc') : defaultOrder[next]);
    const isDefault = next === 'proxima' && direction === 'asc';
    update({ sort: isDefault ? null : next, order: isDefault ? null : direction });
  }
  const sortItems: MenuItem[] = [
    ...(['proxima', 'nome', 'ultima'] as PatientSort[]).map(key => ({ label: sortLabels[key], checked: sort === key, onSelect: () => setSort(key, key === sort ? order : defaultOrder[key]) })),
    { separator: true, label: 'Direção' },
    { label: 'Crescente', checked: order === 'asc', onSelect: () => setSort(sort, 'asc') },
    { label: 'Decrescente', checked: order === 'desc', onSelect: () => setSort(sort, 'desc') },
  ];
  const sortHeader = (key: PatientSort, label: string) => <th scope="col" aria-sort={sort === key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" className="th-sort" onClick={() => setSort(key)}>{label}<ArrowUpDown size={12} aria-hidden="true" /></button>
  </th>;

  let body;
  if (!state.patients.length) {
    body = <EmptyState title="Nenhum paciente cadastrado" description="Cadastre o primeiro paciente para começar."><Button onClick={onCreate}><Plus size={16} />Cadastrar paciente</Button></EmptyState>;
  } else if (!rows.length) {
    body = <EmptyState title="Nenhum paciente encontrado" description="Experimente outro nome ou telefone, ou remova os filtros."><Button variant="secondary" onClick={() => update({ q: null, insurance: null, view: null })}>Limpar filtros</Button></EmptyState>;
  } else {
    body = <>
      <div className="table-wrap patient-table-wrap">
        <table className="data-table patient-table">
          <thead><tr>
            {sortHeader('nome', 'Paciente')}
            <th scope="col">Convênio</th>
            {sortHeader('proxima', 'Próxima consulta')}
            {sortHeader('ultima', 'Última consulta')}
            <th scope="col">Pendência</th>
            <th scope="col" className="patient-chevron-cell"><span className="sr-only">Abrir</span></th>
          </tr></thead>
          <tbody>{page.items.map(row => <PatientTableRow key={row.patient.id} row={row} href={detailHref(params, row.patient.id)} onOpen={href => router.push(href)} />)}</tbody>
        </table>
      </div>
      <footer className="patient-list-footer">
        <span className="tabular">{page.from}–{page.to} de {page.total} {page.total === 1 ? 'paciente' : 'pacientes'}</span>
        {page.pages > 1 && <nav className="pagination" aria-label="Paginação">
          <button type="button" className="btn btn-ghost" disabled={page.page === 1} onClick={() => update({ page: page.page > 2 ? String(page.page - 1) : null }, false)}>Anterior</button>
          {Array.from({ length: page.pages }, (_, index) => index + 1).map(number => <button key={number} type="button" className="page-number tabular" aria-current={number === page.page ? 'page' : undefined} aria-label={`Página ${number}`} onClick={() => update({ page: number > 1 ? String(number) : null }, false)}>{number}</button>)}
          <button type="button" className="btn btn-ghost" disabled={page.page === page.pages} onClick={() => update({ page: String(page.page + 1) }, false)}>Próxima</button>
        </nav>}
      </footer>
    </>;
  }

  return <div className="page-stack patients-page" data-density="standard">
    <PageHeading trail={['Gestão', 'Pacientes']} title="Pacientes" actions={<Button onClick={onCreate}><Plus size={16} />Cadastrar paciente</Button>} />
    {params.has('id') && <div className="warning-banner">Paciente não encontrado. Escolha um dos cadastros disponíveis.</div>}
    <section className="patient-card" aria-label="Lista de pacientes">
      <div className="patient-list-bar">
        <div className="segmented patient-views" role="group" aria-label="Visões">
          {(['todos', 'pendencias', 'sem-proxima'] as PatientView[]).map(key => <button key={key} type="button" aria-pressed={view === key} onClick={() => update({ view: key === 'todos' ? null : key })}>
            {key === 'pendencias' && <i className="pending-dot" aria-hidden="true" />}{viewLabels[key]} <span className="view-count tabular">{counts[key]}</span>
          </button>)}
        </div>
        <span className="bar-spacer" />
        <SearchInput className="patient-search" aria-label="Buscar paciente" placeholder="Buscar por nome ou telefone" value={q} onChange={(e) => update({ q: e.target.value || null })} />
        <div className={`insurance-filter${insurance ? ' is-active' : ''}`}>
          <Popover label="Filtrar por convênio" triggerClassName="btn btn-secondary insurance-trigger" triggerContent={<><Filter size={16} aria-hidden="true" />{insurance ? `Convênio: ${insuranceName}` : 'Convênio'}</>}>
            {close => <div className="popover-stack">
              <Field label="Convênio"><select aria-label="Filtrar convênio" value={insurance} onChange={(e) => { update({ insurance: e.target.value || null }); close(); }}><option value="">Todos os convênios</option><option value="particular">Particular</option>{plans.map((item) => <option key={item}>{item}</option>)}</select></Field>
            </div>}
          </Popover>
          {insurance && <button type="button" className="insurance-clear" aria-label="Limpar filtro de convênio" onClick={() => update({ insurance: null })}><X size={14} aria-hidden="true" /></button>}
        </div>
        <Menu label={`Ordenar por: ${sortLabels[sort]}`} icon={<ArrowUpDown size={16} aria-hidden="true" />} text={sortLabels[sort]} triggerClassName="btn btn-secondary" items={sortItems} className="patient-sort" />
      </div>
      {body}
    </section>
  </div>;
}

function PatientTableRow({ row, href, onOpen }: { row: PatientRow; href: string; onOpen: (href: string) => void }) {
  const { state } = useDemo();
  const { patient, next, last, pendencies } = row;
  const professional = next && state.professionals.find(p => p.id === next.professionalId);
  const [first, ...rest] = pendencies;
  const particular = !patient.insurance || isParticularName(patient.insurance);
  return <tr className="patient-row" onClick={event => { if (!(event.target as HTMLElement).closest('a') && !window.getSelection()?.toString()) onOpen(href); }}>
    <td className="patient-cell">
      <Link className="patient-row-link" href={href} aria-label={`Abrir cadastro de ${patient.name}`}>
        <Avatar name={patient.name} size="sm" className="avatar-32" />
        <span className="patient-name-block"><span className="patient-name">{patient.name}</span><span className="patient-phone tabular">{patient.phone}</span></span>
      </Link>
    </td>
    <td className={`insurance-cell${particular ? ' is-particular' : ''}`} data-label="Convênio">{particular ? 'Particular' : patient.insurance}</td>
    <td className="next-cell" data-label="Próxima">{next
      ? <><span className="cell-primary tabular">{appointmentWhen(next.date, next.start, state.referenceDate)}</span><span className="cell-secondary">{professional?.name ?? 'Profissional'} · {next.specialty}</span></>
      : <><span className="cell-primary is-empty">Sem consulta marcada</span><span className="cell-secondary">Agendar a próxima</span></>}</td>
    <td className="last-cell">{last
      ? <><span className="cell-primary tabular">{relativeAgo(last.date, state.referenceDate)}</span><span className="cell-secondary tabular">{dayMonth(last.date)}</span></>
      : <><span className="cell-dash" aria-hidden="true">—</span><span className="sr-only">Sem consulta anterior</span></>}</td>
    <td className="pendency-cell">{first
      ? <span className="pendency-badges"><PendencyBadge pendency={first} />{rest.length > 0 && <span className="pendency-more" title={rest.map(p => p.label).join(', ')}><Badge>+{rest.length}<span className="sr-only">: {rest.map(p => p.label).join(', ')}</span></Badge></span>}</span>
      : <><span className="cell-dash is-none" aria-hidden="true">—</span><span className="sr-only">Sem pendência</span></>}</td>
    <td className="patient-chevron-cell"><ChevronRight size={16} aria-hidden="true" /></td>
  </tr>;
}
