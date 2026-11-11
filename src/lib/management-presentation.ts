import { getMetrics } from './metrics';
import type { DemoState, Metrics, Period, Professional } from './types';

export const managementSorts = ['name', 'planned', 'completed', 'availableMinutes', 'occupancy', 'cancelled', 'missed', 'absenceRate'] as const;
export type ManagementSort = typeof managementSorts[number];
export type ProfessionalMetrics = { professional: Professional; metrics: Metrics };

/** Match the aggregate's historical specialty scope, including changed/inactive
 * professionals. Missing rates stay last in either sorting direction. */
export function professionalMetrics(state: DemoState, period: Period, professionalId = '', specialty = '', sort: ManagementSort = 'completed', order: 'asc' | 'desc' = 'desc'): ProfessionalMetrics[] {
  return state.professionals.filter(p => (!professionalId || p.id === professionalId)
    && (!specialty || p.specialties.includes(specialty) || state.appointments.some(a => a.professionalId === p.id && a.specialty === specialty && a.date >= period.start && a.date <= period.end)))
    .map(professional => ({ professional, metrics: getMetrics(state, period, professional.id, specialty) }))
    .sort((a, b) => {
      const left = sort === 'name' ? a.professional.name : a.metrics[sort];
      const right = sort === 'name' ? b.professional.name : b.metrics[sort];
      if (left === null || right === null) return left === right ? a.professional.id.localeCompare(b.professional.id) : left === null ? 1 : -1;
      const delta = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right, 'pt-BR') : Number(left) - Number(right);
      return delta * (order === 'asc' ? 1 : -1) || a.professional.name.localeCompare(b.professional.name, 'pt-BR') || a.professional.id.localeCompare(b.professional.id);
    });
}
