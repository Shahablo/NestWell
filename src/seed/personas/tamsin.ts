/**
 * 6.7 Tamsin — high utilizer. English, commercial insurance, twins, NICU stay. She sets the NICU
 * status herself on day 1 (milestone and celebration items suppressed; the NICU check-in set from
 * then on). Weeks 2–6: "I need help now" at most check-ins with a callback each time, free text on
 * check-ins, and many saved questions, each of which creates a queue item on entry (FR-17). One
 * saved question, entered at 4 p.m. on a Friday, contains an emergency-lexicon term. The canned
 * AI-03 exemplar groups her other questions without answering them. Minutes accumulate.
 *
 * The scan-on and scan-off branches run this same script; what differs is
 * config.freetext.free_text_urgency_scan, which the free-text service reads (FR-17). With the
 * flag off (this build): the flagged question creates a Needs-review item, read the same
 * afternoon. With the flag on: the same entry renders the full-screen locked instruction, creates
 * one Urgent item and no Needs-review item, and logs the lexicon version.
 */
import {
  acknowledgeQueueItem, addSavedQuestion, completeCallback, confirmSensitiveStatus, enroll, helpNow, organizeQuestions, registerPatient, requestCallback,
  resolveQueueItem, setSensitiveStatus,
} from '../../domain/services';
import {
  ackItemStep, acknowledgeStep, answers, checkinSteps, closeStep, contactStep, on, patientRecord, persona, planDoneStep, prefSteps, rateItemStep,
  ratingStep, readStep, resolveItemStep, screenStep, summarySteps, visitDoneSteps, PRIMARY_CARE_ON_FILE, type Persona,
} from '../actions';
import { addMinutes } from '../../domain/clock';
import { local, type SeedEnv } from '../env';
import { episodeOf, itemOf, pendingCallback } from '../lookup';
import { CLINICIAN, COORD, PATIENT, step, type Step } from '../script';
import type { EscalationRating } from '../../domain/types';

export const TAMSIN = { key: 'tamsin', patient_id: 'pt-tamsin', delivery: '2026-01-26', flagged_question_day: 18 } as const;

/** The emergency-lexicon term is "do not want to be here" (class self_harm). The text itself is never stored on the match (SR-11). */
export const TAMSIN_FLAGGED_QUESTION = 'Some nights I do not want to be here any more. Who can I talk to?';

/** Texts the canned AI-03 exemplar groups (config/ai-exemplars.json, question_organizer.tamsin), in the order she enters them. */
export const TAMSIN_QUESTIONS = {
  day9: ['How do I pump while the babies are in the NICU?', 'Is it okay to mix formula and breast milk?'],
  day12: ['When can I lift things heavier than the babies?', 'How long will my incision feel numb?'],
  day14: ['Is there parking near the clinic entrance?', 'When can I start exercising again?'],
  day21: ['Who signs my leave paperwork?', 'Do I need a separate referral for the pediatrician?'],
  day42: ['Can I bring both babies to my six-week visit?', 'How long will the six-week visit take?'],
  day63: ['Can my partner come to the twelve-week visit?'],
} as const;

function questionSteps(p: Persona, at: string, texts: readonly string[]): Step[] {
  return texts.map((text, i) => step(addMinutes(at, i), `tamsin: saves a question (${i + 1}/${texts.length})`, (r) => {
    r.run(addSavedQuestion({ episode_id: episodeOf(r, p.patient_id).id, text }), PATIENT);
  }));
}

/** "I need help now" from a check-in, a callback request, the coordinator's callback and the close against that contact. */
function helpNowSteps(p: Persona, at: string, callbackOutcome: string, minutes: number, rating: EscalationRating): Step[] {
  const t = (m: number) => addMinutes(at, m);
  return [
    step(t(0), 'tamsin: taps "I need help now"', (r) => { r.run(helpNow({ episode_id: episodeOf(r, p.patient_id).id }), PATIENT); }),
    step(t(2), 'tamsin: requests a callback on the Urgent item', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(requestCallback({ episode_id: ep.id, queue_item_id: itemOf(r, ep.id, { queue_key: 'urgent', open: true }).id }), PATIENT);
    }),
    ackItemStep(p, t(15), { queue_key: 'urgent', open: true }),
    step(t(25), 'tamsin: coordinator completes the callback', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(completeCallback({ callback_id: pendingCallback(r, ep.id).id, occurred: true, outcome: callbackOutcome, minutes }), COORD);
    }),
    resolveItemStep(p, t(30), { queue_key: 'urgent', open: true }, { outcome: 'callback completed and outcome logged', withContact: true }),
    rateItemStep(p, t(60), { queue_key: 'urgent' }, rating),
  ];
}

/** Acknowledge and close the oldest open free-text Needs-review items, one command per item (5 minutes each). */
function closeFreeTextItems(p: Persona, at: string, outcome: string, count: number): Step[] {
  return Array.from({ length: count }, (_, i) => step(addMinutes(at, i * 2), `tamsin: clinician reads and closes a free-text item (${i + 1}/${count})`, (r) => {
    const ep = episodeOf(r, p.patient_id);
    const open = Object.values(r.state().queueItems)
      .filter((q) => q.episode_id === ep.id && q.queue_key === 'needs_review' && q.state !== 'resolved' && q.trigger_type === 'free_text')
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const item = open[0];
    if (!item) throw new Error('tamsin: no open free-text item to close');
    if (item.acknowledged_at === null) r.run(acknowledgeItem(item.id), CLINICIAN);
    r.run(resolveItem(item.id, outcome), CLINICIAN);
  }));
}

const acknowledgeItem = (queue_item_id: string) => acknowledgeQueueItem({ queue_item_id });
const resolveItem = (queue_item_id: string, outcome: string) => resolveQueueItem({ queue_item_id, outcome, minutes: 5 });

export function tamsinSteps(env: SeedEnv): Step[] {
  const p = persona(env, TAMSIN.key, TAMSIN.patient_id, local(env, TAMSIN.delivery, 6));
  return [
    step(on(p, 1, 11, 0), 'tamsin: registered on the postnatal ward', (r) => {
      r.run(registerPatient({ patient: patientRecord({ id: p.patient_id, display_name: 'Tamsin', persona_key: 'tamsin', insurance_type: 'commercial', access_barriers: [] }, r.now()) }), COORD);
    }),
    step(on(p, 1, 11, 5), 'tamsin: enrolled by the coordinator before discharge', (r) => {
      r.run(enroll({ patient_id: p.patient_id, enrollment_point: 'before_discharge', delivery_date: p.delivery, delivery_outcome: 'live_birth', performed_by: 'staff', staff_user_id: 'coord-1' }), COORD);
    }),
    acknowledgeStep(p, on(p, 1, 11, 10)),
    ...prefSteps(p, on(p, 1, 11, 12), [
      { field: 'preferred_name', value: 'Tamsin' },
      { field: 'contact_windows', value: ['morning', 'afternoon', 'evening'] },
      { field: 'safe_to_message', value: true },
      { field: 'baby_reference_permission', value: 'welcome' },
      { field: 'sharing_category', value: 'clinician_and_coordinator' },
    ]),
    step(on(p, 1, 11, 20), 'tamsin: taps "My baby is in the NICU"', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(setSensitiveStatus({ patient_id: p.patient_id, episode_id: ep.id, subtype: 'nicu', set_by: 'patient', control: 'nicu' }), PATIENT);
    }),
    step(on(p, 1, 14, 0), 'tamsin: coordinator confirms the NICU subtype', (r) => { r.run(confirmSensitiveStatus({ patient_id: p.patient_id, subtype: 'nicu' }), COORD); }),
    ackItemStep(p, on(p, 1, 14, 5), { queue_key: 'sensitive_review', open: true }, CLINICIAN),
    resolveItemStep(p, on(p, 1, 14, 10), { queue_key: 'sensitive_review', open: true }, { outcome: 'subtype confirmed: NICU; milestone and celebration items suppressed', minutes: 5 }, CLINICIAN),

    // Day 3: callback requested, a note on the check-in.
    ...checkinSteps(p, 3, answers({ coping: 'some_days_hard', callback: 'yes', note: 'The twins are still in the NICU. When can I see my own doctor about my incision?' }), { open: on(p, 3, 10, 15), submit: on(p, 3, 10, 20) }),
    ackItemStep(p, on(p, 3, 11, 0), { trigger_type: 'callback', open: true }),
    step(on(p, 3, 11, 30), 'tamsin: coordinator completes the requested callback', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(completeCallback({ callback_id: pendingCallback(r, ep.id).id, occurred: true, outcome: 'called; questions about her incision answered; early visit moved up', minutes: 15 }), COORD);
    }),
    resolveItemStep(p, on(p, 3, 11, 35), { trigger_type: 'callback', open: true }, { outcome: 'callback completed', withContact: true }),
    readStep(p, on(p, 3, 13, 0), 'free_text'),
    ...closeFreeTextItems(p, on(p, 3, 13, 2), 'note read; answered on the callback', 1),

    // Day 7: the middle coping option twice in a row offers the instrument through the configured rule.
    ...checkinSteps(p, 7, answers({ coping: 'some_days_hard' }), { open: on(p, 7, 10, 10), submit: on(p, 7, 10, 15) }),
    screenStep(p, on(p, 7, 10, 20), [1, 1, 1, 0, 1, 1, 1, 1, 1, 0], { day: 7 }),

    ...questionSteps(p, on(p, 9, 20, 0), TAMSIN_QUESTIONS.day9),
    ...closeFreeTextItems(p, on(p, 10, 9, 0), 'question read; answered on the next call', 2),
    ...questionSteps(p, on(p, 12, 21, 0), TAMSIN_QUESTIONS.day12),
    ...closeFreeTextItems(p, on(p, 14, 8, 30), 'question read; answered on the next call', 2),

    // Day 14: check-in with a note, the instrument, help now, two more questions.
    ...checkinSteps(p, 14, answers({ coping: 'some_days_hard', note: 'Will the NICU team talk to my OB about the twins?' }), { open: on(p, 14, 10, 10), submit: on(p, 14, 10, 15) }),
    screenStep(p, on(p, 14, 10, 25), [0, 1, 1, 0, 1, 1, 0, 1, 1, 0], { day: 14 }),
    ...helpNowSteps(p, on(p, 14, 10, 30), 'called back; her questions answered; clinician call arranged for tomorrow', 12, 'appropriate'),
    readStep(p, on(p, 14, 11, 5), 'free_text'),
    ...closeFreeTextItems(p, on(p, 14, 11, 7), 'note read; the NICU team contact was passed to the OB', 1),
    ...questionSteps(p, on(p, 14, 15, 0), TAMSIN_QUESTIONS.day14),
    ...closeFreeTextItems(p, on(p, 15, 9, 0), 'question read; answered on the next call', 2),

    // Day 18, Friday 4 p.m.: the question that carries an emergency-lexicon term (FR-17, both modes).
    ...questionSteps(p, on(p, TAMSIN.flagged_question_day, 16, 10), [TAMSIN_FLAGGED_QUESTION]),
    step(on(p, TAMSIN.flagged_question_day, 16, 22), 'tamsin: the on-call clinician acknowledges the item the question created', (r) => {
      const ep = episodeOf(r, p.patient_id);
      r.run(acknowledgeItem(itemOf(r, ep.id, { open: true }).id), CLINICIAN);
    }),
    contactStep(p, on(p, TAMSIN.flagged_question_day, 16, 30), { type: 'phone_call', outcome: 'called the same afternoon; safety conversation; she has the crisis line and the after-hours number; follow-up call Monday; behavioral health partner offered', minutes: 20 }, CLINICIAN),
    step(on(p, TAMSIN.flagged_question_day, 16, 50), 'tamsin: the clinician closes the item against that call', (r) => {
      const ep = episodeOf(r, p.patient_id);
      const item = itemOf(r, ep.id, { open: true });
      const contact = Object.values(r.state().contacts).filter((c) => c.episode_id === ep.id).sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).pop();
      r.run(resolveQueueItem({ queue_item_id: item.id, outcome: 'called the same afternoon; safety plan reviewed; follow-up call Monday', contact_id: contact?.id ?? null }), CLINICIAN);
    }),
    rateItemStep(p, on(p, TAMSIN.flagged_question_day, 17, 0), { open: false }, 'appropriate'),

    // Day 21: early visit, check-in, help now, two more questions.
    ...checkinSteps(p, 21, answers(), { open: on(p, 21, 10, 20), submit: on(p, 21, 10, 24) }),
    ...helpNowSteps(p, on(p, 21, 10, 30), 'called back; visit logistics confirmed', 10, 'unsure'),
    ...visitDoneSteps(p, on(p, 21, 11, 30), 'early_postpartum', { minutes: 25, outcome: 'early postpartum visit completed', plan: ['early_visit', 'blood_pressure_check', 'mood_checkin_explained'] }),
    ...questionSteps(p, on(p, 21, 16, 0), TAMSIN_QUESTIONS.day21),
    ...closeFreeTextItems(p, on(p, 22, 9, 0), 'question read; answered by phone', 2),

    // Week 6: check-in, instrument, usefulness, help now, the last two questions, the canned organizer, the comprehensive visit.
    ...checkinSteps(p, 42, answers(), { open: on(p, 42, 10, 10), submit: on(p, 42, 10, 14) }),
    screenStep(p, on(p, 42, 10, 18), [0, 1, 1, 0, 1, 0, 1, 1, 0, 0], { day: 42 }),
    ratingStep(p, on(p, 42, 10, 22), 6, 3),
    ...helpNowSteps(p, on(p, 42, 10, 25), 'called back; questions for the visit reviewed', 10, 'unnecessary'),
    ...questionSteps(p, on(p, 42, 10, 28), TAMSIN_QUESTIONS.day42),
    step(on(p, 42, 10, 58), 'tamsin: the canned AI-03 exemplar groups her questions (never the flagged one)', (r) => {
      r.run(organizeQuestions({ episode_id: episodeOf(r, p.patient_id).id }), PATIENT);
    }),
    ...visitDoneSteps(p, on(p, 42, 11, 30), 'comprehensive', { minutes: 30, outcome: 'comprehensive postpartum visit completed', plan: ['comprehensive_visit', 'contraception_conversation', 'pelvic_floor_recovery', 'newborn_visit'] }),
    ...closeFreeTextItems(p, on(p, 42, 13, 0), 'question read; answered at the visit', 2),

    // Week 9: one question stays open at the summary; week 12: usefulness, feeding support done, summary, transition.
    ...checkinSteps(p, 63, answers()),
    ...questionSteps(p, on(p, 63, 10, 40), TAMSIN_QUESTIONS.day63),
    ...summarySteps(p, on(p, 63, 11, 0), 'week9'),
    ...closeFreeTextItems(p, on(p, 65, 9, 0), 'question read; answered by phone', 1),
    ...checkinSteps(p, 84, answers(), { open: on(p, 84, 10, 10), submit: on(p, 84, 10, 14) }),
    ratingStep(p, on(p, 84, 10, 20), 12, 4),
    planDoneStep(p, on(p, 84, 10, 30), ['feeding_support'], PATIENT),
    ...summarySteps(p, on(p, 84, 14, 0), 'week12'),
    planDoneStep(p, on(p, 85, 9, 0), ['transition_primary_care'], COORD),
    closeStep(p, on(p, 85, 9, 5), {
      primary_care: PRIMARY_CARE_ON_FILE, mental_health: 'none_identified', open_items: ['mental health destination not identified; NICU follow-up continues with the pediatric team'],
      owner_role: 'coordinator', next_contact_date: on(p, 92, 10, 0),
    }),
  ];
}
