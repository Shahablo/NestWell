import { describe, expect, it } from 'vitest';
import { makeTestConfig, makeTestContent, makeTestStore } from '../testutil';
import { COORD, PATIENT, checkinByDay, dayAt, enrolled, itemsIn } from '../testflows';
import { DomainError } from './errors';
import { resolve } from './queues';
import { liftSensitiveStatus, patientControlSubtype, setSensitivePreferences, setSensitiveStatus } from './sensitive';

describe('sensitive status (FR-07, FR-54, FR-55, FR-59)', () => {
  it('the patient control applies suppression immediately, switches later check-ins to the loss set, and creates a Sensitive-review item', () => {
    const store = makeTestStore();
    const { episode_id, patient_id } = enrolled(store, { delivery_outcome: 'stillbirth' });
    // The loss delivery outcome already gives the loss set at enrollment; add the patient control on day 2.
    store.setClock(dayAt(2, 10));
    const ep = store.getState().episodes[episode_id];
    const subtype = patientControlSubtype('loss', ep);
    expect(subtype).toBe('stillbirth');
    const events = store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype, set_by: 'patient', control: 'loss' }), PATIENT);
    expect(events.map((e) => e.type)).toEqual(['sensitive_status_set', 'queue_item_created']);
    const review = itemsIn(store, 'sensitive_review', episode_id);
    expect(review).toHaveLength(1);
    expect(review[0].owner_role).toBe('clinician');
    const state = store.getState();
    const plan = Object.values(state.carePlanItems).filter((c) => c.episode_id === episode_id);
    expect(plan.map((c) => `${c.key}:${c.state}`).sort()).toEqual(['mood_support:open', 'recovery_visit:open']);
    expect(checkinByDay(store, episode_id, 3).template_key).toBe('loss_checkin');
    expect(state.episodes[episode_id].indicated).toBe(true);
    expect(state.sensitiveStatuses[0].confirmed_by_staff).toBe(false);
    expect(() => store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype, set_by: 'patient' }), PATIENT)).toThrow(DomainError);
  });

  it('a NICU status set by staff on a standard episode suppresses milestone and celebration items and remaps future check-ins only', () => {
    const store = makeTestStore();
    const { episode_id, patient_id } = enrolled(store);
    store.setClock(dayAt(3, 10));
    store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype: 'nicu', set_by: 'coordinator', note: 'twins admitted' }), COORD);
    const state = store.getState();
    const plan = Object.values(state.carePlanItems).filter((c) => c.episode_id === episode_id);
    expect(plan.find((c) => c.key === 'milestones')?.state).toBe('suppressed');
    expect(plan.find((c) => c.key === 'feeding_support')?.state).toBe('open');
    expect(checkinByDay(store, episode_id, 3).template_key).toBe('day03'); // already released
    expect(checkinByDay(store, episode_id, 7).template_key).toBe('nicu_checkin');
    expect(checkinByDay(store, episode_id, 7).set).toBe('nicu');
    expect(state.derivedEvents.filter((e) => e.type === 'content_suppressed').map((e) => e.attributes.tag)).toEqual(['milestone']);
    expect(state.notifications.find((n) => n.id === `ntf:careplan:${plan.find((c) => c.key === 'milestones')!.id}`)).toMatchObject({ simulated_state: 'suppressed', suppressed_reason: 'sensitive_status:milestone' });
    // Nothing resumes automatically; a lift is explicit and logged, and the patient may not lift a NICU status.
    store.setClock(dayAt(60));
    expect(store.getState().carePlanItems[plan.find((c) => c.key === 'milestones')!.id].state).toBe('suppressed');
    expect(() => store.dispatch(liftSensitiveStatus({ patient_id, subtype: 'nicu', reason: 'home now' }), PATIENT)).toThrow(DomainError);
    store.dispatch(liftSensitiveStatus({ patient_id, subtype: 'nicu', reason: 'baby discharged; patient asked' }), COORD);
    expect(store.getState().sensitiveStatuses[0].active).toBe(false);
    expect(store.getState().sensitiveStatuses[0].lift_reason).toBe('baby discharged; patient asked');
    expect(store.getState().carePlanItems[plan.find((c) => c.key === 'milestones')!.id].state).toBe('open');
  });
});

describe('sensitive preferences (FR-56)', () => {
  it('"not for now" pauses check-ins as the patient and creates the review item with the 7-day deadline; asked once', () => {
    const store = makeTestStore();
    const { episode_id, patient_id } = enrolled(store, { delivery_outcome: 'stillbirth' });
    store.setClock(dayAt(2, 10));
    store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype: 'stillbirth', set_by: 'patient' }), PATIENT);
    store.setClock(dayAt(2, 11));
    const events = store.dispatch(setSensitivePreferences({ patient_id, episode_id, form_of_address: 'Elena', use_baby_name: false, contact_frequency: 'not_for_now' }), PATIENT);
    expect(events.map((e) => e.type)).toEqual(['sensitive_preferences_set', 'checkins_paused', 'queue_item_created']);
    const paused = events.find((e) => e.type === 'checkins_paused');
    expect(paused && paused.type === 'checkins_paused' && paused.payload.actor).toBe('patient');
    expect(paused && paused.type === 'checkins_paused' && paused.payload.until).toBeNull();
    const items = itemsIn(store, 'sensitive_review', episode_id);
    expect(items).toHaveLength(2);
    const deadlineItem = items.find((q) => q.note?.includes('not for now'))!;
    expect(deadlineItem.note).toContain('7-day contact deadline');
    expect(deadlineItem.note).toContain(dayAt(9, 11));
    const state = store.getState();
    expect(state.episodes[episode_id].status).toBe('paused');
    expect(state.patients[patient_id].preferences.contact_frequency).toBe('not_for_now');
    expect(state.patients[patient_id].preferences.baby_reference_permission).toBe('no');
    store.setClock(dayAt(90));
    expect(Object.values(store.getState().checkins).filter((c) => c.episode_id === episode_id).every((c) => c.state === 'paused')).toBe(true);
    expect(itemsIn(store, 'unreached', episode_id)).toHaveLength(0);
    expect(() => store.dispatch(setSensitivePreferences({ patient_id, episode_id, form_of_address: null, use_baby_name: false, contact_frequency: 'continue' }), PATIENT)).toThrow(DomainError);
  });

  it('the "not for now" item is due at the contact deadline and escalates like Needs-review after it', () => {
    const store = makeTestStore();
    const { episode_id, patient_id } = enrolled(store, { delivery_outcome: 'stillbirth' });
    store.setClock(dayAt(2, 11));
    store.dispatch(setSensitivePreferences({ patient_id, episode_id, form_of_address: 'Elena', use_baby_name: false, contact_frequency: 'not_for_now' }), PATIENT);
    const item = itemsIn(store, 'sensitive_review', episode_id).find((q) => q.note?.includes('not for now'))!;
    expect(item.ack_target_at).toBe(dayAt(9, 11));
    expect(item.backup_target_at).toBe(dayAt(10, 11)); // the queue's backup delta (2880 − 1440 minutes) after the deadline
    store.setClock(dayAt(9, 10));
    expect(store.getState().queueItems[item.id].state).toBe('open');
    store.setClock(dayAt(9, 11));
    expect(store.getState().queueItems[item.id]).toMatchObject({ state: 'escalated', escalated_at: dayAt(9, 11) });
    store.setClock(dayAt(10, 11));
    expect(store.getState().queueItems[item.id].state).toBe('unowned');
    expect(store.getState().derivedEvents.some((e) => e.type === 'escalation_unacknowledged_timeout' && e.related_id === item.id)).toBe(true);
    store.dispatch(resolve({ queue_item_id: item.id, outcome: 'called; agreed to a message every two weeks' }), COORD);
    expect(store.getState().queueItems[item.id].state).toBe('resolved');
  });
});

describe('rules on status_set (FR-23, FR-55)', () => {
  it('a trauma status routes to clinician review through a configured rule, with the review item already handled', () => {
    const config = makeTestConfig((c) => {
      c.rules.push({
        key: 'trauma_review', version: '1', description: 'trauma routes to clinician review, not a screen', author: 'engineer', approved_by: null, effective_from: '2026-01-01T00:00:00.000Z',
        trigger: 'status_set', conditions: { all: [{ field: 'status.subtype', op: 'eq', value: 'trauma' }] },
        action: { type: 'create_queue_item', queue_key: 'needs_review', instrument_key: null, note: 'hard birth: clinician review of how she wants to be contacted' }, placeholder: true,
      });
    });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id, patient_id } = enrolled(store);
    store.setClock(dayAt(3, 10));
    const events = store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype: 'trauma', set_by: 'patient', control: 'hard_birth' }), PATIENT);
    expect(itemsIn(store, 'sensitive_review', episode_id)).toHaveLength(1);
    const review = itemsIn(store, 'needs_review', episode_id);
    expect(review).toHaveLength(1);
    const fired = events.find((e) => e.type === 'rule_fired');
    expect(fired && fired.type === 'rule_fired' && fired.payload.rule_key).toBe('trauma_review');
    expect(fired && fired.type === 'rule_fired' && fired.payload.queue_item_id).toBe(review[0].id);
    expect(checkinByDay(store, episode_id, 7).template_key).toBe('trauma_checkin');
    // A NICU status does not match the rule; only the review item is created.
    const nicu = store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype: 'nicu', set_by: 'coordinator' }), COORD);
    expect(nicu.map((e) => e.type)).toEqual(['sensitive_status_set', 'queue_item_created']);
  });
});
