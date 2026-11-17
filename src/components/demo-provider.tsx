'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createDemoState } from '@/lib/demo-data';
import type { DataSource } from '@/lib/data/data-source';
import { localDemoSource } from '@/lib/demo/local-source';
import { setClinicTimeZone } from '@/lib/date';
import { CommandError, isCommandError } from '@/lib/errors';
import type { Command, DemoState } from '@/lib/types';

export { DEMO_STORAGE_KEY } from '@/lib/demo/local-source';
type DemoContextValue = {
  state: DemoState; ready: boolean; error: string | null; act: (command: Command) => Promise<void>; reset: () => Promise<void>;
  /** Demo only: act as another fictitious user (stands in for signing in). */
  switchUser: (userId: string) => Promise<void>;
};
// Holds the live value plus the value the server rendered. Stored data can load
// before a nested Suspense boundary finishes hydrating; consumers then hydrate with
// the server value (matching the HTML) and re-render with live data right after.
const DemoContext = createContext<{ live: DemoContextValue; server: DemoContextValue } | null>(null);
const noopSubscribe = () => () => {};

export function DemoProvider({ children, source = localDemoSource }: { children: ReactNode; source?: DataSource }) {
  // A stable initial value is never presented as loaded data: the source is read after hydration.
  const [initialState] = useState<DemoState>(() => createDemoState('2026-11-09'));
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(state);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // Swapping the seed for loaded data changes the context. A Suspense boundary
    // whose HTML is still streaming (common in `next dev`) would then be
    // client-rendered and the late server segment left behind as a hidden
    // duplicate. Wait until the document has fully arrived before loading.
    const load = () => { timeout = setTimeout(() => {
      void source.load().then(({ state: loaded, warning }) => {
        if (!mounted) return;
        // Let streamed routes finish hydrating before replacing the initial shell.
        startTransition(() => {
          if (warning) setError(warning);
          setClinicTimeZone(loaded.clinic.timezone);
          current.current = loaded;
          setState(loaded);
          setReady(true);
        });
      });
    }, 80); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
    else load();
    return () => { mounted = false; clearTimeout(timeout); document.removeEventListener('DOMContentLoaded', load); };
  }, [source]);

  /** Runs one change at a time, in order. Command errors go back to the caller, which shows
   * them next to the form; only a storage/transport failure is global (every screen). */
  const enqueue = useCallback((task: (state: DemoState) => Promise<DemoState>): Promise<void> => {
    const result = queue.current.catch(() => undefined).then(async () => {
      try {
        const next = await task(current.current);
        current.current = next;
        setState(next);
        setError(null);
      } catch (cause) {
        if (isCommandError(cause) && cause.field === 'storage') setError(cause.message);
        throw cause;
      }
    });
    queue.current = result;
    return result;
  }, []);

  const act = useCallback((command: Command) => enqueue(state => source.execute(state, command)), [enqueue, source]);
  const reset = useCallback(() => enqueue(() => source.reset ? source.reset() : Promise.reject(new CommandError('forbidden', 'Restaurar não está disponível.'))), [enqueue, source]);
  const switchUser = useCallback((userId: string) => enqueue(state => source.switchUser ? source.switchUser(state, userId) : Promise.resolve(state)), [enqueue, source]);

  const server = useMemo(() => ({ state: initialState, ready: false, error: null, act, reset, switchUser }), [initialState, act, reset, switchUser]);
  const value = useMemo(() => ({ live: { state, ready, error, act, reset, switchUser }, server }), [state, ready, error, act, reset, switchUser, server]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  // false only while this component hydrates (React uses the server snapshot).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!value) throw new Error('useDemo deve ser usado dentro de DemoProvider.');
  return hydrated ? value.live : value.server;
}
