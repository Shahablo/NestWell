import { describe, expect, it } from 'vitest';
import { makeTestConfig, makeTestContent, makeTestContext, makeTestStore } from '../testutil';
import { COORD, OK_DAY03, OK_DAY07, PATIENT, checkinByDay, dayAt, enrolled, itemsIn, submitAt } from '../testflows';
import { closingStatementFor, notNow, openCheckin, submitCheckin } from './checkins';
import { DomainError } from './errors';
import { addSavedQuestion, routeFreeText, routeFreeTextEvents } from './freetext';
import { administerScreen } from './screening';

describe('submitCheckin fan-out (FR-23, FR-29, FR-36a, FR-34)', () => {
  it('an urgent answer shows the locked instruction first and creates one Urgent item with rule id and version', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 3), [{ question_key: 'recovery', value: 'bleeding_heavy' }, { question_key: 'coping', value: 'managing' }, { question_key: 'ride', value: 'have_ride' }, { question_key: 'callback', value: 'no' }]);
    expect(events[0].type).toBe('checkin_submitted');
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(1);
    expect(events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen')).toBe(true);
    expect(events.some((e) => e.type === 'help_requested' && e.payload.source === 'rule')).toBe(true);
    const fired = events.find((e) => e.type === 'rule_fired');
    expect(fired && fired.type === 'rule_fired' && fired.payload.rule_key).toBe('urgent_symptom');
    expect(events.some((e) => e.type === 'ai_call')).toBe(false);
    expect(checkinByDay(store, episode_id, 3).state).toBe('completed');
  });

  it('coping at the worst option creates exactly one Needs-review item and offers the instrument once', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 3), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'very_hard' }, { question_key: 'ride', value: 'have_ride' }, { question_key: 'callback', value: 'no' }]);
    const items = itemsIn(store, 'needs_review', episode_id);
    expect(items).toHaveLength(1);
    expect(items[0].trigger_type).toBe('coping_difficulty');
    const offered = events.filter((e) => e.type === 'screen_offered');
    expect(offered).toHaveLength(1);
    expect(offered[0].type === 'screen_offered' && offered[0].payload.reason).toBe('coping_trigger');
    expect(offered[0].type === 'screen_offered' && offered[0].payload.instrument_key).toBe('epds');
  });

  it('the middle coping option on two consecutive check-ins offers the instrument; once does not', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const first = submitAt(store, checkinByDay(store, episode_id, 3), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'hard' }, { question_key: 'ride', value: 'have_ride' }, { question_key: 'callback', value: 'no' }]);
    expect(first.some((e) => e.type === 'screen_offered')).toBe(false);
    const second = submitAt(store, checkinByDay(store, episode_id, 7), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'hard' }, { question_key: 'feeding', value: 'going_ok' }, { question_key: 'callback', value: 'no' }]);
    expect(second.filter((e) => e.type === 'screen_offered')).toHaveLength(1);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
  });

  it('a barrier answer creates one typed Follow-through item; a callback request creates one item and a callback', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { insurance_type: 'medicaid', access_barriers: ['transport'] } });
    const events = submitAt(store, checkinByDay(store, episode_id, 3), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'ride', value: 'no_ride' }, { question_key: 'callback', value: 'yes' }]);
    const ft = itemsIn(store, 'follow_through', episode_id);
    expect(ft.map((q) => q.trigger_type).sort()).toEqual(['barrier', 'callback']);
    expect(ft.find((q) => q.trigger_type === 'barrier')?.note).toContain('NOT YET PROVIDED');
    expect(events.filter((e) => e.type === 'barrier_item_created')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'callback_requested')).toHaveLength(1);
    expect(Object.values(store.getState().callbacks)).toHaveLength(1);
  });

  it('the scheduled instrument is offered at the day-14 check-in and a partial submission is stored partial', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 14), [{ question_key: 'recovery', value: 'ok' }]);
    const offered = events.find((e) => e.type === 'screen_offered');
    expect(offered && offered.type === 'screen_offered' && offered.payload.reason).toBe('scheduled');
    expect(checkinByDay(store, episode_id, 14).state).toBe('partial');
    expect(closingStatementFor(store.getState(), store.config, checkinByDay(store, episode_id, 14).id, store.getClock()).kind).toBe('pending');
  });

  it('a check-in that is not open cannot be submitted; not-now moves it once', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const c3 = checkinByDay(store, episode_id, 3);
    store.setClock(dayAt(2));
    expect(() => store.dispatch(submitCheckin({ checkin_id: c3.id, responses: OK_DAY03 }), PATIENT)).toThrow(DomainError);
    store.setClock(dayAt(3, 10));
    store.dispatch(openCheckin({ checkin_id: c3.id }), PATIENT);
    store.dispatch(notNow({ checkin_id: c3.id }), PATIENT);
    expect(checkinByDay(store, episode_id, 3).scheduled_at).toBe(dayAt(3, 14));
    expect(checkinByDay(store, episode_id, 3).rescheduled_once).toBe(true);
    store.setClock(dayAt(3, 15));
    expect(() => store.dispatch(notNow({ checkin_id: c3.id }), PATIENT)).toThrow(DomainError);
    submitAt(store, checkinByDay(store, episode_id, 3), OK_DAY03, 90);
    const closing = closingStatementFor(store.getState(), store.config, c3.id, store.getClock());
    expect(closing.kind).toBe('no_follow_up');
    expect(closing.content_id).toBe('closing.no_follow_up');
    void OK_DAY07;
  });
});

describe('FR-17 free text in both flag states', () => {
  const NOTE = 'Some days I think about how I might hurt myself';
  const responses = [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'ride', value: 'have_ride' }, { question_key: 'callback', value: 'no' }, { question_key: 'note', value: null, free_text: NOTE }];

  it('flag off: no text is scanned; one Needs-review item in the same command, inline instruction, pending closing statement', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 3), responses);
    const nr = itemsIn(store, 'needs_review', episode_id);
    expect(nr).toHaveLength(1);
    expect(nr[0].trigger_type).toBe('free_text');
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(0);
    expect(events.some((e) => e.type === 'free_text_routed' && e.payload.queue_key === 'needs_review' && e.payload.lexicon_match === null)).toBe(true);
    expect(events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'inline')).toBe(true);
    expect(events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen')).toBe(false);
    const submitted = events.find((e) => e.type === 'checkin_submitted');
    const note = submitted && submitted.type === 'checkin_submitted' ? submitted.payload.responses.find((r) => r.question_key === 'note') : undefined;
    expect(note?.queue_item_id).toBe(nr[0].id);
    expect(note?.lexicon_match).toBeNull();
    expect(submitted && submitted.type === 'checkin_submitted' && submitted.payload.free_text_entered).toBe(true);
    const closing = closingStatementFor(store.getState(), store.config, checkinByDay(store, episode_id, 3).id, store.getClock());
    expect(closing.kind).toBe('pending');
    expect(closing.pending).toContain('your written note');
    expect(closing.target_time).not.toBeNull();
  });

  it('flag on: the match creates one Urgent item and no Needs-review item, logs the lexicon version, never the text', () => {
    const config = makeTestConfig((c) => { c.freetext.free_text_urgency_scan = true; c.freetext.free_text_urgency_scan_set_by = 'ob-1'; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 3), responses);
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(1);
    expect(itemsIn(store, 'urgent', episode_id)[0].trigger_type).toBe('lexicon_match');
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    const help = events.find((e) => e.type === 'help_requested');
    expect(help && help.type === 'help_requested' && help.payload.source).toBe('lexicon_match');
    expect(help && help.type === 'help_requested' && help.payload.lexicon_version).toBe('1');
    expect(events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen')).toBe(true);
    const submitted = events.find((e) => e.type === 'checkin_submitted');
    const note = submitted && submitted.type === 'checkin_submitted' ? submitted.payload.responses.find((r) => r.question_key === 'note') : undefined;
    expect(note?.lexicon_match).toEqual({ version: '1', term_class: 'self_harm' });
    expect(JSON.stringify(note?.lexicon_match)).not.toContain('hurt');
    const routed = events.find((e) => e.type === 'free_text_routed');
    expect(routed && routed.type === 'free_text_routed' && routed.payload.queue_key).toBe('urgent');
  });

  it('flag on: text without a match still creates a Needs-review item; matching is case-insensitive whole phrase', () => {
    const config = makeTestConfig((c) => { c.freetext.free_text_urgency_scan = true; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(5));
    store.dispatch(routeFreeText({ episode_id, field: 'saved_question', text: 'When can I start walking again?' }), PATIENT);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(1);
    store.dispatch(routeFreeText({ episode_id, field: 'saved_question', text: 'I have HEAVY   bleeding today' }), PATIENT);
    expect(itemsIn(store, 'urgent', episode_id)).toHaveLength(1);
  });

  it('saved questions (Tamsin) get the FR-17 behaviour for the mode in force in the same command', () => {
    const off = makeTestStore();
    const a = enrolled(off);
    off.setClock(dayAt(20));
    const eventsOff = off.dispatch(addSavedQuestion({ episode_id: a.episode_id, text: 'Sometimes I want to end my life' }), PATIENT);
    expect(eventsOff.map((e) => e.type)).toContain('saved_question_added');
    expect(itemsIn(off, 'needs_review', a.episode_id)).toHaveLength(1);
    const q = Object.values(off.getState().savedQuestions)[0];
    expect(q.queue_item_id).toBe(itemsIn(off, 'needs_review', a.episode_id)[0].id);
    expect(q.lexicon_match).toBeNull();
    expect(q.order).toBe(1);

    const config = makeTestConfig((c) => { c.freetext.free_text_urgency_scan = true; });
    const on = makeTestStore(config, makeTestContent(config));
    const b = enrolled(on);
    on.setClock(dayAt(20));
    on.dispatch(addSavedQuestion({ episode_id: b.episode_id, text: 'Sometimes I want to end my life' }), PATIENT);
    expect(itemsIn(on, 'urgent', b.episode_id)).toHaveLength(1);
    expect(itemsIn(on, 'needs_review', b.episode_id)).toHaveLength(0);
    expect(Object.values(on.getState().savedQuestions)[0].lexicon_match).toEqual({ version: '1', term_class: 'self_harm' });
  });

  it('ai_enabled without the scan flag is refused at command time (FR-61)', () => {
    const config = makeTestConfig((c) => { c.freetext.ai_enabled = true; c.freetext.free_text_urgency_scan = false; });
    const ctx = makeTestContext({ config, content: makeTestContent(config), now: dayAt(5) });
    expect(() => routeFreeTextEvents(ctx, { episode_id: 'ep-x', field: 'saved_question', text: 'hello' })).toThrow(DomainError);
    expect(() => routeFreeTextEvents(ctx, { episode_id: 'ep-x', field: 'saved_question', text: 'hello' })).toThrow(/free_text_urgency_scan/);
  });

  it('empty text creates nothing', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(5));
    expect(store.dispatch(routeFreeText({ episode_id, field: 'usefulness_comment', text: '   ' }), PATIENT)).toEqual([]);
    void COORD;
  });
});

describe('rules that document service-owned routing (FR-23 AC, FR-36a)', () => {
  it('are logged as fired against the item the service created and never add a duplicate', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 3), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'ride', value: 'no_ride' }, { question_key: 'callback', value: 'yes' }, { question_key: 'note', value: null, free_text: 'a short note' }]);
    const created = events.filter((e) => e.type === 'queue_item_created');
    expect(created.map((e) => e.type === 'queue_item_created' && e.payload.trigger_type).sort()).toEqual(['barrier', 'callback', 'free_text']);
    const fired = events.filter((e) => e.type === 'rule_fired');
    expect(fired.map((e) => e.type === 'rule_fired' && e.payload.rule_key).sort()).toEqual(['barrier_item', 'callback_requested', 'free_text_present']);
    const idFor = (t: string) => { const c = created.find((e) => e.type === 'queue_item_created' && e.payload.trigger_type === t); return c && c.type === 'queue_item_created' ? c.payload.queue_item_id : null; };
    const firedId = (k: string) => { const f = fired.find((e) => e.type === 'rule_fired' && e.payload.rule_key === k); return f && f.type === 'rule_fired' ? f.payload.queue_item_id : undefined; };
    expect(firedId('barrier_item')).toBe(idFor('barrier'));
    expect(firedId('callback_requested')).toBe(idFor('callback'));
    expect(firedId('free_text_present')).toBe(idFor('free_text'));
    expect(itemsIn(store, undefined, episode_id)).toHaveLength(3);
  });

  it('with the scan on, the free-text rule points at the Urgent item that took the Needs-review item\'s place', () => {
    const config = makeTestConfig((c) => { c.freetext.free_text_urgency_scan = true; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store);
    const events = submitAt(store, checkinByDay(store, episode_id, 3), [...OK_DAY03, { question_key: 'note', value: null, free_text: 'I might hurt myself' }]);
    const urgent = itemsIn(store, 'urgent', episode_id);
    expect(urgent).toHaveLength(1);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(0);
    const fired = events.find((e) => e.type === 'rule_fired' && e.payload.rule_key === 'free_text_present');
    expect(fired && fired.type === 'rule_fired' && fired.payload.queue_item_id).toBe(urgent[0].id);
  });
});

describe('FR-16 burden cap', () => {
  const worst = [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'very_hard' }, { question_key: 'feeding', value: 'going_ok' }, { question_key: 'callback', value: 'no' }];

  it('drops the scheduled instrument step when the weekly cap would be exceeded', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const day7 = submitAt(store, checkinByDay(store, episode_id, 7), worst);
    expect(day7.some((e) => e.type === 'screen_offered' && e.payload.reason === 'coping_trigger')).toBe(true);
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', checkin_id: checkinByDay(store, episode_id, 7).id, item_responses: Array(10).fill(3) }), PATIENT);
    // Day 14, inside the trailing week: ten EPDS items already count against the cap of ten; the scheduled step is dropped.
    const day14 = submitAt(store, checkinByDay(store, episode_id, 14), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }], 20);
    expect(day14.filter((e) => e.type === 'screen_offered')).toHaveLength(0);
    const deferred = day14.find((e) => e.type === 'burden_cap_deferred');
    expect(deferred && deferred.type === 'burden_cap_deferred' && deferred.payload.item_key).toBe('epds');
    // A week later the cap has room again.
    const day21 = submitAt(store, checkinByDay(store, episode_id, 21), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'callback', value: 'no' }]);
    expect(day21.some((e) => e.type === 'burden_cap_deferred')).toBe(false);
  });

  it('never defers a screen triggered by a coping answer', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    submitAt(store, checkinByDay(store, episode_id, 7), worst);
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', checkin_id: checkinByDay(store, episode_id, 7).id, item_responses: Array(10).fill(3) }), PATIENT);
    const day14 = submitAt(store, checkinByDay(store, episode_id, 14), [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'very_hard' }], 20);
    const offered = day14.filter((e) => e.type === 'screen_offered');
    expect(offered).toHaveLength(1);
    expect(offered[0].type === 'screen_offered' && offered[0].payload.reason).toBe('coping_trigger');
    expect(day14.some((e) => e.type === 'burden_cap_deferred')).toBe(false);
  });
});
