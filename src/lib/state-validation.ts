import { isTimeZone, isValidDate, isValidTime } from './date';
import type { DemoState } from './types';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.length > 0;
const flag = (value: unknown): value is boolean => typeof value === 'boolean';
const list = (value: unknown, check: (item: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.every(check);
const texts = (value: unknown): boolean => list(value, text);
const date = isValidDate;
const time = isValidTime;
const instant = (value: unknown): boolean => text(value) && Number.isFinite(Date.parse(value));
const slot = (value: unknown): boolean => record(value) && time(value.start) && time(value.end) && value.start < value.end;
const weekSlot = (value: unknown): boolean => record(value) && slot(value) && Number.isInteger(value.day) && Number(value.day) >= 0 && Number(value.day) <= 6;
const identified = (value: unknown): value is RecordValue => record(value) && nonempty(value.id);
const event = (value: unknown): boolean => identified(value) && instant(value.at) && nonempty(value.authorId) && nonempty(value.type) && text(value.description)
  && (value.sessionId === undefined || nonempty(value.sessionId)) && (value.requestedAt === undefined || instant(value.requestedAt))
  && (value.previousStart === undefined || text(value.previousStart)) && (value.newStart === undefined || text(value.newStart));
const unique = (value: unknown): boolean => Array.isArray(value) && new Set(value.map((entry: RecordValue) => entry.id)).size === value.length;

/** Validate a stored version before any view consumes it. Storage is untrusted and may be
 * incomplete after an interrupted edit or belong to a different application version. */
export function isDemoState(value: unknown): value is DemoState {
  if (!record(value) || value.version !== 1 || !date(value.referenceDate) || !instant(value.now) || !nonempty(value.currentUserId)) return false;
  const clinic = value.clinic;
  if (!record(clinic) || !nonempty(clinic.name) || !text(clinic.address) || !text(clinic.phone) || !(text(clinic.timezone) && isTimeZone(clinic.timezone)) || !texts(clinic.insurance) || !texts(clinic.specialties) || !list(clinic.hours, weekSlot)) return false;
  if (!list(value.users, (user) => identified(user) && nonempty(user.name) && text(user.role) && ['admin', 'attendant'].includes(String(user.access))) || !unique(value.users)) return false;
  if (!list(value.patients, (patient) => identified(patient) && nonempty(patient.name) && text(patient.phone) && text(patient.insurance) && text(patient.notes)) || !unique(value.patients)) return false;
  if (!list(value.professionals, (professional) => identified(professional) && nonempty(professional.name) && texts(professional.specialties) && flag(professional.active) && text(professional.color) && list(professional.availability, weekSlot)) || !unique(value.professionals)) return false;
  const users = new Set((value.users as RecordValue[]).map((user) => user.id));
  const patients = new Set((value.patients as RecordValue[]).map((patient) => patient.id));
  const professionals = new Set((value.professionals as RecordValue[]).map((professional) => professional.id));
  if (!users.has(value.currentUserId)) return false;
  if (!list(value.blocks, (block) => identified(block) && professionals.has(block.professionalId) && date(block.date) && slot(block) && text(block.reason)) || !unique(value.blocks)) return false;
  if (!list(value.appointments, (appointment) => identified(appointment) && patients.has(appointment.patientId) && professionals.has(appointment.professionalId)
    && text(appointment.specialty) && date(appointment.date) && time(appointment.start) && Number.isInteger(appointment.duration) && Number(appointment.duration) >= 15 && Number(appointment.duration) <= 240
    && ['agendada', 'confirmada', 'cancelada', 'realizada', 'falta'].includes(String(appointment.status)) && list(appointment.events, event)
    && (appointment.cancelReason === undefined || text(appointment.cancelReason))) || !unique(value.appointments)) return false;
  if (!list(value.conversations, (conversation) => identified(conversation) && patients.has(conversation.patientId)
    && ['ia', 'aguardando', 'humano', 'encerrada'].includes(String(conversation.status)) && nonempty(conversation.sessionId)
    && (conversation.status === 'humano' ? users.has(conversation.assigneeId) : conversation.assigneeId === null)
    && (conversation.reason === undefined || text(conversation.reason)) && (conversation.requestedAt === undefined || instant(conversation.requestedAt))
    && list(conversation.events, event) && list(conversation.messages, (message) => identified(message)
      && ['paciente', 'ia', 'humano', 'evento'].includes(String(message.author)) && text(message.text) && instant(message.at) && nonempty(message.sessionId)
      && ['pendente', 'enviada', 'falha'].includes(String(message.delivery)) && (message.attempts === undefined || (Number.isInteger(message.attempts) && Number(message.attempts) >= 1)) && (message.author !== 'humano' || users.has(message.authorId)))
    && unique(conversation.messages)) || !unique(value.conversations)) return false;
  if (!list(value.knowledge, (document) => identified(document) && text(document.title) && text(document.category) && text(document.content) && flag(document.archived)) || !unique(value.knowledge)) return false;
  if (!list(value.assistantHistory, (entry) => identified(entry) && text(entry.question) && text(entry.answer) && text(entry.context) && text(entry.period) && instant(entry.at)
    && list(entry.links, (link) => record(link) && text(link.label) && text(link.href) && /^\/(?!\/)/.test(link.href))) || !unique(value.assistantHistory)) return false;
  if (value.availabilityHistory !== undefined) {
    if (!record(value.availabilityHistory)) return false;
    for (const [day, byProfessional] of Object.entries(value.availabilityHistory)) {
      if (!date(day) || !record(byProfessional) || !Object.entries(byProfessional).every(([id, intervals]) => professionals.has(id) && list(intervals, slot))) return false;
    }
  }
  return true;
}

/** Bring a save from an earlier build up to the current shape, before `isDemoState`:
 * users get an access level inferred from their job title, and consultation notes (free
 * clinical text, outside the administrative scope, docs/DECISOES.md) are dropped so they
 * do not linger in the browser. Returns whether anything changed. Untrusted input: it
 * only touches records that already have the expected shape. */
export function upgradeStoredState(value: unknown): boolean {
  if (!record(value)) return false;
  let changed = false;
  if (Array.isArray(value.users)) for (const user of value.users) {
    if (record(user) && user.access === undefined) { user.access = /admin/i.test(String(user.role)) ? 'admin' : 'attendant'; changed = true; }
  }
  if (Array.isArray(value.appointments)) for (const appointment of value.appointments) {
    if (record(appointment) && 'notes' in appointment) { delete appointment.notes; changed = true; }
  }
  return changed;
}
