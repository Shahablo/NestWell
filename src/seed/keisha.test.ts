/** 6.5 Keisha: the patient who stops responding, and the paused variant (FR-13, FR-13a, FR-14, FR-37). */
import { describe, expect, it } from 'vitest';
import { checkinFor, derivedFor, episodeFor, eventsOf, itemsFor, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-keisha';

describe('6.5 Keisha — stops responding', () => {
  const store = seedStore('keisha');

  it('answers days 3 and 7; day 14 goes unopened with exactly one reminder', () => {
    const state = stateAt(store, t('2026-04-13', 12, 0));
    const ep = episodeFor(state, P);
    expect(state.patients[P]).toMatchObject({ insurance_type: 'uninsured', access_barriers: ['phone_data'] });
    expect(ep.enrolled_by).toBe('patient');
    expect(checkinFor(state, ep.id, 3).state).toBe('completed');
    expect(checkinFor(state, ep.id, 7).state).toBe('completed');
    const c14 = checkinFor(state, ep.id, 14);
    expect(c14.state).toBe('unopened');
    expect(c14.reminder_at).toBe(t('2026-04-08', 10, 0));
    expect(c14.reminder_suppressed_reason).toBeNull();
    expect(derivedFor(state, ep.id, 'reminder_sent').map((d) => d.related_id)).toEqual([c14.id]);
    expect(itemsFor(state, ep.id)).toHaveLength(0);
  });

  it('at day 21 the sweep emits no_contact_by_day_21 and exactly one Unreached item; the day-21 reminder is suppressed; a second unopened check-in creates none', () => {
    const sweep = stateAt(store, opening(store));
    const ep = episodeFor(sweep, P);
    const items = itemsFor(sweep, ep.id, 'unreached');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: `day21:${ep.id}`, trigger_type: 'day21_sweep', derived: true, state: 'open', open_clinical_flag: false, created_at: t('2026-04-14', 12, 0) });
    expect(derivedFor(sweep, ep.id, 'no_contact_by_day_21')).toEqual([expect.objectContaining({ related_id: items[0].id, attributes: { item_created: true } })]);
    expect(derivedFor(sweep, ep.id, 'unreached_item_created')).toHaveLength(1);

    const later = stateAt(store, t('2026-04-16', 12, 0));
    const c21 = checkinFor(later, ep.id, 21);
    expect(c21.state).toBe('unopened');
    expect(c21.reminder_suppressed_reason).toBe('unreached_open');
    expect(derivedFor(later, ep.id, 'reminder_sent')).toHaveLength(1);
    expect(itemsFor(later, ep.id, 'unreached')).toHaveLength(1);
    expect(later.notifications.filter((n) => n.episode_id === ep.id && n.kind === 'reminder' && n.simulated_state === 'sent')).toHaveLength(1);
  });

  it('the coordinator acknowledges, logs two attempts and reaches her on day 27: first contact day 27, target unmet, visit rescheduled', () => {
    const acked = stateAt(store, t('2026-04-15', 9, 30));
    const ep = episodeFor(acked, P);
    expect(itemsFor(acked, ep.id, 'unreached')[0]).toMatchObject({ state: 'acknowledged', acknowledged_by: 'coord-1', minutes_to_ack: 1260 });

    const state = stateAt(store, t('2026-04-20', 10, 0));
    const outreach = eventsOf(store.getEvents(), 'outreach_logged', ep.id).filter((e) => e.occurred_at <= state.clock);
    expect(outreach.map((e) => [e.payload.outcome, e.payload.barrier])).toEqual([['not_reached', null], ['not_reached', null], ['reached', 'transport']]);
    expect(outreach.every((e) => e.payload.queue_item_id === `day21:${ep.id}`)).toBe(true);
    expect(episodeFor(state, P)).toMatchObject({ initial_contact_day: 27, initial_contact_met_target: false });
    const contacts = Object.values(state.contacts).filter((c) => c.episode_id === ep.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].outcome).toContain('transport');
    expect(Object.values(state.visits).find((v) => v.episode_id === ep.id && v.type === 'early_postpartum')).toMatchObject({ state: 'rescheduled', scheduled_for: t('2026-04-23', 10, 0) });
    // The item resolved at the first logged outreach outcome (FR-13); attempts cost minutes on the ledger.
    const item = itemsFor(state, ep.id, 'unreached')[0];
    expect(item.state).toBe('resolved');
    expect(state.staffTime.filter((s) => s.episode_id === ep.id).map((s) => [s.source_type, s.minutes])).toEqual([['outreach', 5], ['outreach', 5], ['contact', 15]]);
  });

  it('over the whole episode exactly one Unreached item ever exists and the later check-ins are answered', () => {
    const state = stateAt(store, t('2026-06-17', 12, 0));
    const ep = episodeFor(state, P);
    expect(itemsFor(state, ep.id, 'unreached')).toHaveLength(1);
    expect(derivedFor(state, ep.id, 'unreached_item_created')).toHaveLength(1);
    for (const day of [42, 63, 84]) expect(checkinFor(state, ep.id, day).state, `day ${day}`).toBe('completed');
    expect(episodeFor(state, P).status).toBe('completed');
  });
});

describe('6.5 Keisha — paused 2 weeks at day 7', () => {
  const store = seedStore('keisha_paused');

  it('days 14 and 21 are paused, no reminder goes, the sweep finds the pause in force and no Unreached item is created', () => {
    const sweep = stateAt(store, opening(store));
    const ep = episodeFor(sweep, P);
    expect(ep).toMatchObject({ status: 'paused', paused: true });
    expect(ep.paused_until).toBe(t('2026-04-14', 20, 0));
    expect(eventsOf(store.getEvents(), 'checkins_paused', ep.id).map((e) => [e.payload.actor, e.payload.duration_label])).toEqual([['patient', '2 weeks']]);
    expect(checkinFor(sweep, ep.id, 14).state).toBe('paused');
    expect(checkinFor(sweep, ep.id, 21).state).toBe('paused');
    expect(itemsFor(sweep, ep.id, 'unreached')).toHaveLength(0);
    expect(derivedFor(sweep, ep.id, 'no_contact_by_day_21')).toEqual([expect.objectContaining({ related_id: null, attributes: { item_created: false } })]);
    expect(derivedFor(sweep, ep.id, 'reminder_sent')).toHaveLength(0);
    expect(sweep.notifications.filter((n) => n.episode_id === ep.id && n.simulated_state === 'sent' && n.kind !== 'care_plan').length).toBe(2);
  });

  it('never creates an Unreached item; contact resumes after the pause with the first contact on day 28', () => {
    for (const clock of [t('2026-04-16', 12, 0), t('2026-04-30', 12, 0), t('2026-06-17', 12, 0)]) {
      const state = stateAt(store, clock);
      const ep = episodeFor(state, P);
      expect(itemsFor(state, ep.id, 'unreached'), clock).toHaveLength(0);
      expect(derivedFor(state, ep.id, 'unreached_item_created'), clock).toHaveLength(0);
    }
    const end = stateAt(store, t('2026-06-17', 12, 0));
    expect(episodeFor(end, P)).toMatchObject({ initial_contact_day: 28, initial_contact_met_target: false, status: 'completed' });
    expect(checkinFor(end, episodeFor(end, P).id, 42).state).toBe('completed');
  });
});
