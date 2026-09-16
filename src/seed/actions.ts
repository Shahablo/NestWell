/**
 * Composite step builders shared by the persona scripts. Every builder runs a real domain
 * service through the runner as a realistic actor; nothing here writes an event directly
 * (NFR-11: seeded history and live actions are the same kind of thing).
 */
import { addMinutes } from '../domain/clock';
import type { SubmitResponse } from '../domain/services/checkins';
import {
  acknowledgeEnrollment, acknowledgeQueueItem, administerScreen, closeEpisode, completeCarePlanItem, draftSummary, logContact, openCheckin,
  rateEscalation, rateUsefulness, readScreen, recordAssessment, resolveQueueItem, setPreference, setSummaryState, setVisitState, submitCheckin,
} from '../domain/services';
import type {
  AccessBarrier, Actor, AssessmentOutcome, ContactType, EscalationRating, Id, ISO, InsuranceType, Locale, Patient, Preferences, SharingCategory,
  SummaryPeriod, Transition, VisitType,
} from '../domain/types';
import { dayAt, itemIndexes, sendTime, type SeedEnv } from './env';
import { checkinOn, episodeOf, itemOf, latestContact, latestScreen, planItemOf, summaryOf, visitOf, type ItemPick } from './lookup';
import { CLINICIAN, COORD, PATIENT, step, type Step } from './script';

/** A persona under construction: who she is and the anchor (delivery or loss date) her days count from. */
export interface Persona {
  key: string;
  patient_id: Id;
  delivery: ISO;
  env: SeedEnv;
}

export const persona = (env: SeedEnv, key: string, patient_id: Id, delivery: ISO): Persona => ({ env, key, patient_id, delivery });

/** Shorthand for a wall-clock time on delivery day + `day`. */
export const on = (p: Persona, day: number, hour: number, minute = 0): ISO => dayAt(p.env, p.delivery, day, hour, minute);

// ---------------------------------------------------------------------------
// Patient records and preferences
// ---------------------------------------------------------------------------

export interface PatientSpec {
  id: Id;
  display_name: string;
  persona_key: string;
  insurance_type: InsuranceType;
  access_barriers: AccessBarrier[];
  locale?: Locale;
  formality?: 'usted' | 'tu' | null;
  sharing_category?: SharingCategory;
}

/** A synthetic adult patient with the least-intrusive defaults (FR-03); she sets the rest in preferences. */
export function patientRecord(spec: PatientSpec, registered_at: ISO): Patient {
  return {
    id: spec.id,
    is_synthetic: true,
    is_adult: true,
    display_name: spec.display_name,
    persona_key: spec.persona_key,
    insurance_type: spec.insurance_type,
    access_barriers: [...spec.access_barriers],
    registered_at,
    preferences: {
      locale: spec.locale ?? 'en', formality: spec.formality ?? null, preferred_name: null, form_of_address: null, contact_windows: [],
      safe_to_message: null, baby_reference_permission: 'unset', baby_name: null, sharing_category: spec.sharing_category ?? 'clinician_only', contact_frequency: null,
    },
  };
}

export type PrefChange = { [K in keyof Preferences]: { field: K; value: Preferences[K] } }[keyof Preferences];

/** One preferences_changed per field, a minute apart, as the patient taps through the preferences screen. */
export function prefSteps(p: Persona, at: ISO, changes: PrefChange[]): Step[] {
  return changes.map((c, i) => step(addMinutes(at, i), `${p.key}: sets preference ${c.field}`, (r) => {
    r.run(setPreference({ patient_id: p.patient_id, field: c.field, value: c.value }), PATIENT);
  }));
}

export function acknowledgeStep(p: Persona, at: ISO, mode: 'standard' | 'demo_participant' = 'standard'): Step {
  return step(at, `${p.key}: acknowledges enrollment`, (r) => {
    r.run(acknowledgeEnrollment({ episode_id: episodeOf(r, p.patient_id).id, mode }), PATIENT);
  });
}

// ---------------------------------------------------------------------------
// Check-ins and screens
// ---------------------------------------------------------------------------

export interface Answers {
  /** Values of the urgent-symptom multi-tap item; ['none'] by default. */
  urgent?: string[];
  coping?: 'coping' | 'some_days_hard' | 'not_coping';
  barriers?: 'transport' | 'childcare' | 'phone_data' | 'interpreter' | 'cost' | 'no';
  callback?: 'yes' | 'no';
  /** Loss set only. */
  body_recovery?: 'better' | 'same' | 'worse' | 'not_sure';
  /** Loss and trauma sets only. */
  contact_preference?: 'call' | 'message' | 'not_now';
  /** Optional free text (FR-17). */
  note?: string;
}

/**
 * A full set of answers for any template: keys a template does not carry are ignored by
 * submitCheckin, and every carried item is answered, so the check-in counts as complete.
 */
export function answers(a: Answers = {}): SubmitResponse[] {
  const out: SubmitResponse[] = [
    { question_key: 'urgent_symptoms', value: a.urgent ?? ['none'] },
    { question_key: 'coping', value: a.coping ?? 'coping' },
    { question_key: 'barriers', value: a.barriers ?? 'no' },
    { question_key: 'callback', value: a.callback ?? 'no' },
    { question_key: 'body_recovery', value: a.body_recovery ?? 'better' },
    { question_key: 'contact_preference', value: a.contact_preference ?? 'message' },
  ];
  if (a.note) out.push({ question_key: 'free_text', value: null, free_text: a.note });
  return out;
}

export interface CheckinTiming {
  open?: ISO;
  submit?: ISO;
  complete?: boolean;
}

/** Open then submit the day-N check-in (default: 20 and 24 minutes after it is released). */
export function checkinSteps(p: Persona, day: number, responses: SubmitResponse[], timing: CheckinTiming = {}): Step[] {
  const open = timing.open ?? addMinutes(sendTime(p.env, p.delivery, day), 20);
  const submit = timing.submit ?? addMinutes(open, 4);
  return [
    step(open, `${p.key}: opens the day-${day} check-in`, (r) => {
      r.run(openCheckin({ checkin_id: checkinOn(r, p.patient_id, day).id }), PATIENT);
    }),
    step(submit, `${p.key}: submits the day-${day} check-in`, (r) => {
      r.run(submitCheckin({ checkin_id: checkinOn(r, p.patient_id, day).id, responses, complete: timing.complete }), PATIENT);
    }),
  ];
}

export interface ScreenOptions {
  /** Cadence day of the check-in the instrument step belongs to; omit for a screen taken from home. */
  day?: number;
  instrument?: string;
  framing?: 'standard' | 'loss_pathway';
}

/** The patient answers the instrument; `scores` are per-item scores, resolved to option indexes from config. */
export function screenStep(p: Persona, at: ISO, scores: number[], o: ScreenOptions = {}): Step {
  const instrument = o.instrument ?? 'epds';
  return step(at, `${p.key}: answers the ${instrument} step`, (r) => {
    r.run(administerScreen({
      episode_id: episodeOf(r, p.patient_id).id, instrument_key: instrument, checkin_id: o.day === undefined ? null : checkinOn(r, p.patient_id, o.day).id,
      item_responses: itemIndexes(p.env, instrument, scores), framing: o.framing,
    }), PATIENT);
  });
}

export function ratingStep(p: Persona, at: ISO, week: 6 | 12, rating: number, comment?: string): Step {
  return step(at, `${p.key}: rates usefulness at week ${week}`, (r) => {
    r.run(rateUsefulness({ episode_id: episodeOf(r, p.patient_id).id, week, rating, comment }), PATIENT);
  });
}

// ---------------------------------------------------------------------------
// Practice actions: contacts, queue items, visits, care plan, summaries, closure
// ---------------------------------------------------------------------------

export interface ContactSpec {
  type: ContactType;
  outcome: string;
  minutes: number;
  note?: string;
}

export function contactStep(p: Persona, at: ISO, c: ContactSpec, actor: Actor = COORD): Step {
  return step(at, `${p.key}: ${actor.role} logs a ${c.type} contact`, (r) => {
    r.run(logContact({ episode_id: episodeOf(r, p.patient_id).id, type: c.type, outcome: c.outcome, note: c.note ?? null, minutes: c.minutes }), actor);
  });
}

export function ackItemStep(p: Persona, at: ISO, pick: ItemPick, actor: Actor = COORD): Step {
  return step(at, `${p.key}: ${actor.role} acknowledges ${pick.queue_key ?? 'the'} item`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    r.run(acknowledgeQueueItem({ queue_item_id: itemOf(r, ep.id, pick).id }), actor);
  });
}

export interface ResolveSpec {
  outcome: string;
  note?: string;
  /** Minutes create one staff_time row (FR-45) unless the close references the latest contact (FR-38). */
  minutes?: number;
  withContact?: boolean;
}

export function resolveItemStep(p: Persona, at: ISO, pick: ItemPick, s: ResolveSpec, actor: Actor = COORD): Step {
  return step(at, `${p.key}: ${actor.role} resolves ${pick.queue_key ?? 'the'} item`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    const item = itemOf(r, ep.id, pick);
    const contact_id = s.withContact ? latestContact(r, ep.id).id : null;
    r.run(resolveQueueItem({ queue_item_id: item.id, outcome: s.outcome, note: s.note ?? null, minutes: s.minutes ?? null, contact_id }), actor);
  });
}

export function rateItemStep(p: Persona, at: ISO, pick: ItemPick, rating: EscalationRating): Step {
  return step(at, `${p.key}: clinician rates the escalation ${rating}`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    r.run(rateEscalation({ queue_item_id: itemOf(r, ep.id, pick).id, rating }), CLINICIAN);
  });
}

/** FR-03a: a staff read of her free text or of a screen's item responses is recorded. */
export function readStep(p: Persona, at: ISO, field: 'screen_items' | 'free_text', actor: Actor = CLINICIAN): Step {
  return step(at, `${p.key}: ${actor.role} reads ${field}`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    const screen_result_id = field === 'screen_items' ? latestScreen(r, ep.id).id : null;
    r.run(readScreen({ screen_result_id, episode_id: ep.id, field }), actor);
  });
}

export interface AssessmentSpec {
  outcome: AssessmentOutcome;
  note: string;
  minutes?: number;
  /** Link to the latest screen (FR-32); default true. */
  screen?: boolean;
  /** Link to a queue item as the trigger. */
  trigger?: ItemPick;
}

export function assessmentStep(p: Persona, at: ISO, a: AssessmentSpec): Step {
  return step(at, `${p.key}: clinician records an assessment (${a.outcome})`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    r.run(recordAssessment({
      episode_id: ep.id, screen_result_id: a.screen === false ? null : latestScreen(r, ep.id).id, trigger_ref: a.trigger ? itemOf(r, ep.id, a.trigger).id : null,
      outcome: a.outcome, note: a.note, minutes: a.minutes ?? null,
    }), CLINICIAN);
  });
}

export interface VisitDone {
  minutes: number;
  outcome: string;
  /** Care plan keys the coordinator marks completed at the visit. */
  plan?: string[];
}

/** The coordinator records the visit as completed, logs the in-person contact once, and completes the plan items. */
export function visitDoneSteps(p: Persona, at: ISO, type: VisitType, v: VisitDone): Step[] {
  const steps: Step[] = [
    step(at, `${p.key}: coordinator marks the ${type} visit completed`, (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setVisitState({ visit_id: visitOf(r, ep.id, type).id, state: 'completed' }), COORD);
    }),
    contactStep(p, addMinutes(at, 2), { type: 'in_person', outcome: v.outcome, minutes: v.minutes }),
  ];
  if (v.plan?.length) steps.push(planDoneStep(p, addMinutes(at, 5), v.plan, COORD));
  return steps;
}

export function planDoneStep(p: Persona, at: ISO, keys: string[], actor: Actor): Step {
  return step(at, `${p.key}: ${actor.role ?? actor.type} completes care plan items ${keys.join(', ')}`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    for (const key of keys) r.run(completeCarePlanItem({ episode_id: ep.id, item_id: planItemOf(r, ep.id, key).id }), actor);
  });
}

/** The clinician drafts the summary (canned narrative, AI-02), acknowledges the review item, marks it reviewed and closes the item. */
export function summarySteps(p: Persona, at: ISO, period: SummaryPeriod): Step[] {
  return [
    step(at, `${p.key}: clinician drafts the ${period} summary`, (r) => {
      r.run(draftSummary({ episode_id: episodeOf(r, p.patient_id).id, period }), CLINICIAN);
    }),
    ackItemStep(p, addMinutes(at, 10), { queue_key: 'summaries', open: true }, CLINICIAN),
    step(addMinutes(at, 20), `${p.key}: clinician marks the ${period} summary reviewed`, (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setSummaryState({ summary_id: summaryOf(r, ep.id, period).id, state: 'reviewed' }), CLINICIAN);
    }),
    resolveItemStep(p, addMinutes(at, 21), { queue_key: 'summaries', open: true }, { outcome: 'reviewed', minutes: 10 }, CLINICIAN),
  ];
}

export function closeStep(p: Persona, at: ISO, transition: Transition): Step {
  return step(at, `${p.key}: coordinator completes the transition and closes the episode`, (r) => {
    r.run(closeEpisode({ episode_id: episodeOf(r, p.patient_id).id, transition }), COORD);
  });
}

export const PRIMARY_CARE_ON_FILE = 'Primary care clinician on file (synthetic)';
