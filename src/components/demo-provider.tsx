'use client';

import { createContext, startTransition, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createDemoState } from '@/lib/demo-data';
import { runCommand } from '@/lib/services';
import { isDemoState } from '@/lib/state-validation';
import type { Command, DemoState } from '@/lib/types';

export const DEMO_STORAGE_KEY = 'clinia.demo.v1';
type DemoContextValue = { state: DemoState; ready: boolean; error: string | null; act: (command: Command) => Promise<void>; reset: () => Promise<void> };
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  // A stable initial value is never presented as loaded data. Browser storage is read after hydration.
  const [state, setState] = useState<DemoState>(() => createDemoState('2026-11-09'));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef(state);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let mounted = true;
    const timeout = setTimeout(() => {
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
    }, 80);
    return () => { mounted = false; clearTimeout(timeout); };
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

  return <DemoContext.Provider value={{ state, ready, error, act, reset }}>{children}</DemoContext.Provider>;
}

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error('useDemo deve ser usado dentro de DemoProvider.');
  return value;
}
