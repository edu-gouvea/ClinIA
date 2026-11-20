import type { Command, DemoState } from '../types';

/** The one boundary between the screens and wherever the data lives. The provider only
 * talks to a `DataSource`; today that is `localDemoSource` (browser storage + simulated
 * actors), later an HTTP source that calls the ClinIA API. Swapping it changes no screen.
 *
 * Contract every implementation keeps:
 * - `execute` resolves with the new snapshot (the server's truth, never an optimistic
 *   guess) or rejects with a `CommandError` (`lib/errors`), never another error type;
 * - commands run one at a time per client (the provider queues them);
 * - a storage/transport failure that affects every screen uses `field: 'storage'`. */
export interface DataSource {
  /** First snapshot. `warning` explains a fallback (e.g. unreadable saved data). */
  load(): Promise<{ state: DemoState; warning?: string }>;
  execute(state: DemoState, command: Command): Promise<DemoState>;
  /** Demo only: start over from the fictitious base. */
  reset?(): Promise<DemoState>;
  /** Demo only: act as another fictitious user (stands in for signing in). */
  switchUser?(state: DemoState, userId: string): Promise<DemoState>;
}
