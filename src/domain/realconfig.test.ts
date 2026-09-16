/**
 * CORE against the shipped config and content (config/*.json, content/en/*.json): the flows the seeds and
 * the UI run must produce exactly one item per reason with the real rules, and every canned narrative
 * must pass the AI-16 postfilter. Option values are discovered from the templates by rule tag so the
 * test survives wording changes; only the ids ARCHITECTURE section 4 promises are named.
 */
import { describe, expect, it } from 'vitest';
import { addDays, addMinutes } from './clock';
import { loadConfig } from './config';
import { narrativeViolations } from './services/ai';
import { submitCheckin, type SubmitResponse } from './services/checkins';
import { enroll, registerPatient } from './services/enrollment';
import { assertScanConsistency } from './services/freetext';
import { helpNow } from './services/queues';
import { CRITICAL_WITHHELD_NOTE, administerScreen } from './services/screening';
import { setSensitivePreferences, setSensitiveStatus } from './services/sensitive';
import { draftSummary } from './services/summaries';
import { ADMIN, CLINICIAN, DELIVERY, PATIENT } from './testflows';
import { makePatient, makeTestContext, makeTestStore, type PatientOverrides } from './testutil';
import type { AnyEvent, Id, RuleTag } from './types';

const loaded = loadConfig();
const { config, content } = loaded;

function enrolledReal(store: ReturnType<typeof makeTestStore>, patient_id: string, over: PatientOverrides = {}, outcome: 'live_birth' | 'stillbirth' = 'live_birth') {
  store.setClock(addMinutes(DELIVERY, 360));
  store.dispatch(registerPatient({ patient: makePatient(patient_id, over) }), ADMIN);
  store.dispatch(enroll({ patient_id, enrollment_point: 'after_delivery', delivery_date: DELIVERY, delivery_outcome: outcome, performed_by: 'patient' }), PATIENT);
  const episode = Object.values(store.getState().episodes).find((e) => e.patient_id === patient_id);
  if (!episode) throw new Error('no episode');
  return episode.id;
}

function checkin(store: ReturnType<typeof makeTestStore>, episode_id: Id, day: number) {
  const c = Object.values(store.getState().checkins).find((x) => x.episode_id === episode_id && x.day_number === day);
  if (!c) throw new Error(`no check-in for day ${day}`);
  return c;
}

/** The first option carrying a rule tag on the template, as a submission response. */
function answerWithTag(templateKey: string, tag: RuleTag): SubmitResponse {
  const t = config.checkins[templateKey];
  for (const item of t.items) {
    const o = item.options.find((x) => x.rule_tags.includes(tag));
    if (o) return { question_key: item.key, value: item.response_type === 'multi_tap' ? [o.value] : o.value };
  }
  throw new Error(`no option tagged ${tag} on ${templateKey}`);
}

const of = <T extends AnyEvent['type']>(events: AnyEvent[], type: T) => events.filter((e): e is Extract<AnyEvent, { type: T }> => e.type === type);

describe('shipped config and content', () => {
  it('loads with zero problems and a consistent free-text mode', () => {
    expect(loaded.problems).toEqual([]);
    expect(() => assertScanConsistency(config)).not.toThrow();
  });

  it('a day-3 submission with an urgent answer, worst coping, a barrier, a callback and a note creates exactly one item per reason', () => {
    const store = makeTestStore(config, content);
    const episode_id = enrolledReal(store, 'real-a', { insurance_type: 'medicaid', access_barriers: ['transport'] });
    const c3 = checkin(store, episode_id, 3);
    const note = config.checkins.day03.items.find((i) => i.response_type === 'free_text_optional');
    expect(note).toBeTruthy();
    store.setClock(addMinutes(c3.scheduled_at, 30));
    const events = store.dispatch(submitCheckin({
      checkin_id: c3.id,
      responses: [
        answerWithTag('day03', 'urgent_candidate'), answerWithTag('day03', 'coping_difficulty'), answerWithTag('day03', 'barrier_transport'),
        answerWithTag('day03', 'callback_requested'), { question_key: note!.key, value: null, free_text: 'I am very tired and sore' },
      ],
    }), PATIENT);
    const items = Object.values(store.getState().queueItems).filter((q) => q.episode_id === episode_id);
    const byType = (t: string) => items.filter((q) => q.trigger_type === t);
    expect(items.filter((q) => q.queue_key === 'urgent')).toHaveLength(1);
    expect(byType('rule')).toHaveLength(1);
    expect(byType('coping_difficulty')).toHaveLength(1);
    expect(byType('coping_difficulty')[0].open_clinical_flag).toBe(true);
    expect(byType('free_text')).toHaveLength(1);
    expect(byType('barrier')).toHaveLength(1);
    expect(byType('callback')).toHaveLength(1);
    expect(items).toHaveLength(5);
    const fired = of(events, 'rule_fired');
    expect(fired.map((e) => e.payload.rule_key).sort()).toEqual(['barrier_item', 'callback_requested', 'coping_worst', 'free_text_present', 'urgent_symptom']);
    for (const f of fired) {
      const item = items.find((q) => q.id === f.payload.queue_item_id);
      expect(item, f.payload.rule_key).toBeTruthy();
    }
    expect(of(events, 'emergency_instruction_shown').some((e) => e.payload.layout === 'full_screen')).toBe(true);
    expect(of(events, 'emergency_instruction_shown').some((e) => e.payload.layout === 'inline')).toBe(true);
    expect(of(events, 'barrier_item_created')).toHaveLength(1);
    expect(of(events, 'callback_requested')).toHaveLength(1);
    const offered = of(events, 'screen_offered');
    expect(offered).toHaveLength(1);
    expect(offered[0].payload).toMatchObject({ instrument_key: 'epds', reason: 'coping_trigger' });
    expect(of(events, 'ai_call')).toHaveLength(0);
    expect(of(events, 'free_text_routed')[0].payload.queue_key).toBe('needs_review');
  });

  it('the middle coping option on two consecutive check-ins offers the EPDS through the configured rule, once', () => {
    const store = makeTestStore(config, content);
    const episode_id = enrolledReal(store, 'real-b');
    const c3 = checkin(store, episode_id, 3);
    store.setClock(addMinutes(c3.scheduled_at, 30));
    const first = store.dispatch(submitCheckin({ checkin_id: c3.id, responses: [answerWithTag('day03', 'coping_difficulty_mild')] }), PATIENT);
    expect(of(first, 'screen_offered')).toHaveLength(0);
    const c7 = checkin(store, episode_id, 7);
    store.setClock(addMinutes(c7.scheduled_at, 30));
    const second = store.dispatch(submitCheckin({ checkin_id: c7.id, responses: [answerWithTag('day07', 'coping_difficulty_mild')] }), PATIENT);
    expect(of(second, 'rule_fired').map((e) => e.payload.rule_key)).toEqual(['coping_mild_twice']);
    expect(of(second, 'screen_offered')).toHaveLength(1);
    expect(Object.values(store.getState().queueItems).filter((q) => q.episode_id === episode_id)).toHaveLength(0);
  });

  it('a critical EPDS item with sharing withheld follows the FR-30a flag in force (override on: one Urgent item, placeholder note)', () => {
    const store = makeTestStore(config, content);
    const episode_id = enrolledReal(store, 'real-c', { preferences: { sharing_category: 'nobody_yet' } });
    const inst = config.instruments.epds;
    const lowCritical = inst.items.map((i) => (i.critical ? i.options.findIndex((o) => o.score >= inst.critical_item_min_score) : i.options.findIndex((o) => o.score === 0)));
    store.setClock(addDays(DELIVERY, 14));
    const events = store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: lowCritical }), PATIENT);
    // Stored items only: by day 14 the unopened day-3 and day-7 check-ins have also derived an Unreached item (FR-13).
    const items = Object.values(store.getState().queueItems).filter((q) => q.episode_id === episode_id && !q.derived);
    expect(Object.values(store.getState().queueItems).filter((q) => q.episode_id === episode_id && q.derived).map((q) => q.queue_key)).toEqual(['unreached']);
    expect(config.freetext.critical_item_overrides_sharing).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ queue_key: 'urgent', trigger_type: 'critical_item', note: CRITICAL_WITHHELD_NOTE });
    expect(of(events, 'rule_fired').map((e) => e.payload.rule_key)).toEqual(['critical_item']);
    expect(of(events, 'rule_fired')[0].payload.queue_item_id).toBe(items[0].id);
    expect(of(events, 'critical_item_hit')[0].payload.shared).toBe(true);
    expect(of(events, 'sharing_reasked')[0].payload.count).toBe(1);
    const screen = Object.values(store.getState().screens)[0];
    expect(screen.shared_with).toEqual([]);
    expect(screen.instrument_version).toBe(inst.version);
  });

  it('I need help now creates one Urgent item with the help_now rule logged, not two', () => {
    const store = makeTestStore(config, content);
    const episode_id = enrolledReal(store, 'real-d');
    store.setClock(addDays(DELIVERY, 7));
    const events = store.dispatch(helpNow({ episode_id }), PATIENT);
    expect(of(events, 'queue_item_created')).toHaveLength(1);
    expect(of(events, 'rule_fired').map((e) => e.payload.rule_key)).toEqual(['help_now']);
    expect(of(events, 'help_requested')[0].payload.source).toBe('patient');
  });

  it('a loss episode uses the loss check-in set; the patient control and "not for now" pause it with the configured deadline', () => {
    const store = makeTestStore(config, content);
    const episode_id = enrolledReal(store, 'real-e', {}, 'stillbirth');
    for (const c of Object.values(store.getState().checkins).filter((x) => x.episode_id === episode_id)) {
      expect(c.template_key).toBe('loss_checkin');
      expect(c.set).toBe('loss');
    }
    store.setClock(addDays(DELIVERY, 2));
    store.dispatch(setSensitiveStatus({ patient_id: 'real-e', episode_id, subtype: 'stillbirth', set_by: 'patient', control: 'loss' }), PATIENT);
    store.dispatch(setSensitivePreferences({ patient_id: 'real-e', episode_id, form_of_address: 'Elena', use_baby_name: false, contact_frequency: 'not_for_now' }), PATIENT);
    const state = store.getState();
    expect(state.episodes[episode_id].status).toBe('paused');
    const review = Object.values(state.queueItems).filter((q) => q.episode_id === episode_id && q.queue_key === 'sensitive_review');
    expect(review).toHaveLength(2);
    const deadline = review.find((q) => q.note?.includes('not for now'))!;
    expect(deadline.ack_target_at).toBe(addDays(addDays(DELIVERY, 2), config.cadence.loss_not_for_now_contact_days));
    const plan = Object.values(state.carePlanItems).filter((c) => c.episode_id === episode_id);
    expect(plan.every((c) => !c.tags.some((t) => ['infant', 'feeding', 'milestone', 'celebration', 'newborn_visit', 'birth_story'].includes(t)) || c.state === 'suppressed')).toBe(true);
  });

  it('every canned narrative passes the postfilter and a persona summary drafts without a fallback', () => {
    const ctx = makeTestContext({ config, content, now: DELIVERY });
    const texts = { ...config.ai_exemplars.summary_narrative, generic_fallback: config.ai_exemplars.generic_fallback };
    for (const [key, text] of Object.entries(texts)) expect(narrativeViolations(ctx, 'none', text), key).toEqual([]);
    const store = makeTestStore(config, content);
    const episode_id = enrolledReal(store, 'real-f', { persona_key: 'marisol' });
    store.setClock(addDays(DELIVERY, 7));
    store.dispatch(helpNow({ episode_id }), PATIENT);
    store.setClock(addDays(DELIVERY, 63));
    const events = store.dispatch(draftSummary({ episode_id, period: 'week9' }), CLINICIAN);
    expect(of(events, 'ai_fallback_used')).toHaveLength(0);
    const summary = Object.values(store.getState().summaries)[0];
    expect(summary.narrative).toBe(config.ai_exemplars.summary_narrative['marisol:week9']);
    expect(summary.structured.care_plan.length).toBe(config.careplan.items.filter((i) => i.sets.includes('standard')).length);
  });
});
