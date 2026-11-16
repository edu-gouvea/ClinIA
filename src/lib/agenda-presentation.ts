import { dateTime, formatDate, minutes } from './date';
import { isReschedule } from './conversation-inbox';
import { rescheduleTarget } from './conversation-assistant';
import { isOpenAppointment } from './scheduling';
import type { Appointment, AppointmentStatus, DemoState } from './types';

/** Pure presentation helpers for the Agenda screen. No clock other than `state.now`. */

export type AgendaView = 'dia' | 'semana';
/** `view=dia|semana` wins; otherwise the historical rule applies (a selected
 * professional opens their week). A week always needs a professional, so an
 * unknown value (including the legacy `day`/`week`) or `semana` without one falls back. */
export function resolveAgendaView(params: { get(name: string): string | null }): AgendaView {
  const professional = params.get('professional') ?? '';
  const view = params.get('view');
  if (view === 'dia') return 'dia';
  if (view === 'semana') return professional ? 'semana' : 'dia';
  return professional ? 'semana' : 'dia';
}

export const legacyStatusLabels: Record<string, string> = { previstas: 'Previstas', pendente: 'Sem resultado registrado' };
export const isLegacyStatus = (status: string) => status in legacyStatusLabels;
/** Same rule the Agenda always used for `status`, including the legacy `previstas`/`pendente`. */
export function matchesAgendaStatus(appointment: Appointment, status: string, now: string): boolean {
  if (!status) return true;
  if (status === 'previstas') return isOpenAppointment(appointment);
  if (status === 'pendente') return isOpenAppointment(appointment) && new Date(dateTime(appointment.date, appointment.start)).getTime() + appointment.duration * 60000 <= new Date(now).getTime();
  return appointment.status === status;
}

export const statusChipOrder: AppointmentStatus[] = ['agendada', 'confirmada', 'realizada', 'falta', 'cancelada'];
/** Plural chip labels; tone and singular labels stay in `status-presentation`. */
export const statusChipLabels: Record<AppointmentStatus, string> = { agendada: 'A confirmar', confirmada: 'Confirmadas', realizada: 'Realizadas', falta: 'Faltas', cancelada: 'Canceladas' };
export type StatusCounts = Record<AppointmentStatus | 'todas', number>;
export function countByStatus(appointments: Appointment[]): StatusCounts {
  const counts: StatusCounts = { todas: appointments.length, agendada: 0, confirmada: 0, realizada: 0, falta: 0, cancelada: 0 };
  for (const appointment of appointments) counts[appointment.status] += 1;
  return counts;
}

const sentenceCase = (text: string) => text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1).toLocaleLowerCase('pt-BR');
const year = (date: string) => date.slice(0, 4);
const dayNumber = (date: string) => Number(date.slice(8, 10));
/** "Terça-feira, 10 de novembro" — only the first letter capitalised. */
export const formatDayTitle = (date: string) => sentenceCase(formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' }));
/** "Novembro 2026" for the mini calendar heading. */
export const formatMonthTitle = (date: string) => `${sentenceCase(formatDate(date, { month: 'long', day: undefined }))} ${year(date)}`;
/** "9 – 13 de novembro" or, across months, "30 de nov. – 4 de dez.". */
export function formatWeekTitle(start: string, end: string): { title: string; year: string } {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);
  const title = sameMonth
    ? `${dayNumber(start)} – ${dayNumber(end)} de ${formatDate(end, { month: 'long', day: undefined })}`
    : `${formatDate(start, { day: 'numeric', month: 'short' })} – ${formatDate(end, { day: 'numeric', month: 'short' })}`;
  return { title, year: year(start) === year(end) ? year(start) : `${year(start)}–${year(end)}` };
}

const rangeSubjects: Record<string, string> = {
  cancelada: 'Cancelamentos', agendada: 'Consultas a confirmar', confirmada: 'Consultas confirmadas', realizada: 'Consultas realizadas',
  falta: 'Faltas', previstas: 'Consultas previstas', pendente: 'Consultas sem resultado registrado',
};
/** "1 a 15 de nov.", "30 de nov. a 4 de dez.", with years only when they differ. */
export function formatRangeSpan(from: string, to: string): string {
  if (from === to) return formatDate(from, { day: 'numeric', month: 'short' });
  if (year(from) !== year(to)) return `${formatDate(from, { day: 'numeric', month: 'short', year: 'numeric' })} a ${formatDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (from.slice(0, 7) === to.slice(0, 7)) return `${dayNumber(from)} a ${formatDate(to, { day: 'numeric', month: 'short' })}`;
  return `${formatDate(from, { day: 'numeric', month: 'short' })} a ${formatDate(to, { day: 'numeric', month: 'short' })}`;
}
/** Title of the link-only list mode, derived from `from`/`to`/`status`. */
export function rangeTitle(from: string, to: string, status = ''): string {
  return `${rangeSubjects[status] ?? 'Consultas'} · ${formatRangeSpan(from, to)}`;
}

type Rgb = [number, number, number];
const hex = (value: string): Rgb | null => {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split('').map(c => c + c).join('') : match[1];
  return [0, 2, 4].map(i => parseInt(digits.slice(i, i + 2), 16)) as Rgb;
};
const toHex = (rgb: Rgb) => `#${rgb.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
/** `weight` of `a` mixed into `b` (like CSS `color-mix(in srgb, a weight, b)`). */
const mix = (a: Rgb, b: Rgb, weight: number): Rgb => [0, 1, 2].map(i => a[i] * weight + b[i] * (1 - weight)) as Rgb;
const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrastRatio(a: string, b: string): number {
  const x = hex(a); const y = hex(b);
  if (!x || !y) return 1;
  const [light, dark] = [luminance(x), luminance(y)].sort((m, n) => n - m);
  return (light + 0.05) / (dark + 0.05);
}
/** Theme surfaces the avatar sits on (`--surface` in tokens.css). */
export const avatarSurfaces = { light: '#ffffff', dark: '#1a1a1e' } as const;
/** Avatar tint: the professional colour ~14% over the surface, with initials in a
 * darker (light theme) or lighter (dark theme) tone of the same hue, pushed until the
 * pair reaches 4.5:1. Invalid colours fall back to a neutral grey. */
export function professionalAvatarColors(color: string, theme: keyof typeof avatarSurfaces): { background: string; ink: string } {
  const base = hex(color) ?? hex('#71717a')!;
  const surface = hex(avatarSurfaces[theme])!;
  const background = mix(base, surface, 0.14);
  const target: Rgb = theme === 'light' ? [0, 0, 0] : [255, 255, 255];
  let ink = mix(target, base, theme === 'light' ? 0.35 : 0.45);
  for (let weight = 0.35; contrastRatio(toHex(ink), toHex(background)) < 4.6 && weight < 1; weight += 0.05) ink = mix(target, base, weight);
  if (contrastRatio(toHex(ink), toHex(background)) < 4.5) ink = target;
  return { background: toHex(background), ink: toHex(ink) };
}

export type OffHoursBand = { start: number; end: number; label: 'Intervalo' | 'Fora do expediente' | 'Clínica fechada' };
/** Hatched bands = the grid range minus the open windows. Gaps between two windows are
 * "Intervalo", the edges "Fora do expediente"; a closed clinic day is one band. */
export function offHoursBands(bounds: { start: number; end: number }, windows: { start: string; end: string }[], clinicOpen: boolean): OffHoursBand[] {
  if (!clinicOpen) return [{ start: bounds.start, end: bounds.end, label: 'Clínica fechada' }];
  const open = windows.map(w => ({ start: Math.max(bounds.start, minutes(w.start)), end: Math.min(bounds.end, minutes(w.end)) }))
    .filter(w => w.start < w.end).sort((a, b) => a.start - b.start);
  if (!open.length) return [{ start: bounds.start, end: bounds.end, label: 'Fora do expediente' }];
  const bands: OffHoursBand[] = [];
  let cursor = bounds.start;
  open.forEach((window, index) => {
    if (window.start > cursor) bands.push({ start: cursor, end: window.start, label: index === 0 ? 'Fora do expediente' : 'Intervalo' });
    cursor = Math.max(cursor, window.end);
  });
  if (cursor < bounds.end) bands.push({ start: cursor, end: bounds.end, label: 'Fora do expediente' });
  return bands;
}

export const isClinicClosed = (state: Pick<DemoState, 'clinic'>, date: string) => !state.clinic.hours.some(slot => slot.day === new Date(`${date}T12:00:00Z`).getUTCDay());
/** "Sábado e domingo: clínica fechada" for the closed days among those displayed ('' if none). */
export function closedDaysNote(state: Pick<DemoState, 'clinic'>, days: string[]): string {
  const names = days.filter(day => isClinicClosed(state, day)).map(day => formatDate(day, { weekday: 'long', day: undefined, month: undefined }).toLowerCase());
  if (!names.length) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
  return `${sentenceCase(list)}: clínica fechada`;
}

/** Appointments with an open reschedule request — the same derivation as the Início
 * counter (open conversation whose reason mentions "remarc") plus the target the
 * conversation assistant resolves for it. */
export function rescheduleRequestIds(state: DemoState): Set<string> {
  const ids = new Set<string>();
  for (const conversation of state.conversations) {
    if (conversation.status === 'encerrada' || !isReschedule(conversation)) continue;
    const target = rescheduleTarget(state, conversation);
    if (target) ids.add(target.id);
  }
  return ids;
}
