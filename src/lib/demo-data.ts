import { addDays, dateTime, minutes, timeFromMinutes, todayInRecife } from './date';
import { getAvailability } from './metrics';
import type { Appointment, AppointmentStatus, Conversation, DemoState, Message, WeekSlot } from './types';

const hours = (days: number[], start: string, end: string): WeekSlot[] => days.map((day) => ({ day, start, end }));

export function createDemoState(referenceDate = todayInRecife()): DemoState {
  const state: DemoState = {
    version: 1,
    referenceDate,
    now: dateTime(referenceDate, '10:15'),
    currentUserId: 'user-marina',
    clinic: {
      name: 'Clínica Florescer',
      address: 'Rua das Acácias, 120 · Boa Vista, Recife — endereço fictício',
      phone: '(81) 3000-0100',
      timezone: 'America/Recife',
      insurance: ['Particular', 'Viva Saúde', 'Bem-estar Saúde', 'UniCuidado'],
      specialties: ['Cardiologia', 'Dermatologia', 'Fisioterapia', 'Nutrição'],
      hours: [...hours([1, 2, 3, 4, 5], '08:00', '18:00'), ...hours([6], '08:00', '14:00'), ...hours([0], '08:00', '12:00')],
    },
    users: [
      { id: 'user-marina', name: 'Marina Costa', role: 'Administradora' },
      { id: 'user-rafael', name: 'Rafael Melo', role: 'Atendente' },
      { id: 'user-beatriz', name: 'Beatriz Lima', role: 'Atendente' },
    ],
    patients: [
      ['Ana Beatriz Santos', '(81) 90000-0101', 'Viva Saúde'], ['Pedro Almeida', '(81) 90000-0102', 'Particular'],
      ['Juliana Ferreira', '(81) 90000-0103', 'Bem-estar Saúde'], ['Carlos Eduardo Lima', '(81) 90000-0104', 'UniCuidado'],
      ['Mariana Oliveira', '(81) 90000-0105', 'Viva Saúde'], ['Fernanda Rocha', '(81) 90000-0106', 'Particular'],
      ['Gabriel Souza', '(81) 90000-0107', 'UniCuidado'], ['Camila Nunes', '(81) 90000-0108', 'Bem-estar Saúde'],
      ['Rafael Martins', '(81) 90000-0109', 'Particular'], ['Larissa Costa', '(81) 90000-0110', 'Viva Saúde'],
      ['Bruno Teixeira', '(81) 90000-0111', 'UniCuidado'], ['Isabela Duarte', '(81) 90000-0112', 'Viva Saúde'],
      ['Lucas Barros', '(81) 90000-0113', 'Particular'], ['Sofia Andrade', '(81) 90000-0114', 'Bem-estar Saúde'],
      ['Mateus Ribeiro', '(81) 90000-0115', 'UniCuidado'], ['Helena Carvalho', '(81) 90000-0116', 'Particular'],
      ['Renata Alves', '(81) 90000-0117', 'Viva Saúde'], ['Diego Moreira', '(81) 90000-0118', 'Particular'],
      ['Patrícia Melo', '(81) 90000-0119', 'Bem-estar Saúde'], ['Tiago Araújo', '(81) 90000-0120', 'UniCuidado'],
      ['Luiza Farias', '(81) 90000-0121', 'Particular'], ['André Monteiro', '(81) 90000-0122', 'Viva Saúde'],
      ['Daniela Pires', '(81) 90000-0123', 'UniCuidado'], ['Vinícius Freitas', '(81) 90000-0124', 'Particular'],
    ].map(([name, phone, insurance], index) => ({ id: `patient-${index + 1}`, name, phone, insurance, notes: index === 0 ? 'Prefere contato pelo WhatsApp no período da manhã. Registro fictício.' : '' })),
    professionals: [
      { id: 'pro-clara', name: 'Dra. Clara Mendes', specialties: ['Cardiologia'], active: true, color: '#266b53', availability: [...hours([0, 1, 2, 3, 4, 5, 6], '08:00', '12:00'), ...hours([1, 2, 3, 4, 5], '13:00', '17:00')] },
      { id: 'pro-lucas', name: 'Dr. Lucas Vieira', specialties: ['Dermatologia'], active: true, color: '#6f75a8', availability: [...hours([1, 2, 3, 4, 5, 6], '09:00', '12:00'), ...hours([1, 2, 4, 5], '13:00', '18:00')] },
      { id: 'pro-bianca', name: 'Bianca Torres', specialties: ['Fisioterapia'], active: true, color: '#b7874a', availability: [...hours([1, 2, 3, 4, 5], '08:00', '12:00'), ...hours([1, 2, 3, 4, 5], '14:00', '18:00')] },
      { id: 'pro-helena', name: 'Helena Duarte', specialties: ['Nutrição'], active: true, color: '#a56b82', availability: [...hours([1, 3, 5, 6], '08:00', '12:00'), ...hours([2, 4], '13:00', '17:00')] },
    ],
    blocks: [
      { id: 'block-1', professionalId: 'pro-clara', date: addDays(referenceDate, 1), start: '14:00', end: '15:00', reason: 'Reunião de equipe' },
      { id: 'block-2', professionalId: 'pro-lucas', date: addDays(referenceDate, 2), start: '10:00', end: '11:00', reason: 'Indisponibilidade informada' },
      { id: 'block-3', professionalId: 'pro-bianca', date: addDays(referenceDate, -3), start: '14:00', end: '15:00', reason: 'Reunião administrativa' },
    ],
    appointments: [],
    conversations: [],
    knowledge: [
      { id: 'knowledge-1', title: 'Horários e canais de atendimento', category: 'Horários', content: 'A recepção atende nos horários de funcionamento cadastrados. Use o WhatsApp demonstrativo para dúvidas administrativas. Confirme a disponibilidade na agenda antes de oferecer um horário.', archived: false },
      { id: 'knowledge-2', title: 'Convênios disponíveis', category: 'Convênios', content: 'A clínica fictícia trabalha com Viva Saúde, Bem-estar Saúde, UniCuidado e atendimento particular. A equipe deve confirmar a elegibilidade de cada cadastro antes do agendamento.', archived: false },
      { id: 'knowledge-3', title: 'Documentos para a primeira visita', category: 'Preparos administrativos', content: 'Para atualizar o cadastro administrativo, confirme nome, telefone e convênio. Não solicite informações clínicas neste canal de demonstração.', archived: false },
      { id: 'knowledge-4', title: 'Política de remarcação', category: 'Políticas', content: 'Solicitações de remarcação são encaminhadas à recepção. O novo horário depende da disponibilidade. Preserve o histórico da consulta e confirme a alteração com o paciente.', archived: false },
    ],
    assistantHistory: [],
    availabilityHistory: {},
  };

  // All dates are relative to the saved reference day. The same reference always creates the same demo.
  // Two complete 30-day periods (plus a buffer) support equivalent comparisons.
  for (let offset = -65; offset <= 12; offset++) {
    const date = addDays(referenceDate, offset);
    state.professionals.forEach((professional, professionalIndex) => {
      // During seeding, compute each day's then-current schedule before saving the
      // historical snapshot (the normal query must not invent missing history).
      const availability = getAvailability({ ...state, referenceDate: date }, professional.id, date);
      if (offset < 0) {
        state.availabilityHistory![date] ??= {};
        state.availabilityHistory![date][professional.id] = availability;
      }
      let position = 0;
      availability.forEach((slot) => {
        for (let start = minutes(slot.start); start + 30 <= minutes(slot.end); start += 60) {
          const index = position++;
          // Keep future slots genuinely free while still populating every initial day.
          if (offset > 0 && (index + offset + professionalIndex) % 3 === 0) continue;
          const numeric = (offset + 65) * 13 + professionalIndex * 7 + index;
          let status: AppointmentStatus;
          if (offset < 0 || (offset === 0 && start + 30 < 10 * 60 + 15)) {
            status = numeric % 13 === 0 ? 'cancelada' : numeric % 11 === 0 ? 'falta' : numeric % 17 === 0 ? 'agendada' : 'realizada';
          } else {
            status = numeric % 3 === 0 ? 'agendada' : 'confirmada';
          }
          const id = `appt-${offset + 65}-${professionalIndex}-${index}`;
          const patientId = `patient-${numeric % state.patients.length + 1}`;
          // Prevent concurrent appointments for the same fictitious patient.
          if (state.appointments.some((appointment) => appointment.date === date && appointment.patientId === patientId && appointment.start === timeFromMinutes(start) && appointment.status !== 'cancelada')) continue;
          const appointment: Appointment = {
            id, patientId, professionalId: professional.id, specialty: professional.specialties[0], date,
            start: timeFromMinutes(start), duration: 30, status,
            events: [{ id: `${id}-created`, at: dateTime(offset > 0 ? addDays(referenceDate, -(numeric % 7 + 1)) : addDays(date, -3), '09:00'), authorId: numeric % 2 ? 'user-marina' : 'user-rafael', type: 'appointment.create', description: 'Consulta cadastrada na demonstração.' }],
          };
          if (status !== 'agendada') appointment.events.push({ id: `${id}-status`, at: dateTime(offset > 0 ? referenceDate : date, status === 'realizada' || status === 'falta' ? timeFromMinutes(start + 30) : '07:30'), authorId: numeric % 2 ? 'user-marina' : 'user-beatriz', type: `appointment.${status}`, description: `Situação registrada: ${status}.` });
          if (status === 'cancelada') appointment.cancelReason = numeric % 2 ? 'Solicitação do paciente.' : 'Reorganização de horário solicitada.';
          state.appointments.push(appointment);
        }
      });
    });
  }

  // A stable record anchors the complete demo flow: claim Ana's conversation, consult patient, reschedule.
  const anchorDate = referenceDate;
  const anchorTime = '11:30';
  state.appointments = state.appointments.filter((appointment) => !(appointment.date === anchorDate && appointment.start === anchorTime && (appointment.professionalId === 'pro-clara' || appointment.patientId === 'patient-1')));
  state.appointments.push({ id: 'appt-ana', patientId: 'patient-1', professionalId: 'pro-clara', specialty: 'Cardiologia', date: anchorDate, start: anchorTime, duration: 30, status: 'agendada', events: [{ id: 'appt-ana-create', at: dateTime(addDays(referenceDate, -2), '14:00'), authorId: 'user-marina', type: 'appointment.create', description: 'Consulta agendada pela recepção.' }] });

  const scenarios: { patient: number; status: Conversation['status']; assignee: string | null; reason?: string; text: string }[] = [
    { patient: 1, status: 'aguardando', assignee: null, reason: 'Pedido de remarcação', text: 'Bom dia! Preciso remarcar minha consulta de hoje. Podem me ajudar?' },
    { patient: 2, status: 'ia', assignee: null, text: 'Vocês atendem pelo convênio Viva Saúde?' },
    { patient: 3, status: 'humano', assignee: 'user-marina', reason: 'Confirmação de horário', text: 'Perfeito, confirmo minha presença. Obrigada!' },
    { patient: 4, status: 'humano', assignee: 'user-rafael', reason: 'Dúvida administrativa', text: 'Qual é o endereço da clínica?' },
    { patient: 5, status: 'aguardando', assignee: null, reason: 'Solicitação de atendimento humano', text: 'Gostaria de falar com uma pessoa da recepção.' },
    { patient: 6, status: 'encerrada', assignee: null, reason: 'Agendamento concluído', text: 'Combinado. Até lá!' },
    { patient: 7, status: 'ia', assignee: null, text: 'Quais são os horários de atendimento?' },
    { patient: 8, status: 'encerrada', assignee: null, reason: 'Informação administrativa enviada', text: 'Obrigada pela atenção.' },
  ];
  state.conversations = scenarios.map((scenario, index) => {
    const id = `conversation-${index + 1}`;
    const sessionId = `session-${index + 1}-1`;
    const base = 9 * 60 + 15 + index * 3;
    const at = (extra: number) => dateTime(referenceDate, timeFromMinutes(base + extra));
    const messages: Message[] = [
      { id: `${id}-m1`, author: 'paciente', text: 'Olá, bom dia!', at: at(0), delivery: 'enviada', sessionId },
      { id: `${id}-m2`, author: 'ia', text: 'Olá! Sou o assistente administrativo da Clínica Florescer. Como posso ajudar?', at: at(1), delivery: 'enviada', sessionId },
    ];
    const conversation: Conversation = { id, patientId: `patient-${scenario.patient}`, status: scenario.status, assigneeId: scenario.assignee, reason: scenario.reason, requestedAt: scenario.reason ? at(2) : undefined, sessionId, messages, events: [] };
    if (scenario.reason) {
      messages.push({ id: `${id}-handoff`, author: 'evento', text: `Atendimento encaminhado à recepção: ${scenario.reason.toLowerCase()}.`, at: at(2), delivery: 'enviada', sessionId });
      conversation.events.push({ id: `${id}-request`, at: at(2), authorId: 'ia', type: 'conversation.request', description: `Encaminhamento: ${scenario.reason}.`, sessionId, requestedAt: at(2) });
    }
    if (scenario.status === 'humano' || scenario.status === 'encerrada') {
      const authorId = scenario.assignee || (index % 2 ? 'user-marina' : 'user-beatriz');
      conversation.events.push({ id: `${id}-claim`, at: at(5), authorId, type: 'conversation.claim', description: 'Conversa assumida pela recepção.', sessionId, requestedAt: at(2) });
      conversation.messages.push({ id: `${id}-human`, author: 'humano', authorId, text: 'Bom dia! Sou da recepção e vou ajudar você com essa solicitação.', at: at(7), delivery: 'enviada', sessionId });
      if (scenario.status === 'encerrada') conversation.events.push({ id: `${id}-close`, at: at(13), authorId, type: 'conversation.close', description: 'Atendimento encerrado. Histórico preservado.', sessionId, requestedAt: at(2) });
    }
    messages.push({ id: `${id}-m3`, author: 'paciente', text: scenario.text, at: at(10), delivery: 'enviada', sessionId });
    if (scenario.status === 'ia') messages.push({ id: `${id}-m4`, author: 'ia', text: index === 1 ? 'Nesta demonstração, a clínica aceita Viva Saúde. Posso encaminhar você à recepção para confirmar os dados do convênio.' : 'Os horários variam por dia. A recepção pode confirmar a disponibilidade para sua visita.', at: at(11), delivery: 'enviada', sessionId });
    if (scenario.status === 'encerrada') messages.push({ id: `${id}-ended`, author: 'evento', text: 'Atendimento encerrado pela recepção.', at: at(13), delivery: 'enviada', sessionId });
    return conversation;
  });
  return state;
}
