import { answerQuestion } from './assistant';
import { addDays, dateTime, monthShortOf, weekdayOf, weekdaysFull, weekdaysShort, weekStart } from './date';
import { firstName, isReschedule } from './conversation-inbox';
import { normalizeText } from './format';
import { getFreeSlots } from './metrics';
import { isOpenAppointment } from './scheduling';
import { validateAppointment } from './services';
import { appointmentStatusLabels } from './status-presentation';
import type { Appointment, Conversation, DemoState, Knowledge } from './types';

/** Conversation-scoped assistant. Deterministic and read-only: it never mutates
 * state, never sends messages and never invents data that is not in the state. */
export type ConversationIntent = 'draft' | 'slots' | 'appointments' | 'summary' | 'fallback';
export type AnswerSource = { kind: 'conversa' | 'agenda' | 'conhecimento'; label: string; title: string };
export type SlotSuggestion = { id: string; date: string; start: string; duration: number; professionalId: string; label: string };
export type DraftReply = { text: string; sources: AnswerSource[] };
export type ConversationAnswer = {
  intent: ConversationIntent; text: string;
  slots?: SlotSuggestion[]; draft?: DraftReply; links?: { label: string; href: string }[];
};

const weekdaysLong = weekdaysFull.map(day => day.toLowerCase());
const weekday = weekdayOf;
const ddmm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** "Qua, 11 nov." */
export const shortDay = (date: string) => `${weekdaysShort[weekday(date)]}, ${date.slice(8, 10)} ${monthShortOf(date)}`;
/** "Hoje", "Amanhã" or "Qui, 12 nov.". */
export const relativeDay = (date: string, referenceDate: string) => date === referenceDate ? 'Hoje' : date === addDays(referenceDate, 1) ? 'Amanhã' : shortDay(date);

const SOURCES = {
  conversa: { kind: 'conversa', label: 'Conversa', title: 'Mensagens e motivo desta conversa' },
  agenda: { kind: 'agenda', label: 'Agenda', title: 'Consultas e horários livres da agenda' },
} as const satisfies Record<string, AnswerSource>;

export function classifyConversationQuestion(question: string): ConversationIntent {
  const text = normalizeText(question);
  if (/resum/.test(text)) return 'summary';
  if (/respost|rascunh|sugir|sugest|escrev|redij|responder/.test(text)) return 'draft';
  if (/horario|livre|vaga|remarc|disponib/.test(text)) return 'slots';
  if (/consulta|agenda/.test(text)) return 'appointments';
  return 'fallback';
}

export function futureAppointments(state: DemoState, patientId: string): Appointment[] {
  const now = Date.parse(state.now);
  return state.appointments.filter(a => a.patientId === patientId && isOpenAppointment(a) && Date.parse(dateTime(a.date, a.start)) >= now)
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
}

/** The future appointment a reschedule request refers to (the next open one). */
export function rescheduleTarget(state: DemoState, conversation: Conversation): Appointment | undefined {
  return isReschedule(conversation) ? futureAppointments(state, conversation.patientId)[0] : undefined;
}

/** Up to `limit` 30-min options for the appointment, same professional first
 * (then same specialty), from the reference date to the end of next week.
 * Every option passes the same validation as `appointment.save`, so conflicts
 * with the patient's other appointments are excluded. */
export function suggestSlots(state: DemoState, appointment: Appointment, limit = 3): SlotSuggestion[] {
  const last = addDays(weekStart(state.referenceDate), 13);
  const professionals = [appointment.professionalId, ...state.professionals.filter(p => p.active && p.id !== appointment.professionalId && p.specialties.includes(appointment.specialty)).map(p => p.id)];
  for (const professionalId of professionals) {
    const result: SlotSuggestion[] = [];
    for (let date = state.referenceDate; date <= last && result.length < limit; date = addDays(date, 1)) {
      for (const start of getFreeSlots(state, professionalId, date, appointment.duration)) {
        if (date === appointment.date && start === appointment.start) continue;
        try {
          validateAppointment(state, { patientId: appointment.patientId, professionalId, specialty: appointment.specialty, date, start, duration: appointment.duration, status: appointment.status }, appointment.id);
        } catch { continue; }
        result.push({ id: `${professionalId}-${date}-${start}`, date, start, duration: appointment.duration, professionalId, label: `${shortDay(date)} · ${start}` });
        if (result.length >= limit) break;
      }
    }
    if (result.length) return result;
  }
  return [];
}

const STOP = new Set(['para', 'como', 'qual', 'quais', 'voces', 'voce', 'gostaria', 'clinica', 'sobre', 'pode', 'podem', 'esta', 'esse', 'essa', 'isso', 'minha', 'meu', 'tenho', 'preciso', 'obrigada', 'obrigado', 'favor', 'bom', 'dia', 'tarde', 'noite', 'com', 'uma', 'umas', 'atendem', 'atende', 'pelo', 'pela', 'perfeito', 'confirmo', 'recepcao', 'falar', 'pessoa', 'atendente', 'atendimento', 'ajudar', 'ajuda']);
const words = (text: string) => normalizeText(text).split(/[^a-z0-9]+/).filter(word => word.length >= 4 && !STOP.has(word));
/** Simple keyword match between the last patient message and active guidance. */
export function matchKnowledge(state: DemoState, conversation: Conversation): Knowledge | undefined {
  const question = [...conversation.messages].reverse().find(message => message.author === 'paciente' && message.sessionId === conversation.sessionId);
  if (!question) return undefined;
  const asked = new Set(words(question.text));
  let best: { item: Knowledge; score: number } | undefined;
  for (const item of state.knowledge.filter(k => !k.archived)) {
    const score = new Set(words(`${item.title} ${item.category} ${item.content}`).filter(word => asked.has(word))).size;
    if (score > 0 && (!best || score > best.score)) best = { item, score };
  }
  return best?.item;
}

function signature(state: DemoState, patientName: string) {
  const user = state.users.find(item => item.id === state.currentUserId);
  return `Olá, ${firstName(patientName)}! Aqui é a ${firstName(user?.name ?? 'recepção')}, da recepção da ${state.clinic.name}.`;
}

/** Deterministic reply templates. Returns undefined when no template applies. */
export function draftReply(state: DemoState, conversation: Conversation, slot?: SlotSuggestion): DraftReply | undefined {
  const patient = state.patients.find(p => p.id === conversation.patientId);
  if (!patient) return undefined;
  const target = rescheduleTarget(state, conversation);
  if (target) {
    const option = slot ?? suggestSlots(state, target)[0];
    if (!option) return undefined;
    const professional = state.professionals.find(p => p.id === option.professionalId);
    return {
      text: `${signature(state, patient.name)} Para remarcar sua consulta de ${target.specialty} com ${professional?.name}, tenho disponível ${weekdaysLong[weekday(option.date)]} (${ddmm(option.date)}), às ${option.start}. Posso confirmar esse horário para você?`,
      sources: [SOURCES.conversa, SOURCES.agenda],
    };
  }
  const lastPatient = [...conversation.messages].reverse().find(message => message.author === 'paciente');
  const toConfirm = futureAppointments(state, patient.id).find(a => a.status === 'agendada');
  if (toConfirm && /confirm/.test(normalizeText(`${conversation.reason ?? ''} ${lastPatient?.text ?? ''}`))) {
    const professional = state.professionals.find(p => p.id === toConfirm.professionalId);
    return {
      text: `${signature(state, patient.name)} Sua consulta de ${toConfirm.specialty} com ${professional?.name} está marcada para ${weekdaysLong[weekday(toConfirm.date)]} (${ddmm(toConfirm.date)}), às ${toConfirm.start}. Você confirma sua presença?`,
      sources: [SOURCES.conversa, SOURCES.agenda],
    };
  }
  const guidance = matchKnowledge(state, conversation);
  if (guidance) return {
    text: `${signature(state, patient.name)} ${guidance.content}`,
    sources: [SOURCES.conversa, { kind: 'conhecimento', label: 'Base de conhecimento', title: `Orientação: ${guidance.title}` }],
  };
  return undefined;
}

export const FALLBACK_TEXT = 'Nesta demonstração, respondo sobre horários livres, próximas consultas, resumo da conversa e sugestão de resposta.';

export function answerConversationQuestion(state: DemoState, conversationId: string, question: string, slot?: SlotSuggestion): ConversationAnswer {
  const conversation = state.conversations.find(c => c.id === conversationId);
  const patient = state.patients.find(p => p.id === conversation?.patientId);
  const intent = classifyConversationQuestion(question);
  if (!conversation || !patient) return { intent: 'fallback', text: 'Não encontrei esta conversa na demonstração.' };
  const name = firstName(patient.name);

  if (intent === 'summary') {
    return { intent, text: answerQuestion(state, 'Resuma esta conversa.', 'Conversas', `/conversas?id=${conversation.id}`).answer };
  }
  if (intent === 'appointments') {
    const upcoming = futureAppointments(state, patient.id);
    if (!upcoming.length) return { intent, text: `${patient.name} não tem consultas futuras agendadas.` };
    const list = upcoming.slice(0, 3).map(a => `${relativeDay(a.date, state.referenceDate)} · ${a.start} — ${state.professionals.find(p => p.id === a.professionalId)?.name} (${a.specialty}), ${appointmentStatusLabels[a.status]}`).join('\n');
    return { intent, text: `${patient.name} tem ${upcoming.length} ${upcoming.length === 1 ? 'consulta futura' : 'consultas futuras'}. ${upcoming.length === 1 ? 'A próxima' : 'As próximas'}:\n${list}` };
  }
  if (intent === 'slots') {
    const target = rescheduleTarget(state, conversation);
    if (target) {
      const slots = suggestSlots(state, target);
      const professional = state.professionals.find(p => p.id === target.professionalId);
      const href = `/gestao/agenda?patient=${patient.id}&edit=${target.id}&context=${conversation.id}&date=${slots[0]?.date ?? target.date}`;
      if (!slots.length) return { intent, text: `Não encontrei horários livres para remarcar a consulta de ${target.specialty} até o fim da próxima semana.`, links: [{ label: 'Abrir remarcação na agenda', href }] };
      return { intent, text: `Horários livres para remarcar a consulta de ${target.specialty} de ${name} (${relativeDay(target.date, state.referenceDate)} · ${target.start}), sem conflito com outras consultas de ${name}. ${slots.every(s => s.professionalId === target.professionalId) ? `Com ${professional?.name}.` : 'Com outro profissional da mesma especialidade.'}`, slots, draft: draftReply(state, conversation, slots[0]), links: [{ label: 'Abrir remarcação na agenda', href }] };
    }
    const free = state.professionals.filter(p => p.active).reduce((sum, p) => sum + getFreeSlots(state, p.id, state.referenceDate).length, 0);
    return { intent, text: `Esta conversa não tem consulta para remarcar. Hoje há ${free} ${free === 1 ? 'horário livre' : 'horários livres'} de 30 min na agenda da clínica.`, links: [{ label: 'Abrir disponibilidade', href: `/gestao/agenda?date=${state.referenceDate}&availability=1` }] };
  }
  if (intent === 'draft') {
    const target = rescheduleTarget(state, conversation);
    const suggestions = target ? suggestSlots(state, target) : undefined;
    const draft = draftReply(state, conversation, slot ?? suggestions?.[0]);
    if (draft) return { intent, text: `Rascunho para ${name}. Revise antes de enviar.`, draft, slots: suggestions };
    return { intent, text: conversation.status === 'ia' ? 'A IA está conduzindo esta conversa e não tenho um modelo de resposta para ela.' : 'Não tenho uma sugestão de resposta para esta conversa.' };
  }
  return { intent: 'fallback', text: FALLBACK_TEXT };
}
