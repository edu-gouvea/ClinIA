'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { ArrowRight, CalendarCheck, Check, ChevronDown, ChevronRight, Clock3, Info, MessageCircle, Plus, Repeat, Sparkles } from 'lucide-react';
import { useAssistant } from '@/components/assistant-provider';
import { StackedBarChart, type StackedDatum, type StackedSeries } from '@/components/stacked-bar-chart';
import { Badge, Button, EmptyState } from '@/components/ui';
import { KpiStrip } from '@/components/kpi-strip';
import { dateTime, formatDate, formatPeriod, minutes, timeFromMinutes } from '@/lib/date';
import { metricComparison } from '@/lib/metric-comparison';
import { dailyBreakdown } from '@/lib/management-analysis';
import { getFreeSlots } from '@/lib/metrics';
import { isOpenAppointment } from '@/lib/scheduling';
import { appointmentStatusLabels, appointmentStatusTones } from '@/lib/status-presentation';
import type { AppointmentStatus, DemoState, Metrics, Period } from '@/lib/types';
import { AppointmentDetails } from './agenda/appointment-details';
import { AppointmentForm } from './agenda/appointment-form';

const PREVIEW = 6;
const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const weekdaysLong = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const dayOf = (date: string) => date.slice(8, 10);
const monthOf = (date: string) => months[Number(date.slice(5, 7)) - 1];
const weekdayIndex = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const plural = (count: number, one: string, many: string) => `${count.toLocaleString('pt-BR')} ${count === 1 ? one : many}`;
const ratio = (value: number | null) => value === null ? 'Sem dados' : `${value.toFixed(1).replace('.', ',')}%`;
const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1);

/** Short interval, e.g. "04–10 nov.", "28 out.–03 nov." or "09 nov.". */
export function shortPeriod(period: Period) {
  if (period.start === period.end) return `${dayOf(period.start)} ${monthOf(period.start)}`;
  if (period.start.slice(0, 7) === period.end.slice(0, 7)) return `${dayOf(period.start)}–${dayOf(period.end)} ${monthOf(period.end)}`;
  return `${dayOf(period.start)} ${monthOf(period.start)}–${dayOf(period.end)} ${monthOf(period.end)}`;
}

/** Columns of the "Consultas por dia" chart (Início and Visão gerencial): one per day
 * from `dailyBreakdown`, "Hoje" highlighted, sparse labels in the 30-day view. */
export function dailyChartData(state: DemoState, period: Period, days: number, professionalId: string, specialty: string): StackedDatum[] {
  const data: StackedDatum[] = dailyBreakdown(state, { professionalId, specialty }, period).slice(0, 366).map((day, index) => {
    const date = day.date; const isToday = date === state.referenceDate;
    return {
      id: date, highlight: isToday, label: isToday ? 'Hoje' : `${weekdays[weekdayIndex(date)]} ${dayOf(date)}`, shortLabel: isToday ? 'Hoje' : dayOf(date),
      fullLabel: `${weekdaysLong[weekdayIndex(date)]}, ${dayOf(date)} ${monthOf(date)}`,
      showLabel: days < 30 || isToday || index % 5 === 0,
      values: { completed: day.completed, missed: day.missed, cancelled: day.cancelled, planned: day.planned },
    };
  });
  // A label right before "Hoje" would collide with it in the 30-day view.
  if (days >= 30) data.forEach((datum, index) => { if (index >= data.length - 3 && !datum.highlight) datum.showLabel = false; });
  return data;
}

export const chartSeries: StackedSeries[] = [
  { key: 'completed', label: 'Realizadas', unit: 'realizadas', color: 'var(--data-realizadas)' },
  { key: 'missed', label: 'Faltas', unit: 'faltas', color: 'var(--data-faltas)' },
  { key: 'cancelled', label: 'Canceladas', unit: 'canceladas', color: 'var(--data-canceladas)' },
  { key: 'planned', label: 'Em aberto', unit: 'em aberto', color: 'var(--data-em-aberto)', outlined: true },
];

type Props = { state: DemoState; period: Period; previous: Period; metrics: Metrics; before: Metrics; days: number; professionalId: string; specialty: string; onPeriod: (value: string) => void };

export function HomeOverview({ state, period, previous, metrics, before, days, professionalId, specialty, onPeriod }: Props) {
  const { openAssistant } = useAssistant();
  const router = useRouter();
  const params = useSearchParams();
  const [newAppointment, setNewAppointment] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const definitions = useRef<HTMLDetailsElement>(null);
  const listId = useId();
  const performanceId = useId();

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
  const updateAppointment = (changes: Record<string, string | null>) => router.push(appointmentHref(changes), { scroll: false });

  // Today's operation (independent of the selected period).
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
    { label: 'Solicitações na fila', scope: 'Conversas aguardando atendente', count: waiting, href: '/conversas?status=aguardando', icon: MessageCircle },
    { label: 'Pedidos de remarcação', scope: 'Em conversas abertas', count: reschedules, href: '/conversas?reason=remarcacao', icon: Repeat },
    { label: 'Confirmações de hoje', scope: 'Consultas a confirmar hoje', count: confirmations, href: `${agenda}&status=agendada`, icon: CalendarCheck },
  ];
  const openActions = actions.filter(action => action.count > 0);
  const clearActions = actions.filter(action => action.count === 0);
  const attention = actions.reduce((sum, action) => sum + action.count, 0);
  const inService = humans + bots;
  const visible = expanded ? pending : pending.slice(0, PREVIEW);

  // Period performance.
  function agendaHref(status?: AppointmentStatus) {
    return `/gestao/agenda?from=${period.start}&to=${period.end}${status ? `&status=${status}` : ''}${professionalId ? `&professional=${professionalId}` : ''}${specialty ? `&specialty=${encodeURIComponent(specialty)}` : ''}`;
  }
  const results = metrics.completed + metrics.missed;
  const kpis = [
    { title: 'Consultas realizadas', value: String(metrics.completed), detail: 'Resultados registrados', href: agendaHref('realizada'), change: metricComparison(metrics.completed, before.completed, false, 'higher') },
    { title: 'Ocupação da agenda', value: ratio(metrics.occupancy), detail: `${(metrics.bookedMinutes / 60).toLocaleString('pt-BR')} h ocupadas de ${(metrics.availableMinutes / 60).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`, href: agendaHref(), change: metricComparison(metrics.occupancy, before.occupancy, true) },
    { title: 'Taxa de faltas', value: ratio(metrics.absenceRate), detail: `${plural(metrics.missed, 'falta', 'faltas')} em ${plural(results, 'resultado', 'resultados')}`, href: agendaHref('falta'), change: metricComparison(metrics.absenceRate, before.absenceRate, true, 'lower') },
    { title: 'Em aberto', value: String(metrics.planned), detail: 'Agendadas ou confirmadas, sem resultado', href: `${agendaHref()}&status=previstas`, change: metricComparison(metrics.planned, before.planned) },
  ];
  const chartData = dailyChartData(state, period, days, professionalId, specialty);
  const cancelShare = metrics.total ? `${(metrics.cancelled / metrics.total * 100).toFixed(1).replace('.', ',')}%` : null;

  function openDefinitions() {
    const element = definitions.current;
    if (!element) return;
    element.open = true;
    element.querySelector('summary')?.focus();
  }

  return <div className="home-page">
    <header className="home-header">
      <div className="home-heading">
        <p className="home-date">{capitalize(formatDate(state.referenceDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</p>
        <h1>Bom dia, Marina</h1>
        <p className="home-summary">Hoje: <strong>{plural(today.length, 'consulta', 'consultas')}</strong> · <strong>{plural(pending.length, 'pendente', 'pendentes')}</strong> · {waiting ? <strong>{plural(waiting, 'conversa aguardando', 'conversas aguardando')}</strong> : 'nenhuma conversa aguardando'}</p>
      </div>
      <Button className="home-new" onClick={() => setNewAppointment(true)}><Plus size={16} /> Novo agendamento</Button>
    </header>

    <div className="home-grid home-operation">
      <section className="home-card home-upcoming" aria-labelledby="home-upcoming-title">
        <div className="home-card-header">
          <div><h2 id="home-upcoming-title">Próximas consultas</h2><p>{plural(pending.length, 'pendente', 'pendentes')} de {plural(today.length, 'consulta', 'consultas')} hoje</p></div>
          <Link className="home-link" href={agenda}>Ver agenda <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {pending.length === 0 ? <EmptyState title="Agenda em dia" description="Nenhuma consulta pendente hoje." /> :
          <ul className="home-today-list" id={listId}>{visible.map(appointment => {
            const patient = state.patients.find(p => p.id === appointment.patientId);
            const professional = state.professionals.find(p => p.id === appointment.professionalId);
            const ended = new Date(dateTime(appointment.date, appointment.start)).getTime() + appointment.duration * 60000 <= new Date(state.now).getTime();
            return <li key={appointment.id}><Link className="home-today-row" data-appointment-id={appointment.id} href={appointmentHref({ appointment: appointment.id, edit: null })} scroll={false}>
              <span className="home-time tabular"><strong>{appointment.start}</strong>–{timeFromMinutes(minutes(appointment.start) + appointment.duration)}</span>
              <span className="home-person"><strong>{patient?.name}</strong><span>{professional?.name} · {appointment.specialty}</span></span>
              <span className="home-row-status">
                <Badge tone={appointmentStatusTones[appointment.status]}>{appointment.status === 'confirmada' && <Check aria-hidden="true" />}{appointmentStatusLabels[appointment.status]}</Badge>
                {ended && <Badge tone="warning">Aguardando resultado</Badge>}
              </span>
              <ChevronRight size={16} className="home-chevron" aria-hidden="true" />
            </Link></li>;
          })}</ul>}
        <div className="home-card-footer">
          {pending.length > PREVIEW ? <Button variant="ghost" className="home-more" aria-expanded={expanded} aria-controls={listId} onClick={() => setExpanded(!expanded)}>
            <ChevronDown size={16} aria-hidden="true" />{expanded ? 'Mostrar menos' : `Ver mais ${pending.length - PREVIEW}`}
          </Button> : <span />}
          <Link href={`${agenda}&availability=1`} className="home-free"><Clock3 size={14} aria-hidden="true" /><span><strong className="tabular">{free}</strong> horários livres de 30 min hoje</span><ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="home-card home-attention" aria-labelledby="home-attention-title">
        <div className="home-card-header">
          <div><h2 id="home-attention-title">Precisa de atenção</h2><p>Fila atual e consultas de hoje</p></div>
          {attention > 0 && <span className="home-pill tabular" role="img" aria-label={`${attention} ${attention === 1 ? 'pendência' : 'pendências'}`}>{attention}</span>}
        </div>
        {openActions.length > 0 && <ul className="home-action-list">{openActions.map(action => <li key={action.label}><Link href={action.href} className="home-action">
          <span className="home-action-icon" aria-hidden="true"><action.icon size={16} /></span>
          <span className="home-action-text"><strong>{action.label}</strong><small>{action.scope}</small></span>
          <span className="home-action-count tabular">{action.count}</span>
          <ChevronRight size={16} className="home-chevron" aria-hidden="true" />
        </Link></li>)}</ul>}
        {clearActions.length > 0 && <ul className="home-clear">{(clearActions.length === actions.length ? ['Tudo em dia'] : clearActions.map(action => `${action.label} em dia`)).map(text => <li key={text}><span className="home-clear-icon" aria-hidden="true"><Check size={12} /></span>{text}</li>)}</ul>}
        <div className="home-service">
          <div className="home-service-head"><strong>Em atendimento</strong><span>{plural(inService, 'conversa', 'conversas')}</span></div>
          {inService === 0 ? <p className="home-service-empty">Nenhuma conversa em atendimento</p> : <>
            <div className="home-service-bar" role="img" aria-label={`${plural(humans, 'conversa', 'conversas')} com atendente e ${plural(bots, 'conversa', 'conversas')} com a IA`}>
              {humans > 0 && <span className="human" style={{ flexGrow: humans }} />}{bots > 0 && <span className="ai" style={{ flexGrow: bots }} />}
            </div>
          </>}
          <div className="home-service-legend">
            {inService > 0 && <span><i className="human" aria-hidden="true" /><strong className="tabular">{humans}</strong> com atendente</span>}
            {inService > 0 && <span><i className="ai" aria-hidden="true" /><strong className="tabular">{bots}</strong> com IA</span>}
            <Link href="/conversas" className="home-link">Abrir conversas <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        </div>
      </section>
    </div>

    <section className="home-performance" aria-labelledby={performanceId}>
      <div className="home-performance-header">
        <h2 id={performanceId}>Desempenho</h2>
        <label className="period-select"><span>Período</span><select aria-label="Período dos indicadores" value={days} onChange={e => onPeriod(e.target.value)}><option value="1">Hoje</option><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option></select></label>
        <p className="home-interval">{shortPeriod(period)} · comparado a {shortPeriod(previous)}</p>
        <Button variant="ghost" size="icon" className="home-info" aria-label="Como calculamos estes indicadores" onClick={openDefinitions}><Info size={16} /></Button>
      </div>

      <KpiStrip className="home-kpis" items={kpis} />

      <div className="home-grid home-analysis">
        <section className="home-card home-chart" aria-labelledby="home-chart-title">
          <div className="home-card-header">
            <div><h2 id="home-chart-title">Consultas por dia</h2><p>Pela data prevista · composição por resultado</p></div>
            <Badge>{plural(metrics.total, 'consulta', 'consultas')}</Badge>
          </div>
          <div className="home-chart-body">
            <StackedBarChart series={chartSeries} data={chartData} label={`Consultas por dia e resultado, ${formatPeriod(period)}. Dados completos na tabela abaixo.`} tableCaption={`Consultas por dia e resultado, ${formatPeriod(period)}`} />
          </div>
        </section>

        <div className="home-side">
          <section className="home-card home-insight" aria-labelledby="home-insight-title">
            <div className="home-insight-head"><span className="home-insight-icon" aria-hidden="true"><Sparkles size={14} /></span><h2 id="home-insight-title">Insight do período</h2><Badge>Simulação</Badge></div>
            <p><strong>{metrics.cancelled} de {plural(metrics.total, 'consulta', 'consultas')}</strong> {metrics.cancelled === 1 ? 'foi cancelada' : 'foram canceladas'} {period.start === period.end ? 'em' : 'entre'} <span className="home-nowrap">{shortPeriod(period)}</span>{cancelShare ? ` — ${cancelShare} do período` : ''}.</p>
            <button type="button" className="home-ai-link" onClick={() => openAssistant('Como foram os cancelamentos neste período?')}>Explorar com a IA <ArrowRight size={14} aria-hidden="true" /></button>
          </section>
          <details className="home-card metric-definitions" ref={definitions}>
            <summary><Info size={14} aria-hidden="true" />Como calculamos estes indicadores</summary>
            <p>Em aberto: agendadas e confirmadas, ainda sem resultado. Taxa de faltas: faltas ÷ (realizadas + faltas). Ocupação: duração das consultas não canceladas ÷ disponibilidade efetiva, descontando bloqueios. As taxas variam em pontos percentuais. Base anterior zero: sem base de comparação. Sem disponibilidade ou resultados: sem dados. A especialidade filtra consultas e profissionais habilitados; a disponibilidade é compartilhada entre suas especialidades. Fuso: America/Recife.</p>
          </details>
        </div>
      </div>
    </section>

    {newAppointment && <AppointmentForm onClose={() => setNewAppointment(false)} />}
    {selected && !editing && <AppointmentDetails key={selected.id} appointment={selected} onClose={() => updateAppointment({ appointment: null, edit: null })} onReschedule={() => updateAppointment({ appointment: null, edit: selected.id })} />}
    {editing && <AppointmentForm key={editing.id} appointment={editing} onClose={() => updateAppointment({ appointment: editing.id, edit: null })} />}
  </div>;
}
