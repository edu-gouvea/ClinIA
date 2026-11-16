'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Calendar, CalendarPlus, Check, ChevronDown, FileText, Filter, MessageCircle, X, XCircle } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Badge, EmptyState, Menu } from '@/components/ui';
import { clinicDate } from '@/lib/date';
import { relativeDay } from '@/lib/conversation-assistant';
import { rescheduleRequestIds } from '@/lib/agenda-presentation';
import { buildPatientTimeline, longDayLabel, type AppointmentItem, type ConversationItem, type TimelineItem } from '@/lib/patient-presentation';
import { appointmentStatusPresentation, conversationStatusPresentation } from '@/lib/status-presentation';
import { appointmentEnd } from '@/lib/scheduling';
import type { AppointmentStatus } from '@/lib/types';
import { plural } from './shared';

type Filter = 'tudo' | 'consultas' | 'conversas';
const filterLabels: Record<Filter, string> = { tudo: 'Tudo', consultas: 'Consultas', conversas: 'Conversas' };
const PREVIEW = 3;
const isOpen = (status: AppointmentStatus) => status === 'agendada' || status === 'confirmada';

export type PatientLinks = { details: (id: string) => string; reschedule: (id: string) => string; schedule: string };

/** Card shared by the Atividade and Conversas tabs: status badge (central map), session
 * line, two-line preview and the link to the conversation. */
export function ConversationCard({ item }: { item: ConversationItem }) {
  const status = conversationStatusPresentation[item.status];
  return <div className="activity-card conversation-card">
    <div className="activity-card-head"><Badge tone={status.tone}>{status.label}</Badge><span className="activity-meta tabular">Sessão {item.sessionNumber} · {plural(item.messageCount, 'mensagem', 'mensagens')}{item.reason ? ` · motivo: ${item.reason.toLocaleLowerCase('pt-BR')}` : ''}</span></div>
    <p className="activity-preview">{item.preview}</p>
    <Link className="activity-link" href={`/conversas?id=${item.conversationId}`}>Abrir conversa<ArrowUpRight size={14} aria-hidden="true" /></Link>
  </div>;
}

export function conversationHeadline(item: ConversationItem) {
  if (item.status === 'humano') return <><strong>{item.assignee ?? 'Atendente'}</strong> assumiu a conversa</>;
  if (item.status === 'aguardando') return <>Conversa aguardando atendimento</>;
  if (item.status === 'ia') return <>A IA está conduzindo a conversa</>;
  return <>Conversa encerrada{item.assignee ? ` por ${item.assignee}` : ''}</>;
}

export function PatientActivity({ patientId, links }: { patientId: string; links: PatientLinks }) {
  const { state } = useDemo();
  const [filter, setFilter] = useState<Filter>('tudo');
  const [months, setMonths] = useState(2);
  const [expanded, setExpanded] = useState(false);
  const timeline = buildPatientTimeline(state, patientId, state.now, months);
  const reschedules = rescheduleRequestIds(state);
  const keep = (item: TimelineItem) => filter === 'tudo' || (filter === 'consultas' ? item.type === 'appointment' : item.type === 'conversation');
  const groups = timeline.groups.map(group => ({ ...group, items: group.items.filter(keep) })).filter(group => group.items.length);
  const items: { label: string; filter: Filter }[] = (['tudo', 'consultas', 'conversas'] as Filter[]).map(key => ({ label: filterLabels[key], filter: key }));

  return <div className="activity-panel">
    <div className="activity-head">
      <h2>Atividade</h2>
      <Menu label={`Filtrar atividade: ${filterLabels[filter]}`} icon={<Filter size={14} aria-hidden="true" />} text={filterLabels[filter]} triggerClassName="btn btn-secondary btn-28"
        items={items.map(item => ({ label: item.label, checked: filter === item.filter, onSelect: () => setFilter(item.filter) }))} />
    </div>
    {!groups.length && !timeline.nextMonth
      ? <EmptyState title="Nenhuma atividade ainda" description="Consultas e conversas deste paciente aparecem aqui."><Link className="btn btn-primary" href={links.schedule}><CalendarPlus size={16} aria-hidden="true" />Agendar consulta</Link></EmptyState>
      : <>
        {groups.map(group => {
          const upcoming = group.id === 'proximas';
          const featured = upcoming ? group.items.find((item): item is AppointmentItem => item.type === 'appointment' && isOpen(item.status)) : undefined;
          const rest = featured ? group.items.filter(item => item !== featured) : group.items;
          const limit = upcoming && !expanded ? Math.max(0, PREVIEW - (featured ? 1 : 0)) : rest.length;
          const hidden = rest.length - limit;
          return <section key={group.id} className="activity-group" aria-labelledby={`activity-group-${group.id}`}>
            <h3 id={`activity-group-${group.id}`} className={upcoming ? 'is-upcoming' : undefined}>{group.title}</h3>
            {featured && <FeaturedAppointment item={featured} links={links} reschedule={reschedules.has(featured.id)} />}
            {limit > 0 && <ol className="timeline-list">{rest.slice(0, limit).map(item => <TimelineEntry key={item.id} item={item} upcoming={upcoming} links={links} />)}</ol>}
            {hidden > 0 && <button type="button" className="btn btn-ghost btn-28 activity-more" onClick={() => setExpanded(true)}><ChevronDown size={14} aria-hidden="true" />Mais {plural(hidden, 'consulta marcada', 'consultas marcadas')}</button>}
          </section>;
        })}
        {timeline.nextMonth && <button type="button" className="btn btn-ghost activity-load" onClick={() => setMonths(months + 1)}>Carregar {timeline.nextMonth}</button>}
      </>}
  </div>;
}

function FeaturedAppointment({ item, links, reschedule }: { item: AppointmentItem; links: PatientLinks; reschedule: boolean }) {
  const status = appointmentStatusPresentation[item.status];
  return <div className="featured-appointment" data-tone={status.tone}>
    <div className="featured-main">
      <strong className="tabular">{longDayLabel(item.date)} · {item.time}–{appointmentEnd({ start: item.time, duration: item.duration })}</strong>
      <span className="featured-sub">{item.specialty} com {item.professional}</span>
      <span className="featured-badges"><Badge tone={status.tone}>{status.label}</Badge>{reschedule && <Badge tone="warning">Pediu remarcação</Badge>}</span>
    </div>
    <div className="featured-actions">
      <Link className="btn btn-secondary btn-28" href={links.reschedule(item.id)}>Remarcar</Link>
      <Link className="btn btn-ghost btn-28" href={links.details(item.id)} scroll={false}>Detalhes</Link>
    </div>
  </div>;
}

function marker(item: AppointmentItem, upcoming: boolean) {
  if (item.status === 'cancelada') return <X size={14} />;
  if (upcoming || item.status === 'agendada' || item.status === 'confirmada') return <Calendar size={14} />;
  if (item.status === 'realizada') return <Check size={14} />;
  return <XCircle size={14} />;
}

function TimelineEntry({ item, upcoming, links }: { item: TimelineItem; upcoming: boolean; links: PatientLinks }) {
  const { state } = useDemo();
  const date = item.type === 'appointment' ? item.date : clinicDate(item.at);
  const day = relativeDay(date, state.referenceDate);
  const when = <span className={`timeline-date tabular${upcoming && day === 'Hoje' ? ' is-today' : ''}`}>{day}</span>;
  if (item.type === 'conversation') {
    return <li className="timeline-entry" data-tone={conversationStatusPresentation[item.status].tone}>
      <span className="timeline-marker" aria-hidden="true"><MessageCircle size={14} /></span>
      <div className="timeline-body">
        <div className="timeline-line"><span className="timeline-text">{conversationHeadline(item)}</span>{when}</div>
        <ConversationCard item={item} />
      </div>
    </li>;
  }
  const status = appointmentStatusPresentation[item.status];
  const cancelled = item.status === 'cancelada';
  return <li className="timeline-entry" data-tone={status.tone} data-status={item.status}>
    <span className={`timeline-marker${cancelled ? ' is-dashed' : ''}`} aria-hidden="true">{marker(item, upcoming)}</span>
    <div className="timeline-body">
      <Link className="timeline-line is-link" href={links.details(item.id)} scroll={false} aria-label={`${item.specialty} com ${item.professional}, ${day} às ${item.time}, ${status.label}. Abrir detalhes`}>
        <span className="timeline-text"><strong className={cancelled ? 'is-cancelled' : undefined}>{item.specialty}</strong> <span className="timeline-muted">com {item.professional} · <span className="tabular">{item.time}</span></span> <Badge tone={status.tone}>{status.label}</Badge></span>
        {when}
      </Link>
      {item.cancelReason && <p className="timeline-reason">Motivo: “{item.cancelReason}”</p>}
      {item.latestNote && <Link className="activity-card note-card" href={links.details(item.id)} scroll={false}>
        <FileText size={14} aria-hidden="true" />
        <span><span className="activity-preview">{item.latestNote.text}</span><span className="activity-meta">Anotação de {item.latestNote.author} · versão {item.latestNote.version}</span></span>
      </Link>}
    </div>
  </li>;
}
