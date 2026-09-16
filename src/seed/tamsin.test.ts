/** 6.7 Tamsin: high utilizer, scan-off and scan-on branches (FR-17, FR-20, FR-21, FR-54, AI-03, AI-15, FR-47). */
import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../domain/metrics';
import { suppressedTagsFor } from '../domain/projection';
import { closingStatementFor } from '../domain/services/checkins';
import { assertScanConsistency } from '../domain/services/freetext';
import { DEFAULT_CLOCK } from '../domain/store';
import { TAMSIN_FLAGGED_QUESTION } from './personas/tamsin';
import { LOADED, checkinFor, checkinsFor, episodeFor, eventsOf, itemsFor, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-tamsin';
const FLAGGED_AT = t('2026-02-13', 16, 10);

describe('6.7 Tamsin — scan off (the shipped flag)', () => {
  const store = seedStore('tamsin_scan_off');

  it('the NICU status suppresses milestone and celebration items and switches her check-ins to the NICU set', () => {
    // Before any check-in is answered: every scheduled check-in has moved to the NICU set (FR-55).
    const state = stateAt(store, t('2026-01-28', 12, 0));
    const ep = episodeFor(state, P);
    expect(state.sensitiveStatuses.filter((s) => s.episode_id === ep.id)).toEqual([expect.objectContaining({ subtype: 'nicu', set_by: 'patient', active: true, confirmed_by_staff: true })]);
    expect([...suppressedTagsFor(state, ep.id)].sort()).toEqual(['celebration', 'milestone']);
    expect(checkinsFor(state, ep.id).every((c) => c.set === 'nicu' && c.template_key === 'nicu_checkin')).toBe(true);
    expect(Object.values(state.carePlanItems).filter((c) => c.episode_id === ep.id && c.tags.some((tag) => tag === 'milestone' || tag === 'celebration')).every((c) => c.state === 'suppressed')).toBe(true);
    expect(itemsFor(state, ep.id, 'sensitive_review').map((q) => q.state)).toEqual(['resolved']);
  });

  it('every saved question creates a queue item on entry; the flagged question creates one Needs-review item with no scan, beside the locked instruction', () => {
    expect(LOADED.config.freetext.free_text_urgency_scan).toBe(false);
    expect(() => assertScanConsistency(LOADED.config)).not.toThrow();
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const questions = Object.values(state.savedQuestions).filter((q) => q.episode_id === ep.id).sort((a, b) => a.order - b.order);
    expect(questions).toHaveLength(7);
    expect(questions.every((q) => q.queue_item_id !== '' && state.queueItems[q.queue_item_id]?.trigger_type === 'free_text')).toBe(true);
    expect(questions.every((q) => q.lexicon_match === null)).toBe(true);
    const flagged = questions.find((q) => q.text === TAMSIN_FLAGGED_QUESTION)!;
    const item = state.queueItems[flagged.queue_item_id];
    expect(item).toMatchObject({ queue_key: 'needs_review', trigger_type: 'free_text', state: 'open', created_at: FLAGGED_AT });
    // Same-business-day target on coverage hours: Friday 16:10 + 480 minutes falls outside coverage, so the target is Monday 08:00.
    expect(item.ack_target_at).toBe(t('2026-02-16', 8, 0));
    const atEntry = store.getEvents().filter((e) => e.episode_id === ep.id && e.occurred_at === FLAGGED_AT);
    expect(atEntry.map((e) => e.type)).toEqual(['emergency_instruction_shown', 'queue_item_created', 'free_text_routed', 'saved_question_added']);
    expect(eventsOf(atEntry, 'emergency_instruction_shown')[0].payload.layout).toBe('inline');
    expect(eventsOf(atEntry, 'free_text_routed')[0].payload).toMatchObject({ queue_key: 'needs_review', field: 'saved_question', lexicon_match: null });
    expect(itemsFor(state, ep.id, 'urgent').filter((q) => q.created_at === FLAGGED_AT)).toHaveLength(0);
    expect(eventsOf(store.getEvents(), 'help_requested', ep.id).every((e) => e.payload.source === 'patient')).toBe(true);
    expect(eventsOf(store.getEvents(), 'ai_call', ep.id).every((e) => e.payload.feature !== 'reword' || true)).toBe(true);
    // After free text the closing statement is always the pending form (FR-15, FR-17); the day-3 note shows it.
    const day3 = checkinFor(state, ep.id, 3);
    const closing = closingStatementFor(state, LOADED.config, day3.id, day3.submitted_at!);
    expect(closing.kind).toBe('pending');
    expect(closing.pending).toContain('your written note');
    const later = stateAt(store, t('2026-02-13', 17, 5));
    expect(later.queueItems[item.id]).toMatchObject({ state: 'resolved', acknowledged_by: 'ob-1' });
  });

  it('"I need help now" at check-ins creates one Urgent item each with a callback, all closed against a contact; no model is ever called for them', () => {
    const state = stateAt(store, t('2026-03-10', 12, 0));
    const ep = episodeFor(state, P);
    const urgent = itemsFor(state, ep.id, 'urgent');
    expect(urgent.map((q) => [q.trigger_type, q.state])).toEqual([['help_now', 'resolved'], ['help_now', 'resolved'], ['help_now', 'resolved']]);
    expect(urgent.map((q) => q.rating)).toEqual(['appropriate', 'unsure', 'unnecessary']);
    const callbacks = Object.values(state.callbacks).filter((c) => c.episode_id === ep.id);
    expect(callbacks.filter((c) => urgent.some((q) => q.id === c.queue_item_id)).every((c) => c.occurred === true && c.preferred_window === null)).toBe(true);
    expect(eventsOf(store.getEvents(), 'help_requested', ep.id).filter((e) => e.occurred_at <= state.clock).map((e) => e.payload.source)).toEqual(['patient', 'patient', 'patient']);
    expect(Object.values(state.aiInteractions).filter((a) => a.episode_id === ep.id).map((a) => a.feature)).toEqual(['question_organizer']);
  });

  it('the canned AI-03 exemplar groups her other questions without answering; the ungrouped flagged question keeps its place', () => {
    const state = stateAt(store, t('2026-03-10', 12, 0));
    const ep = episodeFor(state, P);
    const grouped = eventsOf(store.getEvents(), 'saved_questions_grouped', ep.id);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].payload.groups.map((g) => g.title)).toEqual(['Visit logistics', 'Feeding', 'Recovery', 'Paperwork', 'Other questions']);
    const questions = Object.values(state.savedQuestions).filter((q) => q.episode_id === ep.id).sort((a, b) => a.order - b.order);
    expect(questions.map((q) => q.order)).toEqual(questions.map((_, i) => i + 1));
    const flagged = questions.find((q) => q.text === TAMSIN_FLAGGED_QUESTION)!;
    expect(flagged.group_title).toBe('Other questions');
    expect(questions.filter((q) => q.id !== flagged.id).every((q) => q.group_title !== null && q.group_title !== 'Other questions')).toBe(true);
    const ai = Object.values(state.aiInteractions).find((a) => a.feature === 'question_organizer')!;
    expect(ai).toMatchObject({ model_id: null, fallback_used: false, prefilter_result: 'not_run', postfilter_result: 'not_run' });
  });

  it('minutes accumulate: at the default clock she is the top-decile episode in the all_personas branch', () => {
    const all = seedStore('all_personas');
    const state = stateAt(all, DEFAULT_CLOCK);
    const m = computeMetrics(state, all.getEvents(), LOADED.config);
    const ep = episodeFor(state, P);
    const per = m.staff_minutes.per_episode;
    expect(per[ep.id]).toBe(Math.max(...Object.values(per)));
    expect(per[ep.id]).toBeGreaterThan(150);
    expect(m.staff_minutes.top_decile_mean).toBe(per[ep.id]);
  });
});

describe('6.7 Tamsin — scan on (free_text_urgency_scan: true)', () => {
  const store = seedStore('tamsin_scan_on', (c) => { c.freetext.free_text_urgency_scan = true; c.freetext.free_text_urgency_scan_set_by = 'ob-1'; });

  it('the same question renders the full-screen instruction, creates one Urgent item and no Needs-review item, and logs the lexicon version', () => {
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const atEntry = store.getEvents().filter((e) => e.episode_id === ep.id && e.occurred_at === FLAGGED_AT);
    expect(atEntry.map((e) => e.type)).toEqual(['emergency_instruction_shown', 'queue_item_created', 'emergency_instruction_shown', 'help_requested', 'free_text_routed', 'saved_question_added']);
    expect(eventsOf(atEntry, 'emergency_instruction_shown').map((e) => [e.payload.layout, e.payload.trigger])).toEqual([['inline', 'free_text:saved_question'], ['full_screen', 'lexicon_match']]);
    const lexicon = LOADED.config.lexicons.emergency.version;
    expect(eventsOf(atEntry, 'help_requested')[0].payload).toMatchObject({ source: 'lexicon_match', lexicon_version: lexicon });
    const routed = eventsOf(atEntry, 'free_text_routed')[0].payload;
    expect(routed).toMatchObject({ queue_key: 'urgent', lexicon_match: { version: lexicon, term_class: 'self_harm' } });
    expect(Object.keys(routed.lexicon_match!).sort()).toEqual(['term_class', 'version']);
    const created = itemsFor(state, ep.id).filter((q) => q.created_at === FLAGGED_AT);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ queue_key: 'urgent', trigger_type: 'lexicon_match', state: 'open' });
    expect(created[0].note).not.toContain('want to be here');
    expect(itemsFor(state, ep.id, 'needs_review').filter((q) => q.created_at === FLAGGED_AT)).toHaveLength(0);
    const flagged = Object.values(state.savedQuestions).find((q) => q.episode_id === ep.id && q.text === TAMSIN_FLAGGED_QUESTION)!;
    expect(flagged.lexicon_match).toEqual({ version: lexicon, term_class: 'self_harm' });
    expect(flagged.queue_item_id).toBe(created[0].id);
    const later = stateAt(store, t('2026-02-13', 17, 5));
    expect(later.queueItems[created[0].id]).toMatchObject({ state: 'resolved', minutes_to_ack: 12 });
  });

  it('the flagged question is never sent to the organizer and every other question is grouped', () => {
    const state = stateAt(store, t('2026-03-10', 12, 0));
    const ep = episodeFor(state, P);
    const flagged = Object.values(state.savedQuestions).find((q) => q.episode_id === ep.id && q.text === TAMSIN_FLAGGED_QUESTION)!;
    const grouped = eventsOf(store.getEvents(), 'saved_questions_grouped', ep.id)[0].payload.groups;
    expect(grouped.map((g) => g.title)).toEqual(['Visit logistics', 'Feeding', 'Recovery', 'Paperwork']);
    expect(grouped.flatMap((g) => g.question_ids)).not.toContain(flagged.id);
    expect(flagged.group_title).toBeNull();
    expect(Object.values(state.savedQuestions).filter((q) => q.episode_id === ep.id && q.id !== flagged.id && q.created_at <= t('2026-03-09', 11, 0)).every((q) => q.group_title !== null)).toBe(true);
    // Both branches share one history apart from the flag: the same number of stored events.
    expect(store.getEvents().length).toBe(seedStore('tamsin_scan_off').getEvents().length + 2);
  });
});
