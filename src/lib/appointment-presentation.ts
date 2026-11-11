import type { AppointmentStatus } from './types';
export const appointmentStatusLabels: Record<AppointmentStatus, string> = { agendada: 'Agendada', confirmada: 'Confirmada', cancelada: 'Cancelada', realizada: 'Realizada', falta: 'Falta' };
export const appointmentStatusTones: Record<AppointmentStatus, 'green' | 'amber' | 'red' | 'gray' | 'blue'> = { agendada: 'amber', confirmada: 'blue', cancelada: 'gray', realizada: 'green', falta: 'red' };
