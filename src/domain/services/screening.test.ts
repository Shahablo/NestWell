import { describe, expect, it } from 'vitest';
import { makeTestConfig, makeTestContent, makeTestStore } from '../testutil';
import { CLINICIAN, COORD, PATIENT, dayAt, enrolled, itemsIn } from '../testflows';
import { DomainError } from './errors';
import { CRITICAL_WITHHELD_NOTE, SHARING_WITHHELD_NOTICE, administerScreen, readScreen, score, sharedWithFor, visibleScreenFor } from './screening';

const epds = makeTestConfig().instruments.epds;
const zeros = Array(10).fill(0);

describe('score (FR-29)', () => {
  it('scores per option so reverse-scored EPDS items count correctly', () => {
    // Items 1, 2, 4 are forward (0..3); the rest are reverse (3..0). All first options: 0+0+0 + 7×3 = 21.
    expect(score(epds, zeros)).toEqual({ score: 21, positive: true, critical_item_hit: true });
    // All last options: 3+3+3 + 7×0 = 9, below the placeholder threshold; item 10 scores 0 → no critical hit.
    expect(score(epds, Array(10).fill(3))).toEqual({ score: 9, positive: false, critical_item_hit: false });
    // Critical item alone: low total but the self-harm item is answered.
    expect(score(epds, [3, 3, 3, 3, 3, 3, 3, 3, 3, 2])).toEqual({ score: 10, positive: true, critical_item_hit: true });
    // Item 3 is reverse-scored: first option = 3; item 10 third option = 1.
    expect(score(epds, [0, 0, 0, 0, 3, 3, 3, 3, 3, 2])).toEqual({ score: 4, positive: false, critical_item_hit: true });
  });
  it('rejects a wrong number of responses or an option out of range', () => {
    expect(() => score(epds, [0, 1])).toThrow(DomainError);
    expect(() => score(epds, [...zeros.slice(0, 9), 7])).toThrow(DomainError);
  });
  it('maps sharing categories to roles', () => {
    expect(sharedWithFor('clinician_only')).toEqual(['clinician']);
    expect(sharedWithFor('clinician_and_coordinator')).toEqual(['clinician', 'coordinator']);
    expect(sharedWithFor('clinician_coordinator_partner')).toEqual(['clinician', 'coordinator', 'referral_partner']);
    expect(sharedWithFor('nobody_yet')).toEqual([]);
  });
});

describe('administerScreen routing (FR-06, FR-30, FR-30a)', () => {
  const positiveNoCritical = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3]; // 3×0 forward + 6×3 reverse + item10 option 3 (score 0) = 18
  const lowCritical = [3, 3, 3, 3, 3, 3, 3, 3, 3, 2]; // 9 + 1 = 10 → positive too; use a lower one below
  const lowCriticalOnly = [0, 0, 0, 3, 3, 3, 3, 3, 3, 2]; // 0 + 0 + 1 = 1, critical hit

  it('a threshold positive shared with clinician and coordinator creates exactly one Needs-review item', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { preferences: { sharing_category: 'clinician_and_coordinator' } } });
    store.setClock(dayAt(14, 10));
    const events = store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: positiveNoCritical }), PATIENT);
    const items = itemsIn(store, 'needs_review', episode_id);
    expect(items).toHaveLength(1);
    expect(items[0].trigger_type).toBe('positive_screen');
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(0);
    const fired = events.filter((e) => e.type === 'rule_fired');
    expect(fired).toHaveLength(1);
    expect(fired[0].type === 'rule_fired' && fired[0].payload.queue_item_id).toBe(items[0].id);
    const screen = Object.values(store.getState().screens)[0];
    expect(screen.shared_with).toEqual(['clinician', 'coordinator']);
    expect(visibleScreenFor(store.getState(), screen, 'coordinator').visible).toBe(true);
    expect(visibleScreenFor(store.getState(), screen, 'referral_partner').visible).toBe(false);
    expect(visibleScreenFor(store.getState(), screen, 'budget_owner').visible).toBe(false);
    void lowCritical;
  });

  it('sharing withheld: no queue item for a threshold positive, coordinator cannot see it, re-asked exactly once', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { preferences: { sharing_category: 'nobody_yet' } } });
    store.setClock(dayAt(14, 10));
    const events = store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: positiveNoCritical }), PATIENT);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(0);
    expect(events.filter((e) => e.type === 'queue_item_created')).toHaveLength(0);
    expect(events.some((e) => e.type === 'rule_fired' && e.payload.queue_item_id === null)).toBe(true);
    const reask = events.find((e) => e.type === 'sharing_reasked');
    expect(reask && reask.type === 'sharing_reasked' && reask.payload.count).toBe(1);
    const screen = Object.values(store.getState().screens)[0];
    const coordinator = visibleScreenFor(store.getState(), screen, 'coordinator');
    expect(coordinator).toMatchObject({ visible: false, score: null, items: null, withheld_notice: SHARING_WITHHELD_NOTICE });
    expect(visibleScreenFor(store.getState(), screen, 'clinician').visible).toBe(false);
    expect(visibleScreenFor(store.getState(), screen, 'admin')).toMatchObject({ visible: true, score: 18, admin_override: true });
    expect(visibleScreenFor(store.getState(), screen, 'patient').visible).toBe(true);
    expect(() => store.dispatch(readScreen({ screen_result_id: screen.id, field: 'screen_items' }), COORD)).toThrow(DomainError);
    store.setClock(dayAt(42, 10));
    const second = store.dispatch(administerScreen({ episode_id, instrument_key: 'phq9', item_responses: Array(9).fill(0) }), PATIENT);
    expect(second.some((e) => e.type === 'sharing_reasked')).toBe(false);
  });

  it('FR-30a override on: critical item with sharing withheld creates the Urgent item with the placeholder note and shared: true', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { preferences: { sharing_category: 'nobody_yet' } } });
    store.setClock(dayAt(14, 10));
    const events = store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: lowCriticalOnly }), PATIENT);
    const urgent = itemsIn(store, 'urgent', episode_id);
    expect(urgent).toHaveLength(1);
    expect(urgent[0].note).toBe(CRITICAL_WITHHELD_NOTE);
    expect(urgent[0].trigger_type).toBe('critical_item');
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    const hit = events.find((e) => e.type === 'critical_item_hit');
    expect(hit && hit.type === 'critical_item_hit' && hit.payload.shared).toBe(true);
    expect(events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen')).toBe(true);
    expect(events.some((e) => e.type === 'help_requested' && e.payload.source === 'critical_item')).toBe(true);
    expect(events.filter((e) => e.type === 'rule_fired').map((e) => e.type === 'rule_fired' && e.payload.rule_key)).toEqual(['critical_item']);
    expect(events.filter((e) => e.type === 'queue_item_created')).toHaveLength(1);
  });

  it('FR-30a override off: no queue item, the instruction still shows, critical_item_hit carries shared: false', () => {
    const config = makeTestConfig((c) => { c.freetext.critical_item_overrides_sharing = false; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store, { patient: { preferences: { sharing_category: 'nobody_yet' } } });
    store.setClock(dayAt(14, 10));
    const events = store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: lowCriticalOnly }), PATIENT);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(0);
    expect(events.filter((e) => e.type === 'queue_item_created')).toHaveLength(0);
    const hit = events.find((e) => e.type === 'critical_item_hit');
    expect(hit && hit.type === 'critical_item_hit' && hit.payload.shared).toBe(false);
    expect(events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen')).toBe(true);
    expect(events.some((e) => e.type === 'help_requested')).toBe(false);
  });

  it('a shared critical item creates one Urgent item and a low score creates nothing else', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(14, 10));
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: lowCriticalOnly }), PATIENT);
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(1);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    const screen = Object.values(store.getState().screens)[0];
    store.dispatch(readScreen({ screen_result_id: screen.id, field: 'screen_items' }), CLINICIAN);
    expect(store.getState().readRecords).toHaveLength(1);
    expect(store.getState().readRecords[0].role).toBe('clinician');
    expect(store.getState().episodes[episode_id].indicated).toBe(true);
  });
});
