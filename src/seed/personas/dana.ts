/**
 * 6.1 Dana — uneventful recovery. Vaginal birth, first child, English, commercial insurance, no
 * barriers. Enrolled at 38 weeks; every check-in answered in full; day-14 and week-6 screens below
 * threshold; both visits kept; week-9 and week-12 summaries reviewed; transition at week 12. No
 * queue item is ever created for her.
 *
 * Late-enrollment variant (FR-02, FR-37): enrolled on day 20 by a nurse in person. Days 3, 7 and
 * 14 are not_applicable, the day-21 check-in moves to enrollment + 1 day, the in-person enrollment
 * is the day-21 contact, and no Unreached item or reminder ever exists.
 */
import { enroll, recordDelivery, registerPatient } from '../../domain/services';
import {
  acknowledgeStep, answers, checkinSteps, closeStep, on, patientRecord, persona, planDoneStep, prefSteps, ratingStep, screenStep, summarySteps,
  visitDoneSteps, PRIMARY_CARE_ON_FILE, type Persona,
} from '../actions';
import { local, type SeedEnv } from '../env';
import { episodeOf } from '../lookup';
import { CLINICIAN, COORD, PATIENT, step, type Step } from '../script';

export type DanaVariant = 'baseline' | 'late_enrollment';

export const DANA = { key: 'dana', patient_id: 'pt-dana', delivery: '2026-03-03', expected: '2026-03-05', enrolled: '2026-02-17', late_enrolled: '2026-03-23' } as const;

const record = (p: Persona, at: string) => patientRecord({ id: p.patient_id, display_name: 'Dana', persona_key: 'dana', insurance_type: 'commercial', access_barriers: [] }, at);

const preferences = (p: Persona, at: string): Step[] => prefSteps(p, at, [
  { field: 'preferred_name', value: 'Dana' },
  { field: 'contact_windows', value: ['morning', 'evening'] },
  { field: 'safe_to_message', value: true },
  { field: 'baby_reference_permission', value: 'welcome' },
  { field: 'sharing_category', value: 'clinician_and_coordinator' },
]);

/** Weeks 6 to 12 are the same in both variants. */
function tail(p: Persona): Step[] {
  return [
    ...checkinSteps(p, 42, answers(), { open: on(p, 42, 10, 10), submit: on(p, 42, 10, 14) }),
    screenStep(p, on(p, 42, 10, 18), [0, 0, 1, 0, 0, 0, 0, 1, 0, 0], { day: 42 }),
    ratingStep(p, on(p, 42, 10, 22), 6, 4),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 30, outcome: 'comprehensive postpartum visit completed', plan: ['comprehensive_visit', 'contraception_conversation'] }),
    ...checkinSteps(p, 63, answers()),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...checkinSteps(p, 84, answers()),
    ratingStep(p, on(p, 84, 10, 28), 12, 5),
    planDoneStep(p, on(p, 84, 10, 50), ['pelvic_floor_recovery'], CLINICIAN),
    ...summarySteps(p, on(p, 84, 11, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), { primary_care: PRIMARY_CARE_ON_FILE, mental_health: 'not_indicated', open_items: [], owner_role: null, next_contact_date: null }),
  ];
}

export function danaSteps(env: SeedEnv, variant: DanaVariant = 'baseline'): Step[] {
  const p = persona(env, DANA.key, DANA.patient_id, local(env, DANA.delivery, 6));

  if (variant === 'late_enrollment') {
    const t0 = local(env, DANA.late_enrolled, 14, 0);
    return [
      step(t0, 'dana: registered by the nurse at the day-20 visit', (r) => { r.run(registerPatient({ patient: record(p, r.now()) }), COORD); }),
      step(local(env, DANA.late_enrolled, 14, 5), 'dana: enrolled in person by the nurse on day 20', (r) => {
        r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'after_delivery', delivery_date: p.delivery, delivery_outcome: 'live_birth', performed_by: 'staff', staff_user_id: 'coord-1' }), COORD);
      }),
      acknowledgeStep(p, local(env, DANA.late_enrolled, 14, 10)),
      ...preferences(p, local(env, DANA.late_enrolled, 14, 12)),
      // The early visit falls on day 21 as scheduled; the first live check-in is enrollment + 1 day (FR-02), released the next morning at 10:00.
      ...visitDoneSteps(p, on(p, 21, 10, 40), 'early_postpartum', { minutes: 25, outcome: 'early postpartum visit completed', plan: ['early_visit', 'blood_pressure_check'] }),
      ...checkinSteps(p, 21, answers(), { open: on(p, 22, 10, 20), submit: on(p, 22, 10, 24) }),
      ...tail(p),
    ];
  }

  const t0 = local(env, DANA.enrolled, 9, 0);
  return [
    step(t0, 'dana: registered at the 38-week visit', (r) => { r.run(registerPatient({ patient: record(p, r.now()) }), COORD); }),
    step(local(env, DANA.enrolled, 9, 5), 'dana: enrolls herself at 38 weeks', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'late_pregnancy', expected_date: local(env, DANA.expected, 6), delivery_date: null, delivery_outcome: null, performed_by: 'patient' }), PATIENT);
    }),
    acknowledgeStep(p, local(env, DANA.enrolled, 9, 10)),
    ...preferences(p, local(env, DANA.enrolled, 9, 12)),
    step(local(env, DANA.delivery, 14, 0), 'dana: the practice records the birth (two days before the expected date)', (r) => {
      r.run(recordDelivery({ episode_id: episodeOf(r, p.patient_id).id, delivery_date: p.delivery, outcome: 'live_birth' }), CLINICIAN);
    }),
    ...checkinSteps(p, 3, answers()),
    planDoneStep(p, on(p, 5, 9, 0), ['newborn_visit'], PATIENT),
    ...checkinSteps(p, 7, answers()),
    planDoneStep(p, on(p, 7, 11, 0), ['feeding_support'], PATIENT),
    ...checkinSteps(p, 14, answers()),
    screenStep(p, on(p, 14, 10, 30), [0, 1, 0, 0, 1, 0, 0, 1, 0, 0], { day: 14 }),
    planDoneStep(p, on(p, 14, 10, 40), ['mood_checkin_explained'], PATIENT),
    ...checkinSteps(p, 21, answers(), { open: on(p, 21, 10, 5), submit: on(p, 21, 10, 8) }),
    ...visitDoneSteps(p, on(p, 21, 10, 40), 'early_postpartum', { minutes: 25, outcome: 'early postpartum visit completed', plan: ['early_visit', 'blood_pressure_check'] }),
    ...tail(p),
  ];
}
