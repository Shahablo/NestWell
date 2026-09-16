/**
 * The store: an append-only event log plus a demo clock, projected into State on demand.
 *
 * - `dispatch(command)` runs a pure service function against the current projection and
 *   appends the events it returns (atomically — all or none), then re-projects.
 * - `setClock(iso)` re-projects without changing the log. Timer-driven transitions are
 *   derived from the clock inside project().
 * - `reseed(branch)` clears the log and replays a scenario branch through the same
 *   services at virtual times (NFR-11), so seeded history and live actions are the
 *   same kind of thing.
 * - Everything persists to localStorage; the whole demo lives in one browser.
 */
import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import type { AppConfig } from './config.schema';
import type { ContentIndex } from './content';
import { project } from './projection';
import type { Actor, AnyEvent, Command, CommandContext, DomainEvent, EventPayloads, EventType, ISO, Role, State } from './types';

export const STORAGE_KEY = 'nestwell.demo.v1';
export const DEFAULT_BRANCH = 'all_personas';
export const DEFAULT_CLOCK: ISO = '2026-04-20T15:00:00.000Z';

export interface ScenarioBranch {
  key: string;
  label: string;
  description: string;
  /** Requirement / scenario references, e.g. "6.2 Priya — sharing withheld variant". */
  scenario: string;
  /** Clock to jump to after seeding so the demo opens at the interesting moment. */
  clock: ISO;
  run: (runner: SeedRunner) => void;
}

/** Given to scenario scripts: advance virtual time and run commands through the services. */
export interface SeedRunner {
  /** Set the virtual "now" for subsequent commands. Must be monotonic within a branch. */
  at(iso: ISO): void;
  now(): ISO;
  run(command: Command, actor?: Actor): AnyEvent[];
  state(): State;
  nextId(prefix: string): string;
}

export interface Persisted {
  version: 1;
  events: AnyEvent[];
  clock: ISO;
  branch: string;
  idCounter: number;
  role: Role;
  staffUserId: string | null;
  demoParticipantMode: boolean;
  demoSessionId: string;
  /** How many events at the head of the log came from the scenario script (the rest are live actions). */
  seededCount?: number;
}

type Listener = () => void;

export class NestWellStore {
  private events: AnyEvent[] = [];
  private clock: ISO = DEFAULT_CLOCK;
  private branch = DEFAULT_BRANCH;
  private idCounter = 0;
  private role: Role = 'patient';
  private staffUserId: string | null = null;
  private demoParticipantMode = false;
  private demoSessionId = 'session-0001';
  /** Events [0, seededCount) are the scenario script; a live action may fork the script's future (see dispatch). */
  private seededCount = 0;
  private projected: State | null = null;
  private listeners = new Set<Listener>();
  private snapshotCache: StoreSnapshot | null = null;

  constructor(
    public readonly config: AppConfig,
    public readonly content: ContentIndex,
    private readonly branches: Record<string, ScenarioBranch>,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  ) {}

  // ---- lifecycle ---------------------------------------------------------

  /** Load persisted state or seed the default branch. */
  init(): void {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const p = JSON.parse(raw) as Persisted;
        if (p.version === 1 && Array.isArray(p.events)) {
          this.events = p.events;
          this.clock = p.clock;
          this.branch = p.branch;
          this.idCounter = p.idCounter;
          this.role = p.role;
          this.staffUserId = p.staffUserId;
          this.demoParticipantMode = p.demoParticipantMode;
          this.demoSessionId = p.demoSessionId;
          this.seededCount = typeof p.seededCount === 'number' ? Math.min(p.seededCount, this.events.length) : 0;
          this.invalidate();
          return;
        }
      } catch {
        // fall through to reseed
      }
    }
    this.reseed(this.branches[DEFAULT_BRANCH] ? DEFAULT_BRANCH : Object.keys(this.branches)[0]);
  }

  reseed(branchKey: string): void {
    const branch = this.branches[branchKey];
    if (!branch) throw new Error(`Unknown scenario branch: ${branchKey}`);
    this.events = [];
    this.idCounter = 0;
    this.branch = branchKey;
    this.demoSessionId = `session-${String(Date.now()).slice(-6)}`;
    this.projected = null;
    let virtualNow: ISO = branch.clock;
    const runner: SeedRunner = {
      at: (iso) => { virtualNow = iso; this.clock = iso; this.invalidate(); },
      now: () => virtualNow,
      run: (command, actor = { type: 'seed' }) => this.apply(command, virtualNow, actor),
      state: () => this.getState(),
      nextId: (prefix) => this.nextId(prefix),
    };
    branch.run(runner);
    this.events.push(this.makeEvent('demo_session_reset', { branch: branchKey }, { type: 'admin' }, virtualNow, {}));
    this.seededCount = this.events.length;
    this.clock = branch.clock;
    this.invalidate();
    this.persist();
    this.emit();
  }

  // ---- reads --------------------------------------------------------------

  getState(): State {
    if (this.projected) return this.projected;
    const next: State = project(this.events, this.clock, this.config, this.content);
    this.projected = next;
    return next;
  }

  getEvents(): AnyEvent[] { return this.events; }
  getClock(): ISO { return this.clock; }
  getBranch(): string { return this.branch; }
  getRole(): Role { return this.role; }
  getStaffUserId(): string | null { return this.staffUserId; }
  getDemoParticipantMode(): boolean { return this.demoParticipantMode; }
  getDemoSessionId(): string { return this.demoSessionId; }
  getBranches(): ScenarioBranch[] { return Object.values(this.branches); }

  // ---- writes -------------------------------------------------------------

  /**
   * Run a command at the current clock as the current role. Returns the events appended.
   *
   * NFR-11: a live action forks the scripted future for the patients it touches. A scenario branch
   * carries a persona's whole scripted history, including steps stamped after the branch's opening
   * clock, so that moving the clock forward reveals the scripted story. Once someone acts live on a
   * patient, her scripted events after the current clock are dropped: the live action is the story
   * from here, and moving the clock forward never replays a seeded acknowledgment, contact or resolution
   * over the one just performed (FR-38, FR-45). Other patients keep their scripts.
   */
  dispatch(command: Command, actorOverride?: Actor): AnyEvent[] {
    const actor: Actor = actorOverride ?? this.currentActor();
    const appended = this.apply(command, this.clock, actor);
    if (appended.length > 0) this.forkScriptedFuture(appended);
    this.persist();
    this.emit();
    return appended;
  }

  private forkScriptedFuture(appended: readonly AnyEvent[]): void {
    const patients = new Set<string>();
    const episodes = new Set<string>();
    for (const e of appended) {
      if (e.patient_id) patients.add(e.patient_id);
      if (e.episode_id) episodes.add(e.episode_id);
    }
    if ((patients.size === 0 && episodes.size === 0) || this.seededCount === 0) return;
    const T = Date.parse(this.clock);
    const scripted = this.events.slice(0, this.seededCount).filter((e) => {
      const touches = (e.patient_id !== null && patients.has(e.patient_id)) || (e.episode_id !== null && episodes.has(e.episode_id));
      return !(touches && Date.parse(e.occurred_at) > T);
    });
    if (scripted.length !== this.seededCount) {
      this.events = [...scripted, ...this.events.slice(this.seededCount)];
      this.seededCount = scripted.length;
      this.invalidate();
    }
  }

  setClock(iso: ISO): void {
    this.clock = iso;
    this.invalidate();
    this.persist();
    this.emit();
  }

  setRole(role: Role, staffUserId: string | null = null): void {
    this.role = role;
    this.staffUserId = staffUserId ?? this.defaultStaffUser(role);
    this.snapshotCache = null;
    this.persist();
    this.emit();
  }

  setDemoParticipantMode(on: boolean): void {
    this.demoParticipantMode = on;
    this.snapshotCache = null;
    this.persist();
    this.emit();
  }

  /** SR-12: wipe everything in this browser and reseed. */
  reset(branchKey: string = this.branch): void {
    this.storage?.removeItem(STORAGE_KEY);
    this.reseed(branchKey);
  }

  // ---- internals ----------------------------------------------------------

  private currentActor(): Actor {
    if (this.role === 'patient') return { type: 'patient', role: 'patient' };
    if (this.role === 'admin') return { type: 'admin', role: 'admin' };
    if (this.role === 'referral_partner') return { type: 'partner', role: 'referral_partner', id: this.staffUserId ?? undefined };
    return { type: 'staff', role: this.role, id: this.staffUserId ?? undefined };
  }

  private defaultStaffUser(role: Role): string | null {
    const u = this.config.practice.staff_users.find((s) => s.role === role);
    return u?.id ?? null;
  }

  private apply(command: Command, now: ISO, actor: Actor): AnyEvent[] {
    const ctx = this.makeContext(now, actor);
    const produced = command(ctx);
    if (produced.length === 0) return produced;
    this.events.push(...produced);
    this.invalidate();
    return produced;
  }

  private makeContext(now: ISO, actor: Actor): CommandContext {
    return {
      state: this.getState(),
      config: this.config,
      content: this.content,
      now,
      actor,
      demo_session_id: this.demoSessionId,
      nextId: (prefix) => this.nextId(prefix),
      makeEvent: (type, payload, opts = {}) => this.makeEvent(type, payload, actor, opts.occurred_at ?? now, opts),
    };
  }

  private makeEvent<T extends EventType>(
    type: T,
    payload: EventPayloads[T],
    actor: Actor,
    occurredAt: ISO,
    opts: { patient_id?: string | null; episode_id?: string | null; client_reported?: boolean },
  ): DomainEvent<T> {
    return {
      id: this.nextId('evt'),
      type,
      occurred_at: occurredAt,
      wall_at: new Date().toISOString(),
      actor,
      patient_id: opts.patient_id ?? null,
      episode_id: opts.episode_id ?? null,
      client_reported: opts.client_reported ?? false,
      demo_session_id: this.demoSessionId,
      payload,
    };
  }

  private nextId(prefix: string): string {
    this.idCounter += 1;
    return `${prefix}-${String(this.idCounter).padStart(5, '0')}`;
  }

  private invalidate(): void {
    this.projected = null;
    this.snapshotCache = null;
  }

  private persist(): void {
    if (!this.storage) return;
    const p: Persisted = {
      version: 1,
      events: this.events,
      clock: this.clock,
      branch: this.branch,
      idCounter: this.idCounter,
      role: this.role,
      staffUserId: this.staffUserId,
      demoParticipantMode: this.demoParticipantMode,
      demoSessionId: this.demoSessionId,
      seededCount: this.seededCount,
    };
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {
      // Storage may be unavailable (private mode). The demo keeps working in memory.
    }
  }

  // ---- React integration --------------------------------------------------

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StoreSnapshot => {
    if (!this.snapshotCache) {
      this.snapshotCache = {
        state: this.getState(),
        events: this.events,
        clock: this.clock,
        branch: this.branch,
        role: this.role,
        staffUserId: this.staffUserId,
        demoParticipantMode: this.demoParticipantMode,
        demoSessionId: this.demoSessionId,
      };
    }
    return this.snapshotCache;
  };

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

export interface StoreSnapshot {
  state: State;
  events: AnyEvent[];
  clock: ISO;
  branch: string;
  role: Role;
  staffUserId: string | null;
  demoParticipantMode: boolean;
  demoSessionId: string;
}

export const StoreContext = createContext<NestWellStore | null>(null);

/** The public surface of the store (keyof excludes private fields such as `events` and `clock`). */
export type PublicStore = Pick<NestWellStore, keyof NestWellStore>;

const boundStores = new WeakMap<NestWellStore, PublicStore>();

/**
 * Every public method bound to the real instance, so that `setClock`, `dispatch`, `reset` etc.
 * called on the object returned by useStore() mutate the store (and re-render) rather than a
 * detached copy.
 */
export function bindStore(store: NestWellStore): PublicStore {
  const cached = boundStores.get(store);
  if (cached) return cached;
  const out: Record<string, unknown> = {
    config: store.config,
    content: store.content,
    subscribe: store.subscribe,
    getSnapshot: store.getSnapshot,
  };
  let proto: object | null = Object.getPrototypeOf(store) as object | null;
  while (proto && proto !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === 'constructor' || name in out) continue;
      const value = (store as unknown as Record<string, unknown>)[name];
      if (typeof value === 'function') out[name] = (value as (...args: unknown[]) => unknown).bind(store);
    }
    proto = Object.getPrototypeOf(proto) as object | null;
  }
  const bound = out as unknown as PublicStore;
  boundStores.set(store, bound);
  return bound;
}

export function useStore(): PublicStore & StoreSnapshot {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreContext.Provider>');
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const bound = bindStore(store);
  return useMemo(() => ({ ...bound, ...snap }), [bound, snap]);
}
