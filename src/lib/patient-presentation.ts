import { clinicDate, dateTime, monthShortOf, monthYearShort, weekdayOf, weekdaysLong } from './date';
import { isReschedule } from './conversation-inbox';
import { relativeDay, rescheduleTarget } from './conversation-assistant';
import { isOpenAppointment } from './scheduling';
import type { StatusTone } from './status-presentation';
import type { Appointment, AppointmentStatus, Conversation, ConversationStatus, DemoState, Patient } from './types';

/** Pure presentation helpers for the Pacientes screen. The only clock is `state.now`
 * (or an explicit `now`); nothing here mutates state. */

const startOf = (appointment: Pick<Appointment, 'date' | 'start'>) => Date.parse(dateTime(appointment.date, appointment.start));
const byStart = (a: Appointment, b: Appointment) => startOf(a) - startOf(b) || a.id.localeCompare(b.id);
const ofPatient = (state: DemoState, patientId: string) => state.appointments.filter(a => a.patientId === patientId);

/** First future open appointment (`agendada`/`confirmada`) from `state.now`. */
export function nextAppointment(state: DemoState, patientId: string): Appointment | undefined {
  const now = Date.parse(state.now);
  return ofPatient(state, patientId).filter(a => isOpenAppointment(a) && startOf(a) >= now).sort(byStart)[0];
}

/** Most recent past appointment with an outcome (`realizada` or `falta`). */
export function lastAppointment(state: DemoState, patientId: string): Appointment | undefined {
  const now = Date.parse(state.now);
  return ofPatient(state, patientId).filter(a => (a.status === 'realizada' || a.status === 'falta') && startOf(a) < now).sort(byStart).at(-1);
}

export type PendencyKind = 'remarcacao' | 'conversa' | 'confirmar' | 'falta';
/** Icon keys (the UI maps them to lucide icons): Repeat, MessageCircle, Clock, XCircle. */
export type PendencyIcon = 'repeat' | 'message' | 'clock' | 'x-circle';
export type Pendency = { kind: PendencyKind; label: string; tone: StatusTone; icon: PendencyIcon; appointmentId?: string; conversationId?: string };

/** Ordered by priority: reschedule request (the same derivation as the Início counter
 * and the Agenda flag — an open conversation whose reason mentions "remarc", targeting
 * the next open appointment), waiting conversation (not repeated when it is the same
 * conversation), next appointment still to confirm, and a no-show on the last visit. */
export function patientPendencies(state: DemoState, patientId: string): Pendency[] {
  const result: Pendency[] = [];
  const conversations = state.conversations.filter(c => c.patientId === patientId);
  const reschedules = new Set<string>();
  for (const conversation of conversations) {
    if (conversation.status === 'encerrada' || !isReschedule(conversation)) continue;
    reschedules.add(conversation.id);
    result.push({ kind: 'remarcacao', label: 'Pediu remarcação', tone: 'warning', icon: 'repeat', appointmentId: rescheduleTarget(state, conversation)?.id, conversationId: conversation.id });
  }
  for (const conversation of conversations) {
    if (conversation.status !== 'aguardando' || reschedules.has(conversation.id)) continue;
    result.push({ kind: 'conversa', label: 'Conversa aguardando', tone: 'warning', icon: 'message', conversationId: conversation.id });
  }
  const next = nextAppointment(state, patientId);
  if (next?.status === 'agendada') result.push({ kind: 'confirmar', label: 'A confirmar', tone: 'warning', icon: 'clock', appointmentId: next.id });
  const last = lastAppointment(state, patientId);
  if (last?.status === 'falta') result.push({ kind: 'falta', label: 'Faltou na última', tone: 'danger', icon: 'x-circle', appointmentId: last.id });
  return result;
}

export type ProfessionalCount = { professionalId: string; name: string; color: string; realizadas: number };
export type PatientSummary = { realizadas: number; proximas: number; faltas: number; canceladas: number; desde: string | null; profissionais: ProfessionalCount[] };

/** Counts, "desde" (month and year of the first appointment, e.g. "set. 2026") and up to
 * four professionals by completed appointments, most first. */
export function patientSummary(state: DemoState, patientId: string): PatientSummary {
  const now = Date.parse(state.now);
  const list = ofPatient(state, patientId);
  const first = [...list].sort(byStart)[0];
  const counts = new Map<string, number>();
  for (const a of list) if (a.status === 'realizada') counts.set(a.professionalId, (counts.get(a.professionalId) ?? 0) + 1);
  const profissionais = [...counts.entries()].map(([professionalId, realizadas]) => {
    const professional = state.professionals.find(p => p.id === professionalId);
    return { professionalId, name: professional?.name ?? 'Profissional removido', color: professional?.color ?? '#71717a', realizadas };
  }).sort((a, b) => b.realizadas - a.realizadas || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 4);
  return {
    realizadas: list.filter(a => a.status === 'realizada').length,
    proximas: list.filter(a => isOpenAppointment(a) && startOf(a) >= now).length,
    faltas: list.filter(a => a.status === 'falta').length,
    canceladas: list.filter(a => a.status === 'cancelada').length,
    desde: first ? monthYearShort(first.date) : null,
    profissionais,
  };
}

export type AppointmentItem = { type: 'appointment'; id: string; start: string; date: string; time: string; duration: number; status: AppointmentStatus; professional: string; professionalId: string; specialty: string; cancelReason?: string };
export type ConversationItem = { type: 'conversation'; id: string; conversationId: string; sessionId: string; sessionNumber: number; at: string; status: ConversationStatus; assignee: string | null; reason?: string; messageCount: number; preview: string };
export type TimelineItem = AppointmentItem | ConversationItem;
export type TimelineGroup = { id: string; title: string; items: TimelineItem[] };
export type PatientTimeline = { groups: TimelineGroup[]; nextMonth: string | null };

export function appointmentItem(state: DemoState, appointment: Appointment): AppointmentItem {
  return {
    type: 'appointment', id: appointment.id, start: dateTime(appointment.date, appointment.start), date: appointment.date, time: appointment.start, duration: appointment.duration,
    status: appointment.status, professionalId: appointment.professionalId, professional: state.professionals.find(p => p.id === appointment.professionalId)?.name ?? 'Profissional removido',
    specialty: appointment.specialty, cancelReason: appointment.status === 'cancelada' && appointment.cancelReason && appointment.cancelReason !== 'Motivo não informado.' ? appointment.cancelReason : undefined,
  };
}

const userName = (state: DemoState, id?: string | null) => (id && state.users.find(u => u.id === id)?.name) || null;

/** Conversation sessions of a patient, most recent activity first. The current session
 * carries the conversation status; earlier sessions are closed. */
export function patientSessions(state: DemoState, patientId: string): ConversationItem[] {
  const items: ConversationItem[] = [];
  for (const conversation of state.conversations.filter(c => c.patientId === patientId)) {
    const sessions = [...new Set(conversation.messages.map(m => m.sessionId))];
    if (!sessions.includes(conversation.sessionId) && conversation.events.some(e => e.sessionId === conversation.sessionId)) sessions.push(conversation.sessionId);
    sessions.forEach((sessionId, index) => items.push(sessionItem(state, conversation, sessionId, index + 1)));
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at) || b.id.localeCompare(a.id));
}

function sessionItem(state: DemoState, conversation: Conversation, sessionId: string, sessionNumber: number): ConversationItem {
  const messages = conversation.messages.filter(m => m.sessionId === sessionId);
  const events = conversation.events.filter(e => e.sessionId === sessionId);
  const times = [...messages.map(m => m.at), ...events.map(e => e.at)].sort((a, b) => Date.parse(a) - Date.parse(b));
  const current = sessionId === conversation.sessionId;
  const status: ConversationStatus = current ? conversation.status : 'encerrada';
  const owner = [...events].reverse().find(e => e.type === 'conversation.close' || e.type === 'conversation.claim')?.authorId;
  const assignee = current && status === 'humano' ? userName(state, conversation.assigneeId) : status === 'encerrada' ? userName(state, owner) : null;
  const preview = [...messages].reverse().find(m => m.author !== 'evento') ?? messages.at(-1);
  return {
    type: 'conversation', id: `${conversation.id}:${sessionId}`, conversationId: conversation.id, sessionId, sessionNumber,
    at: times.at(-1) ?? state.now, status, assignee, reason: current ? conversation.reason : undefined,
    messageCount: messages.length, preview: preview?.text ?? 'Sem mensagens registradas.',
  };
}

const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** "Outubro", or "Setembro de 2025" when the year differs from `now`. */
export function monthTitle(month: string, now: string): string {
  const name = monthNames[Number(month.slice(5, 7)) - 1];
  return month.slice(0, 4) === clinicDate(now).slice(0, 4) ? name : `${name} de ${month.slice(0, 4)}`;
}

const WEEK = 7 * 86_400_000;
/** "Próximas" (future, ascending), "Esta semana" (last 7 days up to now, descending) and
 * one group per month (descending). Only `monthsLoaded` past months are returned;
 * `nextMonth` names the next one still available (or null). */
export function buildPatientTimeline(state: DemoState, patientId: string, now: string, monthsLoaded = 2): PatientTimeline {
  const current = Date.parse(now);
  const items: TimelineItem[] = [...ofPatient(state, patientId).map(a => appointmentItem(state, a)), ...patientSessions(state, patientId)];
  const at = (item: TimelineItem) => Date.parse(item.type === 'appointment' ? item.start : item.at);
  const future = items.filter(item => at(item) >= current).sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
  const past = items.filter(item => at(item) < current).sort((a, b) => at(b) - at(a) || b.id.localeCompare(a.id));
  const groups: TimelineGroup[] = [];
  if (future.length) groups.push({ id: 'proximas', title: 'Próximas', items: future });
  const week = past.filter(item => at(item) >= current - WEEK);
  if (week.length) groups.push({ id: 'semana', title: 'Esta semana', items: week });
  const months = new Map<string, TimelineItem[]>();
  for (const item of past.filter(entry => at(entry) < current - WEEK)) {
    const key = clinicDate(item.type === 'appointment' ? item.date : item.at).slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), item]);
  }
  const keys = [...months.keys()].sort().reverse();
  const loaded = Math.max(0, Math.floor(monthsLoaded));
  for (const key of keys.slice(0, loaded)) groups.push({ id: key, title: monthTitle(key, now), items: months.get(key)! });
  return { groups, nextMonth: keys[loaded] ? monthTitle(keys[loaded], now) : null };
}

export type PatientView = 'todos' | 'pendencias' | 'sem-proxima';
export type PatientSort = 'nome' | 'proxima' | 'ultima';
export type SortOrder = 'asc' | 'desc';
export type PatientRow = { patient: Patient; next?: Appointment; last?: Appointment; pendencies: Pendency[] };
export const patientViews: PatientView[] = ['todos', 'pendencias', 'sem-proxima'];
export const patientSorts: PatientSort[] = ['proxima', 'nome', 'ultima'];
export const parseView = (value: string | null): PatientView => patientViews.find(v => v === value) ?? 'todos';
export const parseSort = (value: string | null): PatientSort => patientSorts.find(v => v === value) ?? 'proxima';
export const parseOrder = (value: string | null): SortOrder => value === 'desc' ? 'desc' : 'asc';

const digits = (value: string) => value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
const isParticular = (insurance: string) => !insurance.trim() || /^particular$/i.test(insurance.trim());
/** Same matching as before: name (case-insensitive) or phone digits; `insurance` is a
 * plan name or `particular` (empty or "Particular"). */
function matches(patient: Patient, q: string, insurance: string) {
  const query = q.trim().toLocaleLowerCase('pt-BR');
  const phone = digits(q);
  const text = !query || patient.name.toLocaleLowerCase('pt-BR').includes(query) || (phone.length > 0 && digits(patient.phone).includes(phone));
  const plan = !insurance || (insurance === 'particular' ? isParticular(patient.insurance) : patient.insurance === insurance);
  return text && plan;
}
export function patientRow(state: DemoState, patient: Patient): PatientRow {
  return { patient, next: nextAppointment(state, patient.id), last: lastAppointment(state, patient.id), pendencies: patientPendencies(state, patient.id) };
}
const inView = (row: PatientRow, view: PatientView) => view === 'pendencias' ? row.pendencies.length > 0 : view === 'sem-proxima' ? !row.next : true;

export function filterPatients(state: DemoState, { q = '', insurance = '', view = 'todos' }: { q?: string; insurance?: string; view?: PatientView }): PatientRow[] {
  return state.patients.filter(p => matches(p, q, insurance)).map(p => patientRow(state, p)).filter(row => inView(row, view));
}
/** Counts per view with search and insurance applied. */
export function viewCounts(state: DemoState, filters: { q?: string; insurance?: string }): Record<PatientView, number> {
  const rows = filterPatients(state, { ...filters, view: 'todos' });
  return { todos: rows.length, pendencias: rows.filter(r => inView(r, 'pendencias')).length, 'sem-proxima': rows.filter(r => inView(r, 'sem-proxima')).length };
}
/** Rows without the sorted date always go last, whatever the direction. */
export function sortPatients(rows: PatientRow[], sort: PatientSort = 'proxima', order: SortOrder = 'asc'): PatientRow[] {
  const sign = order === 'asc' ? 1 : -1;
  const byName = (a: PatientRow, b: PatientRow) => a.patient.name.localeCompare(b.patient.name, 'pt-BR') || a.patient.id.localeCompare(b.patient.id);
  return [...rows].sort((a, b) => {
    if (sort === 'nome') return sign * byName(a, b);
    const left = sort === 'proxima' ? a.next : a.last;
    const right = sort === 'proxima' ? b.next : b.last;
    if (!left || !right) return left === right ? byName(a, b) : left ? -1 : 1;
    return sign * (startOf(left) - startOf(right)) || byName(a, b);
  });
}

export type Page<T> = { items: T[]; page: number; pages: number; from: number; to: number; total: number };
/** 1-based page, clamped to the available range. `from`/`to` are 1-based positions. */
export function paginate<T>(rows: T[], page: number, size = 12): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(pages, Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1));
  const start = (current - 1) * size;
  const items = rows.slice(start, start + size);
  return { items, page: current, pages, from: items.length ? start + 1 : 0, to: start + items.length, total: rows.length };
}

/** "Hoje · 11:30", "Amanhã · 14:00", "Qui, 12 nov. · 09:00". */
export const appointmentWhen = (date: string, start: string, referenceDate: string) => `${relativeDay(date, referenceDate)} · ${start}`;
/** "Terça, 10 de nov." */
export const longDayLabel = (date: string) => `${weekdaysLong[weekdayOf(date)]}, ${Number(date.slice(8, 10))} de ${monthShortOf(date)}`;

/** Upcoming (from `state.now`, ascending) and earlier (descending) appointments,
 * optionally for one professional. */
export function patientAppointmentsSplit(state: DemoState, patientId: string, professionalId = ''): { proximas: Appointment[]; anteriores: Appointment[] } {
  const now = Date.parse(state.now);
  const list = ofPatient(state, patientId).filter(a => !professionalId || a.professionalId === professionalId);
  return { proximas: list.filter(a => startOf(a) >= now).sort(byStart), anteriores: list.filter(a => startOf(a) < now).sort((a, b) => byStart(b, a)) };
}

/** The patient's conversation with the most recent activity. */
export function latestConversation(state: DemoState, patientId: string): Conversation | undefined {
  const last = (c: Conversation) => Math.max(0, ...c.messages.map(m => Date.parse(m.at)), ...c.events.map(e => Date.parse(e.at)));
  return state.conversations.filter(c => c.patientId === patientId).sort((a, b) => last(b) - last(a) || a.id.localeCompare(b.id))[0];
}
