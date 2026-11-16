'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, ChevronRight, UserRound } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, EmptyState, Field, Popover } from '@/components/ui';
import { clinicDate, formatDate, formatTime } from '@/lib/date';
import { relativeDay } from '@/lib/conversation-assistant';
import { paginate, patientAppointmentsSplit, patientNotes, patientSessions } from '@/lib/patient-presentation';
import { appointmentStatusPresentation } from '@/lib/status-presentation';
import { isOpenAppointment } from '@/lib/scheduling';
import { ConversationCard, conversationHeadline, type PatientLinks } from './patient-activity';
import { plural } from './shared';

const PAGE_SIZE = 12;

export function PatientAppointmentsTab({ patientId, links, context }: { patientId: string; links: PatientLinks; context: string }) {
  const { state } = useDemo(); const params = useSearchParams(); const router = useRouter();
  const professionalId = params.get('professional') ?? '';
  const split = patientAppointmentsSplit(state, patientId, professionalId);
  const requested = params.get('when');
  const when = requested === 'anteriores' || requested === 'proximas' ? requested : split.proximas.length ? 'proximas' : 'anteriores';
  const list = split[when];
  const page = paginate(list, Number(params.get('page') ?? 1), PAGE_SIZE);
  const recorded = [...new Set(state.appointments.filter(a => a.patientId === patientId).map(a => a.professionalId))];
  const professionals = state.professionals.filter(p => recorded.includes(p.id));
  const selected = professionals.find(p => p.id === professionalId);
  const span = list.map(a => a.date).sort();
  const agenda = `/gestao/agenda?patient=${patientId}${span.length ? `&from=${span[0]}&to=${span.at(-1)}` : ''}${context}`;

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    Object.entries({ page: null, ...changes }).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`/gestao/pacientes?${next}`, { scroll: false });
  }

  return <div className="appointments-panel">
    <div className="appointments-bar">
      <div className="segmented" role="group" aria-label="Período das consultas">
        <button type="button" aria-pressed={when === 'proximas'} onClick={() => update({ when: 'proximas' })}>Próximas <span className="view-count tabular">{split.proximas.length}</span></button>
        <button type="button" aria-pressed={when === 'anteriores'} onClick={() => update({ when: 'anteriores' })}>Anteriores <span className="view-count tabular">{split.anteriores.length}</span></button>
      </div>
      <span className="bar-spacer" />
      <Popover label="Filtrar por profissional" triggerClassName="btn btn-secondary btn-28" triggerContent={<><UserRound size={14} aria-hidden="true" />{selected?.name ?? 'Todos os profissionais'}</>}>
        {close => <div className="popover-stack"><Field label="Profissional"><select aria-label="Filtrar profissional" value={professionalId} onChange={e => { update({ professional: e.target.value || null }); close(); }}><option value="">Todos os profissionais</option>{professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field></div>}
      </Popover>
      <Link className="btn btn-ghost btn-28" href={agenda}>Ver na agenda<ArrowUpRight size={14} aria-hidden="true" /></Link>
    </div>
    {list.length ? <>
      <div className="table-wrap">
        <table className="data-table patient-appointments-table">
          <thead><tr><th scope="col">Data e horário</th><th scope="col">Profissional</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>{page.items.map(a => {
            const status = appointmentStatusPresentation[a.status];
            const professional = state.professionals.find(p => p.id === a.professionalId);
            const day = relativeDay(a.date, state.referenceDate);
            return <tr key={a.id} className="appointment-row" data-appointment-id={a.id} onClick={event => { if (!(event.target as HTMLElement).closest('a')) router.push(links.details(a.id), { scroll: false }); }}>
              <td><Link className="appointment-row-link" href={links.details(a.id)} scroll={false} aria-label={`Abrir detalhes da consulta de ${day}, ${a.start}`}><span className="cell-primary is-strong">{formatDate(a.date, { weekday: 'short', day: 'numeric', month: 'short', year: a.date.slice(0, 4) === state.referenceDate.slice(0, 4) ? undefined : 'numeric' })}</span></Link><span className="cell-secondary tabular">{a.start} · {a.duration} min</span></td>
              <td><span className="cell-primary">{professional?.name ?? 'Profissional removido'}</span><span className="cell-secondary">{a.specialty}</span></td>
              <td><Badge tone={status.tone}>{status.label}</Badge></td>
              <td className="row-actions">{when === 'proximas' && isOpenAppointment(a) && <Link className="btn btn-ghost btn-28" href={links.reschedule(a.id)}>Remarcar</Link>}<ChevronRight size={16} aria-hidden="true" className="row-chevron" /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer className="patient-list-footer">
        <span className="tabular">{plural(list.length, 'consulta', 'consultas')}</span>
        {page.pages > 1 && <nav className="pagination" aria-label="Paginação das consultas">
          <button type="button" className="btn btn-ghost" disabled={page.page === 1} onClick={() => update({ page: page.page > 2 ? String(page.page - 1) : null })}>Anterior</button>
          {Array.from({ length: page.pages }, (_, i) => i + 1).map(n => <button key={n} type="button" className="page-number tabular" aria-current={n === page.page ? 'page' : undefined} aria-label={`Página ${n}`} onClick={() => update({ page: n > 1 ? String(n) : null })}>{n}</button>)}
          <button type="button" className="btn btn-ghost" disabled={page.page === page.pages} onClick={() => update({ page: String(page.page + 1) })}>Próxima</button>
        </nav>}
      </footer>
    </> : <EmptyState title={when === 'proximas' ? 'Nenhuma consulta marcada' : 'Nenhuma consulta anterior'} description={selected ? 'Remova o filtro de profissional para ver as demais.' : undefined} />}
  </div>;
}

export function PatientConversationsTab({ patientId }: { patientId: string }) {
  const { state } = useDemo();
  const sessions = patientSessions(state, patientId);
  if (!sessions.length) return <EmptyState title="Nenhuma conversa com este paciente" />;
  return <ol className="card-list">{sessions.map(item => <li key={item.id}>
    <div className="timeline-line"><span className="timeline-text">{conversationHeadline(item)}</span><span className="timeline-date tabular">{relativeDay(clinicDate(item.at), state.referenceDate)} · {formatTime(item.at)}</span></div>
    <ConversationCard item={item} />
  </li>)}</ol>;
}

export function PatientNotesTab({ patientId, links }: { patientId: string; links: PatientLinks }) {
  const { state } = useDemo();
  const notes = patientNotes(state, patientId);
  if (!notes.length) return <EmptyState title="Nenhuma anotação" description="As anotações aparecem aqui depois que uma consulta é realizada." />;
  return <ol className="card-list">{notes.map(note => <li key={note.appointmentId} className="note-entry">
    <div className="note-head"><strong>{note.author}</strong><span className="activity-meta tabular">{formatDate(note.at)} · {formatTime(note.at)}</span></div>
    <Link className="activity-link" href={links.details(note.appointmentId)} scroll={false}>{note.specialty} · {formatDate(note.date, { day: 'numeric', month: 'short' })}</Link>
    <p className="note-text">{note.text}</p>
    <span className="activity-meta">versão {note.version}</span>
  </li>)}</ol>;
}
