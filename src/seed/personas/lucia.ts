/**
 * 6.6 Lucía — Spanish-speaking patient. Preferred language Spanish (usted), Medicaid, interpreter
 * need, adult.
 *
 * Blocked branch: enrollment captures the language; the safety-critical Spanish class (FR-63a)
 * is not yet approved by the clinical owner, so she is not offered enrollment (reason
 * language_content_unavailable), counts in the denominator, and a human-only outreach item
 * "interpreter or Spanish-speaking staff needed" is created. When the content index does not
 * carry the class at all, registerPatient does this by itself; when the class is present only as
 * a placeholder translation (approver "placeholder-translator", placeholder: true), the service
 * allows enrollment and the coordinator records the not-offered status and the outreach item by
 * hand, which is what this build ships.
 *
 * Second branch: once the class is approved she enrolls; ordinary check-in items fall back to
 * English with the FR-63 marker (a UI concern). The branch checks the content index at run time
 * and stays blocked, with the missing ids in its description, until the class is approved.
 */
import { acknowledgeQueueItem, createQueueItem, enroll, recordEligibility, registerPatient, resolveQueueItem, safetyClassStatus } from '../../domain/services';
import type { SeedRunner } from '../../domain/store';
import type { QueueItem } from '../../domain/types';
import {
  ackItemStep, acknowledgeStep, answers, checkinSteps, closeStep, contactStep, on, patientRecord, persona, planDoneStep, prefSteps, ratingStep,
  resolveItemStep, screenStep, summarySteps, visitDoneSteps, PRIMARY_CARE_ON_FILE, type Persona,
} from '../actions';
import { local, type SeedEnv } from '../env';
import { COORD, step, type Step } from '../script';

export type LuciaVariant = 'blocked' | 'enrolled';

export const LUCIA = { key: 'lucia', patient_id: 'pt-lucia', delivery: '2026-04-15', registered: '2026-04-16' } as const;

/** The placeholder episode id a pre-enrollment item carries (the same form registerPatient uses). */
export const LUCIA_NO_EPISODE = `no-episode:${LUCIA.patient_id}`;

export const LUCIA_OUTREACH_NOTE = 'interpreter or Spanish-speaking staff needed; enrollment not offered until the clinical owner approves the Spanish safety-critical class (FR-63a); this build carries a placeholder translation only';

/** Whether the Spanish safety-critical class is approved in the content index in force. */
export function spanishClass(env: SeedEnv): { ok: boolean; missing: string[]; placeholder: boolean } {
  const status = safetyClassStatus(env.content, 'es');
  const placeholder = env.content.items.some((i) => i.locale === 'es' && i.placeholder);
  return { ok: status.ok, missing: status.missing, placeholder };
}

function record(p: Persona, at: string) {
  return patientRecord({ id: p.patient_id, display_name: 'Lucía', persona_key: 'lucia', insurance_type: 'medicaid', access_barriers: ['interpreter'], locale: 'es', formality: 'usted' }, at);
}

function blocked(env: SeedEnv, p: Persona): Step[] {
  const t0 = local(env, LUCIA.registered, 9, 0);
  const steps: Step[] = [
    step(t0, 'lucia: registered; enrollment captures Spanish as her language', (r) => { r.run(registerPatient({ patient: record(p, r.now()) }), COORD); }),
  ];
  if (spanishClass(env).ok) {
    // The service saw an approved (placeholder-translated) class; the practice does not offer enrollment on a placeholder translation.
    steps.push(
      step(local(env, LUCIA.registered, 9, 2), 'lucia: coordinator records not offered — Spanish safety-critical class not approved by the clinical owner', (r) => {
        r.run(recordEligibility({ patient_id: p.patient_id, status: 'not_offered', reason: 'language_content_unavailable' }), COORD);
      }),
      step(local(env, LUCIA.registered, 9, 3), 'lucia: coordinator creates the human-only outreach item', (r) => {
        r.run(createQueueItem({ queue_key: 'follow_through', episode_id: LUCIA_NO_EPISODE, patient_id: p.patient_id, trigger_type: 'referral', note: LUCIA_OUTREACH_NOTE }), COORD);
      }),
    );
  }
  steps.push(
    step(local(env, '2026-04-17', 10, 0), 'lucia: coordinator acknowledges the outreach item', (r) => {
      r.run(acknowledgeQueueItem({ queue_item_id: outreachItem(r).id }), COORD);
    }),
    step(local(env, '2026-04-17', 10, 30), 'lucia: coordinator closes the outreach item with an outcome', (r) => {
      r.run(resolveQueueItem({
        queue_item_id: outreachItem(r).id, minutes: 20,
        outcome: 'called with a phone interpreter; she will be offered enrollment when the Spanish safety-critical class is approved; interpreter booked for her visit',
      }), COORD);
    }),
  );
  return steps;
}

/** The pre-enrollment outreach item belongs to the patient, not to an episode. */
export function outreachItem(r: SeedRunner): QueueItem {
  const item = Object.values(r.state().queueItems).find((q) => q.patient_id === LUCIA.patient_id && q.queue_key === 'follow_through');
  if (!item) throw new Error('lucia: outreach item not found');
  return item;
}

function enrolled(env: SeedEnv, p: Persona): Step[] {
  return [
    step(local(env, LUCIA.registered, 9, 0), 'lucia: registered; enrollment captures Spanish as her language', (r) => { r.run(registerPatient({ patient: record(p, r.now()) }), COORD); }),
    step(local(env, LUCIA.registered, 9, 5), 'lucia: enrolled in person by the coordinator with a phone interpreter', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'after_delivery', delivery_date: p.delivery, delivery_outcome: 'live_birth', performed_by: 'staff', staff_user_id: 'coord-1' }), COORD);
    }),
    acknowledgeStep(p, local(env, LUCIA.registered, 9, 10)),
    ...prefSteps(p, local(env, LUCIA.registered, 9, 12), [
      { field: 'preferred_name', value: 'Lucía' },
      { field: 'formality', value: 'usted' },
      { field: 'contact_windows', value: ['afternoon'] },
      { field: 'safe_to_message', value: true },
      { field: 'baby_reference_permission', value: 'welcome' },
      { field: 'sharing_category', value: 'clinician_and_coordinator' },
    ]),
    ...checkinSteps(p, 3, answers({ barriers: 'interpreter' }), { open: on(p, 3, 14, 0), submit: on(p, 3, 14, 5) }),
    ackItemStep(p, on(p, 5, 9, 0), { trigger_type: 'barrier', open: true }),
    contactStep(p, on(p, 5, 9, 20), { type: 'phone_call', outcome: 'called with a phone interpreter; interpreter booked for the early visit', minutes: 15 }),
    resolveItemStep(p, on(p, 5, 9, 25), { trigger_type: 'barrier', open: true }, { outcome: 'interpreter booked for the early postpartum visit', withContact: true }),
    ...checkinSteps(p, 7, answers()),
    ...checkinSteps(p, 14, answers()),
    screenStep(p, on(p, 14, 10, 30), [0, 1, 0, 0, 1, 0, 0, 0, 0, 0], { day: 14 }),
    ...checkinSteps(p, 21, answers(), { open: on(p, 21, 10, 15), submit: on(p, 21, 10, 18) }),
    ...visitDoneSteps(p, on(p, 21, 11, 0), 'early_postpartum', { minutes: 30, outcome: 'early postpartum visit completed with an interpreter', plan: ['early_visit', 'blood_pressure_check', 'newborn_visit', 'feeding_support'] }),
    ...checkinSteps(p, 42, answers(), { open: on(p, 42, 10, 10), submit: on(p, 42, 10, 14) }),
    screenStep(p, on(p, 42, 10, 18), [0, 0, 1, 0, 0, 0, 0, 1, 0, 0], { day: 42 }),
    ratingStep(p, on(p, 42, 10, 22), 6, 4),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 35, outcome: 'comprehensive postpartum visit completed with an interpreter', plan: ['comprehensive_visit', 'contraception_conversation', 'pelvic_floor_recovery'] }),
    ...checkinSteps(p, 63, answers()),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...checkinSteps(p, 84, answers()),
    ratingStep(p, on(p, 84, 10, 28), 12, 4),
    ...summarySteps(p, on(p, 84, 11, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), { primary_care: PRIMARY_CARE_ON_FILE, mental_health: 'not_indicated', open_items: [], owner_role: null, next_contact_date: null }),
  ];
}

export function luciaSteps(env: SeedEnv, variant: LuciaVariant = 'blocked'): Step[] {
  const p = persona(env, LUCIA.key, LUCIA.patient_id, local(env, LUCIA.delivery, 6));
  if (variant === 'enrolled' && spanishClass(env).ok) return enrolled(env, p);
  return blocked(env, p);
}
