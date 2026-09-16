/**
 * 6.4 Elena — pregnancy loss and sensitive mode. Enrolled at 34 weeks with an expected date;
 * stillbirth at 36 weeks recorded as day 0 (the schedule regenerates with the loss check-in set).
 * She taps "Something has happened to my baby": suppression is immediate, a Sensitive-review item
 * is created, nothing further is asked; the coordinator confirms the subtype later. The
 * preferences dialog is asked once; "not for now" pauses every check-in and creates the review
 * item with the 7-day contact deadline; the coordinator calls inside the deadline; recovery
 * follow-up and a mental-health referral continue; the episode closes at week 12 with a confirmed
 * destination. Nothing resumes automatically (FR-59): the loss status is never lifted and the
 * check-ins stay paused.
 */
import {
  acknowledgeQueueItem, confirmSensitiveStatus, createReferral, enroll, patientControlSubtype, recordDelivery, registerPatient, setReferralState,
  setSensitivePreferences, setSensitiveStatus, setVisitState,
} from '../../domain/services';
import {
  ackItemStep, acknowledgeStep, closeStep, contactStep, on, patientRecord, persona, planDoneStep, prefSteps, resolveItemStep, summarySteps, visitDoneSteps,
  PRIMARY_CARE_ON_FILE,
} from '../actions';
import { local, type SeedEnv } from '../env';
import { episodeOf, itemsOf, referralOf, visitOf } from '../lookup';
import { CLINICIAN, COORD, PARTNER, PATIENT, step, type Step } from '../script';

export const ELENA = { key: 'elena', patient_id: 'pt-elena', enrolled: '2026-03-18', expected: '2026-04-29', loss: '2026-04-01' } as const;

export function elenaSteps(env: SeedEnv): Step[] {
  const p = persona(env, ELENA.key, ELENA.patient_id, local(env, ELENA.loss, 6));
  return [
    step(local(env, ELENA.enrolled, 10, 0), 'elena: registered at the 34-week visit', (r) => {
      r.run(registerPatient({ patient: patientRecord({ id: p.patient_id, display_name: 'Elena', persona_key: 'elena', insurance_type: 'commercial', access_barriers: [] }, r.now()) }), COORD);
    }),
    step(local(env, ELENA.enrolled, 10, 5), 'elena: enrolls herself at 34 weeks', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'late_pregnancy', expected_date: local(env, ELENA.expected, 6), delivery_date: null, delivery_outcome: null, performed_by: 'patient' }), PATIENT);
    }),
    acknowledgeStep(p, local(env, ELENA.enrolled, 10, 10)),
    ...prefSteps(p, local(env, ELENA.enrolled, 10, 12), [
      { field: 'preferred_name', value: 'Elena' },
      { field: 'contact_windows', value: ['morning'] },
      { field: 'safe_to_message', value: true },
      { field: 'baby_reference_permission', value: 'welcome' },
      { field: 'baby_name', value: 'Sam' },
      { field: 'sharing_category', value: 'clinician_and_coordinator' },
    ]),
    step(local(env, ELENA.loss, 15, 0), 'elena: the clinician records the stillbirth at 36 weeks as day 0', (r) => {
      r.run(recordDelivery({ episode_id: episodeOf(r, p.patient_id).id, delivery_date: p.delivery, outcome: 'stillbirth' }), CLINICIAN);
    }),
    step(on(p, 1, 9, 0), 'elena: taps "Something has happened to my baby" (no reason asked)', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setSensitiveStatus({ patient_id: p.patient_id, episode_id: ep.id, subtype: patientControlSubtype('loss', ep), set_by: 'patient', control: 'loss' }), PATIENT);
    }),
    step(on(p, 1, 9, 5), 'elena: answers the once-only preferences dialog: "not for now"', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setSensitivePreferences({ patient_id: p.patient_id, episode_id: ep.id, form_of_address: 'Elena', use_baby_name: false, contact_frequency: 'not_for_now' }), PATIENT);
    }),
    step(on(p, 1, 11, 0), 'elena: coordinator confirms the subtype', (r) => {
      r.run(confirmSensitiveStatus({ patient_id: p.patient_id, subtype: 'stillbirth' }), COORD);
    }),
    step(on(p, 1, 11, 5), 'elena: clinician acknowledges both Sensitive-review items', (r) => {
      const ep = episodeOf(r, p.patient_id);
      for (const item of itemsOf(r, ep.id, { queue_key: 'sensitive_review', open: true })) {
        r.run(acknowledgeQueueItem({ queue_item_id: item.id }), CLINICIAN);
      }
    }),
    // Inside the 7-day deadline: the named contact calls once to agree how to stay in touch (FR-56).
    contactStep(p, on(p, 6, 10, 0), { type: 'phone_call', outcome: 'reached; she agreed to one call every two weeks and no app messages for now; mental-health support offered and accepted', minutes: 20 }),
    resolveItemStep(p, on(p, 6, 10, 25), { queue_key: 'sensitive_review', open: true }, { outcome: 'human contact made within the 7-day deadline; agreed: calls only, every two weeks', withContact: true }),
    resolveItemStep(p, on(p, 6, 10, 30), { queue_key: 'sensitive_review', open: true }, { outcome: 'subtype confirmed: stillbirth; loss pathway and suppression in force', minutes: 5 }, CLINICIAN),
    step(on(p, 6, 10, 40), 'elena: coordinator moves both visits to dates after the loss', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setVisitState({ visit_id: visitOf(r, ep.id, 'early_postpartum').id, state: 'rescheduled', rescheduled_to: on(p, 14, 10, 0) }), COORD);
      r.run(setVisitState({ visit_id: visitOf(r, ep.id, 'comprehensive').id, state: 'rescheduled', rescheduled_to: on(p, 42, 10, 0) }), COORD);
    }),
    step(on(p, 6, 14, 0), 'elena: clinician creates the mental-health referral (FR-57)', (r) => {
      r.run(createReferral({ episode_id: episodeOf(r, p.patient_id).id, partner_id: 'bh-partner-1', screen_result_id: null, reason: 'pregnancy loss (stillbirth at 36 weeks); she accepted mental-health support' }), CLINICIAN);
    }),
    step(on(p, 6, 14, 5), 'elena: coordinator sends the referral with the consent basis', (r) => {
      r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'sent_to_partner', consent_basis: 'verbal consent by phone on the coordinator call; consented fields only', consent_version: '1' }), COORD);
    }),
    step(on(p, 8, 9, 30), 'elena: partner schedules the appointment', (r) => {
      r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'appointment_scheduled', scheduled_for: on(p, 20, 14, 0), note: 'commercial insurance accepted' }), PARTNER);
    }),
    ...visitDoneSteps(p, on(p, 14, 11, 0), 'early_postpartum', { minutes: 30, outcome: 'recovery visit after the loss completed', plan: ['early_visit', 'blood_pressure_check'] }),
    step(on(p, 20, 16, 0), 'elena: partner records the appointment as kept', (r) => {
      r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'appointment_completed', completed_at: on(p, 20, 14, 0), note: 'appointment kept' }), PARTNER);
    }),
    planDoneStep(p, on(p, 21, 9, 0), ['mental_health_connection'], CLINICIAN),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 30, outcome: 'comprehensive visit completed', plan: ['comprehensive_visit', 'pelvic_floor_recovery', 'contraception_conversation'] }),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...summarySteps(p, on(p, 84, 11, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), { primary_care: PRIMARY_CARE_ON_FILE, mental_health: 'confirmed', open_items: [], owner_role: null, next_contact_date: null }),
  ];
}
