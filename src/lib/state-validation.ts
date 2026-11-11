import type { DemoState } from './types';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string';
const nonempty = (value: unknown): value is string => text(value) && value.length > 0;
const flag = (value: unknown): value is boolean => typeof value === 'boolean';
const list = (value: unknown, check: (item: unknown) => boolean): value is unknown[] => Array.isArray(value) && value.every(check);
const texts = (value: unknown): boolean => list(value, text);
const date = (value: unknown): value is string => text(value) && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const time = (value: unknown): value is string => text(value) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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
  if (!record(clinic) || !nonempty(clinic.name) || !text(clinic.address) || !text(clinic.phone) || clinic.timezone !== 'America/Recife' || !texts(clinic.insurance) || !texts(clinic.specialties) || !list(clinic.hours, weekSlot)) return false;
  if (!list(value.users, (user) => identified(user) && nonempty(user.name) && text(user.role)) || !unique(value.users)) return false;
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
    && (appointment.cancelReason === undefined || text(appointment.cancelReason))
    && (appointment.notes === undefined || (list(appointment.notes, note => identified(note) && text(note.text) && professionals.has(note.professionalId) && users.has(note.recordedByUserId) && instant(note.at)) && unique(appointment.notes)))) || !unique(value.appointments)) return false;
  if (!list(value.conversations, (conversation) => identified(conversation) && patients.has(conversation.patientId)
    && ['ia', 'aguardando', 'humano', 'encerrada'].includes(String(conversation.status)) && nonempty(conversation.sessionId)
    && (conversation.status === 'humano' ? users.has(conversation.assigneeId) : conversation.assigneeId === null)
    && (conversation.reason === undefined || text(conversation.reason)) && (conversation.requestedAt === undefined || instant(conversation.requestedAt))
    && list(conversation.events, event) && list(conversation.messages, (message) => identified(message)
      && ['paciente', 'ia', 'humano', 'evento'].includes(String(message.author)) && text(message.text) && instant(message.at) && nonempty(message.sessionId)
      && ['pendente', 'enviada', 'falha'].includes(String(message.delivery)) && (message.author !== 'humano' || users.has(message.authorId)))
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
