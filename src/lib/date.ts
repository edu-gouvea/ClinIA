import type { Period } from './types';

/** Default IANA zone of the demo clinic. Dates and times in the data are wall-clock
 * values of the clinic's zone; `setClinicTimeZone` (called when the clinic record loads)
 * makes every helper below use the clinic's own zone, and each takes an explicit `zone`
 * for code that works with another clinic. */
export const DEFAULT_TIMEZONE = 'America/Recife';
let activeTimeZone = DEFAULT_TIMEZONE;

export const isTimeZone = (zone: string) => { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); return true; } catch { return false; } };
export function setClinicTimeZone(zone: string): void { if (isTimeZone(zone)) activeTimeZone = zone; }
export const clinicTimeZone = () => activeTimeZone;

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();
/** UTC offset of `zone` at an instant, as "-03:00" ("+00:00" for UTC). */
function offsetAt(instant: number, zone: string): string {
  let formatter = offsetFormatters.get(zone);
  if (!formatter) { formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }); offsetFormatters.set(zone, formatter); }
  const name = formatter.formatToParts(instant).find(part => part.type === 'timeZoneName')?.value ?? 'GMT';
  return name === 'GMT' ? '+00:00' : name.slice(3);
}
const offsetMinutes = (offset: string) => (offset.startsWith('-') ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));

/** Today's calendar date (YYYY-MM-DD) in the clinic zone. */
export function todayInClinic(zone = activeTimeZone): string {
  return clinicDate(new Date().toISOString(), zone);
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function weekStart(date: string): string {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -(day === 0 ? 6 : day - 1));
}

export function formatDate(date: string, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return 'Sem data';
  const value = new Date(date.length === 10 ? dateTime(date, '12:00') : date);
  if (Number.isNaN(value.getTime())) return 'Data inválida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: activeTimeZone, day: '2-digit', month: 'short', ...options }).format(value);
}

export function formatTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: activeTimeZone, hour: '2-digit', minute: '2-digit' }).format(date);
}

export function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

/** ISO instant of a wall-clock `date` + `time` in the clinic zone, e.g.
 * "2026-11-09T10:15:00-03:00". The offset is the one in force on that date (two passes,
 * so a daylight-saving change is honoured); invalid input keeps a parseable shape. */
const instants = new Map<string, string>();
export function dateTime(date: string, time: string, zone = activeTimeZone): string {
  const key = `${zone}|${date}|${time}`;
  const cached = instants.get(key);
  if (cached) return cached;
  const asUtc = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(asUtc)) return `${date}T${time}:00${offsetAt(Date.now(), zone)}`;
  const first = offsetAt(asUtc, zone);
  const value = `${date}T${time}:00${offsetAt(asUtc - offsetMinutes(first) * 60000, zone)}`;
  // Metrics and free-slot searches call this in loops; the set of wall-clock slots is small.
  if (instants.size > 50_000) instants.clear();
  instants.set(key, value);
  return value;
}

export function formatPeriod(period: Period): string {
  if (period.start === period.end) return formatDate(period.start, { year: 'numeric' });
  return `${formatDate(period.start)} – ${formatDate(period.end, { year: 'numeric' })}`;
}

/** Calendar date (YYYY-MM-DD) of an ISO instant in the clinic timezone. */
export function clinicDate(value: string, zone = activeTimeZone): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
/** Whole calendar days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}
/** "hoje", "ontem", "há 12 dias", "há 1 mês", "há 3 meses", "há 1 ano" for a past date. */
export function relativeAgo(date: string, referenceDate: string): string {
  const days = daysBetween(date, referenceDate);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 30) return `há ${days} dias`;
  if (days < 365) { const months = Math.floor(days / 30); return `há ${months} ${months === 1 ? 'mês' : 'meses'}`; }
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? 'ano' : 'anos'}`;
}
/** "29 out." */
export const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${monthsShort[Number(date.slice(5, 7)) - 1]}`;
/** "set. 2026" */
export const monthYearShort = (date: string) => `${monthsShort[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** Single pt-BR calendar vocabulary. Index 0 is Sunday / January. */
export const monthsShort = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'] as const;
export const monthsLong = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'] as const;
/** "Dom", "Seg", … */
export const weekdaysShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const;
/** "Domingo", "Segunda", … */
export const weekdaysLong = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;
/** "Domingo", "Segunda-feira", … */
export const weekdaysFull = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'] as const;
/** Monday first, Sunday last: the order of weekly schedules. */
export const weekOrder = [1, 2, 3, 4, 5, 6, 0] as const;
/** Day of the week (0 = Sunday) of a calendar date (YYYY-MM-DD). */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
/** "nov." for a calendar date. */
export const monthShortOf = (date: string) => monthsShort[Number(date.slice(5, 7)) - 1];
/** A real calendar date in YYYY-MM-DD (rejects 2026-02-30). */
export function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
/** A 24-hour time in HH:MM. */
export const isValidTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
/** Short interval, e.g. "04–10 nov.", "28 out.–03 nov." or "09 nov.". */
export function shortPeriod(period: Period): string {
  const day = (date: string) => date.slice(8, 10);
  if (period.start === period.end) return `${day(period.start)} ${monthShortOf(period.start)}`;
  if (period.start.slice(0, 7) === period.end.slice(0, 7)) return `${day(period.start)}–${day(period.end)} ${monthShortOf(period.end)}`;
  return `${day(period.start)} ${monthShortOf(period.start)}–${day(period.end)} ${monthShortOf(period.end)}`;
}
