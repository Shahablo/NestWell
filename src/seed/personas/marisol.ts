/**
 * 6.3 Marisol — emergency instruction and same-day practice call. English, cesarean, commercial
 * insurance. At the day-7 check-in she taps an item on the clinical owner's placeholder urgent
 * list: the locked instruction renders first, one Urgent item is created by the configured rule,
 * the coordinator acknowledges in 12 minutes, logs a 12-minute call and closes the item against
 * that contact (12 minutes on the ledger, not 24, FR-38/FR-45). No model is called.
 *
 * After-hours variant: the same answer at 7 p.m.; nobody acknowledges; escalated at 7:30 p.m. and
 * UNOWNED at 8 p.m. on the wall basis (FR-25); the patient sees the "we have not reached a nurse
 * yet" item; the next morning the coordinator picks it up and an incident is recorded.
 */
import { addMinutes } from '../../domain/clock';
import { enroll, recordIncident, registerPatient, scheduleVisit, setVisitState } from '../../domain/services';
import {
  ackItemStep, acknowledgeStep, answers, checkinSteps, closeStep, contactStep, on, patientRecord, persona, planDoneStep, prefSteps, rateItemStep,
  ratingStep, readStep, resolveItemStep, screenStep, summarySteps, visitDoneSteps, PRIMARY_CARE_ON_FILE, type Persona,
} from '../actions';
import { local, type SeedEnv } from '../env';
import { episodeOf, itemOf, visitOf } from '../lookup';
import { ADMIN, CLINICIAN, COORD, step, type Step } from '../script';

export type MarisolVariant = 'baseline' | 'after_hours';

export const MARISOL = { key: 'marisol', patient_id: 'pt-marisol', delivery: '2026-04-07' } as const;

/** The coordinator's response to the Urgent item: acknowledge, one 12-minute call, close against that contact. */
function urgentResponse(p: Persona, ackAt: string, callOutcome: string): Step[] {
  const t = (m: number) => addMinutes(ackAt, m);
  return [
    ackItemStep(p, t(0), { queue_key: 'urgent', open: true }),
    contactStep(p, t(4), { type: 'phone_call', outcome: callOutcome, minutes: 12 }),
    resolveItemStep(p, t(16), { queue_key: 'urgent', open: true }, { outcome: 'contact made and outcome logged: same-day visit arranged', withContact: true }),
    rateItemStep(p, t(24), { queue_key: 'urgent' }, 'appropriate'),
  ];
}

function sameDayVisit(p: Persona, scheduleAt: string, visitAt: string, doneAt: string): Step[] {
  return [
    step(scheduleAt, 'marisol: coordinator books a same-day visit', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(scheduleVisit({ patient_id: p.patient_id, episode_id: ep.id, type: 'other', scheduled_for: visitAt, purpose: 'same-day visit after the day-7 check-in', bring: ['Your questions'] }), COORD);
    }),
    step(doneAt, 'marisol: coordinator records the same-day visit as completed', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setVisitState({ visit_id: visitOf(r, ep.id, 'other').id, state: 'completed' }), COORD);
    }),
    planDoneStep(p, addMinutes(doneAt, 5), ['blood_pressure_check'], COORD),
  ];
}

function tail(p: Persona): Step[] {
  return [
    ...checkinSteps(p, 14, answers()),
    screenStep(p, on(p, 14, 10, 30), [0, 0, 0, 0, 1, 0, 0, 0, 0, 0], { day: 14 }),
    // Day 21: an optional note shows the FR-17 path in the scan mode in force (step 6 of the script).
    ...checkinSteps(p, 21, answers({ note: 'My incision is itchy. Is that expected?' }), { open: on(p, 21, 10, 15), submit: on(p, 21, 10, 18) }),
    ...visitDoneSteps(p, on(p, 21, 11, 0), 'early_postpartum', { minutes: 25, outcome: 'early postpartum visit completed', plan: ['early_visit', 'newborn_visit', 'feeding_support', 'mood_checkin_explained'] }),
    readStep(p, on(p, 21, 11, 20), 'free_text'),
    ackItemStep(p, on(p, 21, 11, 22), { trigger_type: 'free_text', open: true }, CLINICIAN),
    resolveItemStep(p, on(p, 21, 11, 25), { trigger_type: 'free_text', open: true }, { outcome: 'note read; answered at the early visit', minutes: 5 }, CLINICIAN),
    ...checkinSteps(p, 42, answers(), { open: on(p, 42, 10, 10), submit: on(p, 42, 10, 14) }),
    screenStep(p, on(p, 42, 10, 18), [0, 0, 0, 0, 0, 1, 0, 0, 1, 0], { day: 42 }),
    ratingStep(p, on(p, 42, 10, 22), 6, 5),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 30, outcome: 'comprehensive postpartum visit completed', plan: ['comprehensive_visit', 'contraception_conversation', 'pelvic_floor_recovery'] }),
    ...checkinSteps(p, 63, answers()),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...checkinSteps(p, 84, answers()),
    ratingStep(p, on(p, 84, 10, 28), 12, 5),
    ...summarySteps(p, on(p, 84, 11, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), { primary_care: PRIMARY_CARE_ON_FILE, mental_health: 'not_indicated', open_items: [], owner_role: null, next_contact_date: null }),
  ];
}

export function marisolSteps(env: SeedEnv, variant: MarisolVariant = 'baseline'): Step[] {
  const p = persona(env, MARISOL.key, MARISOL.patient_id, local(env, MARISOL.delivery, 6));
  const head: Step[] = [
    // Day 1 (the first live check-in goes no sooner than enrollment + 1 day, FR-02, so day 3 stays on day 3).
    step(on(p, 1, 11, 0), 'marisol: registered on the postnatal ward', (r) => {
      r.run(registerPatient({ patient: patientRecord({ id: p.patient_id, display_name: 'Marisol', persona_key: 'marisol', insurance_type: 'commercial', access_barriers: [] }, r.now()) }), COORD);
    }),
    step(on(p, 1, 11, 5), 'marisol: enrolled by the coordinator before discharge', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'before_discharge', delivery_date: p.delivery, delivery_outcome: 'live_birth', performed_by: 'staff', staff_user_id: 'coord-1' }), COORD);
    }),
    acknowledgeStep(p, on(p, 1, 11, 10)),
    ...prefSteps(p, on(p, 1, 11, 12), [
      { field: 'preferred_name', value: 'Marisol' },
      { field: 'contact_windows', value: ['morning'] },
      { field: 'safe_to_message', value: true },
      { field: 'baby_reference_permission', value: 'welcome' },
      { field: 'sharing_category', value: 'clinician_and_coordinator' },
    ]),
    ...checkinSteps(p, 3, answers()),
  ];
  const urgentAnswer = answers({ urgent: ['headache_vision'] });

  if (variant === 'after_hours') {
    return [
      ...head,
      ...checkinSteps(p, 7, urgentAnswer, { open: on(p, 7, 18, 55), submit: on(p, 7, 19, 0) }),
      ...urgentResponse(p, on(p, 8, 8, 5), 'reached the next morning; symptoms reviewed with the clinician; same-day visit arranged'),
      step(on(p, 8, 8, 30), 'marisol: admin records the UNOWNED timeout as an incident (SR-16)', (r) => {
        const ep = episodeOf(r, p.patient_id);
        const item = itemOf(r, ep.id, { queue_key: 'urgent' });
        r.run(recordIncident({ type: 'unowned_timeout', related_entity: 'queue_item', related_id: item.id, description: 'Urgent item created at 7 p.m. outside coverage passed the acknowledgment and backup targets before anyone acknowledged it; the patient saw the nobody-reached item until the next morning' }), ADMIN);
      }),
      ...sameDayVisit(p, on(p, 8, 9, 0), on(p, 8, 14, 0), on(p, 8, 15, 30)),
      ...tail(p),
    ];
  }

  return [
    ...head,
    ...checkinSteps(p, 7, urgentAnswer),
    ...urgentResponse(p, on(p, 7, 10, 36), 'reached; symptoms reviewed with the clinician; same-day visit arranged'),
    ...sameDayVisit(p, on(p, 7, 11, 5), on(p, 7, 15, 0), on(p, 7, 16, 30)),
    ...tail(p),
  ];
}
