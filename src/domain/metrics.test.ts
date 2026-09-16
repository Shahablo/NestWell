import { describe, expect, it } from 'vitest';
import { computeMetrics, stats } from './metrics';
import { makePatient, makeTestStore } from './testutil';
import { ADMIN, CLINICIAN, COORD, PATIENT, dayAt, enrolled, itemsIn } from './testflows';
import { closeEpisode, recordEligibility, registerPatient, stopProgram } from './services/enrollment';
import { createReferral, logContact, setReferralState, setVisitState } from './services/followthrough';
import { administerScreen, recordAssessment } from './services/screening';
import { helpNow, rate } from './services/queues';

describe('stats', () => {
  it('computes median, mean, p90 and the top decile', () => {
    expect(stats([])).toEqual({ n: 0, median: null, mean: null, p90: null, top_decile_mean: null });
    expect(stats([10, 20, 30, 40])).toEqual({ n: 4, median: 25, mean: 25, p90: 40, top_decile_mean: 40 });
    expect(stats([5])).toEqual({ n: 1, median: 5, mean: 5, p90: 5, top_decile_mean: 5 });
  });
});

describe('computeMetrics (11.3, FR-49, FR-50)', () => {
  it('reports every measure from events with all-eligible primary and enrolled secondary, plus breakdowns', () => {
    const store = makeTestStore();
    // A: enrolled, positive screen, assessment, referral kept, comprehensive visit, transition (commercial, en).
    const a = enrolled(store, { patient_id: 'a', patient: { insurance_type: 'commercial' } });
    store.setClock(dayAt(5));
    store.dispatch(logContact({ episode_id: a.episode_id, type: 'phone_call', outcome: 'welcome call', minutes: 10 }), COORD);
    store.setClock(dayAt(14, 10));
    store.dispatch(administerScreen({ episode_id: a.episode_id, instrument_key: 'epds', item_responses: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3] }), PATIENT);
    const screen = Object.values(store.getState().screens)[0];
    store.setClock(dayAt(15, 10));
    store.dispatch(recordAssessment({ episode_id: a.episode_id, screen_result_id: screen.id, outcome: 'referral', minutes: 20 }), CLINICIAN);
    store.dispatch(createReferral({ episode_id: a.episode_id, partner_id: 'bh-partner-1', screen_result_id: screen.id, reason: 'positive screen' }), CLINICIAN);
    const ref = Object.values(store.getState().referrals)[0];
    store.dispatch(setReferralState({ referral_id: ref.id, state: 'sent_to_partner', consent_basis: 'consent v1' }), COORD);
    store.setClock(dayAt(20, 10));
    store.dispatch(setReferralState({ referral_id: ref.id, state: 'appointment_completed', completed_at: dayAt(20, 10) }), COORD);
    const nr = itemsIn(store, 'needs_review', a.episode_id)[0];
    store.dispatch(rate({ queue_item_id: nr.id, rating: 'appropriate' }), CLINICIAN);
    const visit = Object.values(store.getState().visits).find((v) => v.episode_id === a.episode_id && v.type === 'comprehensive')!;
    store.setClock(dayAt(84, 11));
    store.dispatch(setVisitState({ visit_id: visit.id, state: 'completed' }), COORD);
    store.dispatch(closeEpisode({ episode_id: a.episode_id, transition: { primary_care: 'PCP', mental_health: 'confirmed', open_items: [], owner_role: null, next_contact_date: null } }), COORD);

    // B: enrolled (medicaid, es content unavailable → use en with barrier), help now unowned, stops the program at day 30.
    const b = enrolled(store, { patient_id: 'b', at: dayAt(0, 18), patient: { insurance_type: 'medicaid', access_barriers: ['transport'] } });
    store.setClock(dayAt(7, 19));
    store.dispatch(helpNow({ episode_id: b.episode_id }), PATIENT);
    store.setClock(dayAt(30));
    store.dispatch(stopProgram({ episode_id: b.episode_id }), PATIENT);

    // C: eligible, declined.
    store.dispatch(registerPatient({ patient: makePatient('c', { insurance_type: 'medicaid', preferences: { locale: 'en' } }) }), ADMIN);
    store.dispatch(recordEligibility({ patient_id: 'c', status: 'declined', reason: 'not interested' }), COORD);

    store.setClock(dayAt(90));
    const m = computeMetrics(store.getState(), store.getEvents(), store.config);
    expect(m.eligible).toBe(3);
    expect(m.enrollment).toEqual({ numerator: 2, denominator: 3, rate: 0.667 }); // FR-01: latest eligibility status; B's withdrawal is a dropout, not a status change
    expect(m.program_completion.all_eligible.numerator).toBe(1);
    expect(m.care_completion.all_eligible.numerator).toBe(1);
    expect(m.planned_visits.all_eligible.numerator).toBe(1);
    expect(m.initial_contact_by_day_21.all_eligible).toEqual({ numerator: 1, denominator: 3, rate: 0.333 });
    expect(m.screen_to_assessment_hours.median).toBe(24);
    expect(m.screen_to_connection_hours.median).toBe(144);
    expect(m.referral_completion).toMatchObject({ created: 1, completed: 1, no_capacity: 0, not_covered: 0, declined: 0, rate: 1 });
    expect(m.staff_minutes.per_episode[a.episode_id]).toBe(30);
    expect(m.escalation.ratings.appropriate).toBe(1);
    // Timeouts by day 90: A's Needs-review item and Unreached item (no check-ins answered), B's Urgent, withdrawal and Unreached items.
    expect(m.escalation.timeouts).toBe(5);
    expect(m.escalation.timeouts_by_queue).toEqual({ needs_review: 1, unreached: 2, urgent: 1, follow_through: 1 });
    // B's Unreached item was derived while B's Urgent item was open, so it is flagged "unreached with open clinical item".
    expect(m.escalation.unreached_open_clinical_timeouts).toBe(1);
    expect(m.dropout.unreached_by_trigger).toEqual({ unreached: 2 });
    expect(m.dropout.enrolled.numerator).toBe(1);
    expect(m.dropout.no_contact_by_day_21).toBe(1);
    expect(m.free_text_routing.help_requested_by_source.patient).toBe(1);
    expect(m.transition_destination_gap).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(Object.keys(m.breakdowns.insurance_type).sort()).toEqual(['commercial', 'medicaid']);
    expect(m.breakdowns.insurance_type.medicaid.eligible).toBe(2);
    expect(m.breakdowns.access_barrier.transport.eligible).toBe(1);
    expect(m.breakdowns.locale.en.enrollment.denominator).toBe(3);
    // FR-49: recomputing from the same events gives the same result.
    expect(computeMetrics(store.getState(), store.getEvents(), store.config)).toEqual(m);
  });
});
