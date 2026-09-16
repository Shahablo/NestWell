/**
 * 6.2 Priya — positive mood screen to confirmed appointment. Surgical birth, second child,
 * English, Medicaid, transport barrier. Day-3 barrier answer creates the transport Follow-through
 * item; day-14 coping at the worst option creates a Needs-review item and offers the instrument;
 * the score lands at the threshold; the clinician acknowledges the same business day, records an
 * assessment and refers; the partner confirms Medicaid coverage, schedules, and records the kept
 * appointment (the only state that counts, FR-33). A second positive at week 6 leaves the day-14
 * interval untouched (FR-32).
 *
 * Variants (practice only, 6.2 a–e) diverge at day 14 and are separate branches.
 */
import { addMinutes } from '../../domain/clock';
import { createReferral, declineScreen, enroll, registerPatient, setReferralState } from '../../domain/services';
import {
  ackItemStep, acknowledgeStep, answers, assessmentStep, checkinSteps, closeStep, contactStep, on, patientRecord, persona, planDoneStep, prefSteps,
  rateItemStep, ratingStep, resolveItemStep, screenStep, summarySteps, visitDoneSteps, PRIMARY_CARE_ON_FILE, type Persona,
} from '../actions';
import { local, type SeedEnv } from '../env';
import { episodeOf, itemOf, latestScreen, referralOf } from '../lookup';
import { CLINICIAN, COORD, PARTNER, PATIENT, step, type Step } from '../script';

export type PriyaVariant = 'baseline' | 'declined_screen' | 'sharing_withheld' | 'critical_withheld' | 'referral_declined' | 'escalated_then_acknowledged';

export const PRIYA = { key: 'priya', patient_id: 'pt-priya', delivery: '2026-03-19' } as const;

/** Per-item EPDS scores: exactly at the placeholder threshold (10), no critical item. */
export const PRIYA_AT_THRESHOLD = [1, 1, 1, 1, 1, 1, 1, 1, 2, 0];
/** Week 6: above threshold again, no critical item. */
export const PRIYA_WEEK6 = [2, 1, 1, 1, 1, 2, 1, 1, 2, 0];
/** Low total with the critical item positive (6.2 c). */
export const PRIYA_CRITICAL_LOW = [0, 0, 1, 0, 0, 0, 0, 0, 1, 1];

const CONSENT = { consent_basis: 'verbal consent for the consented fields, recorded by the clinician on the assessment call', consent_version: '1' };

function head(p: Persona, sharing: 'clinician_and_coordinator' | 'nobody_yet'): Step[] {
  return [
    step(on(p, 1, 11, 0), 'priya: registered before discharge', (r) => {
      r.run(registerPatient({ patient: patientRecord({ id: p.patient_id, display_name: 'Priya', persona_key: 'priya', insurance_type: 'medicaid', access_barriers: ['transport'] }, r.now()) }), COORD);
    }),
    step(on(p, 1, 11, 5), 'priya: enrolled in person by the coordinator on day 1', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'after_delivery', delivery_date: p.delivery, delivery_outcome: 'live_birth', performed_by: 'staff', staff_user_id: 'coord-1' }), COORD);
    }),
    acknowledgeStep(p, on(p, 1, 11, 10)),
    ...prefSteps(p, on(p, 1, 11, 12), [
      { field: 'preferred_name', value: 'Priya' },
      { field: 'contact_windows', value: ['afternoon'] },
      { field: 'safe_to_message', value: true },
      { field: 'baby_reference_permission', value: 'welcome' },
      { field: 'sharing_category', value: sharing },
    ]),
    // Day 3: "no ride" creates the typed transport Follow-through item (FR-36a).
    ...checkinSteps(p, 3, answers({ barriers: 'transport' })),
    ackItemStep(p, on(p, 5, 9, 30), { trigger_type: 'barrier', open: true }),
    contactStep(p, on(p, 5, 9, 40), { type: 'phone_call', outcome: 'reached; ride arranged for the early visit; the practice transport resource is NOT YET PROVIDED', minutes: 10 }),
    resolveItemStep(p, on(p, 5, 9, 45), { trigger_type: 'barrier', open: true }, { outcome: 'ride arranged for the early postpartum visit', withContact: true }),
    ...checkinSteps(p, 7, answers()),
  ];
}

/** Assessment, referral and the partner's confirmation after a shared positive screen at day 14 (steps 4 and 5). */
function assessAndRefer(p: Persona, at: string): Step[] {
  const t = (m: number) => addMinutes(at, m);
  return [
    ackItemStep(p, t(0), { trigger_type: 'positive_screen', open: true }, CLINICIAN),
    ackItemStep(p, t(1), { trigger_type: 'coping_difficulty', open: true }, CLINICIAN),
    contactStep(p, t(15), { type: 'phone_call', outcome: 'assessment call: reviewed the mood screen with her; she agreed to a behavioral health referral', minutes: 20 }, CLINICIAN),
    assessmentStep(p, t(20), { outcome: 'referral', note: 'assessed by phone; referral to the behavioral health partner agreed', trigger: { trigger_type: 'positive_screen' } }),
    step(t(25), 'priya: clinician creates the referral with the screen linked', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(createReferral({ episode_id: ep.id, partner_id: 'bh-partner-1', screen_result_id: latestScreen(r, ep.id).id, reason: 'day-14 mood screen at or above the placeholder threshold; patient agreed to a behavioral health referral' }), CLINICIAN);
    }),
    resolveItemStep(p, t(30), { trigger_type: 'positive_screen', open: true }, { outcome: 'assessed; behavioral health referral created', withContact: true }, CLINICIAN),
    resolveItemStep(p, t(31), { trigger_type: 'coping_difficulty', open: true }, { outcome: 'assessed together with the day-14 screen; referral created', withContact: true }, CLINICIAN),
    rateItemStep(p, t(35), { trigger_type: 'positive_screen' }, 'appropriate'),
    step(t(40), 'priya: coordinator sends the referral with the consent basis recorded', (r) => {
      r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'sent_to_partner', ...CONSENT, note: 'consented fields only: display name, preferred name, locale, insurance type, referral reason, screen result (shared)' }), COORD);
    }),
  ];
}

function partnerSchedulesAndKeeps(p: Persona, scheduleDay = 15): Step[] {
  return [
    step(on(p, scheduleDay, 9, 30), 'priya: partner confirms Medicaid coverage and schedules', (r) => {
      r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'appointment_scheduled', scheduled_for: on(p, 25, 9, 0), note: 'Medicaid accepted; first available slot' }), PARTNER);
    }),
    step(on(p, 25, 11, 30), 'priya: partner records the appointment as kept', (r) => {
      r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'appointment_completed', completed_at: on(p, 25, 9, 0), note: 'appointment kept' }), PARTNER);
    }),
    planDoneStep(p, on(p, 25, 11, 45), ['mental_health_connection'], CLINICIAN),
  ];
}

function day21(p: Persona, coping: 'coping' | 'some_days_hard' = 'some_days_hard'): Step[] {
  return [
    ...checkinSteps(p, 21, answers({ coping }), { open: on(p, 21, 10, 15), submit: on(p, 21, 10, 18) }),
    ...visitDoneSteps(p, on(p, 21, 11, 0), 'early_postpartum', { minutes: 25, outcome: 'early postpartum visit completed', plan: ['early_visit', 'blood_pressure_check', 'newborn_visit', 'feeding_support'] }),
  ];
}

/** Weeks 6 to 12: a second positive screen, assessed at the comprehensive visit; summaries; transition with a confirmed destination. */
function tail(p: Persona): Step[] {
  return [
    ...checkinSteps(p, 42, answers({ coping: 'some_days_hard' }), { open: on(p, 42, 10, 20), submit: on(p, 42, 10, 25) }),
    screenStep(p, on(p, 42, 10, 30), PRIYA_WEEK6, { day: 42 }),
    ratingStep(p, on(p, 42, 10, 35), 6, 4),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 30, outcome: 'comprehensive postpartum visit completed', plan: ['comprehensive_visit', 'contraception_conversation', 'pelvic_floor_recovery'] }),
    ackItemStep(p, on(p, 42, 14, 0), { trigger_type: 'positive_screen', open: true }, CLINICIAN),
    assessmentStep(p, on(p, 42, 14, 10), { outcome: 'follow_up_call', note: 'reviewed at the comprehensive visit; partner appointment kept on day 25; follow-up call in two weeks', minutes: 15, trigger: { trigger_type: 'positive_screen', open: true } }),
    resolveItemStep(p, on(p, 42, 14, 15), { trigger_type: 'positive_screen', open: true }, { outcome: 'assessed at the comprehensive visit; follow-up call planned; partner care continuing' }, CLINICIAN),
    rateItemStep(p, on(p, 42, 14, 20), { trigger_type: 'positive_screen' }, 'appropriate'),
    ...checkinSteps(p, 63, answers()),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...checkinSteps(p, 84, answers()),
    ratingStep(p, on(p, 84, 10, 28), 12, 4),
    ...summarySteps(p, on(p, 84, 11, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), { primary_care: PRIMARY_CARE_ON_FILE, mental_health: 'confirmed', open_items: [], owner_role: null, next_contact_date: null }),
  ];
}

export function priyaSteps(env: SeedEnv, variant: PriyaVariant = 'baseline'): Step[] {
  const p = persona(env, PRIYA.key, PRIYA.patient_id, local(env, PRIYA.delivery, 6));
  const withheld = variant === 'sharing_withheld' || variant === 'critical_withheld';
  const steps = head(p, withheld ? 'nobody_yet' : 'clinician_and_coordinator');

  switch (variant) {
    case 'baseline':
      return [
        ...steps,
        ...checkinSteps(p, 14, answers({ coping: 'not_coping' }), { open: on(p, 14, 10, 30), submit: on(p, 14, 10, 35) }),
        screenStep(p, on(p, 14, 10, 40), PRIYA_AT_THRESHOLD, { day: 14 }),
        ...assessAndRefer(p, on(p, 14, 13, 30)),
        ...partnerSchedulesAndKeeps(p),
        ...day21(p),
        ...tail(p),
      ];
    case 'declined_screen':
      return [
        ...steps,
        ...checkinSteps(p, 14, answers({ coping: 'not_coping' }), { open: on(p, 14, 10, 30), submit: on(p, 14, 10, 35) }),
        step(on(p, 14, 10, 40), 'priya: declines the instrument; the decline lands on the coping item (FR-29)', (r) => {
          const ep = episodeOf(r, p.patient_id);
          r.run(declineScreen({ episode_id: ep.id, instrument_key: 'epds', queue_item_id: itemOf(r, ep.id, { trigger_type: 'coping_difficulty', open: true }).id }), PATIENT);
        }),
        ackItemStep(p, on(p, 14, 13, 30), { trigger_type: 'coping_difficulty', open: true }, CLINICIAN),
        contactStep(p, on(p, 14, 13, 45), { type: 'phone_call', outcome: 'called; she declined the questionnaire; follow-up call agreed for next week', minutes: 15 }, CLINICIAN),
        assessmentStep(p, on(p, 14, 13, 50), { outcome: 'follow_up_call', note: 'reported difficulty coping; screen declined; follow-up call agreed', screen: false, trigger: { trigger_type: 'coping_difficulty', open: true } }),
        resolveItemStep(p, on(p, 14, 14, 0), { trigger_type: 'coping_difficulty', open: true }, { outcome: 'reported difficulty coping; screen declined; follow-up call agreed', withContact: true }, CLINICIAN),
        rateItemStep(p, on(p, 14, 14, 5), { trigger_type: 'coping_difficulty' }, 'appropriate'),
        ...day21(p, 'coping'),
      ];
    case 'sharing_withheld':
      return [
        ...steps,
        ...checkinSteps(p, 14, answers({ coping: 'some_days_hard' }), { open: on(p, 14, 10, 30), submit: on(p, 14, 10, 35) }),
        screenStep(p, on(p, 14, 10, 40), PRIYA_AT_THRESHOLD, { day: 14 }),
        ...day21(p, 'coping'),
      ];
    case 'critical_withheld':
      return [
        ...steps,
        ...checkinSteps(p, 14, answers(), { open: on(p, 14, 10, 30), submit: on(p, 14, 10, 35) }),
        screenStep(p, on(p, 14, 10, 40), PRIYA_CRITICAL_LOW, { day: 14 }),
        ackItemStep(p, on(p, 14, 10, 52), { queue_key: 'urgent', open: true }),
        contactStep(p, on(p, 14, 11, 0), { type: 'phone_call', outcome: 'reached within the hour; safety conversation; same-day clinician call arranged', minutes: 15 }),
        resolveItemStep(p, on(p, 14, 11, 10), { queue_key: 'urgent', open: true }, { outcome: 'contact made and outcome logged: same-day clinician call arranged', withContact: true }),
        rateItemStep(p, on(p, 14, 11, 30), { queue_key: 'urgent' }, 'appropriate'),
        ...day21(p, 'coping'),
      ];
    case 'referral_declined':
      return [
        ...steps,
        ...checkinSteps(p, 14, answers({ coping: 'not_coping' }), { open: on(p, 14, 10, 30), submit: on(p, 14, 10, 35) }),
        screenStep(p, on(p, 14, 10, 40), PRIYA_AT_THRESHOLD, { day: 14 }),
        ...assessAndRefer(p, on(p, 14, 13, 30)),
        step(on(p, 15, 10, 0), 'priya: partner records that she declined the appointment; the Needs-review item reopens for a plan (FR-33)', (r) => {
          r.run(setReferralState({ referral_id: referralOf(r, episodeOf(r, p.patient_id).id).id, state: 'declined_by_patient', note: 'she declined the appointment when the partner called' }), PARTNER);
        }),
        ackItemStep(p, on(p, 15, 14, 0), { trigger_type: 'referral_dead_end', open: true }, CLINICIAN),
        contactStep(p, on(p, 15, 14, 30), { type: 'phone_call', outcome: 'called; plan agreed: weekly follow-up call and the referral re-offered at the early visit', minutes: 15 }, CLINICIAN),
        assessmentStep(p, on(p, 15, 14, 35), { outcome: 'follow_up_call', note: 'plan documented after the declined referral: weekly follow-up call; referral re-offered at the early visit', trigger: { trigger_type: 'referral_dead_end', open: true } }),
        resolveItemStep(p, on(p, 15, 14, 40), { trigger_type: 'referral_dead_end', open: true }, { outcome: 'documented plan: weekly follow-up call; referral re-offered at the early visit', withContact: true }, CLINICIAN),
        ...day21(p, 'coping'),
      ];
    case 'escalated_then_acknowledged':
      // She opens the day-14 check-in the next morning, inside its window; the same-business-day target passes at 16:40 before the clinician acknowledges.
      return [
        ...steps,
        ...checkinSteps(p, 14, answers({ coping: 'not_coping' }), { open: on(p, 15, 8, 30), submit: on(p, 15, 8, 35) }),
        screenStep(p, on(p, 15, 8, 40), PRIYA_AT_THRESHOLD, { day: 14 }),
        ...assessAndRefer(p, on(p, 15, 16, 55)),
        ...partnerSchedulesAndKeeps(p, 18),
        ...day21(p, 'coping'),
      ];
  }
}
