'use client';
import { CalendarDays, MessageSquareText } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { formatDate, minutes, timeFromMinutes } from '@/lib/date';
import { appointmentEnd, calendarBounds, calendarColumns, cancellationReason } from '@/lib/scheduling';
import { appointmentStatusLabels } from '@/lib/appointment-presentation';
import type { Appointment, DemoState, Professional } from '@/lib/types';

export function CalendarGrid({ state, days, appointments, professionals, byProfessional, selectedDate, onSelectDate, onSelectProfessional, onSelectAppointment }: {
  state: DemoState; days: string[]; appointments: Appointment[]; professionals: Professional[]; byProfessional: boolean; selectedDate: string;
  onSelectDate: (date: string) => void; onSelectProfessional: (id: string) => void; onSelectAppointment: (appointment: Appointment) => void;
}) {
  function card(appointment: Appointment, outside = false, style?: React.CSSProperties) {
    const patient = state.patients.find(p => p.id === appointment.patientId)?.name ?? 'Paciente';
    const professional = state.professionals.find(p => p.id === appointment.professionalId)?.name ?? 'Profissional';
    const reason = cancellationReason(appointment);
    const label = `${appointment.start}–${appointmentEnd(appointment)}, ${patient}, ${professional}, ${appointmentStatusLabels[appointment.status]}${reason ? `. Motivo: ${reason}` : ''}`;
    return <button key={appointment.id} type="button" className={`calendar-event status-${appointment.status} ${outside ? 'outside-event' : ''}`} style={style} data-appointment-id={appointment.id} data-duration={appointment.duration} data-compact={appointment.duration < 30 && !outside ? 'true' : undefined} aria-label={label} title={label} onClick={() => onSelectAppointment(appointment)}>
      {outside && <span className="outside-event-date">{formatDate(appointment.date)}</span>}
      <span className="event-meta"><span className="event-time">{appointment.start}–{appointmentEnd(appointment)}</span><span className="event-status"><i />{appointmentStatusLabels[appointment.status]}{reason && <MessageSquareText size={12} className="event-cancel-note" aria-label="Motivo do cancelamento nos detalhes" />}</span></span>
      <strong className="event-patient">{patient}</strong>
      {outside && <span className="event-professional">{professional}</span>}
    </button>;
  }
  const bounds = calendarBounds(state, days);
  if (!bounds) return <><EmptyState title="Sem expediente neste período" description="Cadastre o funcionamento da clínica em Configurações para exibir a grade de horários." />{appointments.length > 0 && <section className="outside-hours" aria-label="Consultas preservadas"><p>As consultas cadastradas continuam disponíveis abaixo, mesmo sem expediente configurado.</p><div className="outside-hours-list">{appointments.map(a => card(a, true))}</div></section>}</>;
  if (!professionals.length) return <EmptyState title="Nenhum profissional neste filtro" description="Altere a especialidade ou selecione outro profissional para consultar a agenda." />;
  const inside = appointments.filter(a => minutes(a.start) >= bounds.start && minutes(a.start) + a.duration <= bounds.end);
  const insideIds = new Set(inside.map(a => a.id));
  const outside = appointments.filter(a => !insideIds.has(a.id));
  const pixelsPerMinute = 2;
  const height = (bounds.end - bounds.start) * pixelsPerMinute;
  const columns = calendarColumns(state, days, inside, professionals, byProfessional);
  const gridColumns = `56px ${columns.map(column => `minmax(${column.width}px, 1fr)`).join(' ')}`;
  const minWidth = 56 + columns.reduce((sum, column) => sum + column.width, 0);
  const ticks: number[] = [];
  for (let time = bounds.start; time <= bounds.end; time += 30) ticks.push(time);
  if (ticks.at(-1) !== bounds.end) ticks.push(bounds.end);
  return <><div className="calendar-mode-note">{byProfessional ? 'Dia por profissional · selecione um médico no cabeçalho para ver sua semana.' : days.length > 1 ? 'Semana individual · selecione um dia para consultar horários disponíveis.' : 'Agenda individual do dia.'}</div>
    <div className="calendar-scroll" role="region" aria-label="Calendário de consultas por horário" tabIndex={0}>
      <div className="calendar-canvas" style={{ minWidth }} data-mode={byProfessional ? 'professionals' : 'dates'} data-start-minute={bounds.start} data-end-minute={bounds.end} data-pixels-per-minute={pixelsPerMinute}>
        <div className="calendar-day-headers" style={{ gridTemplateColumns: gridColumns }}>
          <div className="calendar-corner"><CalendarDays size={16} /><span>Recife</span></div>
          {columns.map(({ key, day, professional }) => professional
            ? <button type="button" key={key} className="calendar-professional-header" aria-label={`Ver semana de ${professional.name}`} onClick={() => onSelectProfessional(professional.id)}><strong>{professional.name}</strong><span>{professional.specialties.join(' · ')}{!professional.active && ' · Inativo'}</span></button>
            : <button type="button" key={key} className={`calendar-day-header ${day === state.referenceDate ? 'is-today' : ''} ${day === selectedDate ? 'is-selected' : ''}`} aria-label={`Ver disponibilidade de ${formatDate(day, { day: 'numeric', month: 'long' })}`} aria-pressed={day === selectedDate} onClick={() => onSelectDate(day)}><span>{formatDate(day, { weekday: 'long' }).split(',')[0]}</span><strong>{new Date(`${day}T12:00:00Z`).getUTCDate()}</strong>{day === state.referenceDate && <small>Hoje</small>}</button>)}
        </div>
        <div className="calendar-body" style={{ gridTemplateColumns: gridColumns }}>
          <div className="calendar-time-axis" style={{ height }}>{ticks.map((tick, index) => <span key={tick} className={index === 0 ? 'first-tick' : index === ticks.length - 1 ? 'last-tick' : ''} style={{ top: (tick - bounds.start) * pixelsPerMinute }}>{timeFromMinutes(tick)}</span>)}</div>
          {columns.map(({ key, day, events, professional }) => {
            const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
            const open = state.clinic.hours.filter(slot => slot.day === weekday).sort((a, b) => a.start.localeCompare(b.start));
            const closed: { start: number; end: number }[] = []; let cursor = bounds.start;
            for (const slot of open) { const start = minutes(slot.start); if (start > cursor) closed.push({ start: cursor, end: start }); cursor = Math.max(cursor, minutes(slot.end)); }
            if (cursor < bounds.end) closed.push({ start: cursor, end: bounds.end });
            return <div className={`calendar-day-column ${day === state.referenceDate ? 'is-today' : ''}`} key={key} data-date={day} data-professional-id={professional?.id} style={{ height }}>
              {closed.map(slot => <div className="calendar-closed" key={slot.start} style={{ top: (slot.start - bounds.start) * pixelsPerMinute, height: (slot.end - slot.start) * pixelsPerMinute }}><span>Clínica fechada</span></div>)}
              {ticks.map(tick => <div className={`calendar-line ${tick % 60 === 0 ? 'hour-line' : ''}`} key={tick} style={{ top: (tick - bounds.start) * pixelsPerMinute }} />)}
              {events.map(item => card(item.appointment, false, { top: (item.start - bounds.start) * pixelsPerMinute, height: (item.end - item.start) * pixelsPerMinute, left: `calc(${item.lane / item.lanes * 100}% + 4px)`, width: `calc(${100 / item.lanes}% - 8px)` }))}
              {!events.length && !!open.length && <span className="calendar-empty-day">Sem consultas</span>}
            </div>;
          })}
        </div>
      </div>
    </div><div className="calendar-footnote"><span>{timeFromMinutes(bounds.start)}–{timeFromMinutes(bounds.end)} · funcionamento da clínica</span><span>{byProfessional ? 'Role para explorar os médicos e os horários.' : 'Role para explorar os dias e os horários.'}</span></div>
    {outside.length > 0 && <details className="outside-hours"><summary>Consultas fora do intervalo de funcionamento atual ({outside.length})</summary><p>Registros preservados após alterações no expediente. Abra uma consulta para ver seu histórico.</p><div className="outside-hours-list">{outside.map(a => card(a, true))}</div></details>}
  </>;
}
