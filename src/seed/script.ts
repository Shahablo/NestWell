/**
 * The scripting model. A persona's history is a list of timed steps; each step runs one command
 * through the SeedRunner as a realistic actor (patient, coordinator, clinician, partner, admin),
 * so seeded history and live actions are indistinguishable (NFR-11). A branch runs its steps in
 * time order, which keeps the runner's clock monotonic (store.ts) and lets several personas be
 * merged into one branch (all_personas) by sorting their steps together.
 */
import { toMs } from '../domain/clock';
import type { SeedRunner } from '../domain/store';
import type { Actor, ISO } from '../domain/types';

export interface Step {
  at: ISO;
  label: string;
  run: (r: SeedRunner) => void;
}

export const step = (at: ISO, label: string, run: (r: SeedRunner) => void): Step => ({ at, label, run });

/** Actors. Staff ids are the ones ARCHITECTURE section 4 promises in config/practice.json. */
export const COORD: Actor = { type: 'staff', role: 'coordinator', id: 'coord-1' };
export const CLINICIAN: Actor = { type: 'staff', role: 'clinician', id: 'ob-1' };
export const PARTNER: Actor = { type: 'partner', role: 'referral_partner', id: 'partner-1' };
export const PATIENT: Actor = { type: 'patient', role: 'patient' };
export const ADMIN: Actor = { type: 'admin', role: 'admin' };

/** Steps from several lists in time order; equal instants keep list order (stable). */
export function mergeSteps(...lists: Step[][]): Step[] {
  return lists
    .flat()
    .map((s, i) => ({ s, i }))
    .sort((a, b) => toMs(a.s.at) - toMs(b.s.at) || a.i - b.i)
    .map((x) => x.s);
}

export function runSteps(r: SeedRunner, steps: Step[]): void {
  for (const s of mergeSteps(steps)) {
    r.at(s.at);
    try {
      s.run(r);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`seed step "${s.label}" at ${s.at}: ${message}`);
    }
  }
}
