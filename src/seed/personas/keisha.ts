/**
 * 6.5 Keisha — the patient who stops responding. English, uninsured, no reliable phone. She
 * answers days 3 and 7 (self-enrolled: no staff contact yet). Day 14 goes unopened with its one
 * reminder; day 21 goes unopened; the day-21 sweep records no_contact_by_day_21 and derives the
 * single Unreached item; the day-21 reminder is suppressed. The coordinator acknowledges, logs two
 * attempts and reaches her on day 27 ("transport barrier, visit rescheduled"): first contact on
 * day 27, target unmet, visibly (FR-37).
 *
 * Paused variant (FR-13a): "Pause 2 weeks" chosen at day 7; days 14 and 21 are paused, the sweep
 * finds the pause in force, and no Unreached item is ever created.
 */
import { addDays } from '../../domain/clock';
import { enroll, logOutreach, pauseCheckins, registerPatient, setVisitState } from '../../domain/services';
import {
  ackItemStep, acknowledgeStep, answers, checkinSteps, closeStep, contactStep, on, patientRecord, persona, planDoneStep, prefSteps, ratingStep,
  resolveItemStep, screenStep, summarySteps, visitDoneSteps, type Persona,
} from '../actions';
import { local, type SeedEnv } from '../env';
import { episodeOf, itemOf, visitOf } from '../lookup';
import { COORD, PATIENT, step, type Step } from '../script';

export type KeishaVariant = 'baseline' | 'paused';

export const KEISHA = { key: 'keisha', patient_id: 'pt-keisha', delivery: '2026-03-24' } as const;

function outreach(p: Persona, at: string, outcome: 'reached' | 'not_reached', note: string, minutes: number, barrier: 'transport' | null = null): Step {
  return step(at, `keisha: coordinator logs outreach (${outcome})`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    r.run(logOutreach({ queue_item_id: itemOf(r, ep.id, { queue_key: 'unreached' }).id, outcome, note, barrier, minutes }), COORD);
  });
}

function rescheduleEarlyVisit(p: Persona, at: string): Step {
  return step(at, 'keisha: coordinator reschedules the early visit', (r) => {
    const ep = episodeOf(r, p.patient_id);
    r.run(setVisitState({ visit_id: visitOf(r, ep.id, 'early_postpartum').id, state: 'rescheduled', rescheduled_to: on(p, 30, 10, 0) }), COORD);
  });
}

/** Weeks 6 to 12 are the same in both variants. */
function tail(p: Persona): Step[] {
  return [
    ...visitDoneSteps(p, on(p, 30, 11, 0), 'early_postpartum', { minutes: 25, outcome: 'early postpartum visit completed (rescheduled)', plan: ['early_visit', 'blood_pressure_check', 'newborn_visit', 'feeding_support', 'mood_checkin_explained'] }),
    ...checkinSteps(p, 42, answers({ coping: 'some_days_hard', barriers: 'transport' })),
    screenStep(p, on(p, 42, 10, 30), [1, 0, 1, 0, 1, 0, 0, 1, 0, 0], { day: 42 }),
    ratingStep(p, on(p, 42, 10, 35), 6, 3),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 30, outcome: 'comprehensive postpartum visit completed', plan: ['comprehensive_visit', 'contraception_conversation', 'pelvic_floor_recovery'] }),
    ackItemStep(p, on(p, 42, 13, 0), { trigger_type: 'barrier', open: true }),
    resolveItemStep(p, on(p, 42, 13, 5), { trigger_type: 'barrier', open: true }, { outcome: 'ride arranged through the practice transport resource (NOT YET PROVIDED placeholder noted)', minutes: 10 }),
    ...checkinSteps(p, 63, answers()),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...checkinSteps(p, 84, answers()),
    ratingStep(p, on(p, 84, 10, 28), 12, 4),
    ...summarySteps(p, on(p, 84, 11, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), { primary_care: 'Community health center (synthetic, NOT YET SECURED)', mental_health: 'not_indicated', open_items: [], owner_role: null, next_contact_date: null }),
  ];
}

export function keishaSteps(env: SeedEnv, variant: KeishaVariant = 'baseline'): Step[] {
  const p = persona(env, KEISHA.key, KEISHA.patient_id, local(env, KEISHA.delivery, 6));
  const head: Step[] = [
    step(on(p, 1, 10, 0), 'keisha: registered before discharge', (r) => {
      r.run(registerPatient({ patient: patientRecord({ id: p.patient_id, display_name: 'Keisha', persona_key: 'keisha', insurance_type: 'uninsured', access_barriers: ['phone_data'] }, r.now()) }), COORD);
    }),
    step(on(p, 1, 10, 5), 'keisha: enrolls herself from the link the practice gave her', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'after_delivery', delivery_date: p.delivery, delivery_outcome: 'live_birth', performed_by: 'patient' }), PATIENT);
    }),
    acknowledgeStep(p, on(p, 1, 10, 10)),
    ...prefSteps(p, on(p, 1, 10, 12), [
      { field: 'preferred_name', value: 'Keisha' },
      { field: 'contact_windows', value: ['evening'] },
      { field: 'safe_to_message', value: true },
      { field: 'baby_reference_permission', value: 'welcome' },
    ]),
    ...checkinSteps(p, 3, answers(), { open: on(p, 3, 10, 40), submit: on(p, 3, 10, 45) }),
    ...checkinSteps(p, 7, answers(), { open: on(p, 7, 10, 30), submit: on(p, 7, 10, 33) }),
  ];

  if (variant === 'paused') {
    return [
      ...head,
      step(on(p, 7, 20, 0), 'keisha: taps "Pause check-ins" for 2 weeks', (r) => {
        r.run(pauseCheckins({ episode_id: episodeOf(r, p.patient_id).id, actor: 'patient', duration_label: '2 weeks', until: addDays(r.now(), 14) }), PATIENT);
      }),
      contactStep(p, on(p, 28, 9, 30), { type: 'phone_call', outcome: 'reached after the pause ended; early visit rescheduled', minutes: 15 }),
      rescheduleEarlyVisit(p, on(p, 28, 9, 35)),
      ...tail(p),
    ];
  }

  return [
    ...head,
    // Days 14 and 21 go unopened; the sweep derives the item at noon on day 21. The coordinator picks it up the next morning.
    // The item resolves at the first logged outreach outcome (FR-13), so the attempts come after the day-21 window has
    // closed (day 23 10:00): the second unopened check-in then finds the item still open and creates none.
    ackItemStep(p, on(p, 22, 9, 0), { queue_key: 'unreached', open: true }),
    outreach(p, on(p, 23, 14, 0), 'not_reached', 'no answer; voicemail full', 5),
    outreach(p, on(p, 24, 15, 0), 'not_reached', 'no answer; text bounced (limited phone plan)', 5),
    outreach(p, on(p, 27, 9, 30), 'reached', 'reached; no ride to the early visit; visit rescheduled', 15, 'transport'),
    rescheduleEarlyVisit(p, on(p, 27, 9, 45)),
    ...tail(p),
  ];
}
