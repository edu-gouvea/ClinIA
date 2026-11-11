import { minutes } from './date';
import type { Appointment, Block, DemoState, Professional } from './types';

export const isOpenAppointment = (appointment: Appointment) => ['agendada', 'confirmada'].includes(appointment.status);
/** Early outcomes are allowed on today's reference date, never on a later day.
 * Earlier unresolved appointments remain recordable, preserving the existing pending-outcome workflow. */
export const canRecordOutcome = (appointment: Appointment, referenceDate: string) => isOpenAppointment(appointment) && appointment.date <= referenceDate;
export function getBlockConflicts(state: DemoState, block: Omit<Block, 'id'>): Appointment[] {
  return state.appointments.filter(a => a.professionalId === block.professionalId && a.date === block.date && a.status !== 'cancelada'
    && minutes(block.start) < minutes(a.start) + a.duration && minutes(block.end) > minutes(a.start))
    .sort((a, b) => a.start.localeCompare(b.start));
}
export function appointmentEnd(appointment: Pick<Appointment, 'start' | 'duration'>): string {
  const end = minutes(appointment.start) + appointment.duration;
  return `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
}
export function cancellationReason(appointment: Appointment): string | undefined {
  return appointment.status === 'cancelada' && appointment.cancelReason && appointment.cancelReason !== 'Motivo não informado.' ? appointment.cancelReason : undefined;
}

export type PositionedAppointment = { appointment: Appointment; lane: number; lanes: number; start: number; end: number };
/** Interval partitioning. Touching boundaries share a lane; every connected overlap
 * group uses its peak simultaneous lane count. Position depends solely on time. */
export function layoutAppointments(appointments: Appointment[]): PositionedAppointment[] {
  const sorted = [...appointments].sort((a, b) => minutes(a.start) - minutes(b.start) || b.duration - a.duration || a.id.localeCompare(b.id));
  const result: PositionedAppointment[] = [];
  let group: PositionedAppointment[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => { for (const item of group) result.push({ ...item, lanes: laneEnds.length }); group = []; laneEnds = []; groupEnd = -1; };
  for (const appointment of sorted) {
    const start = minutes(appointment.start); const end = start + appointment.duration;
    if (group.length && start >= groupEnd) flush();
    let lane = laneEnds.findIndex(value => value <= start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = end;
    group.push({ appointment, lane, lanes: 1, start, end });
    groupEnd = Math.max(groupEnd, end);
  }
  flush();
  return result;
}
export function calendarBounds(state: DemoState, days: string[]): { start: number; end: number } | null {
  const weekdays = new Set(days.map(day => new Date(`${day}T12:00:00Z`).getUTCDay()));
  const hours = state.clinic.hours.filter(slot => weekdays.has(slot.day));
  if (!hours.length) return null;
  return { start: Math.min(...hours.map(slot => minutes(slot.start))), end: Math.max(...hours.map(slot => minutes(slot.end))) };
}

export function agendaView(professionalId: string): 'day' | 'week' {
  return professionalId ? 'week' : 'day';
}

/** Keep preserved records visible after inactivation or specialty changes. */
export function agendaProfessionals(state: DemoState, appointments: Appointment[], professionalId: string, specialty: string): Professional[] {
  const recorded = new Set(appointments.map(a => a.professionalId));
  return state.professionals.filter(p => (!professionalId || p.id === professionalId)
    && (p.active || recorded.has(p.id) || p.id === professionalId)
    && (!specialty || p.specialties.includes(specialty) || recorded.has(p.id)));
}

export type CalendarColumn = { key: string; day: string; professional?: Professional; events: PositionedAppointment[]; width: number };
export function calendarColumns(state: DemoState, days: string[], appointments: Appointment[], professionals: Professional[], byProfessional: boolean): CalendarColumn[] {
  const definitions = byProfessional
    ? professionals.map(professional => ({ key: professional.id, day: days[0], professional }))
    : days.map(day => ({ key: day, day, professional: undefined }));
  const names = new Map(state.patients.map(p => [p.id, p.name]));
  return definitions.map(column => {
    const events = layoutAppointments(appointments.filter(a => a.date === column.day && (!column.professional || a.professionalId === column.professional.id)));
    const lanes = Math.max(1, ...events.map(event => event.lanes));
    // Grow horizontally for readable names; never change the time scale.
    const nameWidth = Math.max(0, ...events.map(({ appointment }) => Math.ceil((names.get(appointment.patientId)?.length ?? 0) * 7.5 / (appointment.duration < 30 ? 1 : 2)) + 24));
    return { ...column, events, width: Math.max(byProfessional ? 236 : 208, nameWidth) * lanes };
  });
}
