import type { DataSource } from '../data/data-source';
import { createDemoState } from '../demo-data';
import { CommandError } from '../errors';
import { isDemoState, upgradeStoredState } from '../state-validation';
import type { DemoState } from '../types';
import { runDemoCommand } from './demo-adapter';

export const DEMO_STORAGE_KEY = 'clinia.demo.v1';

function save(state: DemoState): void {
  try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state)); }
  catch {
    throw new CommandError('unavailable', 'O navegador não permitiu salvar a demonstração local. Libere o armazenamento ou espaço e tente novamente; a alteração não foi aplicada.', 'storage');
  }
}

/** The demo's data source: one validated snapshot in `localStorage`, commands run by the
 * demo adapter (latency, simulated failures, delivery reports and AI replies). */
export const localDemoSource: DataSource = {
  async load() {
    let state = createDemoState();
    try {
      const serialized = window.localStorage.getItem(DEMO_STORAGE_KEY);
      if (!serialized) { save(state); return { state }; }
      const stored: unknown = JSON.parse(serialized);
      const upgraded = upgradeStoredState(stored);
      if (!isDemoState(stored)) throw new Error('Formato ou versão incompatível.');
      state = stored;
      if (upgraded) save(state);
      return { state };
    } catch {
      return { state, warning: 'Não foi possível carregar os dados salvos. Uma base inicial foi aberta. Use “Restaurar demonstração” para recuperar a persistência.' };
    }
  },
  async execute(state, command) {
    const next = await runDemoCommand(state, command);
    save(next);
    return next;
  },
  async reset() {
    const state = createDemoState();
    save(state);
    return state;
  },
  async switchUser(state, userId) {
    if (!state.users.some(user => user.id === userId)) return state;
    const next = { ...state, currentUserId: userId };
    save(next);
    return next;
  },
};
