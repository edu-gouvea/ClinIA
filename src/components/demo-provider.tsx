'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createDemoState } from '@/lib/demo-data';
import { runCommand } from '@/lib/services';
import { isDemoState } from '@/lib/state-validation';
import type { Command, DemoState } from '@/lib/types';

export const DEMO_STORAGE_KEY = 'clinia.demo.v1';
type DemoContextValue = { state: DemoState; ready: boolean; error: string | null; act: (command: Command) => Promise<void>; reset: () => Promise<void> };
// Holds the live value plus the value the server rendered. Stored data can load
// before a nested Suspense boundary finishes hydrating; consumers then hydrate with
// the server value (matching the HTML) and re-render with live data right after.
const DemoContext = createContext<{ live: DemoContextValue; server: DemoContextValue } | null>(null);
const noopSubscribe = () => () => {};

export function DemoProvider({ children }: { children: ReactNode }) {
  // A stable initial value is never presented as loaded data. Browser storage is read after hydration.
  const [initialState] = useState<DemoState>(() => createDemoState('2026-11-09'));
  const [state, setState] = useState<DemoState>(initialState);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(state);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    // Swapping the seed for stored data changes the context. A Suspense boundary
    // whose HTML is still streaming (common in `next dev`) would then be
    // client-rendered and the late server segment left behind as a hidden
    // duplicate. Wait until the document has fully arrived before loading.
    const load = () => { timeout = setTimeout(() => {
      if (!mounted) return;
      // Let streamed routes finish hydrating before replacing the initial shell.
      startTransition(() => {
        let initial = createDemoState();
        try {
          const serialized = window.localStorage.getItem(DEMO_STORAGE_KEY);
          if (serialized) {
            const stored: unknown = JSON.parse(serialized);
            if (!isDemoState(stored)) throw new Error('Formato ou versão incompatível.');
            initial = stored;
          } else window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(initial));
        } catch {
          setError('Não foi possível carregar os dados salvos. Uma base inicial foi aberta. Use “Restaurar demonstração” para recuperar a persistência.');
        }
        current.current = initial;
        setState(initial);
        setReady(true);
      });
    }, 80); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
    else load();
    return () => { mounted = false; clearTimeout(timeout); document.removeEventListener('DOMContentLoaded', load); };
  }, []);

  const persist = useCallback((next: DemoState) => {
    try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('O navegador não permitiu salvar a demonstração local. Libere o armazenamento ou espaço e tente novamente; a alteração não foi aplicada.'); }
    current.current = next;
    setState(next);
    setError(null);
  }, []);

  const act = useCallback((command: Command): Promise<void> => {
    const result = queue.current.catch(() => undefined).then(async () => {
      try { persist(await runCommand(current.current, command)); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : 'Não foi possível concluir a alteração. Tente novamente.';
        setError(message);
        throw cause;
      }
    });
    queue.current = result;
    return result;
  }, [persist]);

  const reset = useCallback((): Promise<void> => {
    const result = queue.current.catch(() => undefined).then(() => {
      try { persist(createDemoState()); }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível restaurar. Tente novamente.'); throw cause; }
    });
    queue.current = result;
    return result;
  }, [persist]);

  const server = useMemo(() => ({ state: initialState, ready: false, error: null, act, reset }), [initialState, act, reset]);
  const value = useMemo(() => ({ live: { state, ready, error, act, reset }, server }), [state, ready, error, act, reset, server]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  // false only while this component hydrates (React uses the server snapshot).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!value) throw new Error('useDemo deve ser usado dentro de DemoProvider.');
  return hydrated ? value.live : value.server;
}
