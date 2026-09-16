/** 6.3 Marisol: emergency instruction and same-day practice call, and the 7 p.m. timer-lapse variant (FR-17, FR-22–FR-25, FR-38, FR-45). */
import { describe, expect, it } from 'vitest';
import { closingStatementFor } from '../domain/services/checkins';
import { LOADED, checkinFor, derivedFor, episodeFor, eventsOf, itemsFor, localTime, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-marisol';

describe('6.3 Marisol — urgent answer at the day-7 check-in', () => {
  const store = seedStore('marisol');

  it('the locked instruction renders before anything else, the configured rule creates one Urgent item, and no model is called', () => {
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const urgent = itemsFor(state, ep.id, 'urgent');
    expect(urgent).toHaveLength(1);
    expect(urgent[0]).toMatchObject({ trigger_type: 'rule', state: 'open', open_clinical_flag: true, owner_role: 'coordinator' });
    expect(urgent[0].ack_target_at).toBe(t('2026-04-14', 10, 54));
    expect(urgent[0].backup_target_at).toBe(t('2026-04-14', 11, 24));
    const submitted = store.getEvents().filter((e) => e.episode_id === ep.id && e.occurred_at === t('2026-04-14', 10, 24));
    expect(submitted.map((e) => e.type)).toEqual(['checkin_submitted', 'rule_fired', 'queue_item_created', 'emergency_instruction_shown', 'help_requested']);
    const fired = eventsOf(submitted, 'rule_fired')[0].payload;
    expect(fired).toMatchObject({ rule_key: 'urgent_symptom', rule_version: LOADED.config.rules.find((r) => r.key === 'urgent_symptom')!.version, queue_item_id: urgent[0].id });
    expect(eventsOf(submitted, 'emergency_instruction_shown')[0].payload).toMatchObject({ layout: 'full_screen', trigger: 'rule:urgent_symptom' });
    expect(eventsOf(submitted, 'help_requested')[0].payload.source).toBe('rule');
    expect(eventsOf(store.getEvents(), 'ai_call', ep.id).filter((e) => e.occurred_at <= state.clock)).toHaveLength(0);
    expect(Object.values(state.aiInteractions).filter((a) => a.episode_id === ep.id)).toHaveLength(0);
    expect(closingStatementFor(state, LOADED.config, checkinFor(state, ep.id, 7).id, state.clock).kind).toBe('pending');
  });

  it('the coordinator acknowledges in 12 minutes, logs a 12-minute call and closes the item against it: 12 minutes on the ledger, not 24', () => {
    const state = stateAt(store, t('2026-04-14', 11, 30));
    const ep = episodeFor(state, P);
    const item = itemsFor(state, ep.id, 'urgent')[0];
    expect(item.state).toBe('resolved');
    expect(item.minutes_to_ack).toBe(12);
    expect(item.acknowledged_by).toBe('coord-1');
    expect(item.escalated_at).toBeNull();
    expect(item.outcome).toContain('same-day visit arranged');
    expect(item.rating).toBe('appropriate');
    const contact = Object.values(state.contacts).find((c) => c.episode_id === ep.id && c.type === 'phone_call')!;
    expect(contact.day_number).toBe(7);
    const resolved = eventsOf(store.getEvents(), 'queue_item_resolved', ep.id).find((e) => e.payload.queue_item_id === item.id)!;
    expect(resolved.payload.contact_id).toBe(contact.id);
    const minutes = state.staffTime.filter((s) => s.episode_id === ep.id && s.recorded_at <= state.clock);
    expect(minutes.map((s) => [s.source_type, s.minutes])).toEqual([['contact', 12]]);
    expect(minutes.reduce((a, s) => a + s.minutes, 0)).toBe(12);
    expect(ep.initial_contact_day).toBe(7);
  });

  it('the day-21 note takes the FR-17 path in the mode in force: one Needs-review item, the inline instruction, a recorded read, and the pending closing statement', () => {
    expect(LOADED.config.freetext.free_text_urgency_scan).toBe(false);
    const state = stateAt(store, t('2026-04-28', 12, 0));
    const ep = episodeFor(state, P);
    const c21 = checkinFor(state, ep.id, 21);
    const note = c21.responses.find((r) => r.free_text !== null)!;
    expect(note.lexicon_match).toBeNull();
    const item = state.queueItems[note.queue_item_id!];
    expect(item).toMatchObject({ queue_key: 'needs_review', trigger_type: 'free_text', state: 'resolved' });
    const atSubmit = store.getEvents().filter((e) => e.episode_id === ep.id && e.occurred_at === c21.submitted_at);
    expect(eventsOf(atSubmit, 'emergency_instruction_shown').map((e) => e.payload.layout)).toEqual(['inline']);
    expect(eventsOf(atSubmit, 'free_text_routed')[0].payload).toMatchObject({ queue_key: 'needs_review', field: 'checkin_free_text', lexicon_match: null });
    expect(eventsOf(atSubmit, 'rule_fired').map((e) => [e.payload.rule_key, e.payload.queue_item_id])).toEqual([['free_text_present', item.id]]);
    const closing = closingStatementFor(state, LOADED.config, c21.id, c21.submitted_at!);
    expect(closing.kind).toBe('pending');
    expect(closing.pending).toContain('your written note');
    expect(closing.target_time).not.toBeNull();
    expect(state.readRecords.filter((r) => r.episode_id === ep.id).map((r) => [r.field, r.role])).toEqual([['free_text', 'clinician']]);
  });
});

describe('6.3 Marisol — 7 p.m. variant: the timers lapse', () => {
  const store = seedStore('marisol_after_hours');

  it('open at 7 p.m., escalated at 7:30 p.m., UNOWNED by 8 p.m. on the wall basis, with the patient notified', () => {
    const open = stateAt(store, opening(store));
    const ep = episodeFor(open, P);
    const item = itemsFor(open, ep.id, 'urgent')[0];
    expect(localTime(item.created_at)).toBe('19:00');
    expect(item.state).toBe('open');
    expect(LOADED.config.queues.find((q) => q.key === 'urgent')).toMatchObject({ timer_basis: 'wall', ack_target_minutes: 30, backup_ack_target_minutes: 60 });
    expect(LOADED.config.queues.find((q) => q.key === 'needs_review')?.timer_basis).toBe('coverage_hours');

    const escalated = stateAt(store, t('2026-04-14', 19, 45));
    expect(itemsFor(escalated, ep.id, 'urgent')[0]).toMatchObject({ state: 'escalated', escalated_at: t('2026-04-14', 19, 30), unowned_at: null });
    expect(derivedFor(escalated, ep.id, 'escalation_escalated')).toHaveLength(1);
    expect(derivedFor(escalated, ep.id, 'escalation_unacknowledged_timeout')).toHaveLength(0);

    const unowned = stateAt(store, t('2026-04-14', 20, 0));
    expect(itemsFor(unowned, ep.id, 'urgent')[0]).toMatchObject({ state: 'unowned', unowned_at: t('2026-04-14', 20, 0), owner_user_id: null });
    const timeout = derivedFor(unowned, ep.id, 'escalation_unacknowledged_timeout');
    expect(timeout).toHaveLength(1);
    expect(timeout[0].attributes).toMatchObject({ patient_notified: true, queue_key: 'urgent' });
  });

  it('the next morning the coordinator picks it up, the call is logged once, and the timeout is recorded as an incident', () => {
    const state = stateAt(store, t('2026-04-15', 9, 0));
    const ep = episodeFor(state, P);
    const item = itemsFor(state, ep.id, 'urgent')[0];
    expect(item).toMatchObject({ state: 'resolved', minutes_to_ack: 785, escalated_at: t('2026-04-14', 19, 30), unowned_at: t('2026-04-14', 20, 0) });
    expect(state.staffTime.filter((s) => s.episode_id === ep.id).map((s) => s.minutes)).toEqual([12]);
    const incidents = Object.values(state.incidents);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ type: 'unowned_timeout', related_entity: 'queue_item', related_id: item.id });
  });
});
