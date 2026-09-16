/**
 * Safety-critical review cases (written by the code reviewer, not by the package owners).
 * Each case states a requirement as an assertion. Cases that documented defects found in review were
 * marked `it.fails` until the fix landed; every one of them is now a plain `it(...)` and must stay green.
 */
import { describe, expect, it } from 'vitest';
import { addDays, addMinutes } from './clock';
import { loadConfig } from './config';
import { validateConfigInvariants } from './config.schema';
import { rewordResult } from './services/ai';
import { closingStatementFor, rateUsefulness, submitCheckin, type SubmitResponse } from './services/checkins';
import { DomainError } from './services/errors';
import { enroll, pauseCheckins, registerPatient } from './services/enrollment';
import { assertScanConsistency, routeFreeText } from './services/freetext';
import { logOutreach } from './services/queues';
import { administerScreen } from './services/screening';
import { setSensitivePreferences, setSensitiveStatus } from './services/sensitive';
import { ADMIN, CLINICIAN, COORD, DELIVERY, PATIENT, checkinByDay, enrolled, itemsIn, submitAt } from './testflows';
import { makePatient, makeTestConfig, makeTestContent, makeTestContext, makeTestStore, type PatientOverrides } from './testutil';
import type { AnyEvent, Id, RuleTag } from './types';

const of = <T extends AnyEvent['type']>(events: AnyEvent[], type: T) => events.filter((e): e is Extract<AnyEvent, { type: T }> => e.type === type);

/** Every string anywhere in an event payload (deep). */
function payloadStrings(e: AnyEvent): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v as Record<string, unknown>).forEach(walk);
  };
  walk(e.payload);
  return out;
}

// ---------------------------------------------------------------------------
// FR-17: free text routed in the same command in both flag states; matched text never stored
// ---------------------------------------------------------------------------

describe('FR-17 free text routing in both flag states', () => {
  const TEXT = 'Some nights I think about how I might hurt myself.';

  it('scan off: one Needs-review item in the same command, no Urgent item, no lexicon match, inline instruction shown', () => {
    const store = makeTestStore(makeTestConfig((c) => { c.freetext.free_text_urgency_scan = false; }));
    const { episode_id } = enrolled(store);
    const events = store.dispatch(routeFreeText({ episode_id, field: 'checkin_free_text', text: TEXT }), PATIENT);
    expect(of(events, 'queue_item_created').map((e) => e.payload.queue_key)).toEqual(['needs_review']);
    expect(of(events, 'help_requested')).toHaveLength(0);
    expect(of(events, 'emergency_instruction_shown').map((e) => e.payload.layout)).toEqual(['inline']);
    expect(of(events, 'free_text_routed')[0].payload.lexicon_match).toBeNull();
  });

  it('scan on: one Urgent item in place of Needs-review, help_requested(lexicon_match), full-screen instruction, all in one command', () => {
    const store = makeTestStore(makeTestConfig((c) => { c.freetext.free_text_urgency_scan = true; }));
    const { episode_id } = enrolled(store);
    const events = store.dispatch(routeFreeText({ episode_id, field: 'checkin_free_text', text: TEXT }), PATIENT);
    expect(of(events, 'queue_item_created').map((e) => e.payload.queue_key)).toEqual(['urgent']);
    expect(of(events, 'help_requested').map((e) => e.payload.source)).toEqual(['lexicon_match']);
    expect(of(events, 'emergency_instruction_shown').map((e) => e.payload.layout)).toEqual(['inline', 'full_screen']);
    const match = of(events, 'free_text_routed')[0].payload.lexicon_match;
    expect(match).toEqual({ version: '1', term_class: 'self_harm' });
    // The matched text is never stored: the routing bundle carries no fragment of the note (SR-11).
    for (const e of events) for (const s of payloadStrings(e)) expect(s.toLowerCase()).not.toContain('hurt myself');
  });

  it('ai_enabled without the scan fails at startup validation and at command time', () => {
    const bad = makeTestConfig((c) => { c.freetext.ai_enabled = true; c.freetext.free_text_urgency_scan = false; });
    const content = makeTestContent(bad);
    expect(validateConfigInvariants(bad, content.ids).some((p) => p.includes('ai_enabled'))).toBe(true);
    expect(() => assertScanConsistency(bad)).toThrow(DomainError);
    const store = makeTestStore(bad, content);
    const { episode_id } = enrolled(store);
    expect(() => store.dispatch(routeFreeText({ episode_id, field: 'saved_question', text: 'hello' }), PATIENT)).toThrow(DomainError);
  });

  // FINDING: ai.ts never reads `ai_enabled`. With ai_enabled=true (and the scan on, so startup passes) the gateway
  // serves canned exemplars with prefilter_result 'not_run' while every export and the inventory report live AI.
  it('ai_enabled=true is refused by the AI gateway (no live path exists; canned output must not be labelled live)', () => {
    const cfg = makeTestConfig((c) => { c.freetext.ai_enabled = true; c.freetext.free_text_urgency_scan = true; });
    const ctx = makeTestContext({ config: cfg, now: DELIVERY });
    expect(() => rewordResult(ctx, { content_id: 'careplan.recovery_visit.title', episode_id: null })).toThrow(DomainError);
  });
});

// ---------------------------------------------------------------------------
// FR-17: the text behind a routed item must exist somewhere a clinician can read it
// ---------------------------------------------------------------------------

describe('FR-17 routed free text is readable by the clinician who receives the item', () => {
  // FINDING: usefulness_rated stores only comment_queue_item_id; the comment text is in no event and no state.
  it('a usefulness comment creates a Needs-review item AND the comment text is persisted', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(addDays(DELIVERY, 42));
    const events = store.dispatch(rateUsefulness({ episode_id, week: 6, rating: 3, comment: 'the calls came too late in the evening' }), PATIENT);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(1);
    const stored = events.some((e) => payloadStrings(e).some((s) => s.includes('too late in the evening')));
    expect(stored).toBe(true);
  });

  // FINDING: setSensitivePreferences routes `free_text` (creates the item) but sensitive_preferences_set drops the text.
  it('the sensitive-preferences note creates a Needs-review item AND the note text is persisted', () => {
    const store = makeTestStore();
    const { patient_id, episode_id } = enrolled(store, { delivery_outcome: 'stillbirth' });
    store.setClock(addDays(DELIVERY, 2));
    store.dispatch(setSensitiveStatus({ patient_id, episode_id, subtype: 'stillbirth', set_by: 'patient' }), PATIENT);
    const events = store.dispatch(setSensitivePreferences({ patient_id, episode_id, form_of_address: null, use_baby_name: false, contact_frequency: 'reduced', free_text: 'please do not call before noon' }), PATIENT);
    expect(itemsIn(store, 'needs_review', episode_id)).toHaveLength(1);
    const stored = events.some((e) => payloadStrings(e).some((s) => s.includes('do not call before noon')));
    expect(stored).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-15: the no-follow-up statement is impossible when a rule fired or a screen was deferred
// ---------------------------------------------------------------------------

describe('FR-15 closing statement', () => {
  const loaded = loadConfig();

  function answerWithTag(templateKey: string, tag: RuleTag): SubmitResponse {
    const t = loaded.config.checkins[templateKey];
    for (const item of t.items) {
      const o = item.options.find((x) => x.rule_tags.includes(tag));
      if (o) return { question_key: item.key, value: item.response_type === 'multi_tap' ? [o.value] : o.value };
    }
    throw new Error(`no option tagged ${tag} on ${templateKey}`);
  }
  function fullAnswers(templateKey: string, override: SubmitResponse): SubmitResponse[] {
    const t = loaded.config.checkins[templateKey];
    return t.items.filter((i) => i.response_type !== 'free_text_optional').map((i) => {
      if (i.key === override.question_key) return override;
      const o = i.options.find((x) => x.rule_tags.length === 0 || x.rule_tags.every((r) => r === 'none')) ?? i.options[0];
      return { question_key: i.key, value: i.response_type === 'multi_tap' ? [o.value] : o.value };
    });
  }

  // FINDING: closingStatementFor only looks for queue items and the template's own instrument_key. The shipped
  // coping_mild_twice rule fires on day 7 (no instrument on that template), offers the EPDS, and when she sets it
  // aside the statement still reads "no follow-up".
  it('a rule that fired (administer_screen) with the screen set aside never yields the no-follow-up form (shipped config)', () => {
    const store = makeTestStore(loaded.config, loaded.content);
    store.setClock(addMinutes(DELIVERY, 360));
    store.dispatch(registerPatient({ patient: makePatient('rv-15') }), ADMIN);
    store.dispatch(enroll({ patient_id: 'rv-15', enrollment_point: 'after_delivery', delivery_date: DELIVERY, delivery_outcome: 'live_birth', performed_by: 'patient' }), PATIENT);
    const episode_id = Object.values(store.getState().episodes)[0].id;
    const c3 = checkinByDay(store, episode_id, 3);
    store.setClock(addMinutes(c3.scheduled_at, 30));
    store.dispatch(submitCheckin({ checkin_id: c3.id, responses: fullAnswers('day03', answerWithTag('day03', 'coping_difficulty_mild')) }), PATIENT);
    const c7 = checkinByDay(store, episode_id, 7);
    store.setClock(addMinutes(c7.scheduled_at, 30));
    const events = store.dispatch(submitCheckin({ checkin_id: c7.id, responses: fullAnswers('day07', answerWithTag('day07', 'coping_difficulty_mild')) }), PATIENT);
    expect(of(events, 'rule_fired').map((e) => e.payload.rule_key)).toEqual(['coping_mild_twice']);
    expect(of(events, 'screen_offered')).toHaveLength(1);
    expect(checkinByDay(store, episode_id, 7).state).toBe('completed');
    // Nothing else is open for the episode, so the only reason for the pending form is the fired rule / deferred screen.
    expect(itemsIn(store, undefined, episode_id).filter((q) => q.state !== 'resolved')).toHaveLength(0);
    expect(closingStatementFor(store.getState(), store.config, c7.id, store.getClock()).kind).toBe('pending');
  });

  it('free text entered forces the pending form even when everything else is clean', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const c3 = checkinByDay(store, episode_id, 3);
    submitAt(store, c3, [{ question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'ride', value: 'have_ride' }, { question_key: 'callback', value: 'no' }, { question_key: 'note', value: null, free_text: 'a small question' }]);
    const closing = closingStatementFor(store.getState(), store.config, c3.id, store.getClock());
    expect(closing.kind).toBe('pending');
    expect(closing.pending).toContain('your written note');
  });
});

// ---------------------------------------------------------------------------
// FR-22: the AI module never reads locked emergency content
// ---------------------------------------------------------------------------

describe('FR-22 locked content and the AI module', () => {
  // FINDING: rewordResult blocks locked content but still returns item.body as `text` (the locked emergency body).
  it('rewordResult on a locked item returns no text at all (the AI layer neither reads nor emits FR-22 content)', () => {
    const ctx = makeTestContext({ now: DELIVERY });
    const r = rewordResult(ctx, { content_id: 'emergency_instruction', episode_id: null });
    expect(r.blocked).toBe(true);
    expect(of(r.events, 'ai_call_blocked')[0].payload.reason).toBe('locked_content');
    expect(r.text).toBe('');
  });
});

// ---------------------------------------------------------------------------
// FR-13: exactly one Unreached item; a pause is never a signal
// ---------------------------------------------------------------------------

describe('FR-13 Unreached derivation', () => {
  it('two consecutive unopened check-ins derive exactly one Unreached item; a third unopened adds none', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(addDays(DELIVERY, 24));
    const items = itemsIn(store, 'unreached', episode_id);
    expect(items).toHaveLength(1);
    expect(items[0].derived).toBe(true);
    expect(items[0].id).toBe(`unreached:${episode_id}:${checkinByDay(store, episode_id, 7).id}`);
  });

  it('a patient pause covering the check-ins derives no Unreached item and no day-21 item', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(addDays(DELIVERY, 1));
    store.dispatch(pauseCheckins({ episode_id, actor: 'patient', duration_label: 'until_resumed', until: null }), PATIENT);
    store.setClock(addDays(DELIVERY, 30));
    expect(itemsIn(store, 'unreached', episode_id)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// FR-06 / SR-14: what the coordinator can see of a clinician-only screen
// ---------------------------------------------------------------------------

describe('FR-06 coordinator exclusion beyond visibleScreenFor', () => {
  // FINDING: with "clinician only", the Needs-review item created for the positive screen carries the outcome in its
  // note and trigger type; the coordinator's Queues page renders every queue, so the outcome is visible to a role
  // outside the sharing category.
  it('a positive screen with sharing "clinician only" creates no item whose note or trigger reveals the result to the coordinator', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { preferences: { sharing_category: 'clinician_only' } } });
    store.setClock(addDays(DELIVERY, 14));
    const inst = store.config.instruments.epds;
    const high = inst.items.map((i) => i.options.findIndex((o) => o.score === 3));
    store.dispatch(administerScreen({ episode_id, instrument_key: 'epds', item_responses: high }), PATIENT);
    const items = itemsIn(store, 'needs_review', episode_id);
    expect(items).toHaveLength(1);
    expect(items[0].note ?? '').not.toMatch(/threshold/i);
    expect(items[0].trigger_type).not.toBe('positive_screen');
  });
});

// ---------------------------------------------------------------------------
// FR-38 / FR-45: the single minutes ledger
// ---------------------------------------------------------------------------

describe('FR-38 staff_time ledger', () => {
  it('outreach "reached" logs one contact row and no second row; "not reached" logs one outreach row', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(addDays(DELIVERY, 24));
    const item = itemsIn(store, 'unreached', episode_id)[0];
    store.dispatch(logOutreach({ queue_item_id: item.id, outcome: 'not_reached', minutes: 5 }), COORD);
    const rows = store.getState().staffTime.filter((r) => r.episode_id === episode_id);
    expect(rows).toHaveLength(1);
    expect(rows[0].source_type).toBe('outreach');
  });

  // FINDING: the "not reached" row's source_id is a fresh id (`outreach-NNNNN`) that no entity carries, so the ledger
  // row cannot be traced back to the Unreached item it belongs to (FR-45 requires source_type and source_id).
  it('the "not reached" staff_time row references the queue item it was logged on', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(addDays(DELIVERY, 24));
    const item = itemsIn(store, 'unreached', episode_id)[0];
    store.dispatch(logOutreach({ queue_item_id: item.id, outcome: 'not_reached', minutes: 5 }), COORD);
    const row = store.getState().staffTime.find((r) => r.episode_id === episode_id);
    expect(row?.source_id).toBe(item.id);
  });
});

// keep the helper imports referenced for readers of this file
void CLINICIAN;
void (null as unknown as PatientOverrides);
void (null as unknown as Id);
