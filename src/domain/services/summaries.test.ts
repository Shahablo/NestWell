import { describe, expect, it } from 'vitest';
import { makeTestConfig, makeTestContent, makeTestStore } from '../testutil';
import { CLINICIAN, COORD, PATIENT, dayAt, enrolled, itemsIn } from '../testflows';
import { narrativeViolations, organizeQuestions, rewordResult } from './ai';
import { DomainError } from './errors';
import { addSavedQuestion } from './freetext';
import { administerScreen } from './screening';
import { draftSummary, setSummaryState } from './summaries';
import { makeTestContext } from '../testutil';

const positive = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3];

describe('summaries (FR-40, FR-41, AI-02)', () => {
  it('withheld screens appear as withheld with no score; the narrative is canned, labelled and free of instrument names and scores', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { preferences: { sharing_category: 'nobody_yet' } } });
    store.setClock(dayAt(14, 10));
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: positive }), PATIENT);
    store.setClock(dayAt(63));
    const events = store.dispatch(draftSummary({ episode_id, period: 'week9' }), CLINICIAN);
    expect(events.map((e) => e.type)).toEqual(['ai_call', 'ai_fallback_used', 'summary_drafted', 'queue_item_created']);
    const summary = Object.values(store.getState().summaries)[0];
    expect(summary.structured.screens).toEqual([{ instrument: 'epds', administered_at: dayAt(14, 10), score: null, positive: null, withheld: true }]);
    expect(summary.withheld_notices[0]).toContain('withheld at patient request');
    expect(summary.narrative).toBe(store.config.ai_exemplars.generic_fallback);
    expect(summary.narrative.toLowerCase()).not.toContain('epds');
    expect(summary.narrative).not.toContain('18');
    expect(summary.ai_draft).toBe(true);
    expect(summary.state).toBe('draft');
    expect(itemsIn(store, 'summaries', episode_id)).toHaveLength(1);
    expect(Object.values(store.getState().aiInteractions)[0]).toMatchObject({ feature: 'summary_narrative', fallback_used: true, model_id: null, prefilter_result: 'not_run' });
    expect(summary.structured.episode_week).toBe(9);
  });

  it('a shared positive screen shows its score in the structured section and the intervals once assessed', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { persona_key: 'dana' } });
    store.setClock(dayAt(14, 10));
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: positive }), PATIENT);
    store.setClock(dayAt(84));
    store.dispatch(draftSummary({ episode_id, period: 'week12' }), CLINICIAN);
    const summary = Object.values(store.getState().summaries)[0];
    expect(summary.structured.screens[0]).toMatchObject({ score: 18, positive: true, withheld: false });
    expect(summary.narrative).toBe(store.config.ai_exemplars.summary_narrative['dana:week12']);
    expect(summary.structured.unresolved.some((u) => u.startsWith('needs_review item'))).toBe(true);
    expect(summary.structured.care_plan).toHaveLength(5);
  });

  it('the postfilter refuses a narrative that names the instrument or a score', () => {
    const config = makeTestConfig((c) => { c.ai_exemplars.summary_narrative['bad:week9'] = 'Her EPDS score was 18, which suggests low mood.'; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store, { patient: { persona_key: 'bad' } });
    store.setClock(dayAt(63));
    expect(() => store.dispatch(draftSummary({ episode_id, period: 'week9' }), CLINICIAN)).toThrow(DomainError);
    expect(Object.values(store.getState().summaries)).toHaveLength(0);
  });

  it('only a clinician marks reviewed and a draft is never delivered', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(63));
    store.dispatch(draftSummary({ episode_id, period: 'week9' }), CLINICIAN);
    const id = Object.values(store.getState().summaries)[0].id;
    expect(() => store.dispatch(setSummaryState({ summary_id: id, state: 'delivered' }), CLINICIAN)).toThrow(DomainError);
    expect(() => store.dispatch(setSummaryState({ summary_id: id, state: 'reviewed' }), COORD)).toThrow(DomainError);
    store.dispatch(setSummaryState({ summary_id: id, state: 'reviewed' }), CLINICIAN);
    expect(store.getState().summaries[id]).toMatchObject({ state: 'reviewed', reviewer_id: 'ob-1', reviewed_at: dayAt(63) });
    store.dispatch(setSummaryState({ summary_id: id, state: 'delivered' }), CLINICIAN);
    expect(store.getState().summaries[id].state).toBe('delivered');
  });
});

describe('AI fallback store (AI-01, AI-03, AI-21)', () => {
  it('groups saved questions by exemplar, never sends a flagged question, and falls back generically', () => {
    const config = makeTestConfig((c) => { c.freetext.free_text_urgency_scan = true; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store, { patient: { persona_key: 'tamsin' } });
    store.setClock(dayAt(20));
    store.dispatch(addSavedQuestion({ episode_id, text: 'How often should the twins feed?' }), PATIENT);
    store.dispatch(addSavedQuestion({ episode_id, text: 'I am afraid of my partner' }), PATIENT);
    store.dispatch(addSavedQuestion({ episode_id, text: 'Is it normal to be this tired?' }), PATIENT);
    const events = store.dispatch(organizeQuestions({ episode_id }), PATIENT);
    const grouped = events.find((e) => e.type === 'saved_questions_grouped');
    const questions = Object.values(store.getState().savedQuestions).sort((a, b) => a.order - b.order);
    expect(grouped && grouped.type === 'saved_questions_grouped' && grouped.payload.groups).toEqual([
      { title: 'Feeding', question_ids: [questions[0].id] },
      { title: 'Other questions', question_ids: [questions[2].id] },
    ]);
    expect(questions[1].lexicon_match).toEqual({ version: '1', term_class: 'domestic_violence' });
    expect(questions[1].group_title).toBeNull();
    expect(questions[0].group_title).toBe('Feeding');
    expect(events.some((e) => e.type === 'ai_fallback_used')).toBe(false);
    const other = enrolled(store, { patient_id: 'pt-2', at: dayAt(20) });
    store.dispatch(addSavedQuestion({ episode_id: other.episode_id, text: 'Anything?' }), PATIENT);
    const fb = store.dispatch(organizeQuestions({ episode_id: other.episode_id }), PATIENT);
    expect(fb.some((e) => e.type === 'ai_fallback_used' && e.payload.reason === 'no_canned_key')).toBe(true);
  });

  it('reword serves an exemplar, falls back generically, and aborts on locked content with no network', () => {
    const ctx = makeTestContext({ now: dayAt(5) });
    const hit = rewordResult(ctx, { content_id: 'careplan.recovery_visit.title', episode_id: null });
    expect(hit.fallback).toBe(false);
    expect(hit.text).toContain('recovery visit');
    expect(hit.label).toBe(ctx.content.text('ai.patient_label'));
    expect(hit.events.map((e) => e.type)).toEqual(['ai_call']);
    const miss = rewordResult(ctx, { content_id: 'careplan.mood_support.title', episode_id: null });
    expect(miss.fallback).toBe(true);
    expect(miss.events.map((e) => e.type)).toEqual(['ai_call', 'ai_fallback_used']);
    const locked = rewordResult(ctx, { content_id: 'emergency_instruction', episode_id: null });
    expect(locked.blocked).toBe(true);
    expect(locked.events.map((e) => e.type)).toEqual(['ai_call_blocked']);
    expect(locked.ai_interaction_id).toBeNull();
  });
});

describe('AI-16 postfilter for narratives (AI-02 allowlist)', () => {
  it('allows queue-item names, care-plan titles, visit purposes and the episode week, and blocks descriptors', () => {
    const ctx = makeTestContext({ now: dayAt(5) });
    expect(narrativeViolations(ctx, 'ep', 'Episode week 9. Queue items: one urgent item resolved; two needs-review items open; one follow-through item open. Care plan: mood support open; recovery visit completed. Visits: early postpartum visit completed.')).toEqual([]);
    expect(narrativeViolations(ctx, 'ep', 'Her situation is urgent.')).toEqual(['word:urgent']);
    expect(narrativeViolations(ctx, 'ep', 'Her mood was low and she felt unsafe.')).toEqual(['word:mood', 'word:unsafe']);
    expect(narrativeViolations(ctx, 'ep', 'A safe recovery; the safety question was answered.')).toEqual(['word:safe']);
    expect(narrativeViolations(ctx, 'ep', 'The PHQ-9 was completed.')).toContain('instrument:PHQ-9');
    expect(narrativeViolations(ctx, 'ep', 'She was at risk and anxious; the critical item was positive.')).toEqual(['word:anxi', 'word:risk', 'word:critical']);
  });

  it('flags a screen score as a bare number but not the episode week that happens to equal it', () => {
    const config = makeTestConfig((c) => { c.instruments.epds.threshold_positive = 30; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(14, 10));
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: [3, 3, 3, 3, 3, 3, 3, 3, 3, 0] }), PATIENT); // 9 + 3 = 12
    expect(Object.values(store.getState().screens)[0].score).toBe(12);
    const ctx = makeTestContext({ config, content: store.content, now: dayAt(84), state: store.getState() });
    expect(narrativeViolations(ctx, episode_id, 'Episode week 12. Visits: comprehensive visit completed on day 84 at 10:00.')).toEqual([]);
    expect(narrativeViolations(ctx, episode_id, 'Her result was 12.')).toEqual(['score:12']);
  });
});
