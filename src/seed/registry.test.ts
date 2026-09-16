/**
 * SEED: the branch registry as a whole. Every branch seeds through the services without a
 * DomainError, the default branch carries all seven personas at a spread of days, and two
 * reseeds of the same branch produce identical logs apart from wall time and ids (NFR-04, FR-48).
 */
import { describe, expect, it } from 'vitest';
import { dayNumber } from '../domain/clock';
import { DEFAULT_BRANCH, DEFAULT_CLOCK } from '../domain/store';
import { BRANCH_KEYS, SCENARIO_BRANCHES } from './index';
import { LOADED, comparableLog, episodeFor, seedStore, stateAt } from './seedTest';

describe('scenario branch registry', () => {
  it('registers the default branch and one branch per scenario and variant named in section 6', () => {
    expect(LOADED.problems).toEqual([]);
    expect(BRANCH_KEYS).toContain(DEFAULT_BRANCH);
    expect(BRANCH_KEYS).toEqual([
      'all_personas',
      'dana', 'dana_late_enrollment',
      'priya', 'priya_declined_screen', 'priya_sharing_withheld', 'priya_critical_withheld', 'priya_referral_declined', 'priya_escalated_then_acknowledged',
      'marisol', 'marisol_after_hours',
      'elena',
      'keisha', 'keisha_paused',
      'lucia_blocked', 'lucia_enrolled',
      'tamsin_scan_off', 'tamsin_scan_on',
    ]);
    for (const b of Object.values(SCENARIO_BRANCHES)) {
      expect(b.key, b.key).toBe(Object.keys(SCENARIO_BRANCHES).find((k) => SCENARIO_BRANCHES[k] === b));
      expect(b.label.length).toBeGreaterThan(0);
      expect(b.description.length).toBeGreaterThan(20);
      expect(b.scenario).toMatch(/^6\.\d/);
      expect(Number.isNaN(Date.parse(b.clock)), `${b.key} clock`).toBe(false);
    }
    expect(SCENARIO_BRANCHES.all_personas.clock).toBe(DEFAULT_CLOCK);
  });

  it.each(BRANCH_KEYS)('branch %s seeds through the services without error and opens at its clock', (key) => {
    const store = seedStore(key);
    expect(store.getBranch()).toBe(key);
    expect(store.getClock()).toBe(SCENARIO_BRANCHES[key].clock);
    const events = store.getEvents();
    expect(events.length).toBeGreaterThan(5);
    expect(events[events.length - 1].type).toBe('demo_session_reset');
    // Every stored event was written by a service as a realistic actor; only the reset is admin bookkeeping.
    expect(events.every((e) => e.actor.type !== 'seed')).toBe(true);
    // Log order is time order within a branch (monotonic virtual clock).
    for (let i = 1; i < events.length; i++) expect(Date.parse(events[i].occurred_at) >= Date.parse(events[i - 1].occurred_at), `event ${i} ${events[i].type}`).toBe(true);
    expect(() => store.getState()).not.toThrow();
  });

  it('all_personas carries the seven personas with delivery days spread between 5 and 84 at the default clock', () => {
    const store = seedStore('all_personas');
    const state = stateAt(store, DEFAULT_CLOCK);
    const keys = Object.values(state.patients).map((p) => p.persona_key).sort();
    expect(keys).toEqual(['dana', 'elena', 'keisha', 'lucia', 'marisol', 'priya', 'tamsin']);
    expect(Object.values(state.patients).every((p) => p.is_synthetic && p.is_adult)).toBe(true);
    const days: Record<string, number> = {};
    for (const ep of Object.values(state.episodes)) {
      const p = state.patients[ep.patient_id];
      days[p.persona_key ?? ep.patient_id] = dayNumber(ep.delivery_date ?? ep.expected_date ?? DEFAULT_CLOCK, DEFAULT_CLOCK);
    }
    expect(days).toEqual({ dana: 48, priya: 32, marisol: 13, elena: 19, keisha: 27, tamsin: 84 });
    expect(state.episodes[episodeFor(state, 'pt-tamsin').id].status).toBe('active');
    expect(state.eligibility['pt-lucia']).toMatchObject({ status: 'not_offered', reason: 'language_content_unavailable' });
    // Keisha was reached this morning: her Unreached item is resolved and her first contact is on day 27.
    const keisha = episodeFor(state, 'pt-keisha');
    expect(keisha.initial_contact_day).toBe(27);
    expect(keisha.initial_contact_met_target).toBe(false);
    // Locales, insurance and barriers cover the FR-50 breakdown rows.
    expect(state.patients['pt-lucia'].preferences.locale).toBe('es');
    expect(new Set(Object.values(state.patients).map((p) => p.insurance_type))).toEqual(new Set(['commercial', 'medicaid', 'uninsured']));
    expect(Object.values(state.patients).flatMap((p) => p.access_barriers).sort()).toEqual(['interpreter', 'phone_data', 'transport']);
  });

  it.each(BRANCH_KEYS)('branch %s is deterministic: two reseeds give the same log apart from wall time, ids and the session id', (key) => {
    const a = seedStore(key);
    const first = comparableLog(a.getEvents());
    a.reseed(key);
    const second = comparableLog(a.getEvents());
    expect(second.length).toBe(first.length);
    expect(second).toEqual(first);
    // A second store gives the same log too (no hidden state between stores).
    const b = seedStore(key);
    expect(comparableLog(b.getEvents())).toEqual(first);
  });
});
