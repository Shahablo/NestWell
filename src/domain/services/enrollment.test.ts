import { describe, expect, it } from 'vitest';
import { makePatient, makeTestConfig, makeTestContent, makeTestStore } from '../testutil';
import { ADMIN, COORD, PATIENT, dayAt, enrolled, itemsIn, checkinByDay, DELIVERY } from '../testflows';
import { closeEpisode, enroll, recordDelivery, registerPatient, setPreference, stopProgram } from './enrollment';
import { DomainError } from './errors';
import { createReferral } from './followthrough';
import { addDays } from '../clock';

describe('registration and language gate (FR-01, FR-63a)', () => {
  it('a minor is not_offered; a Spanish speaker without the approved safety class is blocked with a reason and an outreach item', () => {
    const store = makeTestStore();
    store.dispatch(registerPatient({ patient: makePatient('minor', { is_adult: false }) }), ADMIN);
    expect(store.getState().eligibility['minor']).toMatchObject({ status: 'not_offered', reason: 'minor_policy_undefined' });
    store.dispatch(registerPatient({ patient: makePatient('lucia', { preferences: { locale: 'es' } }) }), ADMIN);
    expect(store.getState().eligibility['lucia']).toMatchObject({ status: 'not_offered', reason: 'language_content_unavailable' });
    const item = Object.values(store.getState().queueItems).find((q) => q.patient_id === 'lucia');
    expect(item?.queue_key).toBe('follow_through');
    expect(item?.note).toContain('interpreter');
    expect(() => store.dispatch(enroll({ patient_id: 'lucia', enrollment_point: 'after_delivery', delivery_date: DELIVERY, performed_by: 'staff', staff_user_id: 'coord-1' }), COORD)).toThrow(/language_content_unavailable|not approved/);
    expect(() => store.dispatch(registerPatient({ patient: { ...makePatient('fake'), is_synthetic: false as unknown as true } }), ADMIN)).toThrow(DomainError);
  });

  it('once the Spanish safety class is approved she enrolls', () => {
    const config = makeTestConfig();
    const store = makeTestStore(config, makeTestContent(config, { spanishSafetyClass: true }));
    store.dispatch(registerPatient({ patient: makePatient('lucia', { preferences: { locale: 'es' } }) }), ADMIN);
    expect(store.getState().eligibility['lucia']).toBeUndefined();
    store.dispatch(enroll({ patient_id: 'lucia', enrollment_point: 'after_delivery', delivery_date: DELIVERY, performed_by: 'patient' }), PATIENT);
    expect(store.getState().eligibility['lucia'].status).toBe('enrolled');
    expect(Object.values(store.getState().checkins)).toHaveLength(7);
  });
});

describe('episode lifecycle (FR-02, FR-13a, FR-39)', () => {
  it('a pre-delivery enrollment schedules from the expected date and recordDelivery moves unsent check-ins only', () => {
    const store = makeTestStore();
    const expected = DELIVERY;
    const { episode_id } = enrolled(store, { at: '2026-03-18T15:00:00.000Z', enrollment_point: 'late_pregnancy', delivery_date: null, expected_date: expected });
    expect(checkinByDay(store, episode_id, 3).scheduled_at).toBe(dayAt(3));
    expect(store.getState().episodes[episode_id].delivery_date).toBeNull();
    // Day-3 check-in goes out on the expected schedule; then delivery is recorded three days late.
    store.setClock(dayAt(3, 12));
    expect(checkinByDay(store, episode_id, 3).state).toBe('sent');
    store.dispatch(recordDelivery({ episode_id, delivery_date: addDays(DELIVERY, 3), outcome: 'live_birth' }), COORD);
    expect(checkinByDay(store, episode_id, 3).scheduled_at).toBe(dayAt(3)); // already sent: untouched
    expect(checkinByDay(store, episode_id, 7).scheduled_at).toBe(dayAt(10)); // unsent: regenerated from the real date
    expect(Object.values(store.getState().checkins).filter((c) => c.episode_id === episode_id)).toHaveLength(7);
    expect(store.getState().episodes[episode_id].delivery_date).toBe(addDays(DELIVERY, 3));
  });

  it('stop the program: closed_early, dropout, one Follow-through item, later check-ins not applicable', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(10));
    const events = store.dispatch(stopProgram({ episode_id }), PATIENT);
    expect(events.map((e) => e.type)).toEqual(['episode_closed', 'dropout_recorded', 'queue_item_created']);
    const ep = store.getState().episodes[episode_id];
    expect(ep.status).toBe('closed_early');
    expect(ep.close_reason).toBe('patient_withdrew');
    expect(itemsIn(store, 'follow_through', episode_id)[0].trigger_type).toBe('withdrawal');
    store.setClock(dayAt(30));
    expect(checkinByDay(store, episode_id, 14).state).toBe('not_applicable');
    expect(store.getState().notifications.filter((n) => n.episode_id === episode_id && n.simulated_state === 'sent' && n.kind !== 'care_plan').every((n) => n.scheduled_at < dayAt(10))).toBe(true);
    expect(() => store.dispatch(stopProgram({ episode_id }), PATIENT)).toThrow(DomainError);
  });

  it('an indicated episode closes only with a destination or none_identified plus owner and next contact date', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(20));
    store.dispatch(createReferral({ episode_id, partner_id: 'bh-partner-1', reason: 'patient request' }), COORD);
    store.setClock(dayAt(85));
    expect(store.getState().episodes[episode_id].indicated).toBe(true);
    expect(() => store.dispatch(closeEpisode({ episode_id, transition: { primary_care: 'Dr. PCP', mental_health: 'none_identified', open_items: [], owner_role: null, next_contact_date: null } }), COORD)).toThrow(DomainError);
    expect(() => store.dispatch(closeEpisode({ episode_id, transition: { primary_care: 'Dr. PCP', mental_health: 'not_indicated', open_items: [], owner_role: null, next_contact_date: null } }), COORD)).toThrow(DomainError);
    const events = store.dispatch(closeEpisode({ episode_id, transition: { primary_care: 'Dr. PCP', mental_health: 'none_identified', open_items: ['referral'], owner_role: 'coordinator', next_contact_date: dayAt(92) } }), COORD);
    expect(events.map((e) => e.type)).toEqual(['transition_completed', 'episode_closed']);
    expect(store.getState().episodes[episode_id].status).toBe('completed');
    expect(store.getState().episodes[episode_id].transition?.owner_role).toBe('coordinator');
  });

  it('a non-indicated episode closes with any transition; preferences change through setPreference', () => {
    const store = makeTestStore();
    const { episode_id, patient_id } = enrolled(store);
    store.dispatch(setPreference({ patient_id, field: 'sharing_category', value: 'nobody_yet' }), PATIENT);
    expect(store.getState().patients[patient_id].preferences.sharing_category).toBe('nobody_yet');
    store.dispatch(setPreference({ patient_id, field: 'safe_to_message', value: false }), PATIENT);
    store.setClock(dayAt(4, 10));
    expect(store.getState().notifications.filter((n) => n.episode_id === episode_id).every((n) => n.simulated_state === 'suppressed' && n.suppressed_reason === 'safe_to_message_no')).toBe(true);
    store.setClock(dayAt(85));
    store.dispatch(closeEpisode({ episode_id, transition: { primary_care: 'Dr. PCP', mental_health: 'not_indicated', open_items: [], owner_role: null, next_contact_date: null } }), COORD);
    expect(store.getState().episodes[episode_id].status).toBe('completed');
  });
});
