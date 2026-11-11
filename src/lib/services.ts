import { dateTime, minutes } from './date';
import { getAvailability } from './metrics';
import { canRecordOutcome, getBlockConflicts } from './scheduling';
import type { AdminEvent, AppointmentInput, Command, Conversation, DemoState, WeekSlot } from './types';

let failNext = false;
let sequence = 0;

export class DemoValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'DemoValidationError'; }
}

/** One recoverable error on the next mutation; exposed by the demo settings only. */
export function failNextRequest(): void { failNext = true; }
export function id(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`; }
const requireValue: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new DemoValidationError(message); };

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function validTime(value: string): boolean { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  return digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits;
}
function validateHours(slots: WeekSlot[]): void {
  requireValue(Array.isArray(slots), 'Informe os horários semanais.');
  for (const slot of slots) {
    requireValue(Number.isInteger(slot.day) && slot.day >= 0 && slot.day <= 6, 'Dia da semana inválido.');
    requireValue(validTime(slot.start) && validTime(slot.end) && slot.start < slot.end, 'O início da disponibilidade deve ser anterior ao fim.');
  }
  slots.forEach((slot, index) => requireValue(!slots.slice(index + 1).some((other) => slot.day === other.day && slot.start < other.end && slot.end > other.start), 'Há faixas de disponibilidade sobrepostas no mesmo dia.'));
}
function event(state: DemoState, type: string, description: string, extra: Partial<AdminEvent> = {}): AdminEvent {
  return { id: id('event'), at: state.now, authorId: state.currentUserId, type, description, ...extra };
}
function conversationEvent(state: DemoState, conversation: Conversation, type: string, description: string): void {
  const item = event(state, type, description, { sessionId: conversation.sessionId, requestedAt: conversation.requestedAt, ...(type === 'conversation.request' || type === 'conversation.reopen' ? { authorId: 'ia' } : {}) });
  conversation.events.push(item);
  conversation.messages.push({ id: `${item.id}-message`, author: 'evento', authorId: item.authorId, text: description, at: state.now, delivery: 'enviada', sessionId: conversation.sessionId });
}
function ownedConversation(state: DemoState, conversation: Conversation): void {
  requireValue(conversation.status === 'humano' && conversation.assigneeId === state.currentUserId, conversation.assigneeId ? 'Esta conversa está com outro atendente. Você pode acompanhar o histórico.' : 'Assuma a conversa antes de responder ou alterar o atendimento.');
}

export function validateAppointment(state: DemoState, input: AppointmentInput, existingId?: string): void {
  requireValue(state.patients.some((patient) => patient.id === input.patientId), 'Selecione um paciente cadastrado.');
  const professional = state.professionals.find((person) => person.id === input.professionalId);
  requireValue(professional?.active, 'Selecione um profissional ativo. Profissionais inativos não recebem novos agendamentos.');
  requireValue(professional.specialties.includes(input.specialty), 'Selecione uma especialidade atendida pelo profissional.');
  requireValue(validDate(input.date) && validTime(input.start), 'Informe data e horário válidos.');
  requireValue(Number.isInteger(input.duration) && input.duration >= 15 && input.duration <= 240, 'A duração deve ser um número inteiro entre 15 e 240 minutos.');
  requireValue(['agendada', 'confirmada'].includes(input.status), 'Uma consulta nova ou remarcada deve estar agendada ou confirmada.');
  const start = minutes(input.start);
  const end = start + input.duration;
  requireValue(new Date(dateTime(input.date, input.start)).getTime() > new Date(state.now).getTime(), 'Escolha um horário futuro em relação ao relógio da demonstração.');
  requireValue(getAvailability(state, input.professionalId, input.date).some((slot) => start >= minutes(slot.start) && end <= minutes(slot.end)), 'O intervalo completo está fora da disponibilidade ou contém um bloqueio. Escolha outro horário.');
  const other = state.appointments.filter((appointment) => appointment.id !== existingId && appointment.date === input.date && appointment.status !== 'cancelada');
  requireValue(!other.some((appointment) => appointment.professionalId === input.professionalId && start < minutes(appointment.start) + appointment.duration && end > minutes(appointment.start)), 'O profissional já tem uma consulta neste intervalo. Escolha outro horário.');
  requireValue(!other.some((appointment) => appointment.patientId === input.patientId && start < minutes(appointment.start) + appointment.duration && end > minutes(appointment.start)), 'O paciente já tem uma consulta neste intervalo. Escolha outro horário.');
}

/** Components consume this asynchronous boundary; replace here with real queries/mutations later.
 * All authorization and scheduling rules are repeated here, rather than trusting disabled UI controls. */
export async function runCommand(current: DemoState, command: Command): Promise<DemoState> {
  await new Promise((resolve) => setTimeout(resolve, process.env.NODE_ENV === 'test' ? 0 : 180));
  if (failNext) { failNext = false; throw new Error('Não foi possível salvar desta vez. Falha simulada: tente novamente; seus dados foram preservados.'); }
  const state = structuredClone(current);
  switch (command.type) {
    case 'appointment.save': {
      const existing = command.id ? state.appointments.find((appointment) => appointment.id === command.id) : undefined;
      if (command.id) requireValue(existing, 'Consulta não encontrada. Reabra a agenda e tente novamente.');
      if (existing) requireValue(existing.status === 'agendada' || existing.status === 'confirmada', 'Consultas concluídas ou canceladas preservam o histórico e não podem ser remarcadas.');
      if (existing) {
        requireValue(command.input.patientId === existing.patientId, 'O paciente não pode ser alterado em uma remarcação.');
        requireValue(command.input.specialty === existing.specialty, 'A remarcação deve manter a especialidade da consulta.');
        requireValue(state.professionals.some(person => person.id === command.input.professionalId && person.specialties.includes(existing.specialty)), 'Escolha um profissional da mesma especialidade da consulta.');
      }
      validateAppointment(state, command.input, command.id);
      // Whitelist editable fields even when a caller passes a full record. An extra
      // id/events property must never replace the preserved scheduling history.
      const input: AppointmentInput = {
        patientId: command.input.patientId, professionalId: command.input.professionalId,
        specialty: command.input.specialty, date: command.input.date, start: command.input.start,
        duration: command.input.duration, status: command.input.status,
      };
      if (existing) {
        const previousStart = `${existing.date} ${existing.start}`;
        const newStart = `${command.input.date} ${command.input.start}`;
        existing.events.push(event(state, 'appointment.reschedule', `Consulta alterada de ${previousStart} para ${newStart} (${command.input.duration} min).`, { previousStart, newStart }));
        Object.assign(existing, input);
      } else state.appointments.push({ ...input, id: id('appointment'), events: [event(state, 'appointment.create', 'Consulta cadastrada pela recepção.')] });
      break;
    }
    case 'appointment.status': {
      const appointment = state.appointments.find((item) => item.id === command.id);
      requireValue(appointment, 'Consulta não encontrada.');
      requireValue(['agendada', 'confirmada'].includes(appointment.status), 'Esta consulta já tem um resultado final. O histórico foi preservado.');
      requireValue(['confirmada', 'cancelada', 'realizada', 'falta'].includes(command.status), 'Essa alteração de situação não é permitida.');
      requireValue(appointment.status !== command.status, 'A consulta já está nesta situação.');
      if (command.status === 'realizada' || command.status === 'falta') {
        requireValue(canRecordOutcome(appointment, state.referenceDate), 'Realização e falta só podem ser registradas em consultas de hoje ou de dias anteriores, nunca de dias futuros.');
      }
      appointment.status = command.status;
      if (command.status === 'cancelada') appointment.cancelReason = command.reason?.trim() || 'Motivo não informado.';
      appointment.events.push(event(state, `appointment.${command.status}`, `Situação alterada para ${command.status}.${command.status === 'cancelada' ? ` Motivo: ${appointment.cancelReason}` : ''}`));
      break;
    }
    case 'appointment.note': {
      const appointment = state.appointments.find(item => item.id === command.id);
      requireValue(appointment, 'Consulta não encontrada.');
      requireValue(appointment.status === 'realizada', 'Anotações da consulta estão disponíveis após registrar a realização.');
      const text = command.text.trim();
      requireValue(text.length > 0 && text.length <= 10000, 'Escreva uma anotação de até 10.000 caracteres.');
      if (appointment.notes?.at(-1)?.text === text) break;
      appointment.notes ??= [];
      appointment.notes.push({ id: id('note'), text, professionalId: appointment.professionalId, recordedByUserId: state.currentUserId, at: state.now });
      appointment.events.push(event(state, 'appointment.note', 'Anotações da consulta salvas; versões anteriores preservadas.'));
      break;
    }
    case 'patient.save': {
      requireValue(command.input.name.trim().length >= 2, 'Informe o nome do paciente.');
      const phone = normalizePhone(command.input.phone);
      requireValue(phone.length === 10 || phone.length === 11, 'Informe um telefone com DDD e 10 ou 11 dígitos.');
      const duplicate = state.patients.find((patient) => patient.id !== command.id && normalizePhone(patient.phone) === phone);
      requireValue(!duplicate || command.allowSharedPhone, `Este telefone já está vinculado a ${duplicate?.name}. Confira o cadastro ou confirme que o contato é compartilhado.`);
      const input = { ...command.input, name: command.input.name.trim(), phone: command.input.phone.trim(), insurance: command.input.insurance.trim(), notes: command.input.notes.trim() };
      if (command.id) {
        const patient = state.patients.find((item) => item.id === command.id);
        requireValue(patient, 'Paciente não encontrado.');
        Object.assign(patient, input);
      } else state.patients.push({ id: id('patient'), ...input });
      break;
    }
    case 'professional.save': {
      requireValue(command.input.name.trim().length >= 2, 'Informe o nome do profissional.');
      requireValue(command.input.specialties.length > 0 && command.input.specialties.every((specialty) => state.clinic.specialties.includes(specialty)), 'Selecione pelo menos uma especialidade cadastrada na clínica.');
      validateHours(command.input.availability);
      const input = { ...command.input, name: command.input.name.trim(), specialties: [...new Set(command.input.specialties)] };
      if (command.id) {
        const professional = state.professionals.find((item) => item.id === command.id);
        requireValue(professional, 'Profissional não encontrado.');
        Object.assign(professional, input);
      } else state.professionals.push({ ...input, id: id('professional') });
      break;
    }
    case 'clinic.save': {
      requireValue(command.input.name.trim() && command.input.address.trim(), 'Informe nome e endereço da clínica.');
      requireValue([10, 11].includes(normalizePhone(command.input.phone).length), 'Informe um telefone com DDD e 10 ou 11 dígitos para a clínica.');
      requireValue(command.input.timezone === 'America/Recife', 'A demonstração utiliza o fuso America/Recife.');
      requireValue(command.input.specialties.length > 0 && command.input.specialties.every((specialty) => specialty.trim().length > 0), 'Cadastre pelo menos uma especialidade com nome válido.');
      const removed = state.professionals.filter((professional) => professional.active).flatMap((professional) => professional.specialties).find((specialty) => !command.input.specialties.includes(specialty));
      requireValue(!removed, `A especialidade ${removed} está vinculada a um profissional ativo e deve ser mantida.`);
      validateHours(command.input.hours);
      state.clinic = { ...command.input, name: command.input.name.trim(), insurance: [...new Set(command.input.insurance.filter(Boolean))], specialties: [...new Set(command.input.specialties.filter(Boolean))] };
      break;
    }
    case 'block.save': {
      const input = command.input;
      const existing = command.id ? state.blocks.find((block) => block.id === command.id) : undefined;
      if (command.id) requireValue(existing, 'Bloqueio não encontrado.');
      requireValue(state.professionals.some((professional) => professional.id === input.professionalId), 'Selecione um profissional.');
      requireValue(validDate(input.date) && validTime(input.start) && validTime(input.end) && input.start < input.end, 'Informe data e intervalo válidos para o bloqueio.');
      requireValue(new Date(dateTime(input.date, input.start)).getTime() > new Date(state.now).getTime(), 'Crie bloqueios somente em horários futuros.');
      requireValue(input.reason.trim(), 'Informe o motivo do bloqueio.');
      requireValue(getBlockConflicts(state, input).length === 0, 'Existem consultas nesse intervalo. Remarque ou cancele antes de criar o bloqueio.');
      requireValue(!state.blocks.some((block) => block.id !== command.id && block.professionalId === input.professionalId && block.date === input.date && input.start < block.end && input.end > block.start), 'Já existe um bloqueio nesse intervalo.');
      if (existing) Object.assign(existing, input, { reason: input.reason.trim() });
      else state.blocks.push({ ...input, reason: input.reason.trim(), id: id('block') });
      break;
    }
    case 'block.delete': {
      requireValue(state.blocks.some((block) => block.id === command.id), 'Bloqueio não encontrado.');
      state.blocks = state.blocks.filter((block) => block.id !== command.id);
      break;
    }
    case 'knowledge.save': {
      requireValue(command.input.title.trim() && command.input.category.trim() && command.input.content.trim(), 'Preencha título, categoria e conteúdo da orientação.');
      const input = { ...command.input, title: command.input.title.trim(), category: command.input.category.trim(), content: command.input.content.trim() };
      if (command.id) {
        const document = state.knowledge.find((item) => item.id === command.id);
        requireValue(document, 'Orientação não encontrada.');
        Object.assign(document, input);
      } else state.knowledge.push({ ...input, id: id('knowledge') });
      break;
    }
    case 'conversation.claim': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.');
      requireValue(conversation.status !== 'encerrada', 'O atendimento foi encerrado. Uma nova mensagem do paciente inicia outra sessão.');
      requireValue(conversation.assigneeId === null || conversation.assigneeId === state.currentUserId, 'Outro atendente é responsável por esta conversa. Você pode acompanhar o histórico.');
      if (conversation.assigneeId === state.currentUserId) break;
      conversation.assigneeId = state.currentUserId;
      conversation.status = 'humano';
      conversation.requestedAt ??= state.now;
      conversationEvent(state, conversation, command.type, `${state.users.find((user) => user.id === state.currentUserId)?.name ?? 'Atendente'} assumiu a conversa.`);
      break;
    }
    case 'conversation.return':
    case 'conversation.close': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.');
      ownedConversation(state, conversation);
      conversationEvent(state, conversation, command.type, command.type === 'conversation.return' ? 'Conversa devolvida à IA. Ela retomará após a próxima mensagem do paciente.' : 'Atendimento encerrado. Uma nova mensagem iniciará outra sessão, preservando este histórico.');
      conversation.status = command.type === 'conversation.return' ? 'ia' : 'encerrada';
      conversation.assigneeId = null;
      break;
    }
    case 'conversation.send': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.');
      ownedConversation(state, conversation);
      requireValue(command.text.trim(), 'Digite uma mensagem para enviar.');
      requireValue(command.text.length <= 5000, 'Use até 5.000 caracteres por mensagem.');
      requireValue(command.messageId, 'A mensagem precisa de um identificador para evitar duplicação.');
      const existing = conversation.messages.find((message) => message.id === command.messageId);
      if (existing) {
        requireValue(existing.author === 'humano' && existing.authorId === state.currentUserId && existing.sessionId === conversation.sessionId, 'Não é possível reenviar esta mensagem em outra sessão ou autoria.');
        if (existing.delivery === 'enviada') break;
        existing.delivery = command.fail ? 'falha' : 'enviada';
        existing.at = state.now;
        if (!command.fail) conversation.events.push(event(state, 'conversation.send', 'Mensagem humana enviada após nova tentativa.', { sessionId: conversation.sessionId, requestedAt: conversation.requestedAt }));
      } else {
        conversation.messages.push({ id: command.messageId, author: 'humano', authorId: state.currentUserId, text: command.text.trim(), at: state.now, delivery: command.fail ? 'falha' : 'enviada', sessionId: conversation.sessionId });
        if (!command.fail) conversation.events.push(event(state, 'conversation.send', 'Mensagem humana enviada.', { sessionId: conversation.sessionId, requestedAt: conversation.requestedAt }));
      }
      break;
    }
    case 'conversation.receive': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.');
      requireValue(command.text.trim(), 'Digite a mensagem fictícia do paciente.');
      requireValue(command.text.length <= 5000, 'Use até 5.000 caracteres por mensagem.');
      if (conversation.status === 'encerrada') {
        conversation.sessionId = id('session');
        conversation.status = 'ia';
        conversation.assigneeId = null;
        conversation.reason = undefined;
        conversation.requestedAt = undefined;
        conversationEvent(state, conversation, 'conversation.reopen', 'Nova sessão iniciada por uma mensagem do paciente. O histórico anterior permanece disponível.');
      }
      conversation.messages.push({ id: id('message'), author: 'paciente', text: command.text.trim(), at: state.now, delivery: 'enviada', sessionId: conversation.sessionId });
      if (conversation.status === 'ia') {
        if (/atendente|humano|remarcar|remarcação|remarcacao/i.test(command.text)) {
          conversation.status = 'aguardando';
          conversation.requestedAt = state.now;
          conversation.reason = /remarc/i.test(command.text) ? 'Pedido de remarcação' : 'Solicitação de atendimento humano';
          conversation.messages.push({ id: id('message'), author: 'ia', text: 'Vou encaminhar sua solicitação à recepção. Um atendente poderá ajudar a seguir. (Resposta simulada)', at: state.now, delivery: 'enviada', sessionId: conversation.sessionId });
          conversationEvent(state, conversation, 'conversation.request', `Encaminhamento: ${conversation.reason}.`);
        } else {
          conversation.messages.push({ id: id('message'), author: 'ia', text: 'Recebi sua mensagem. Nesta demonstração, posso encaminhar dúvidas administrativas à recepção. Para falar com uma pessoa, escreva “atendente”. (Resposta simulada)', at: state.now, delivery: 'enviada', sessionId: conversation.sessionId });
        }
      }
      break;
    }
    case 'assistant.add': {
      requireValue(command.entry.question.trim() && command.entry.answer.trim(), 'A pergunta e a resposta não podem estar vazias.');
      if (!state.assistantHistory.some((entry) => entry.id === command.entry.id)) state.assistantHistory.push(command.entry);
      break;
    }
  }
  return state;
}
