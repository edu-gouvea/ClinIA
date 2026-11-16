import { addDays, dateTime, daysBetween } from './date';
import { getMetrics } from './metrics';
import { professionalMetrics, type ManagementSort } from './management-presentation';
import type { Appointment, DemoState, Metrics, Period, Professional } from './types';

/** Pure helpers for the Visão gerencial. Every count reuses `getMetrics` (same scope,
 * same definitions) so KPIs, chart, outcome table and professional table agree. */
export type Filters = { professionalId?: string; specialty?: string };

/** Same length, immediately before `range`. */
export function previousRange(range: Period): Period {
  const days = daysBetween(range.start, range.end) + 1;
  return { start: addDays(range.start, -days), end: addDays(range.end, -days) };
}

const eachDay = (range: Period) => Array.from({ length: Math.max(0, daysBetween(range.start, range.end) + 1) }, (_, i) => addDays(range.start, i));

export type DailyOutcome = { date: string; completed: number; missed: number; cancelled: number; planned: number; total: number };
/** Per-day composition by outcome (the aggregation behind the Início chart). */
export function dailyBreakdown(state: DemoState, filters: Filters, range: Period): DailyOutcome[] {
  return eachDay(range).map(date => {
    const day = getMetrics(state, { start: date, end: date }, filters.professionalId, filters.specialty);
    return { date, completed: day.completed, missed: day.missed, cancelled: day.cancelled, planned: day.planned, total: day.completed + day.missed + day.cancelled + day.planned };
  });
}

/** Totals of the previous period aligned by position: the 1st current day pairs with
 * the 1st previous day (also across months), with the previous date for tooltips. */
export function previousDailyTotals(state: DemoState, filters: Filters, range: Period): { date: string; total: number }[] {
  return dailyBreakdown(state, filters, previousRange(range)).map(({ date, total }) => ({ date, total }));
}

/** Professionals in scope, mirroring `getMetrics` (historical specialty included). */
function scopedProfessionals(state: DemoState, range: Period, { professionalId, specialty }: Filters): Set<string> {
  return new Set(state.professionals.filter(p => (!professionalId || p.id === professionalId)
    && (!specialty || p.specialties.includes(specialty) || state.appointments.some(a => a.professionalId === p.id && a.specialty === specialty && a.date >= range.start && a.date <= range.end))).map(p => p.id));
}

/** Open appointments (`agendada`/`confirmada`) in the range whose end already passed
 * `state.now` — the list behind `getMetrics(...).pending`. */
export function pendingResults(state: DemoState, filters: Filters, range: Period): Appointment[] {
  const ids = scopedProfessionals(state, range, filters);
  const now = Date.parse(state.now);
  return state.appointments.filter(a => a.date >= range.start && a.date <= range.end && ids.has(a.professionalId) && (!filters.specialty || a.specialty === filters.specialty)
    && (a.status === 'agendada' || a.status === 'confirmada') && Date.parse(dateTime(a.date, a.start)) + a.duration * 60000 <= now)
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`) || a.id.localeCompare(b.id));
}

export type ActivityRow = {
  professional: Professional;
  realizadas: number; realizadasAnterior: number;
  ocupacao: number | null; horasOcupadas: number; horasDisponiveis: number;
  faltas: number; taxaFaltas: number | null; canceladas: number; emAberto: number;
};
const values = (metrics: Metrics, previous: Metrics): Omit<ActivityRow, 'professional'> => ({
  realizadas: metrics.completed, realizadasAnterior: previous.completed,
  ocupacao: metrics.occupancy, horasOcupadas: metrics.bookedMinutes / 60, horasDisponiveis: metrics.availableMinutes / 60,
  faltas: metrics.missed, taxaFaltas: metrics.absenceRate, canceladas: metrics.cancelled, emAberto: metrics.planned,
});

/** Sort keys that stopped being columns map onto the column that now shows the data:
 * Disponibilidade → Ocupação, Taxa de faltas → Faltas; `planned` is the "Em aberto" column. */
export const legacySortKeys: Partial<Record<ManagementSort, ManagementSort>> = { availableMinutes: 'occupancy', absenceRate: 'missed' };
export const resolveSort = (key: ManagementSort): ManagementSort => legacySortKeys[key] ?? key;

/** Professional table: the existing per-professional metrics plus the previous period's
 * completed count; the total uses aggregated denominators (one `getMetrics` of the scope). */
export function professionalActivity(state: DemoState, filters: Filters, range: Period, previous: Period, sort: ManagementSort = 'completed', order: 'asc' | 'desc' = 'desc'): { rows: ActivityRow[]; total: Omit<ActivityRow, 'professional'> } {
  const rows = professionalMetrics(state, range, filters.professionalId ?? '', filters.specialty ?? '', resolveSort(sort), order)
    .map(({ professional, metrics }) => ({ professional, ...values(metrics, getMetrics(state, previous, professional.id, filters.specialty)) }));
  const total = values(getMetrics(state, range, filters.professionalId, filters.specialty), getMetrics(state, previous, filters.professionalId, filters.specialty));
  return { rows, total };
}

export type Outcomes = { realizadas: number; faltas: number; canceladas: number; emAberto: number; total: number };
const outcomes = (m: Metrics): Outcomes => ({ realizadas: m.completed, faltas: m.missed, canceladas: m.cancelled, emAberto: m.planned, total: m.total });
/** Current and previous outcome counts plus the open appointments already past their end. */
export function outcomeBreakdown(state: DemoState, filters: Filters, range: Period, previous: Period): { current: Outcomes; previous: Outcomes; emAbertoEncerradas: number } {
  return {
    current: outcomes(getMetrics(state, range, filters.professionalId, filters.specialty)),
    previous: outcomes(getMetrics(state, previous, filters.professionalId, filters.specialty)),
    emAbertoEncerradas: pendingResults(state, filters, range).length,
  };
}
