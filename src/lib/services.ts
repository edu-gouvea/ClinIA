import { CommandError, type ErrorCode } from './errors';
import { can, currentUser, type Permission } from './permissions';
import { dateTime, isValidDate as validDate, isValidTime as validTime, minutes } from './date';
import { normalizePhone } from './format';
import { getAvailability } from './metrics';
import { canRecordOutcome, getBlockConflicts } from './scheduling';
import type { AdminEvent, AppointmentInput, Command, Conversation, DemoState, WeekSlot } from './types';

let sequence = 0;


export function id(prefix: string): string { return `${prefix}-${Date.now().toString(36)}-${(++sequence).toString(36)}`; }
/** Throws a `CommandError` (validation by default) when `condition` is falsy. */
const requireValue: (condition: unknown, message: string, code?: ErrorCode, field?: string) => asserts condition = (condition, message, code = 'validation', field) => { if (!condition) throw new CommandError(code, message, field); };

function validateHours(slots: WeekSlot[]): void {
  requireValue(Array.isArray(slots), 'Informe os horários semanais.', 'validation', 'availability');
  for (const slot of slots) {
    requireValue(Number.isInteger(slot.day) && slot.day >= 0 && slot.day <= 6, 'Dia da semana inválido.', 'validation', 'availability');
    requireValue(validTime(slot.start) && validTime(slot.end) && slot.start < slot.end, 'O início da disponibilidade deve ser anterior ao fim.', 'validation', 'availability');
  }
  slots.forEach((slot, index) => requireValue(!slots.slice(index + 1).some((other) => slot.day === other.day && slot.start < other.end && slot.end > other.start), 'Há faixas de disponibilidade sobrepostas no mesmo dia.', 'validation', 'availability'));
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
  requireValue(conversation.status === 'humano' && conversation.assigneeId === state.currentUserId, conversation.assigneeId ? 'Esta conversa está com outro atendente. Você pode acompanhar o histórico.' : 'Assuma a conversa antes de responder ou alterar o atendimento.', conversation.assigneeId ? 'forbidden' : 'invalid_state');
}

export function validateAppointment(state: DemoState, input: AppointmentInput, existingId?: string): void {
  requireValue(state.patients.some((patient) => patient.id === input.patientId), 'Selecione um paciente cadastrado.', 'validation', 'patientId');
  const professional = state.professionals.find((person) => person.id === input.professionalId);
  requireValue(professional?.active, 'Selecione um profissional ativo. Profissionais inativos não recebem novos agendamentos.', 'validation', 'professionalId');
  requireValue(professional.specialties.includes(input.specialty), 'Selecione uma especialidade atendida pelo profissional.', 'validation', 'specialty');
  requireValue(validDate(input.date) && validTime(input.start), 'Informe data e horário válidos.', 'validation', 'start');
  requireValue(Number.isInteger(input.duration) && input.duration >= 15 && input.duration <= 240, 'A duração deve ser um número inteiro entre 15 e 240 minutos.', 'validation', 'duration');
  requireValue(['agendada', 'confirmada'].includes(input.status), 'Uma consulta nova ou remarcada deve estar agendada ou confirmada.', 'validation', 'status');
  const start = minutes(input.start);
  const end = start + input.duration;
  requireValue(new Date(dateTime(input.date, input.start)).getTime() > new Date(state.now).getTime(), 'Escolha um horário futuro em relação ao relógio da demonstração.', 'validation', 'start');
  requireValue(getAvailability(state, input.professionalId, input.date).some((slot) => start >= minutes(slot.start) && end <= minutes(slot.end)), 'O intervalo completo está fora da disponibilidade ou contém um bloqueio. Escolha outro horário.', 'conflict', 'start');
  const other = state.appointments.filter((appointment) => appointment.id !== existingId && appointment.date === input.date && appointment.status !== 'cancelada');
  requireValue(!other.some((appointment) => appointment.professionalId === input.professionalId && start < minutes(appointment.start) + appointment.duration && end > minutes(appointment.start)), 'O profissional já tem uma consulta neste intervalo. Escolha outro horário.', 'conflict', 'start');
  requireValue(!other.some((appointment) => appointment.patientId === input.patientId && start < minutes(appointment.start) + appointment.duration && end > minutes(appointment.start)), 'O paciente já tem uma consulta neste intervalo. Escolha outro horário.', 'conflict', 'start');
}

/** The domain: applies one command to a copy of the state, re-checking every rule rather
 * than trusting disabled UI controls, and throws a `CommandError` when a rule fails. It has
 * no latency, failure injection or simulated actors: those live in `lib/demo/`. The real
 * API runs the same rules on the server (see docs/INTEGRACAO.md). */
const commandPermissions: Partial<Record<Command['type'], Permission>> = {
  'professional.save': 'team.manage',
  'clinic.save': 'clinic.manage',
  'knowledge.save': 'clinic.manage',
};

export async function runCommand(current: DemoState, command: Command): Promise<DemoState> {
  const state = structuredClone(current);
  const permission = commandPermissions[command.type];
  if (permission) requireValue(can(currentUser(state), permission), 'Seu perfil não permite esta alteração. Peça a um administrador da clínica.', 'forbidden');
  switch (command.type) {
    case 'appointment.save': {
      const existing = command.id ? state.appointments.find((appointment) => appointment.id === command.id) : undefined;
      if (command.id) requireValue(existing, 'Consulta não encontrada. Reabra a agenda e tente novamente.', 'not_found');
      if (existing) requireValue(existing.status === 'agendada' || existing.status === 'confirmada', 'Consultas concluídas ou canceladas preservam o histórico e não podem ser remarcadas.', 'invalid_state');
      if (existing) {
        requireValue(command.input.patientId === existing.patientId, 'O paciente não pode ser alterado em uma remarcação.', 'validation', 'patientId');
        requireValue(command.input.specialty === existing.specialty, 'A remarcação deve manter a especialidade da consulta.', 'validation', 'specialty');
        requireValue(state.professionals.some(person => person.id === command.input.professionalId && person.specialties.includes(existing.specialty)), 'Escolha um profissional da mesma especialidade da consulta.', 'validation', 'professionalId');
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
      requireValue(appointment, 'Consulta não encontrada.', 'not_found');
      requireValue(['agendada', 'confirmada'].includes(appointment.status), 'Esta consulta já tem um resultado final. O histórico foi preservado.', 'invalid_state');
      requireValue(['confirmada', 'cancelada', 'realizada', 'falta'].includes(command.status), 'Essa alteração de situação não é permitida.', 'invalid_state');
      requireValue(appointment.status !== command.status, 'A consulta já está nesta situação.', 'invalid_state');
      if (command.status === 'realizada' || command.status === 'falta') {
        requireValue(canRecordOutcome(appointment, state.referenceDate), 'Realização e falta só podem ser registradas em consultas de hoje ou de dias anteriores, nunca de dias futuros.', 'invalid_state');
      }
      appointment.status = command.status;
      if (command.status === 'cancelada') appointment.cancelReason = command.reason?.trim() || 'Motivo não informado.';
      appointment.events.push(event(state, `appointment.${command.status}`, `Situação alterada para ${command.status}.${command.status === 'cancelada' ? ` Motivo: ${appointment.cancelReason}` : ''}`));
      break;
    }
    case 'patient.save': {
      requireValue(command.input.name.trim().length >= 2, 'Informe o nome do paciente.', 'validation', 'name');
      const phone = normalizePhone(command.input.phone);
      requireValue(phone.length === 10 || phone.length === 11, 'Informe um telefone com DDD e 10 ou 11 dígitos.', 'validation', 'phone');
      const duplicate = state.patients.find((patient) => patient.id !== command.id && normalizePhone(patient.phone) === phone);
      requireValue(!duplicate || command.allowSharedPhone, `Este telefone já está vinculado a ${duplicate?.name}. Confira o cadastro ou confirme que o contato é compartilhado.`, 'conflict', 'phone');
      const input = { ...command.input, name: command.input.name.trim(), phone: command.input.phone.trim(), insurance: command.input.insurance.trim(), notes: command.input.notes.trim() };
      if (command.id) {
        const patient = state.patients.find((item) => item.id === command.id);
        requireValue(patient, 'Paciente não encontrado.', 'not_found');
        Object.assign(patient, input);
      } else state.patients.push({ id: id('patient'), ...input });
      break;
    }
    case 'professional.save': {
      requireValue(command.input.name.trim().length >= 2, 'Informe o nome do profissional.', 'validation', 'name');
      requireValue(command.input.specialties.length > 0 && command.input.specialties.every((specialty) => state.clinic.specialties.includes(specialty)), 'Selecione pelo menos uma especialidade cadastrada na clínica.', 'validation', 'specialties');
      validateHours(command.input.availability);
      const input = { ...command.input, name: command.input.name.trim(), specialties: [...new Set(command.input.specialties)] };
      if (command.id) {
        const professional = state.professionals.find((item) => item.id === command.id);
        requireValue(professional, 'Profissional não encontrado.', 'not_found');
        Object.assign(professional, input);
      } else state.professionals.push({ ...input, id: id('professional') });
      break;
    }
    case 'clinic.save': {
      requireValue(command.input.name.trim() && command.input.address.trim(), 'Informe nome e endereço da clínica.', 'validation', 'address');
      requireValue([10, 11].includes(normalizePhone(command.input.phone).length), 'Informe um telefone com DDD e 10 ou 11 dígitos para a clínica.', 'validation', 'phone');
      // Every stored date and time is a wall-clock value of this zone: changing it would
      // silently move the whole schedule, so it is set when the clinic is provisioned.
      requireValue(command.input.timezone === state.clinic.timezone, 'O fuso da clínica é definido na implantação e não pode ser alterado aqui.', 'validation', 'timezone');
      requireValue(command.input.specialties.length > 0 && command.input.specialties.every((specialty) => specialty.trim().length > 0), 'Cadastre pelo menos uma especialidade com nome válido.', 'validation', 'specialties');
      const removed = state.professionals.filter((professional) => professional.active).flatMap((professional) => professional.specialties).find((specialty) => !command.input.specialties.includes(specialty));
      requireValue(!removed, `A especialidade ${removed} está vinculada a um profissional ativo e deve ser mantida.`, 'conflict', 'specialties');
      validateHours(command.input.hours);
      state.clinic = { ...command.input, name: command.input.name.trim(), insurance: [...new Set(command.input.insurance.filter(Boolean))], specialties: [...new Set(command.input.specialties.filter(Boolean))] };
      break;
    }
    case 'block.save': {
      const input = command.input;
      const existing = command.id ? state.blocks.find((block) => block.id === command.id) : undefined;
      if (command.id) requireValue(existing, 'Bloqueio não encontrado.', 'not_found');
      requireValue(state.professionals.some((professional) => professional.id === input.professionalId), 'Selecione um profissional.', 'validation', 'professionalId');
      requireValue(validDate(input.date) && validTime(input.start) && validTime(input.end) && input.start < input.end, 'Informe data e intervalo válidos para o bloqueio.', 'validation', 'start');
      requireValue(new Date(dateTime(input.date, input.start)).getTime() > new Date(state.now).getTime(), 'Crie bloqueios somente em horários futuros.', 'validation', 'start');
      requireValue(input.reason.trim(), 'Informe o motivo do bloqueio.', 'validation', 'reason');
      requireValue(getBlockConflicts(state, input).length === 0, 'Existem consultas nesse intervalo. Remarque ou cancele antes de criar o bloqueio.', 'conflict', 'start');
      requireValue(!state.blocks.some((block) => block.id !== command.id && block.professionalId === input.professionalId && block.date === input.date && input.start < block.end && input.end > block.start), 'Já existe um bloqueio nesse intervalo.', 'conflict', 'start');
      if (existing) Object.assign(existing, input, { reason: input.reason.trim() });
      else state.blocks.push({ ...input, reason: input.reason.trim(), id: id('block') });
      break;
    }
    case 'block.delete': {
      requireValue(state.blocks.some((block) => block.id === command.id), 'Bloqueio não encontrado.', 'not_found');
      state.blocks = state.blocks.filter((block) => block.id !== command.id);
      break;
    }
    case 'knowledge.save': {
      requireValue(command.input.title.trim() && command.input.category.trim() && command.input.content.trim(), 'Preencha título, categoria e conteúdo da orientação.', 'validation', 'content');
      const input = { ...command.input, title: command.input.title.trim(), category: command.input.category.trim(), content: command.input.content.trim() };
      if (command.id) {
        const document = state.knowledge.find((item) => item.id === command.id);
        requireValue(document, 'Orientação não encontrada.', 'not_found');
        Object.assign(document, input);
      } else state.knowledge.push({ ...input, id: id('knowledge') });
      break;
    }
    case 'conversation.claim': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.', 'not_found');
      requireValue(conversation.status !== 'encerrada', 'O atendimento foi encerrado. Uma nova mensagem do paciente inicia outra sessão.', 'invalid_state');
      requireValue(conversation.assigneeId === null || conversation.assigneeId === state.currentUserId, 'Outro atendente é responsável por esta conversa. Você pode acompanhar o histórico.', 'forbidden');
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
      requireValue(conversation, 'Conversa não encontrada.', 'not_found');
      ownedConversation(state, conversation);
      conversationEvent(state, conversation, command.type, command.type === 'conversation.return' ? 'Conversa devolvida à IA. Ela retomará após a próxima mensagem do paciente.' : 'Atendimento encerrado. Uma nova mensagem iniciará outra sessão, preservando este histórico.');
      conversation.status = command.type === 'conversation.return' ? 'ia' : 'encerrada';
      conversation.assigneeId = null;
      break;
    }
    case 'conversation.send': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.', 'not_found');
      ownedConversation(state, conversation);
      requireValue(command.text.trim(), 'Digite uma mensagem para enviar.', 'validation', 'text');
      requireValue(command.text.length <= 5000, 'Use até 5.000 caracteres por mensagem.', 'validation', 'text');
      requireValue(command.messageId, 'A mensagem precisa de um identificador para evitar duplicação.', 'validation', 'messageId');
      // Idempotent by `messageId`: a retry reuses the message (one per id) and waits for a
      // new delivery report; the text is the one first written.
      const existing = conversation.messages.find((message) => message.id === command.messageId);
      if (existing) {
        requireValue(existing.author === 'humano' && existing.authorId === state.currentUserId && existing.sessionId === conversation.sessionId, 'Não é possível reenviar esta mensagem em outra sessão ou autoria.', 'conflict');
        if (existing.delivery !== 'falha') break;
        existing.delivery = 'pendente';
        existing.attempts = (existing.attempts ?? 1) + 1;
        existing.at = state.now;
      } else {
        conversation.messages.push({ id: command.messageId, author: 'humano', authorId: state.currentUserId, text: command.text.trim(), at: state.now, delivery: 'pendente', sessionId: conversation.sessionId, attempts: 1 });
      }
      break;
    }
    case 'conversation.delivery': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.', 'not_found');
      const message = conversation.messages.find((item) => item.id === command.messageId);
      requireValue(message && message.author === 'humano', 'Mensagem não encontrada.', 'not_found');
      // Reports can arrive twice or late: only a pending message changes.
      if (message.delivery !== 'pendente') break;
      message.delivery = command.delivery;
      if (command.delivery === 'enviada') {
        conversation.events.push(event(state, 'conversation.send', (message.attempts ?? 1) > 1 ? 'Mensagem humana enviada após nova tentativa.' : 'Mensagem humana enviada.', { authorId: message.authorId ?? state.currentUserId, sessionId: message.sessionId, requestedAt: conversation.requestedAt }));
      }
      break;
    }
    case 'conversation.receive': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.', 'not_found');
      requireValue(command.text.trim(), 'Digite a mensagem fictícia do paciente.', 'validation', 'text');
      requireValue(command.text.length <= 5000, 'Use até 5.000 caracteres por mensagem.', 'validation', 'text');
      if (conversation.status === 'encerrada') {
        conversation.sessionId = id('session');
        conversation.status = 'ia';
        conversation.assigneeId = null;
        conversation.reason = undefined;
        conversation.requestedAt = undefined;
        conversationEvent(state, conversation, 'conversation.reopen', 'Nova sessão iniciada por uma mensagem do paciente. O histórico anterior permanece disponível.');
      }
      conversation.messages.push({ id: id('message'), author: 'paciente', text: command.text.trim(), at: state.now, delivery: 'enviada', sessionId: conversation.sessionId });
      break;
    }
    case 'conversation.ai_reply': {
      const conversation = state.conversations.find((item) => item.id === command.id);
      requireValue(conversation, 'Conversa não encontrada.', 'not_found');
      requireValue(conversation.status === 'ia', 'A IA só responde conversas que estão com ela.', 'invalid_state');
      requireValue(command.text.trim(), 'A resposta da IA não pode estar vazia.', 'validation', 'text');
      conversation.messages.push({ id: id('message'), author: 'ia', text: command.text.trim(), at: state.now, delivery: 'enviada', sessionId: conversation.sessionId });
      if (command.handoff?.trim()) {
        conversation.status = 'aguardando';
        conversation.requestedAt = state.now;
        conversation.reason = command.handoff.trim();
        conversationEvent(state, conversation, 'conversation.request', `Encaminhamento: ${conversation.reason}.`);
      }
      break;
    }
    case 'assistant.add': {
      requireValue(command.entry.question.trim() && command.entry.answer.trim(), 'A pergunta e a resposta não podem estar vazias.', 'validation', 'question');
      if (!state.assistantHistory.some((entry) => entry.id === command.entry.id)) state.assistantHistory.push(command.entry);
      break;
    }
  }
  return state;
}
