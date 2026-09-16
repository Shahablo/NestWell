import { describe, expect, it } from 'vitest';
import { makeTestConfig, makeTestContext } from '../testutil';
import { actionKey, conditionHolds, evaluateRules, ruleMatches, triggerTypeForRule } from './rules';

describe('rule conditions (FR-23)', () => {
  it('implements eq, gte, lte, in and any_of over scalars and arrays', () => {
    expect(conditionHolds({ field: 'x', op: 'eq', value: 'a' }, { x: 'a' })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'eq', value: true }, { x: true })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'eq', value: 3 }, { x: '3' })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'eq', value: 'a' }, { x: ['b', 'a'] })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'gte', value: 10 }, { x: 10 })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'gte', value: 10 }, { x: 9 })).toBe(false);
    expect(conditionHolds({ field: 'x', op: 'lte', value: 2 }, { x: 2 })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'in', value: ['a', 'b'] }, { x: 'b' })).toBe(true);
    expect(conditionHolds({ field: 'x', op: 'in', value: ['a', 'b'] }, { x: 'c' })).toBe(false);
    expect(conditionHolds({ field: 'tags', op: 'any_of', value: ['urgent_candidate'] }, { tags: ['none', 'urgent_candidate'] })).toBe(true);
    expect(conditionHolds({ field: 'tags', op: 'any_of', value: ['urgent_candidate'] }, { tags: [] })).toBe(false);
    expect(conditionHolds({ field: 'missing', op: 'eq', value: 'a' }, {})).toBe(false);
  });

  it('combines all and any', () => {
    const rule = makeTestConfig().rules.find((r) => r.key === 'coping_screen')!;
    expect(ruleMatches(rule, { response_tags: ['coping_difficulty'], response_tags_consecutive: [] })).toBe(true);
    expect(ruleMatches(rule, { response_tags: [], response_tags_consecutive: ['coping_difficulty_mild'] })).toBe(true);
    expect(ruleMatches(rule, { response_tags: ['coping_difficulty_mild'], response_tags_consecutive: [] })).toBe(false);
    const both = { ...rule, conditions: { all: [{ field: 'episode.day_number', op: 'gte' as const, value: 14 }], any: rule.conditions.any } };
    expect(ruleMatches(both, { response_tags: ['coping_difficulty'], 'episode.day_number': 3 })).toBe(false);
    expect(ruleMatches(both, { response_tags: ['coping_difficulty'], 'episode.day_number': 14 })).toBe(true);
  });

  it('derives action keys and typed triggers', () => {
    const rules = makeTestConfig().rules;
    expect(actionKey(rules.find((r) => r.key === 'urgent_symptom')!.action)).toBe('show_emergency_instruction');
    expect(actionKey(rules.find((r) => r.key === 'positive_screen')!.action)).toBe('create_queue_item:needs_review');
    expect(triggerTypeForRule(rules.find((r) => r.key === 'coping_worst')!)).toBe('coping_difficulty');
    expect(triggerTypeForRule(rules.find((r) => r.key === 'callback_requested')!)).toBe('callback');
    expect(triggerTypeForRule(rules.find((r) => r.key === 'critical_item')!)).toBe('critical_item');
    expect(triggerTypeForRule(rules.find((r) => r.key === 'positive_screen')!)).toBe('positive_screen');
  });
});

describe('evaluateRules', () => {
  const registered = (now: string) => {
    const ctx = makeTestContext({ now });
    const state = ctx.state;
    state.patients['p'] = { id: 'p', is_synthetic: true, is_adult: true, display_name: 'P', persona_key: null, insurance_type: 'commercial', access_barriers: [], registered_at: now, preferences: { locale: 'en', formality: null, preferred_name: null, form_of_address: null, contact_windows: [], safe_to_message: true, baby_reference_permission: 'unset', baby_name: null, sharing_category: 'clinician_only', contact_frequency: null } };
    state.episodes['e'] = { id: 'e', patient_id: 'p', expected_date: null, delivery_date: now, delivery_outcome: 'live_birth', enrollment_point: 'after_delivery', enrolled_at: now, enrolled_by: 'patient', acknowledged_at: null, acknowledgment_mode: null, status: 'active', paused_until: null, paused: false, close_reason: null, closed_at: null, transition: null, initial_contact_day: null, initial_contact_met_target: null, indicated: false };
    return ctx;
  };

  it('an urgent match logs rule id and version, shows the instruction, creates one Urgent item and help_requested(rule)', () => {
    const ctx = registered('2026-04-08T13:30:00.000Z');
    const out = evaluateRules('checkin_submitted', { episode_id: 'e', patient_id: 'p', checkin_id: 'c', trigger_ref: 'c', facts: { response_tags: ['urgent_candidate'] } }, ctx);
    expect(out.fired.map((r) => r.key)).toEqual(['urgent_symptom']);
    expect(out.emergency_shown).toBe(true);
    const types = out.events.map((e) => e.type);
    expect(types).toEqual(['rule_fired', 'queue_item_created', 'emergency_instruction_shown', 'help_requested']);
    const fired = out.events[0];
    expect(fired.type === 'rule_fired' && fired.payload.rule_key).toBe('urgent_symptom');
    expect(fired.type === 'rule_fired' && fired.payload.rule_version).toBe('1');
    expect(fired.type === 'rule_fired' && fired.payload.queue_item_id).toBe(out.created[0].queue_item_id);
    const shown = out.events[2];
    expect(shown.type === 'emergency_instruction_shown' && shown.payload.layout).toBe('full_screen');
  });

  it('a handled action is logged as fired without a duplicate item', () => {
    const ctx = registered('2026-04-08T13:30:00.000Z');
    const out = evaluateRules('screen_scored', { episode_id: 'e', patient_id: 'p', checkin_id: null, trigger_ref: 's', facts: { 'screen.positive': true, 'screen.critical_item_hit': false }, handled: { 'create_queue_item:needs_review': null } }, ctx);
    expect(out.fired.map((r) => r.key)).toEqual(['positive_screen']);
    expect(out.events.map((e) => e.type)).toEqual(['rule_fired']);
    expect(out.created).toHaveLength(0);
  });

  it('ignores rules not yet effective', () => {
    const ctx = registered('2025-12-01T13:30:00.000Z');
    const out = evaluateRules('checkin_submitted', { episode_id: 'e', patient_id: 'p', checkin_id: 'c', trigger_ref: 'c', facts: { response_tags: ['urgent_candidate'] } }, ctx);
    expect(out.fired).toHaveLength(0);
  });

  it('matches handled entries by rule key, then action plus trigger type, then action', () => {
    const facts = { response_tags: ['barrier_transport', 'callback_requested'] };
    const input = { episode_id: 'e', patient_id: 'p', checkin_id: 'c', trigger_ref: 'c', facts };
    const firedId = (out: ReturnType<typeof evaluateRules>, key: string) => { const f = out.events.find((e) => e.type === 'rule_fired' && e.payload.rule_key === key); return f && f.type === 'rule_fired' ? f.payload.queue_item_id : undefined; };
    // Specific: the barrier item is handled; the callback rule still creates its own item.
    const specific = evaluateRules('checkin_submitted', { ...input, handled: { 'create_queue_item:follow_through:barrier': 'qi-b' } }, registered('2026-04-08T13:30:00.000Z'));
    expect(specific.fired.map((r) => r.key).sort()).toEqual(['barrier_item', 'callback_requested']);
    expect(specific.created.map((c) => c.trigger_type)).toEqual(['callback']);
    expect(firedId(specific, 'barrier_item')).toBe('qi-b');
    expect(firedId(specific, 'callback_requested')).toBe(specific.created[0].queue_item_id);
    // By rule key.
    const byKey = evaluateRules('checkin_submitted', { ...input, handled: { barrier_item: 'qi-b', callback_requested: null } }, registered('2026-04-08T13:30:00.000Z'));
    expect(byKey.created).toHaveLength(0);
    expect(firedId(byKey, 'callback_requested')).toBeNull();
    // Generic action key covers every rule with that action.
    const generic = evaluateRules('checkin_submitted', { ...input, handled: { 'create_queue_item:follow_through': 'qi-z' } }, registered('2026-04-08T13:30:00.000Z'));
    expect(generic.created).toHaveLength(0);
    expect(firedId(generic, 'barrier_item')).toBe('qi-z');
    expect(firedId(generic, 'callback_requested')).toBe('qi-z');
    // Two different rules creating items in the same queue for different reasons both create one.
    const both = evaluateRules('checkin_submitted', input, registered('2026-04-08T13:30:00.000Z'));
    expect(both.created.map((c) => c.trigger_type).sort()).toEqual(['barrier', 'callback']);
  });

  it('types free-text and status rules', () => {
    const rules = makeTestConfig().rules;
    expect(triggerTypeForRule(rules.find((r) => r.key === 'free_text_present')!)).toBe('free_text');
    expect(triggerTypeForRule(rules.find((r) => r.key === 'barrier_item')!)).toBe('barrier');
    expect(triggerTypeForRule({ ...rules[0], key: 's', trigger: 'status_set', conditions: { all: [{ field: 'status.subtype', op: 'eq', value: 'trauma' }] } })).toBe('sensitive_status');
    expect(triggerTypeForRule({ ...rules[0], key: 'q', trigger: 'saved_question_added', conditions: {} })).toBe('free_text');
  });
});
