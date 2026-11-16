import type { AppointmentStatus, ConversationStatus } from './types';

/** Single source of truth for status labels and semantic tones. Internal values
 * (stored data, query params such as `status=agendada`) never change here. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'ai';
export type StatusPresentation = { label: string; tone: StatusTone };

export const appointmentStatusPresentation: Record<AppointmentStatus, StatusPresentation> = {
  agendada: { label: 'A confirmar', tone: 'warning' },
  confirmada: { label: 'Confirmada', tone: 'info' },
  realizada: { label: 'Realizada', tone: 'success' },
  falta: { label: 'Falta', tone: 'danger' },
  cancelada: { label: 'Cancelada', tone: 'neutral' },
};

export const conversationStatusPresentation: Record<ConversationStatus, StatusPresentation> = {
  aguardando: { label: 'Aguardando atendente', tone: 'warning' },
  humano: { label: 'Com atendente', tone: 'info' },
  ia: { label: 'Com IA', tone: 'ai' },
  encerrada: { label: 'Encerrada', tone: 'neutral' },
};

const pick = <K extends string>(source: Record<K, StatusPresentation>, field: keyof StatusPresentation) =>
  Object.fromEntries(Object.entries(source).map(([key, value]) => [key, (value as StatusPresentation)[field]])) as Record<K, string>;

export const appointmentStatusLabels = pick(appointmentStatusPresentation, 'label');
export const appointmentStatusTones = pick(appointmentStatusPresentation, 'tone') as Record<AppointmentStatus, StatusTone>;
export const conversationStatusLabels = pick(conversationStatusPresentation, 'label') as Record<ConversationStatus, string>;
export const conversationStatusTones = pick(conversationStatusPresentation, 'tone') as Record<ConversationStatus, StatusTone>;
