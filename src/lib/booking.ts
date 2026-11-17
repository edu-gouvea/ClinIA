import { addDays, minutes, monthsLong, timeFromMinutes, weekdayOf, weekdaysLong } from './date';
import { getFreeSlots } from './metrics';
import { longDayLabel } from './patient-presentation';
import type { StatusTone } from './status-presentation';
import { validateAppointment } from './services';
import type { AdminEvent, DemoState } from './types';

/** Pure helpers for the booking and appointment-details modals. Availability comes from
 * the existing `getFreeSlots` (30-min grid, effective availability, future-only, the
 * professional's bookings); the patient-overlap rule is the one `validateAppointment`
 * enforces, applied here so the list never offers a slot the save would reject. */
export type SlotQuery = { professionalId: string; duration: number; patientId?: string; date: string; excludeAppointmentId?: string };

const without = (state: DemoState, id?: string): DemoState => id ? { ...state, appointments: state.appointments.filter(a => a.id !== id) } : state;

export function availableSlots(state: DemoState, { professionalId, duration, patientId, date, excludeAppointmentId }: SlotQuery): string[] {
  if (!professionalId) return [];
  const scoped = without(state, excludeAppointmentId);
  const patientBookings = patientId ? scoped.appointments.filter(a => a.patientId === patientId && a.date === date && a.status !== 'cancelada') : [];
  return getFreeSlots(scoped, professionalId, date, duration).filter(slot => {
    const start = minutes(slot);
    return !patientBookings.some(a => start < minutes(a.start) + a.duration && start + duration > minutes(a.start));
  });
}

/** Day → number of free slots for every day of `month` (YYYY-MM). Past days count 0. */
export function availableDaysInMonth(state: DemoState, query: Omit<SlotQuery, 'date'> & { month: string }): Record<string, number> {
  const result: Record<string, number> = {};
  for (let date = `${query.month}-01`; date.startsWith(query.month); date = addDays(date, 1)) {
    result[date] = date < state.now.slice(0, 10) ? 0 : availableSlots(state, { ...query, date }).length;
  }
  return result;
}

/** First day from `from` (inclusive) with a free slot, searching `limit` days. */
export function firstAvailableDay(state: DemoState, query: Omit<SlotQuery, 'date'>, from: string, limit = 120): string | null {
  for (let date = from, i = 0; i < limit; i++, date = addDays(date, 1)) if (availableSlots(state, { ...query, date }).length) return date;
  return null;
}

/** "Terça, 10 de nov. · 10:30–11:00 · Dra. Clara Mendes · Cardiologia" (parts omitted when empty). */
export function appointmentSummaryLine({ date, start, duration, professional, specialty }: { date: string; start: string; duration: number; professional?: string; specialty?: string }): string {
  const end = timeFromMinutes(minutes(start) + duration);
  return [longDayLabel(date), `${start}–${end}`, professional, specialty].filter(Boolean).join(' · ');
}

/** "Quinta, 29 de outubro · 16:00–16:30" */
export function appointmentDayLine({ date, start, duration }: { date: string; start: string; duration: number }): string {
  return `${weekdaysLong[weekdayOf(date)]}, ${Number(date.slice(8, 10))} de ${monthsLong[Number(date.slice(5, 7)) - 1]} · ${start}–${timeFromMinutes(minutes(start) + duration)}`;
}

/** The duration options the form has always offered, plus the current value. */
export const durationOptions = (current: number) => [...new Set([15, 30, 45, 60, 90, 120, current])].sort((a, b) => a - b);

const shortStart = (value?: string) => value ? `${Number(value.slice(8, 10))}/${value.slice(5, 7)} ${value.slice(11, 16)}` : '';
/** History line for an appointment event: action text and the status family of its dot. */
export function appointmentEventLine(event: AdminEvent): { action: string; tone: StatusTone } {
  switch (event.type) {
    case 'appointment.create': return { action: 'agendou a consulta', tone: 'neutral' };
    case 'appointment.reschedule': return { action: event.previousStart && event.newStart ? `remarcou de ${shortStart(event.previousStart)} para ${shortStart(event.newStart)}` : 'remarcou a consulta', tone: 'warning' };
    case 'appointment.confirmada': return { action: 'confirmou a consulta', tone: 'info' };
    case 'appointment.realizada': return { action: 'marcou como realizada', tone: 'success' };
    case 'appointment.falta': return { action: 'registrou falta', tone: 'danger' };
    case 'appointment.cancelada': return { action: 'cancelou a consulta', tone: 'neutral' };
    default: return { action: event.description, tone: 'neutral' };
  }
}

const DRAFT = '__draft-patient__';
/** Message from the save command's own validation (`validateAppointment`) for a typed
 * start time, or '' when it would be accepted. Without a patient yet, a placeholder
 * patient stands in so only the time, availability and overlap rules apply. */
export function startTimeIssue(state: DemoState, query: SlotQuery & { specialty: string }, start: string): string {
  const scoped = query.patientId ? state : { ...state, patients: [...state.patients, { id: DRAFT, name: '', phone: '', insurance: '', notes: '' }] };
  try {
    validateAppointment(scoped, { patientId: query.patientId || DRAFT, professionalId: query.professionalId, specialty: query.specialty, date: query.date, start, duration: query.duration, status: 'agendada' }, query.excludeAppointmentId);
    return '';
  } catch (cause) { return cause instanceof Error ? cause.message : 'Horário inválido.'; }
}
