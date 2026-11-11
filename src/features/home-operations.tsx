'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, CalendarDays, CheckCheck, ChevronRight, Clock3, MessageCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAssistant } from '@/components/assistant-provider';
import { Badge, EmptyState } from '@/components/ui';
import { dateTime, formatDate, formatPeriod, minutes, timeFromMinutes } from '@/lib/date';
import { getFreeSlots } from '@/lib/metrics';
import { isOpenAppointment } from '@/lib/scheduling';
import type { DemoState, Metrics, Period } from '@/lib/types';
import { AppointmentDetails } from './agenda/appointment-details';
import { AppointmentForm } from './agenda/appointment-form';

export function HomeOperations({ state, metrics, period, chart }: { state: DemoState; metrics: Metrics; period: Period; chart: ReactNode }) {
  const { openAssistant } = useAssistant();
  const router = useRouter();
  const params = useSearchParams();
  const selected = state.appointments.find(appointment => appointment.id === params.get('appointment'));
  const editing = state.appointments.find(appointment => appointment.id === params.get('edit') && isOpenAppointment(appointment));
  function appointmentHref(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/inicio${next.size ? `?${next}` : ''}`;
  }
  function updateAppointment(changes: Record<string, string | null>) {
    router.push(appointmentHref(changes), { scroll: false });
  }
  const today = state.appointments.filter(a => a.date === state.referenceDate && a.status !== 'cancelada');
  const pending = today.filter(a => ['agendada', 'confirmada'].includes(a.status)).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const waiting = state.conversations.filter(c => c.status === 'aguardando').length;
  const humans = state.conversations.filter(c => c.status === 'humano').length;
  const bots = state.conversations.filter(c => c.status === 'ia').length;
  const reschedules = state.conversations.filter(c => c.status !== 'encerrada' && /remarc/i.test(c.reason || '')).length;
  const confirmations = today.filter(a => a.status === 'agendada').length;
  const free = state.professionals.filter(p => p.active).reduce((sum, p) => sum + getFreeSlots(state, p.id, state.referenceDate).length, 0);
  const agenda = `/gestao/agenda?date=${state.referenceDate}`;
  const actions = [
    { label: 'Solicitações de atendimento', scope: 'Fila atual', count: waiting, href: '/conversas?status=aguardando', icon: MessageCircle },
    { label: 'Confirmações de hoje', scope: 'Consultas agendadas', count: confirmations, href: `${agenda}&status=agendada`, icon: CheckCheck },
    { label: 'Pedidos de remarcação', scope: 'Conversas abertas', count: reschedules, href: '/conversas?reason=remarcacao', icon: CalendarDays },
  ];

  return <>
    <div className="home-operation-grid">
      <section className="card home-priorities" aria-labelledby="home-priorities-title">
        <div className="card-header"><div><h2 id="home-priorities-title">Precisa de atenção</h2><p>Atendimento atual e consultas de hoje</p></div></div>
        <div className="home-action-list">{actions.map(action => <Link key={action.label} href={action.href} className="home-action" data-pending={action.count > 0}>
          <action.icon size={17} aria-hidden="true" /><span><strong>{action.label}</strong><small>{action.scope}</small></span><Badge tone={action.count ? 'amber' : 'gray'}>{action.count}</Badge><ChevronRight size={14} aria-hidden="true" />
        </Link>)}</div>
        {actions.every(action => action.count === 0) && <p className="home-clear-state">Nenhuma pendência nessas filas.</p>}
        <Link href={`${agenda}&availability=1`} className="home-availability"><Clock3 size={16} aria-hidden="true" /><span><strong>{free}</strong> opções livres de 30 min hoje</span><ArrowUpRight size={15} aria-hidden="true" /></Link>
      </section>

      <section className="card home-today" aria-labelledby="home-today-title">
        <div className="card-header"><div><h2 id="home-today-title">Na agenda de hoje <span className="count-chip">{pending.length}</span></h2><p>{formatDate(state.referenceDate, { day: 'numeric', month: 'long' })} · {pending.length} pendentes de {today.length} consultas</p></div><Link className="text-link" href={agenda}>Ver agenda <ArrowUpRight size={15} /></Link></div>
        {pending.length === 0 ? <EmptyState title="Agenda em dia" description="Nenhuma consulta pendente hoje." /> : <>
          <div className="home-today-list">{pending.slice(0, 5).map(appointment => {
            const patient = state.patients.find(p => p.id === appointment.patientId)!;
            const professional = state.professionals.find(p => p.id === appointment.professionalId)!;
            const ended = new Date(dateTime(appointment.date, appointment.start)).getTime() + appointment.duration * 60000 <= new Date(state.now).getTime();
            return <Link key={appointment.id} className="home-today-row" href={appointmentHref({ appointment: appointment.id, edit: null })} scroll={false}>
              <div className="home-appointment-time"><strong>{appointment.start}</strong><small>até {timeFromMinutes(minutes(appointment.start) + appointment.duration)}</small></div>
              <div className="home-appointment-person"><strong>{patient.name}</strong><small>{professional.name} · {appointment.specialty}</small></div>
              <div className="home-appointment-status"><Badge tone={appointment.status === 'confirmada' ? 'green' : 'amber'}>{appointment.status === 'confirmada' ? 'Confirmada' : 'A confirmar'}</Badge>{ended && <small>Aguardando resultado</small>}</div><ChevronRight size={14} aria-hidden="true" />
            </Link>;
          })}</div>
          <p className="home-preview">Exibindo {Math.min(5, pending.length)} de {pending.length} consultas pendentes hoje.</p>
        </>}
      </section>
    </div>

    <div className="home-analysis-grid">
      <section className="card home-trend" aria-labelledby="home-trend-title"><div className="card-header"><div><h2 id="home-trend-title">Consultas no período</h2><p>Pela data prevista · {formatPeriod(period)}</p></div><Badge>{metrics.total} consultas</Badge></div>{chart}</section>
      <section className="card home-conversations" aria-labelledby="home-conversations-title">
        <div className="card-header"><div><h2 id="home-conversations-title">Conversas</h2><p>Fila atual · todos os períodos</p></div><Badge>{waiting + humans + bots} em andamento</Badge></div>
        {[
          { label: 'Aguardando atendente', count: waiting, status: 'aguardando', tone: 'amber' as const },
          { label: 'Com atendimento humano', count: humans, status: 'humano', tone: 'gray' as const },
          { label: 'Com a IA de atendimento', count: bots, status: 'ia', tone: 'green' as const },
        ].map(row => <Link key={row.status} href={`/conversas?status=${row.status}`} className="home-queue-row"><span>{row.label}</span><Badge tone={row.tone}>{row.count}</Badge><ChevronRight size={14} aria-hidden="true" /></Link>)}
        <Link href="/conversas" className="text-link home-queue-link">Abrir central de conversas <ArrowUpRight size={15} /></Link>
        <div className="home-insight"><div><Sparkles size={15} aria-hidden="true" /><strong>Cancelamentos no período</strong><Badge>Simulação</Badge></div><p>{metrics.cancelled} de {metrics.total} consultas · {formatPeriod(period)}</p><button type="button" className="text-link" onClick={() => openAssistant('Como foram os cancelamentos neste período?')}>Explorar com a IA <ArrowUpRight size={14} /></button></div>
      </section>
    </div>
    {selected && !editing && <AppointmentDetails key={selected.id} appointment={selected} onClose={() => updateAppointment({ appointment: null, edit: null })} onReschedule={() => updateAppointment({ appointment: null, edit: selected.id })} />}
    {editing && <AppointmentForm key={editing.id} appointment={editing} onClose={() => updateAppointment({ appointment: editing.id, edit: null })} />}
  </>;
}
