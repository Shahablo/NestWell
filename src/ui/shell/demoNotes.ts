/**
 * "Show demo notes" admin toggle. Stored per browser under nestwell.demoNotes; read through
 * useSyncExternalStore so every DemoNote re-renders when the admin flips it.
 */
import { useSyncExternalStore } from 'react';

export const DEMO_NOTES_KEY = 'nestwell.demoNotes';

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function read(): boolean {
  if (cached !== null) return cached;
  try {
    cached = window.localStorage.getItem(DEMO_NOTES_KEY) === 'on';
  } catch {
    cached = false;
  }
  return cached;
}

export function getDemoNotes(): boolean {
  return read();
}

export function setDemoNotes(on: boolean): void {
  cached = on;
  try {
    window.localStorage.setItem(DEMO_NOTES_KEY, on ? 'on' : 'off');
  } catch {
    // Storage may be unavailable; the in-memory value still drives this session.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDemoNotes(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
