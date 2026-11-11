'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CalendarDays, CalendarOff, ChevronLeft, ChevronRight, Clock3, Filter, MessageSquareText, Plus } from 'lucide-react';
import { useDemo } from '@/components/demo-provider';
import { Button, EmptyState, PageHeading } from '@/components/ui';
import { DateInput, parseDateInput } from '@/components/date-time-fields';
import { addDays, dateTime, formatDate, formatPeriod, weekStart } from '@/lib/date';
import { getAvailability, getFreeSlots } from '@/lib/metrics';
import { agendaProfessionals, agendaView, appointmentEnd, cancellationReason, isOpenAppointment } from '@/lib/scheduling';
import { appointmentStatusLabels } from '@/lib/appointment-presentation';
import { AppointmentForm } from './agenda/appointment-form';
import { AppointmentDetails } from './agenda/appointment-details';
import { CalendarGrid } from './agenda/calendar-grid';
export { AppointmentForm } from './agenda/appointment-form';
export { appointmentStatusLabels, appointmentStatusTones } from '@/lib/appointment-presentation';

export function Agenda() {
  const { state } = useDemo(); const params = useSearchParams(); const router = useRouter();
  const date = parseDateInput(params.get('date') || '') || state.referenceDate;
  const professionalId = params.get('professional') ?? ''; const patientId = params.get('patient') ?? '';
  const specialty = params.get('specialty') ?? ''; const status = params.get('status') ?? (params.get('planned') === '1' ? 'previstas' : '');
  const view = agendaView(professionalId);
  const from = parseDateInput(params.get('from') || ''); const to = parseDateInput(params.get('to') || '');
  const hasRange = !!from || !!to;
  const periodStart = from ?? (view === 'week' ? weekStart(date) : date);
  const periodEnd = to ?? (view === 'week' ? addDays(weekStart(date), 6) : date);
  const context = params.get('context');
  const editRequested = state.appointments.find(a => a.id === params.get('edit'));
  const editing = editRequested && isOpenAppointment(editRequested) ? editRequested : undefined;
  const detail = state.appointments.find(a => a.id === params.get('appointment'));
  const [expandedSlots, setExpandedSlots] = useState<string[]>([]);
  const appointments = state.appointments.filter(a => a.date >= periodStart && a.date <= periodEnd && (!professionalId || a.professionalId === professionalId) && (!patientId || a.patientId === patientId) && (!specialty || a.specialty === specialty)
    && (!status || (status === 'previstas' ? isOpenAppointment(a) : status === 'pendente' ? isOpenAppointment(a) && new Date(dateTime(a.date, a.start)).getTime() + a.duration * 60000 <= new Date(state.now).getTime() : a.status === status)))
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i)) : [date];
  const calendarProfessionals = agendaProfessionals(state, appointments, professionalId, specialty);
  const shownProfessionals = state.professionals.filter(p => p.active && (!professionalId || p.id === professionalId) && (!specialty || p.specialties.includes(specialty)));
  const blocksStart = professionalId ? weekStart(date) : date;
  const blocksEnd = professionalId ? addDays(blocksStart, 6) : date;
  const blocks = state.blocks.filter(b => b.date >= blocksStart && b.date <= blocksEnd
    && (professionalId ? b.professionalId === professionalId : !specialty || state.professionals.find(p => p.id === b.professionalId)?.specialties.includes(specialty)))
    .sort((a, b) => `${a.date}${a.start}${a.id}`.localeCompare(`${b.date}${b.start}${b.id}`));
  function update(changes: Record<string, string | null>) {
    const query = new URLSearchParams(params.toString());
    query.delete('view');
    Object.entries(changes).forEach(([key, value]) => value ? query.set(key, value) : query.delete(key));
    router.push(`/gestao/agenda?${query}`, { scroll: false });
  }
  function closeForm() { update({ new: null, edit: null, start: null }); }
  return <div data-density="compact" className="page-stack agenda-page">
    <PageHeading eyebrow="GESTÃO DA CLÍNICA" title="Agenda" description="Uma visão clara de cada horário, em cada dia." actions={<Button onClick={() => update({ new: '1', edit: null, appointment: null })}><Plus size={17} />Novo agendamento</Button>} />
    {context && <Link className="text-link" href={`/conversas?id=${encodeURIComponent(context)}`}><ArrowLeft size={16} />Voltar à conversa</Link>}
    {params.has('edit') && !editing && <div className="notice">{editRequested ? 'Consultas finalizadas ou canceladas mantêm seu histórico e não podem ser remarcadas.' : 'Consulta não encontrada.'}<Button variant="ghost" onClick={() => update({ edit: null, appointment: editRequested?.id ?? null })}>Ver agenda</Button></div>}
    <div className="schedule-toolbar">
      <div className="schedule-period"><span className="schedule-month">{formatDate(date, { month: 'long', year: 'numeric', day: undefined })}</span><h2>{hasRange ? formatPeriod({ start: periodStart, end: periodEnd }) : view === 'week' ? `${formatDate(days[0], { day: '2-digit', month: 'short' })} — ${formatDate(days[6], { day: '2-digit', month: 'short' })}` : formatDate(date, { weekday: 'long', day: 'numeric' })}</h2></div>
      <div className="schedule-navigation"><Button variant="ghost" aria-label="Período anterior" onClick={() => update({ date: addDays(date, view === 'week' ? -7 : -1), from: null, to: null })}><ChevronLeft size={18} /></Button><Button variant="ghost" aria-label="Próximo período" onClick={() => update({ date: addDays(date, view === 'week' ? 7 : 1), from: null, to: null })}><ChevronRight size={18} /></Button><Button variant="secondary" onClick={() => update({ date: state.referenceDate, from: null, to: null })}>Hoje</Button></div>
      <div className="schedule-controls"><DateInput label="Data da agenda" required value={date} onChange={value => update({ date: value, from: null, to: null })} /></div>
    </div>
    <div className="schedule-filters"><span className="schedule-filter-label"><Filter size={15} />Filtrar</span>
      <select aria-label="Filtrar profissional" value={professionalId} onChange={e => update({ professional: e.target.value })}><option value="">Todos os profissionais</option>{state.professionals.map(p => <option key={p.id} value={p.id}>{p.name}{!p.active ? ' · inativo' : ''}</option>)}</select>
      <select aria-label="Filtrar situação" value={status} onChange={e => update({ status: e.target.value, planned: null })}><option value="">Todas as situações</option>{Object.entries(appointmentStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}<option value="previstas">Previstas</option><option value="pendente">Sem resultado registrado</option></select>
      <select aria-label="Filtrar paciente" value={patientId} onChange={e => update({ patient: e.target.value })}><option value="">Todos os pacientes</option>{state.patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="Filtrar especialidade da agenda" value={specialty} onChange={e => update({ specialty: e.target.value })}><option value="">Todas as especialidades</option>{state.clinic.specialties.map(item => <option key={item}>{item}</option>)}</select>
      {(professionalId || status || patientId || specialty || hasRange) && <Button variant="ghost" onClick={() => update({ professional: null, status: null, planned: null, patient: null, specialty: null, from: null, to: null })}>Limpar</Button>}
    </div>
    <div className="schedule-layout"><section className="schedule-calendar card">
      <div className="schedule-caption"><span><span className="live-dot" />{professionalId ? state.professionals.find(p => p.id === professionalId)?.name : 'Dia por profissional'}</span><span>{appointments.length} consultas · America/Recife</span></div>
      {!hasRange ? <CalendarGrid state={state} days={days} professionals={calendarProfessionals} byProfessional={!professionalId} onSelectProfessional={id => update({ professional: id, from: null, to: null })} selectedDate={date} appointments={appointments} onSelectDate={value => update({ date: value })} onSelectAppointment={appointment => update({ appointment: appointment.id })} /> : appointments.length ? <div className="schedule-range-list">{appointments.map(a => <button key={a.id} className={`schedule-list-event status-${a.status}`} data-appointment-id={a.id} onClick={() => update({ appointment: a.id })}><span className="range-date">{formatDate(a.date)}<strong>{a.start}–{appointmentEnd(a)}</strong></span><span><strong>{state.patients.find(p => p.id === a.patientId)?.name}</strong><small>{state.professionals.find(p => p.id === a.professionalId)?.name}</small>{cancellationReason(a) && <span className="range-cancel-note" title={a.cancelReason}><MessageSquareText size={13} />Motivo nos detalhes</span>}</span><span className="event-status"><i />{appointmentStatusLabels[a.status]}</span><ArrowUpRight size={15} /></button>)}</div> : <EmptyState title="Nenhuma consulta neste recorte" description="Altere o período ou os filtros para consultar a agenda." />}
    </section><aside className="schedule-sidebar">
      <section className="card availability-panel"><div className="panel-title"><span className="icon-tile"><Clock3 size={18} /></span><div><h2>Disponibilidade</h2><p>{formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })} · horários de 30 min</p></div></div><div className="panel-professionals">{shownProfessionals.map((p, index) => {
        const slots = getFreeSlots(state, p.id, date); const availability = getAvailability(state, p.id, date); const expanded = expandedSlots.includes(p.id);
        return <details className="panel-professional" key={`${p.id}-${professionalId ? 'selected' : 'all'}`} open={!!professionalId || index === 0}><summary><span><strong>{p.name}</strong><small>{p.specialties.join(' · ')}</small></span><ChevronRight size={14} /></summary><p>{availability.length ? availability.map(slot => `${slot.start}–${slot.end}`).join(' · ') : 'Sem expediente neste dia'}</p><div className="availability-grid">{(expanded ? slots : slots.slice(0, 4)).map(slot => <button type="button" key={slot} className="availability-chip" aria-label={`Agendar com ${p.name} às ${slot}`} onClick={() => update({ new: '1', professional: p.id, start: slot, appointment: null })}>{slot}</button>)}</div>{slots.length > 4 && <button className="show-slots" onClick={() => setExpandedSlots(ids => expanded ? ids.filter(id => id !== p.id) : [...ids, p.id])}>{expanded ? 'Mostrar menos' : `Ver mais ${slots.length - 4} horários`}</button>}{availability.length > 0 && !slots.length && <p className="panel-empty">Sem horários livres futuros.</p>}</details>;
      })}{!shownProfessionals.length && <p className="panel-empty">Nenhum profissional ativo neste filtro.</p>}</div><Link className="panel-link" href={`/gestao/configuracoes?tab=availability${professionalId ? `&professional=${professionalId}` : ''}`}>Gerenciar disponibilidade<ArrowUpRight size={15} /></Link></section>
      <section className="card blocks-panel"><div className="panel-title"><span className="icon-tile"><CalendarOff size={18} /></span><div><h2>{professionalId ? 'Bloqueios da semana' : 'Bloqueios do dia'}</h2><p>{professionalId ? formatPeriod({ start: blocksStart, end: blocksEnd }) : formatDate(date, { day: 'numeric', month: 'long' })}</p></div></div>{blocks.length ? <div className="panel-blocks">{blocks.map(block => <Link className="panel-block" data-block-id={block.id} key={block.id} href={`/gestao/configuracoes?tab=availability&professional=${block.professionalId}&block=${block.id}`}><strong>{block.start}–{block.end}<ArrowUpRight size={13} /></strong><p>{block.reason}</p><small>{professionalId ? formatDate(block.date, { weekday: 'short', day: 'numeric', month: 'short' }) : state.professionals.find(p => p.id === block.professionalId)?.name}</small></Link>)}</div> : <div className="panel-no-blocks"><span><CalendarDays size={23} /></span><p>{professionalId ? 'Nenhum bloqueio nesta semana.' : 'Nenhum bloqueio neste dia.'}</p><small>O expediente segue os horários da clínica.</small></div>}<Link className="panel-link" href={`/gestao/configuracoes?tab=availability${professionalId ? `&professional=${professionalId}` : ''}`}>Gerenciar bloqueios<ArrowUpRight size={15} /></Link></section>
    </aside></div>
    {(params.get('new') === '1' || editing) && <AppointmentForm key={editing?.id ?? `${date}-${professionalId}-${params.get('start')}`} appointment={editing} patientId={patientId} professionalId={professionalId} initialDate={date} initialStart={params.get('start') ?? undefined} onClose={closeForm} />}
    {detail && !editing && params.get('new') !== '1' && <AppointmentDetails key={detail.id} appointment={detail} onClose={() => update({ appointment: null })} onReschedule={() => update({ appointment: null, edit: detail.id })} />}
  </div>;
}
