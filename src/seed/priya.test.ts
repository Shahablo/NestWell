/** 6.2 Priya: positive mood screen to confirmed appointment, and variants a–e (FR-06, FR-25, FR-29, FR-30, FR-30a, FR-32, FR-33, FR-36a). */
import { describe, expect, it } from 'vitest';
import { closingStatementFor } from '../domain/services/checkins';
import { CRITICAL_WITHHELD_NOTE, SHARING_WITHHELD_NOTICE, visibleScreenFor } from '../domain/services/screening';
import { buildStructured } from '../domain/services/summaries';
import { LOADED, checkinFor, derivedFor, episodeFor, eventsOf, itemsFor, localTime, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-priya';

describe('6.2 Priya — positive screen to kept appointment', () => {
  const store = seedStore('priya');

  it('day 3: "no ride" creates one typed transport Follow-through item with the NOT YET PROVIDED resource', () => {
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const items = itemsFor(state, ep.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ queue_key: 'follow_through', trigger_type: 'barrier', state: 'open' });
    expect(items[0].note).toContain('transport');
    expect(items[0].note).toContain('NOT YET PROVIDED');
    const sofar = store.getEvents().filter((e) => e.occurred_at <= state.clock);
    expect(eventsOf(sofar, 'barrier_item_created', ep.id)).toHaveLength(1);
    expect(eventsOf(sofar, 'rule_fired', ep.id).map((e) => e.payload.rule_key)).toEqual(['barrier_item']);
    expect(state.patients[P]).toMatchObject({ insurance_type: 'medicaid', access_barriers: ['transport'] });
  });

  it('day 14: the worst coping option creates a Needs-review item at once, the instrument is offered, and the threshold score creates exactly one more', () => {
    const state = stateAt(store, t('2026-04-02', 12, 0));
    const ep = episodeFor(state, P);
    const nr = itemsFor(state, ep.id, 'needs_review');
    expect(nr.map((q) => [q.trigger_type, q.state, localTime(q.created_at)])).toEqual([['coping_difficulty', 'open', '10:35'], ['positive_screen', 'open', '10:40']]);
    expect(nr[0].open_clinical_flag).toBe(true);
    const screen = Object.values(state.screens).find((s) => s.episode_id === ep.id)!;
    expect(screen).toMatchObject({ score: 10, positive: true, critical_item_hit: false, shared_with: ['clinician', 'coordinator'] });
    expect(screen.score).toBe(LOADED.config.instruments.epds.threshold_positive);
    const offered = eventsOf(store.getEvents(), 'screen_offered', ep.id).filter((e) => e.occurred_at <= state.clock);
    expect(offered.map((e) => e.payload.reason)).toEqual(['coping_trigger']);
    expect(eventsOf(store.getEvents(), 'rule_fired', ep.id).filter((e) => e.occurred_at <= state.clock).map((e) => e.payload.rule_key)).toEqual(['barrier_item', 'coping_worst', 'positive_screen']);
    expect(closingStatementFor(state, LOADED.config, checkinFor(state, ep.id, 14).id, t('2026-04-02', 10, 41)).kind).toBe('pending');
  });

  it('the clinician acknowledges the same business day, records an assessment, refers with consent, and the partner confirms Medicaid, schedules and records the kept appointment', () => {
    const state = stateAt(store, t('2026-04-13', 12, 0));
    const ep = episodeFor(state, P);
    const positive = itemsFor(state, ep.id, 'needs_review').find((q) => q.trigger_type === 'positive_screen')!;
    expect(positive.state).toBe('resolved');
    expect(positive.minutes_to_ack).toBe(170);
    expect(positive.acknowledged_by).toBe('ob-1');
    expect(positive.escalated_at).toBeNull();
    const assessment = Object.values(state.assessments).find((a) => a.episode_id === ep.id)!;
    expect(assessment).toMatchObject({ outcome: 'referral', clinician_id: 'ob-1' });
    expect(assessment.screen_result_id).toBe(Object.values(state.screens).find((s) => s.episode_id === ep.id)!.id);
    const referral = Object.values(state.referrals).find((r) => r.episode_id === ep.id)!;
    expect(referral.history.map((h) => h.state)).toEqual(['created', 'sent_to_partner', 'appointment_scheduled', 'appointment_completed']);
    expect(referral.consent_basis).toContain('consent');
    expect(referral.coverage_status).toBe('covered');
    expect(referral.completed_at).toBe(t('2026-04-13', 9, 0));
    expect(state.carePlanItems[Object.values(state.carePlanItems).find((c) => c.episode_id === ep.id && c.key === 'mental_health_connection')!.id].state).toBe('completed');
    expect(itemsFor(state, ep.id).every((q) => q.state === 'resolved')).toBe(true);
  });

  it('a second positive at week 6 still reports the day-14 intervals (FR-32) and the episode closes with a confirmed destination', () => {
    const state = stateAt(store, t('2026-05-22', 12, 0));
    const ep = episodeFor(state, P);
    const screens = Object.values(state.screens).filter((s) => s.episode_id === ep.id).sort((a, b) => a.administered_at.localeCompare(b.administered_at));
    expect(screens.map((s) => s.score)).toEqual([10, 12]);
    const { structured } = buildStructured({ state, config: LOADED.config, content: LOADED.content }, ep.id, state.clock);
    expect(structured.intervals.screen_to_assessment_hours).toBe(3.2);
    expect(structured.intervals.screen_to_connection_hours).toBe(262.3);
    const week9 = Object.values(state.summaries).find((s) => s.episode_id === ep.id && s.period === 'week9')!;
    expect(week9.state).toBe('reviewed');
    expect(week9.structured.intervals).toEqual(structured.intervals);
    const end = stateAt(store, t('2026-06-12', 12, 0));
    expect(episodeFor(end, P)).toMatchObject({ status: 'completed', indicated: true });
    expect(episodeFor(end, P).transition?.mental_health).toBe('confirmed');
  });
});

describe('6.2 Priya — variants', () => {
  it('(a) instrument declined: the decline lands on the coping item, which reads "reported difficulty coping; screen declined"', () => {
    const store = seedStore('priya_declined_screen');
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const coping = itemsFor(state, ep.id, 'needs_review');
    expect(coping).toHaveLength(1);
    expect(coping[0].trigger_type).toBe('coping_difficulty');
    const declined = eventsOf(store.getEvents(), 'screen_declined', ep.id);
    expect(declined).toHaveLength(1);
    expect(declined[0].payload).toMatchObject({ instrument_key: 'epds', queue_item_id: coping[0].id });
    expect(Object.values(state.screens).filter((s) => s.episode_id === ep.id).map((s) => s.declined)).toEqual([true]);
    const later = stateAt(store, t('2026-04-02', 15, 0));
    const item = itemsFor(later, ep.id, 'needs_review')[0];
    expect(item.state).toBe('resolved');
    expect(item.outcome).toBe('reported difficulty coping; screen declined; follow-up call agreed');
  });

  it('(b) sharing "nobody yet", threshold positive: the practice sees "screen completed, sharing withheld" and no queue item is created', () => {
    const store = seedStore('priya_sharing_withheld');
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const screen = Object.values(state.screens).find((s) => s.episode_id === ep.id)!;
    expect(screen).toMatchObject({ score: 10, positive: true, shared_with: [] });
    for (const role of ['clinician', 'coordinator', 'referral_partner', 'budget_owner'] as const) {
      const v = visibleScreenFor(state, screen, role);
      expect(v.visible, role).toBe(false);
      expect(v.score, role).toBeNull();
    }
    expect(visibleScreenFor(state, screen, 'clinician').withheld_notice).toBe(SHARING_WITHHELD_NOTICE);
    // Only the resolved day-3 transport item exists; nothing was created at or after the screen.
    const items = itemsFor(state, ep.id);
    expect(items.map((q) => [q.trigger_type, q.state])).toEqual([['barrier', 'resolved']]);
    expect(eventsOf(store.getEvents(), 'rule_fired', ep.id).some((e) => e.payload.rule_key === 'positive_screen')).toBe(false);
    expect(eventsOf(store.getEvents(), 'sharing_reasked', ep.id).map((e) => e.payload.count)).toEqual([1]);
    const { withheld_notices, structured } = buildStructured({ state, config: LOADED.config, content: LOADED.content }, ep.id, state.clock);
    expect(withheld_notices.some((n) => n.includes('withheld at patient request'))).toBe(true);
    expect(structured.screens[0]).toMatchObject({ score: null, positive: null, withheld: true });
  });

  it('(c) sharing "nobody yet", critical item positive: the emergency instruction, then one Urgent item with the FR-30a placeholder note and no score', () => {
    const store = seedStore('priya_critical_withheld');
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    expect(LOADED.config.freetext.critical_item_overrides_sharing).toBe(true);
    const screen = Object.values(state.screens).find((s) => s.episode_id === ep.id)!;
    expect(screen).toMatchObject({ positive: false, critical_item_hit: true, shared_with: [] });
    const created = itemsFor(state, ep.id).filter((q) => q.created_at >= t('2026-04-02', 10, 0));
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ queue_key: 'urgent', trigger_type: 'critical_item', note: CRITICAL_WITHHELD_NOTE, state: 'open' });
    expect(created[0].note).not.toMatch(/\bscore\b/);
    expect(created[0].note).not.toMatch(new RegExp(`\\b${screen.score}\\b`));
    const events = store.getEvents().filter((e) => e.episode_id === ep.id && e.occurred_at === screen.administered_at);
    expect(eventsOf(events, 'emergency_instruction_shown').map((e) => [e.payload.layout, e.payload.trigger])).toEqual([['full_screen', 'critical_item']]);
    expect(eventsOf(events, 'help_requested').map((e) => e.payload.source)).toEqual(['critical_item']);
    expect(eventsOf(events, 'critical_item_hit')[0].payload).toMatchObject({ shared: true, queue_item_id: created[0].id });
    expect(eventsOf(events, 'rule_fired').map((e) => [e.payload.rule_key, e.payload.queue_item_id])).toEqual([['critical_item', created[0].id]]);
    expect(itemsFor(state, ep.id, 'needs_review')).toHaveLength(0);
    const later = stateAt(store, t('2026-04-02', 11, 15));
    const urgent = itemsFor(later, ep.id, 'urgent')[0];
    expect(urgent.state).toBe('resolved');
    expect(urgent.minutes_to_ack).toBe(12);
  });

  it('(d) referral declined: the Needs-review item reopens for an alternative plan and closes only with a documented plan', () => {
    const store = seedStore('priya_referral_declined');
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const referral = Object.values(state.referrals).find((r) => r.episode_id === ep.id)!;
    expect(referral.state).toBe('declined_by_patient');
    const reopened = itemsFor(state, ep.id, 'needs_review').filter((q) => q.trigger_type === 'referral_dead_end');
    expect(reopened).toHaveLength(1);
    expect(reopened[0].state).toBe('open');
    expect(eventsOf(store.getEvents(), 'referral_reopened_for_plan', ep.id).map((e) => e.payload.queue_item_id)).toEqual([reopened[0].id]);
    const later = stateAt(store, t('2026-04-03', 15, 0));
    const item = itemsFor(later, ep.id, 'needs_review').find((q) => q.trigger_type === 'referral_dead_end')!;
    expect(item.state).toBe('resolved');
    expect(item.outcome).toContain('documented plan');
    expect(Object.values(later.assessments).filter((a) => a.episode_id === ep.id).map((a) => a.outcome)).toEqual(['referral', 'follow_up_call']);
  });

  it('(e) ownership rule: the item passes its same-business-day target and escalates, then is acknowledged with minutes_to_ack recorded', () => {
    const store = seedStore('priya_escalated_then_acknowledged');
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const positive = itemsFor(state, ep.id, 'needs_review').find((q) => q.trigger_type === 'positive_screen')!;
    expect(localTime(positive.created_at)).toBe('08:40');
    expect(positive.ack_target_at).toBe(t('2026-04-03', 16, 40));
    expect(positive.state).toBe('escalated');
    expect(positive.escalated_at).toBe(t('2026-04-03', 16, 40));
    expect(positive.unowned_at).toBeNull();
    expect(derivedFor(state, ep.id, 'escalation_escalated').map((d) => d.related_id)).toContain(positive.id);
    expect(derivedFor(state, ep.id, 'escalation_unacknowledged_timeout')).toHaveLength(0);
    const later = stateAt(store, t('2026-04-03', 17, 0));
    const acked = itemsFor(later, ep.id, 'needs_review').find((q) => q.trigger_type === 'positive_screen')!;
    expect(acked.state).toBe('acknowledged');
    expect(acked.escalated_at).toBe(t('2026-04-03', 16, 40));
    expect(acked.minutes_to_ack).toBe(495);
    expect(acked.acknowledged_by).toBe('ob-1');
  });
});
