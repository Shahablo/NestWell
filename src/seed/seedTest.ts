/**
 * Helpers for the scenario end-to-end tests: seed a branch into an in-memory store built on the
 * REAL config and content (fallback mode, AI off), optionally with a config mutation, and read
 * the projected state at any clock.
 */
import { loadConfig } from '../domain/config';
import type { AppConfig } from '../domain/config.schema';
import { NestWellStore } from '../domain/store';
import { memoryStorage } from '../domain/testutil';
import type { AnyEvent, Checkin, DerivedEvent, Episode, Id, ISO, QueueItem, QueueKey, State } from '../domain/types';
import { local, seedEnv } from './env';
import { SCENARIO_BRANCHES } from './index';

export const LOADED = loadConfig();

/** The clock a branch opens at (the store's own clock moves as tests read state at other instants). */
export const opening = (store: NestWellStore): ISO => SCENARIO_BRANCHES[store.getBranch()].clock;

/** A wall-clock instant in the practice timezone: t('2026-04-14', 19, 30). */
export const t = (date: string, hour: number, minute = 0): ISO => local(seedEnv(), date, hour, minute);

/** A store over the shipped config (mutated by `mutate` when given), reseeded with `branch`. */
export function seedStore(branch: string, mutate?: (c: AppConfig) => void): NestWellStore {
  const config = mutate ? mutated(mutate) : LOADED.config;
  const store = new NestWellStore(config, LOADED.content, SCENARIO_BRANCHES, memoryStorage());
  store.reseed(branch);
  return store;
}

function mutated(mutate: (c: AppConfig) => void): AppConfig {
  const c = structuredClone(LOADED.config);
  mutate(c);
  return c;
}

/** The state at a clock (moves the store's clock). */
export function stateAt(store: NestWellStore, clock: ISO): State {
  store.setClock(clock);
  return store.getState();
}

export function episodeFor(state: State, patient_id: Id): Episode {
  const eps = Object.values(state.episodes).filter((e) => e.patient_id === patient_id);
  const ep = eps.find((e) => e.closed_at === null) ?? eps[eps.length - 1];
  if (!ep) throw new Error(`no episode for ${patient_id}`);
  return ep;
}

export function itemsFor(state: State, episode_id: Id, queue_key?: QueueKey): QueueItem[] {
  return Object.values(state.queueItems).filter((q) => q.episode_id === episode_id && (!queue_key || q.queue_key === queue_key)).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function checkinFor(state: State, episode_id: Id, day: number): Checkin {
  const c = Object.values(state.checkins).find((x) => x.episode_id === episode_id && x.day_number === day);
  if (!c) throw new Error(`no day-${day} check-in for ${episode_id}`);
  return c;
}

export function checkinsFor(state: State, episode_id: Id): Checkin[] {
  return Object.values(state.checkins).filter((x) => x.episode_id === episode_id).sort((a, b) => a.day_number - b.day_number);
}

export function derivedFor(state: State, episode_id: Id, type: DerivedEvent['type']): DerivedEvent[] {
  return state.derivedEvents.filter((d) => d.episode_id === episode_id && d.type === type);
}

export function eventsOf<T extends AnyEvent['type']>(events: readonly AnyEvent[], type: T, episode_id?: Id): Array<Extract<AnyEvent, { type: T }>> {
  return events.filter((e): e is Extract<AnyEvent, { type: T }> => e.type === type && (!episode_id || e.episode_id === episode_id));
}

/** The comparable form of a log for the determinism test (NFR-04, FR-48): wall time, event ids and the session id removed. */
export function comparableLog(events: readonly AnyEvent[]): Array<Omit<AnyEvent, 'id' | 'wall_at' | 'demo_session_id'>> {
  return events.map((e) => {
    const { id: _id, wall_at: _wall, demo_session_id: _session, ...rest } = e;
    return rest;
  });
}

/** Minutes in the practice timezone as "HH:MM" for readable assertions. */
export function localTime(iso: ISO): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: LOADED.config.practice.timezone, hour12: false, hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}
