/**
 * useApp(): the store (public methods + snapshot) plus the few shell-level helpers every
 * screen needs. Screens read `state`, `clock`, `role`, `config`, `content`, `events` and call
 * `dispatch`, `setClock`, `reset`, `getBranches` straight off the returned object.
 *
 * The store binding comes from `bindStore` in store.ts (every public method bound to the
 * real instance, so mutating calls re-render); this hook only adds the practice-timezone
 * formatting helpers.
 */
import { useContext, useMemo, useSyncExternalStore } from 'react';
import { formatDateTime, formatTime } from '../../domain/clock';
import { StoreContext, bindStore, type PublicStore, type StoreSnapshot } from '../../domain/store';
import type { ISO } from '../../domain/types';

export type { PublicStore };

export interface AppExtras {
  timezone: string;
  fmt: (iso: ISO, opts?: { withTime?: boolean }) => string;
  fmtTime: (iso: ISO) => string;
}

export type AppStore = PublicStore & StoreSnapshot & AppExtras;

export function useApp(): AppStore {
  const real = useContext(StoreContext);
  if (!real) throw new Error('useApp must be used inside <StoreContext.Provider>');
  const snap = useSyncExternalStore(real.subscribe, real.getSnapshot, real.getSnapshot);
  const bound = bindStore(real);
  const timezone = real.config.practice.timezone;
  const extras = useMemo<AppExtras>(
    () => ({
      timezone,
      fmt: (iso, opts) => formatDateTime(iso, timezone, opts),
      fmtTime: (iso) => formatTime(iso, timezone),
    }),
    [timezone],
  );
  return useMemo<AppStore>(() => ({ ...bound, ...snap, ...extras }), [bound, snap, extras]);
}
