/**
 * Runs a domain command as the active staff user and captures a DomainError as a message for
 * the form instead of letting it reach the error boundary. Every practice action goes through
 * store.dispatch, which stamps the current role and staff user as the actor.
 */
import { useCallback, useState } from 'react';
import { DomainError } from '../../domain/services';
import type { Command } from '../../domain/types';
import { useApp } from '../shell/useApp';

export interface StaffAction {
  run: (command: Command) => boolean;
  error: string | null;
  clear: () => void;
}

export function useStaffAction(): StaffAction {
  const { dispatch } = useApp();
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    (command: Command): boolean => {
      try {
        dispatch(command);
        setError(null);
        return true;
      } catch (err) {
        if (err instanceof DomainError) setError(err.message);
        else setError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [dispatch],
  );
  const clear = useCallback(() => setError(null), []);
  return { run, error, clear };
}

export function parseMinutes(value: string): number | null {
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}
