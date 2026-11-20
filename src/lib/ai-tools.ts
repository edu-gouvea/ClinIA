import type { Command } from './types';

/** Draft catalog of the tools ClinIA's AI agents may call (decision 3, docs/DECISOES.md).
 * The back-end owns the final contract and exposes each tool as the same service the
 * screens use, with the same rules; there are no AI-only endpoints. This file is the
 * front-end's proposal, kept next to the domain so it cannot drift from it: every write
 * tool names an existing `Command` type, and the tests check the scopes below.
 *
 * Two agents, two scopes:
 * - `patient`: answers on WhatsApp for one identified patient. It may only read and change
 *   that patient's own appointments and must hand off to a person for anything else.
 * - `internal`: the staff assistant. Read-only: it can *propose* a command, which runs only
 *   after the person confirms it on screen. */
export type Agent = 'patient' | 'internal';
export type ToolParam = { name: string; type: 'string' | 'number' | 'date' | 'time'; description: string; optional?: boolean };
export type AiTool = {
  name: string;
  description: string;
  agents: Agent[];
  /** Read tools answer from queries; write tools run exactly this domain command. */
  kind: 'read' | 'write';
  command?: Command['type'];
  params: ToolParam[];
  /** Write tools of the internal assistant always need a person to confirm. */
  requiresConfirmation: boolean;
  /** How the patient agent's call is scoped (the server fills these, never the model). */
  scope?: string;
};

const date: ToolParam = { name: 'date', type: 'date', description: 'Data no formato AAAA-MM-DD, no fuso da clínica.' };
const appointmentId: ToolParam = { name: 'appointmentId', type: 'string', description: 'Consulta do próprio paciente (obtida por listar_minhas_consultas).' };
const ownAppointments = 'patientId vem da identidade do WhatsApp; consultas de outros pacientes são recusadas (forbidden).';

export const aiTools: AiTool[] = [
  // Reads
  { name: 'buscar_horarios_livres', description: 'Horários livres de um profissional ou especialidade em um intervalo de datas, já descontando funcionamento, bloqueios e consultas.', agents: ['patient', 'internal'], kind: 'read', requiresConfirmation: false,
    params: [{ name: 'specialty', type: 'string', description: 'Especialidade cadastrada na clínica.' }, { name: 'professionalId', type: 'string', description: 'Restringe a um profissional.', optional: true }, { name: 'from', type: 'date', description: 'Primeiro dia.' }, { name: 'to', type: 'date', description: 'Último dia (até 14 dias depois).' }, { name: 'duration', type: 'number', description: 'Minutos (15 a 240).', optional: true }] },
  { name: 'listar_minhas_consultas', description: 'Próximas consultas do paciente da conversa.', agents: ['patient'], kind: 'read', requiresConfirmation: false, params: [], scope: ownAppointments },
  { name: 'consultar_base_de_conhecimento', description: 'Orientações administrativas ativas (horários, convênios, preparos, políticas). Nunca orientação clínica.', agents: ['patient', 'internal'], kind: 'read', requiresConfirmation: false,
    params: [{ name: 'query', type: 'string', description: 'Pergunta ou palavras-chave.' }] },
  { name: 'resumir_operacao', description: 'Pendências de hoje, consultas de amanhã e cancelamentos de um período, a partir dos indicadores.', agents: ['internal'], kind: 'read', requiresConfirmation: false,
    params: [{ ...date, name: 'from' }, { ...date, name: 'to' }] },
  // Writes — patient agent (scoped to the patient's own appointments)
  { name: 'agendar_consulta', description: 'Agenda uma consulta para o paciente da conversa em um horário livre.', agents: ['patient'], kind: 'write', command: 'appointment.save', requiresConfirmation: false, scope: ownAppointments,
    params: [{ name: 'professionalId', type: 'string', description: 'Profissional ativo.' }, { name: 'specialty', type: 'string', description: 'Especialidade atendida pelo profissional.' }, date, { name: 'start', type: 'time', description: 'Início HH:MM, um horário livre.' }] },
  { name: 'remarcar_consulta', description: 'Move uma consulta do paciente para outro horário livre (mesma especialidade).', agents: ['patient'], kind: 'write', command: 'appointment.save', requiresConfirmation: false, scope: ownAppointments,
    params: [appointmentId, date, { name: 'start', type: 'time', description: 'Novo início HH:MM.' }, { name: 'professionalId', type: 'string', description: 'Outro profissional da mesma especialidade.', optional: true }] },
  { name: 'confirmar_consulta', description: 'Registra a confirmação de presença do paciente.', agents: ['patient'], kind: 'write', command: 'appointment.status', requiresConfirmation: false, scope: ownAppointments, params: [appointmentId] },
  { name: 'cancelar_consulta', description: 'Cancela uma consulta do paciente, com o motivo que ele informar.', agents: ['patient'], kind: 'write', command: 'appointment.status', requiresConfirmation: false, scope: ownAppointments,
    params: [appointmentId, { name: 'reason', type: 'string', description: 'Motivo dito pelo paciente.', optional: true }] },
  { name: 'responder_paciente', description: 'Envia a resposta da IA; com `handoff`, encaminha a conversa à recepção com o motivo.', agents: ['patient'], kind: 'write', command: 'conversation.ai_reply', requiresConfirmation: false,
    params: [{ name: 'text', type: 'string', description: 'Mensagem ao paciente.' }, { name: 'handoff', type: 'string', description: 'Motivo do encaminhamento a um atendente.', optional: true }] },
  // Writes — internal assistant (proposal + confirmation on screen)
  { name: 'propor_remarcacao', description: 'Prepara a remarcação de uma consulta para a pessoa revisar e confirmar.', agents: ['internal'], kind: 'write', command: 'appointment.save', requiresConfirmation: true,
    params: [{ ...appointmentId, description: 'Consulta a remarcar.' }, date, { name: 'start', type: 'time', description: 'Novo início HH:MM.' }] },
  { name: 'rascunhar_resposta', description: 'Coloca um rascunho no campo de mensagem da conversa assumida; nunca envia.', agents: ['internal'], kind: 'write', command: 'conversation.send', requiresConfirmation: true,
    params: [{ name: 'text', type: 'string', description: 'Texto sugerido.' }] },
];

/** Commands no AI agent may ever run: clinic setup, team, knowledge base and ownership
 * changes stay with people. */
export const humanOnlyCommands: Command['type'][] = ['clinic.save', 'professional.save', 'knowledge.save', 'block.save', 'block.delete', 'patient.save', 'conversation.claim', 'conversation.return', 'conversation.close', 'conversation.delivery', 'conversation.receive', 'assistant.add'];

export const toolsFor = (agent: Agent) => aiTools.filter(tool => tool.agents.includes(agent));
