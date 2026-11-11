import { addDays, dateTime, minutes, timeFromMinutes } from './date';
import type { DemoState, Metrics, Period } from './types';

export function getPeriod(referenceDate: string, days = 7): Period {
  const length = Number.isFinite(days) ? Math.min(366, Math.max(1, Math.floor(days))) : 7;
  return { start: addDays(referenceDate, 1 - length), end: referenceDate };
}

/** Effective capacity is the intersection of clinic/professional weekly hours, minus date blocks.
 * Historical snapshots keep comparisons stable after a schedule change or inactivation. */
export function getAvailability(state: DemoState, professionalId: string, date: string): { start: string; end: string }[] {
  // No snapshot means no historical capacity; never project today's new professional or
  // edited schedule backwards into periods before that record existed.
  if (date < state.referenceDate) return (state.availabilityHistory?.[date]?.[professionalId] ?? []).map((slot) => ({ ...slot }));
  const professional = state.professionals.find((person) => person.id === professionalId);
  if (!professional?.active) return [];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const clinicSlots = state.clinic.hours.filter((slot) => slot.day === day);
  let intervals: { start: number; end: number }[] = [];
  professional.availability.filter((slot) => slot.day === day).forEach((slot) => {
    clinicSlots.forEach((clinic) => {
      const start = Math.max(minutes(slot.start), minutes(clinic.start));
      const end = Math.min(minutes(slot.end), minutes(clinic.end));
      if (start < end) intervals.push({ start, end });
    });
  });
  // Merge touching/overlapping schedule windows so duplicate hours never inflate capacity.
  intervals.sort((a, b) => a.start - b.start);
  intervals = intervals.reduce<typeof intervals>((result, interval) => {
    const last = result.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else result.push({ ...interval });
    return result;
  }, []);
  state.blocks.filter((block) => block.professionalId === professionalId && block.date === date).forEach((block) => {
    const blockedStart = minutes(block.start);
    const blockedEnd = minutes(block.end);
    intervals = intervals.flatMap((slot) => {
      if (blockedEnd <= slot.start || blockedStart >= slot.end) return [slot];
      const result = [];
      if (blockedStart > slot.start) result.push({ start: slot.start, end: blockedStart });
      if (blockedEnd < slot.end) result.push({ start: blockedEnd, end: slot.end });
      return result;
    });
  });
  return intervals.map((slot) => ({ start: timeFromMinutes(slot.start), end: timeFromMinutes(slot.end) }));
}

export function getFreeSlots(state: DemoState, professionalId: string, date: string, duration = 30): string[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const bookings = state.appointments.filter((appointment) => appointment.professionalId === professionalId && appointment.date === date && appointment.status !== 'cancelada');
  const result: string[] = [];
  for (const slot of getAvailability(state, professionalId, date)) {
    for (let start = minutes(slot.start); start + duration <= minutes(slot.end); start += 30) {
      const label = timeFromMinutes(start);
      if (new Date(dateTime(date, label)).getTime() <= new Date(state.now).getTime()) continue;
      if (bookings.some((appointment) => start < minutes(appointment.start) + appointment.duration && start + duration > minutes(appointment.start))) continue;
      result.push(label);
    }
  }
  return result;
}

/** Periods use scheduled appointment dates, including cancellations.
 * Occupancy = all non-cancelled booked minutes / available minutes, after blocks.
 * Absence = explicit misses / (explicit completed + misses); unreported outcomes do not count.
 * Rates are percentages (0–100), null means no denominator, zero is an observed zero. */
export function getMetrics(state: DemoState, period: Period, professionalId?: string, specialty?: string): Metrics {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  const validPeriod = validDate(period.start) && validDate(period.end) && period.start <= period.end;
  const professionals = state.professionals.filter((professional) => (!professionalId || professional.id === professionalId) && (!specialty || professional.specialties.includes(specialty) || state.appointments.some((appointment) => appointment.professionalId === professional.id && appointment.specialty === specialty && appointment.date >= period.start && appointment.date <= period.end)));
  const professionalIds = new Set(professionals.map((professional) => professional.id));
  const appointments = state.appointments.filter((appointment) => validPeriod && appointment.date >= period.start && appointment.date <= period.end && professionalIds.has(appointment.professionalId) && (!specialty || appointment.specialty === specialty));
  let availableMinutes = 0;
  // Date validation avoids unbounded iteration from malformed query parameters.
  if (validPeriod) {
    let date = period.start;
    for (let count = 0; date <= period.end && count < 732; count++, date = addDays(date, 1)) {
      for (const professional of professionals) {
        availableMinutes += getAvailability(state, professional.id, date).reduce((sum, slot) => sum + minutes(slot.end) - minutes(slot.start), 0);
      }
    }
  }
  const completed = appointments.filter((appointment) => appointment.status === 'realizada').length;
  const missed = appointments.filter((appointment) => appointment.status === 'falta').length;
  const bookedMinutes = appointments.filter((appointment) => appointment.status !== 'cancelada').reduce((sum, appointment) => sum + appointment.duration, 0);
  const now = new Date(state.now).getTime();
  return {
    planned: appointments.filter((appointment) => appointment.status === 'agendada' || appointment.status === 'confirmada').length,
    completed,
    cancelled: appointments.filter((appointment) => appointment.status === 'cancelada').length,
    missed,
    total: appointments.length,
    pending: appointments.filter((appointment) => ['agendada', 'confirmada'].includes(appointment.status) && new Date(dateTime(appointment.date, appointment.start)).getTime() + appointment.duration * 60000 <= now).length,
    availableMinutes,
    bookedMinutes,
    occupancy: availableMinutes > 0 ? bookedMinutes / availableMinutes * 100 : null,
    absenceRate: completed + missed > 0 ? missed / (completed + missed) * 100 : null,
  };
}
