export type AppointmentStatus = 'agendada' | 'confirmada' | 'cancelada' | 'realizada' | 'falta';
export type ConversationStatus = 'ia' | 'aguardando' | 'humano' | 'encerrada';
export type WeekSlot = { day: number; start: string; end: string };
export type Block = { id: string; professionalId: string; date: string; start: string; end: string; reason: string };
export type Patient = { id: string; name: string; phone: string; insurance: string; notes: string };
export type Professional = { id: string; name: string; specialties: string[]; active: boolean; color: string; availability: WeekSlot[] };
export type DemoUser = { id: string; name: string; role: string };
export type AdminEvent = { id: string; at: string; authorId: string; type: string; description: string; previousStart?: string; newStart?: string; sessionId?: string; requestedAt?: string };
export type ConsultationNote = { id: string; text: string; professionalId: string; recordedByUserId: string; at: string };
export type Appointment = { id: string; patientId: string; professionalId: string; specialty: string; date: string; start: string; duration: number; status: AppointmentStatus; events: AdminEvent[]; cancelReason?: string; notes?: ConsultationNote[] };
export type Message = { id: string; author: 'paciente' | 'ia' | 'humano' | 'evento'; authorId?: string; text: string; at: string; delivery: 'pendente' | 'enviada' | 'falha'; sessionId: string };
export type Conversation = { id: string; patientId: string; status: ConversationStatus; assigneeId: string | null; reason?: string; requestedAt?: string; sessionId: string; messages: Message[]; events: AdminEvent[] };
export type Knowledge = { id: string; title: string; category: string; content: string; archived: boolean };
export type Clinic = { name: string; address: string; phone: string; timezone: string; insurance: string[]; specialties: string[]; hours: WeekSlot[] };
export type AssistantLink = { label: string; href: string };
export type AssistantEntry = { id: string; question: string; answer: string; context: string; period: string; at: string; links: AssistantLink[] };
export type DemoState = { version: 1; referenceDate: string; now: string; currentUserId: string; clinic: Clinic; users: DemoUser[]; patients: Patient[]; professionals: Professional[]; blocks: Block[]; appointments: Appointment[]; conversations: Conversation[]; knowledge: Knowledge[]; assistantHistory: AssistantEntry[]; availabilityHistory?: Record<string, Record<string, { start: string; end: string }[]>> };
export type AppointmentInput = Omit<Appointment, 'id' | 'events' | 'cancelReason' | 'notes'>;
export type Command =
 | { type: 'appointment.save'; input: AppointmentInput; id?: string }
 | { type: 'appointment.status'; id: string; status: AppointmentStatus; reason?: string }
 | { type: 'appointment.note'; id: string; text: string }
 | { type: 'patient.save'; input: Omit<Patient, 'id'>; id?: string; allowSharedPhone?: boolean }
 | { type: 'professional.save'; input: Omit<Professional, 'id'>; id?: string }
 | { type: 'clinic.save'; input: Clinic }
 | { type: 'block.save'; input: Omit<Block, 'id'>; id?: string }
 | { type: 'block.delete'; id: string }
 | { type: 'knowledge.save'; input: Omit<Knowledge, 'id'>; id?: string }
 | { type: 'conversation.claim'; id: string }
 | { type: 'conversation.return'; id: string }
 | { type: 'conversation.close'; id: string }
 | { type: 'conversation.send'; id: string; text: string; messageId: string; fail?: boolean }
 | { type: 'conversation.receive'; id: string; text: string }
 | { type: 'assistant.add'; entry: AssistantEntry };
export type Period = { start: string; end: string };
export type Metrics = { planned: number; completed: number; cancelled: number; missed: number; total: number; pending: number; availableMinutes: number; bookedMinutes: number; occupancy: number | null; absenceRate: number | null };
