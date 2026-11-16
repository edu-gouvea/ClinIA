'use client';
import { MessageSquare, Repeat } from 'lucide-react';
import { Badge } from '@/components/ui';
import { appointmentEnd, cancellationReason } from '@/lib/scheduling';
import { formatDayTitle } from '@/lib/agenda-presentation';
import { appointmentStatusLabels, appointmentStatusTones } from '@/lib/status-presentation';
import type { Appointment, DemoState } from '@/lib/types';

/** One day of the list: used by the link-only list mode (`from`/`to`) and, stacked
 * in cards, by the week view below 768 px (with that day's free slots at the end). */
export function AgendaDayTable({ state, date, appointments, rescheduleIds, onOpen, freeSlots, onSlot, closed = false }: {
  state: DemoState; date: string; appointments: Appointment[]; rescheduleIds: Set<string>; onOpen: (appointment: Appointment) => void;
  freeSlots?: string[]; onSlot?: (start: string) => void; closed?: boolean;
}) {
  const title = formatDayTitle(date);
  return <section className="agenda-day-group" aria-label={title} data-date={date}>
    <h3>{title} · <span className="tabular">{appointments.length}</span>{closed && <span className="closed-pill">Fechada</span>}</h3>
    {appointments.length > 0 ? <table className="data-table agenda-list-table">
      <thead><tr><th scope="col">Horário</th><th scope="col">Paciente</th><th scope="col">Profissional</th><th scope="col">Especialidade</th><th scope="col">Situação</th><th scope="col"><span className="sr-only">Ações</span></th></tr></thead>
      <tbody>{appointments.map(a => {
        const patient = state.patients.find(p => p.id === a.patientId)?.name ?? 'Paciente';
        const reason = cancellationReason(a);
        return <tr key={a.id} className={`schedule-list-event${a.status === 'cancelada' ? ' is-cancelled' : ''}`} data-appointment-id={a.id} data-status={a.status} onClick={() => onOpen(a)}>
          <td className="tabular" data-label="Horário">{a.start}–{appointmentEnd(a)}</td>
          <td data-label="Paciente"><strong>{patient}</strong>{reason && <span className="event-cancel-note" title="Motivo do cancelamento registrado"><MessageSquare size={13} aria-hidden="true" /><span className="sr-only">Com motivo</span></span>}{rescheduleIds.has(a.id) && <span className="event-flag"><Repeat size={11} aria-hidden="true" />Remarcar</span>}</td>
          <td data-label="Profissional">{state.professionals.find(p => p.id === a.professionalId)?.name}</td>
          <td data-label="Especialidade">{a.specialty}</td>
          <td data-label="Situação"><Badge tone={appointmentStatusTones[a.status]}>{appointmentStatusLabels[a.status]}</Badge></td>
          <td className="list-action"><button type="button" className="btn btn-ghost" onClick={event => { event.stopPropagation(); onOpen(a); }}>Ver detalhes<span className="sr-only"> de {patient}, {a.start}</span></button></td>
        </tr>;
      })}</tbody>
    </table> : <p className="agenda-day-empty">{closed ? 'Clínica fechada neste dia.' : 'Sem consultas neste dia.'}</p>}
    {freeSlots && freeSlots.length > 0 && onSlot && <div className="agenda-day-free" role="group" aria-label={`Horários livres de ${title}`}>{freeSlots.map(start => <button key={start} type="button" className="calendar-free-chip tabular" aria-label={`${title}: agendar às ${start}`} onClick={() => onSlot(start)}>+ {start}</button>)}</div>}
  </section>;
}
