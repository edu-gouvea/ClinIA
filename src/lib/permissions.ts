import type { AccessLevel, DemoState, DemoUser } from './types';

/** What each access level may do. The reception (attendant) runs the day: conversations,
 * agenda, blocks and patients. Management screens and clinic-wide settings belong to the
 * administrator. The server enforces the same table; the UI only hides what would fail. */
export type Permission =
  | 'reports.view'   // Visão gerencial
  | 'team.manage'    // Equipe: professionals, availability, attendants' activity
  | 'clinic.manage'  // Configurações: clinic record, hours, knowledge base
  | 'demo.tools';    // Restore / failure injection (demo only)

const grants: Record<AccessLevel, Permission[]> = {
  admin: ['reports.view', 'team.manage', 'clinic.manage', 'demo.tools'],
  attendant: [],
};

export const can = (user: Pick<DemoUser, 'access'> | undefined, permission: Permission) => !!user && grants[user.access].includes(permission);
export const currentUser = (state: DemoState) => state.users.find(user => user.id === state.currentUserId);

/** Permission required by each management route (the others are open to everyone). */
export const routePermissions: Record<string, Permission> = {
  '/gestao/visao-gerencial': 'reports.view',
  '/gestao/equipe': 'team.manage',
  '/gestao/configuracoes': 'clinic.manage',
};
