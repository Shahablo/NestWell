import { describe, expect, it } from 'vitest';
import { makeTestStore } from '../testutil';
import { CLINICIAN, COORD, PATIENT, dayAt, enrolled, itemsIn } from '../testflows';
import { DomainError } from './errors';
import { createReferral, logContact, setReferralState, setVisitState } from './followthrough';
import { acknowledge, helpNow, resolve } from './queues';
import { administerScreen } from './screening';

const positive = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3];

describe('referrals (FR-33, FR-36)', () => {
  it('a dead end on a referral tied to a positive screen reopens a Needs-review item; coverage comes from partner insurance', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { insurance_type: 'medicaid' } });
    store.setClock(dayAt(14, 10));
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: positive }), PATIENT);
    const screen = Object.values(store.getState().screens)[0];
    store.setClock(dayAt(15, 10));
    store.dispatch(createReferral({ episode_id, partner_id: 'bh-partner-1', screen_result_id: screen.id, reason: 'positive screen' }), CLINICIAN);
    const ref = Object.values(store.getState().referrals)[0];
    expect(ref.coverage_status).toBe('covered');
    expect(() => store.dispatch(setReferralState({ referral_id: ref.id, state: 'sent_to_partner' }), COORD)).toThrow(DomainError);
    store.dispatch(setReferralState({ referral_id: ref.id, state: 'sent_to_partner', consent_basis: 'patient consent v1' }), COORD);
    expect(store.getState().referrals[ref.id].sent_at).toBe(dayAt(15, 10));
    expect(store.getState().referrals[ref.id].consent_basis).toBe('patient consent v1');
    const before = itemsIn(store, 'needs_review', episode_id).length;
    const events = store.dispatch(setReferralState({ referral_id: ref.id, state: 'declined_by_patient', note: 'does not want counselling' }), COORD);
    const after = itemsIn(store, 'needs_review', episode_id);
    expect(after).toHaveLength(before + 1);
    const reopened = after.find((q) => q.trigger_type === 'referral_dead_end');
    expect(reopened?.trigger_ref).toBe(ref.id);
    expect(events.some((e) => e.type === 'referral_reopened_for_plan')).toBe(true);
    expect(store.getState().referrals[ref.id].history.map((h) => h.state)).toEqual(['created', 'sent_to_partner', 'declined_by_patient']);
  });

  it('a referral without a linked positive screen does not reopen; only appointment_completed records completed_at', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { insurance_type: 'uninsured' } });
    store.setClock(dayAt(15, 10));
    store.dispatch(createReferral({ episode_id, partner_id: 'bh-partner-1', reason: 'patient request' }), CLINICIAN);
    const ref = Object.values(store.getState().referrals)[0];
    expect(ref.coverage_status).toBe('not_covered');
    store.dispatch(setReferralState({ referral_id: ref.id, state: 'no_capacity' }), COORD);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    store.dispatch(setReferralState({ referral_id: ref.id, state: 'appointment_scheduled', scheduled_for: dayAt(25, 14) }), COORD);
    expect(store.getState().referrals[ref.id].completed_at).toBeNull();
    store.setClock(dayAt(25, 15));
    store.dispatch(setReferralState({ referral_id: ref.id, state: 'appointment_completed', completed_at: dayAt(25, 14) }), COORD);
    expect(store.getState().referrals[ref.id].completed_at).toBe(dayAt(25, 14));
    expect(store.getState().episodes[episode_id].indicated).toBe(true);
  });
});

describe('contact log and minutes (FR-37, FR-38, FR-45)', () => {
  it('Marisol: a 12-minute call logs one staff_time row; closing the item with that contact adds none', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(7, 19));
    store.dispatch(helpNow({ episode_id }), PATIENT);
    const item = itemsIn(store, 'urgent', episode_id)[0];
    store.setClock(dayAt(7, 19, 10));
    store.dispatch(acknowledge({ queue_item_id: item.id }), COORD);
    const events = store.dispatch(logContact({ episode_id, type: 'phone_call', outcome: 'spoke with patient; advised', minutes: 12 }), COORD);
    const contact = events.find((e) => e.type === 'contact_logged');
    const contact_id = contact && contact.type === 'contact_logged' ? contact.payload.contact_id : '';
    expect(events.some((e) => e.type === 'initial_contact_confirmed')).toBe(true);
    expect(events.filter((e) => e.type === 'staff_time_logged')).toHaveLength(1);
    store.dispatch(resolve({ queue_item_id: item.id, outcome: 'contact attempted; outcome logged', minutes: 12, contact_id }), COORD);
    const total = store.getState().staffTime.filter((s) => s.episode_id === episode_id).reduce((a, s) => a + s.minutes, 0);
    expect(total).toBe(12);
    expect(store.getState().queueItems[item.id].state).toBe('resolved');
    expect(store.getState().queueItems[item.id].minutes_to_ack).toBe(10);
    expect(store.getState().episodes[episode_id].initial_contact_day).toBe(7);
    // A second contact does not re-emit initial_contact_confirmed; 10 + 15 = 25 (FR-45).
    const second = store.dispatch(logContact({ episode_id, type: 'phone_call', outcome: 'follow-up', minutes: 10 }), COORD);
    expect(second.some((e) => e.type === 'initial_contact_confirmed')).toBe(false);
    store.dispatch(helpNow({ episode_id }), PATIENT);
    const item2 = itemsIn(store, 'urgent', episode_id).find((q) => q.state !== 'resolved')!;
    store.dispatch(resolve({ queue_item_id: item2.id, outcome: 'resolved by message', minutes: 15 }), COORD);
    expect(store.getState().staffTime.filter((s) => s.episode_id === episode_id).reduce((a, s) => a + s.minutes, 0)).toBe(37);
    expect(() => store.dispatch(resolve({ queue_item_id: item2.id, outcome: 'again' }), COORD)).toThrow(DomainError);
  });

  it('a queue item never closes without an outcome; visits record completion', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(7, 19));
    store.dispatch(helpNow({ episode_id }), PATIENT);
    const item = itemsIn(store, 'urgent', episode_id)[0];
    expect(() => store.dispatch(resolve({ queue_item_id: item.id, outcome: '' }), COORD)).toThrow(DomainError);
    const visit = Object.values(store.getState().visits).find((v) => v.type === 'early_postpartum')!;
    store.setClock(dayAt(21, 11));
    store.dispatch(setVisitState({ visit_id: visit.id, state: 'completed' }), COORD);
    expect(store.getState().visits[visit.id].completed_at).toBe(dayAt(21, 11));
  });
});
