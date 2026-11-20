'use client';

import { useCallback, useState } from 'react';
import { isCommandError } from '@/lib/errors';
import { errorMessage } from '@/lib/format';

/** The busy / error / success lifecycle of one user action (a save, a removal…).
 * `run` clears the previous feedback, awaits the task and resolves to whether it
 * succeeded; a thrown error becomes `error` and the form keeps its values. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  /** The input the last error is about (`CommandError.field`), to mark it invalid. */
  const [field, setField] = useState<string | undefined>();
  const run = useCallback(async (task: () => Promise<unknown>, successMessage = ''): Promise<boolean> => {
    setBusy(true); setError(''); setSuccess(''); setField(undefined);
    try {
      await task();
      setSuccess(successMessage);
      return true;
    } catch (cause) {
      setError(errorMessage(cause));
      setField(isCommandError(cause) ? cause.field : undefined);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  const clear = useCallback(() => { setError(''); setSuccess(''); setField(undefined); }, []);
  return { busy, error, field, success, run, clear, setSuccess };
}
