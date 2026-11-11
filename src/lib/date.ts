import type { Period } from './types';

export const CLINIC_TIMEZONE = 'America/Recife';

export function todayInRecife(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
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
  const value = new Date(date.length === 10 ? `${date}T12:00:00-03:00` : date);
  if (Number.isNaN(value.getTime())) return 'Data inválida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TIMEZONE, day: '2-digit', month: 'short', ...options }).format(value);
}

export function formatTime(value: string): string {
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: CLINIC_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(date);
}

export function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function dateTime(date: string, time: string): string {
  return `${date}T${time}:00-03:00`;
}

export function formatPeriod(period: Period): string {
  if (period.start === period.end) return formatDate(period.start, { year: 'numeric' });
  return `${formatDate(period.start)} – ${formatDate(period.end, { year: 'numeric' })}`;
}
