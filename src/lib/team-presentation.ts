import { dateTime, minutes } from './date';
import { getMetrics } from './metrics';
import type { DemoState, Period } from './types';

export const teamSorts = ['name', 'planned', 'completed', 'occupancy', 'weeklyMinutes'] as const;
export type TeamSort = typeof teamSorts[number];
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();

/** Roster filters describe current registration; operational rates retain the
 * existing period/capacity calculations, including historical snapshots. */
export function teamRoster(state: DemoState, period: Period, query = '', specialty = '', active = '', sort: TeamSort = 'name', order: 'asc' | 'desc' = 'asc') {
  return state.professionals.filter(p => (!query || normalize(p.name).includes(normalize(query))) && (!specialty || p.specialties.includes(specialty)) && (!active || (active === 'active' ? p.active : !p.active)))
    .map(professional => ({
      professional, metrics: getMetrics(state, period, professional.id),
      weeklyMinutes: professional.availability.reduce((sum, slot) => sum + minutes(slot.end) - minutes(slot.start), 0),
      future: state.appointments.filter(a => a.professionalId === professional.id && ['agendada', 'confirmada'].includes(a.status) && new Date(dateTime(a.date, a.start)).getTime() >= new Date(state.now).getTime()).length,
    })).sort((a, b) => {
      const left = sort === 'name' ? a.professional.name : sort === 'weeklyMinutes' ? a.weeklyMinutes : a.metrics[sort];
      const right = sort === 'name' ? b.professional.name : sort === 'weeklyMinutes' ? b.weeklyMinutes : b.metrics[sort];
      if (left === null || right === null) return left === right ? a.professional.id.localeCompare(b.professional.id) : left === null ? 1 : -1;
      const delta = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right, 'pt-BR') : Number(left) - Number(right);
      return delta * (order === 'asc' ? 1 : -1) || a.professional.name.localeCompare(b.professional.name, 'pt-BR') || a.professional.id.localeCompare(b.professional.id);
    });
}
