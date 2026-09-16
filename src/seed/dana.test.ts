/** 6.1 Dana: uneventful recovery, and the late-enrollment variant (FR-02, FR-13, FR-14, FR-15, FR-37). */
import { describe, expect, it } from 'vitest';
import { closingStatementFor } from '../domain/services/checkins';
import { LOADED, checkinFor, checkinsFor, derivedFor, episodeFor, eventsOf, itemsFor, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-dana';

describe('6.1 Dana — uneventful recovery', () => {
  const store = seedStore('dana');

  it('opens at enrollment at 38 weeks with the acknowledgment, preferences and no check-in yet', () => {
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    expect(ep.enrollment_point).toBe('late_pregnancy');
    expect(ep.delivery_date).toBeNull();
    expect(ep.acknowledged_at).not.toBeNull();
    expect(state.patients[P].preferences).toMatchObject({ baby_reference_permission: 'welcome', sharing_category: 'clinician_and_coordinator', safe_to_message: true });
    expect(checkinsFor(state, ep.id).every((c) => c.state === 'scheduled')).toBe(true);
    expect(itemsFor(state, ep.id)).toHaveLength(0);
  });

  it('days 3, 7, 14 and 21 are completed, the day-14 screen is below threshold and every closing statement is the process-only wording', () => {
    const state = stateAt(store, t('2026-03-24', 12, 0));
    const ep = episodeFor(state, P);
    expect(ep.delivery_date).toBe(t('2026-03-03', 6));
    for (const day of [3, 7, 14, 21]) {
      const c = checkinFor(state, ep.id, day);
      expect(c.state, `day ${day}`).toBe('completed');
      expect(closingStatementFor(state, LOADED.config, c.id, c.submitted_at ?? state.clock).kind, `day ${day} closing`).toBe('no_follow_up');
    }
    const screens = Object.values(state.screens).filter((s) => s.episode_id === ep.id);
    expect(screens).toHaveLength(1);
    expect(screens[0]).toMatchObject({ instrument_key: 'epds', score: 3, positive: false, critical_item_hit: false, shared_with: ['clinician', 'coordinator'] });
    expect(itemsFor(state, ep.id)).toHaveLength(0);
    expect(eventsOf(store.getEvents(), 'rule_fired', ep.id)).toHaveLength(0);
    // The early visit is the first human contact, on day 21, so the sweep finds a contact and no reminder was ever needed.
    expect(ep.initial_contact_day).toBe(21);
    expect(ep.initial_contact_met_target).toBe(true);
    expect(derivedFor(state, ep.id, 'reminder_sent')).toHaveLength(0);
    expect(derivedFor(state, ep.id, 'no_contact_by_day_21')).toHaveLength(0);
    expect(derivedFor(state, ep.id, 'unreached_item_created')).toHaveLength(0);
  });

  it('week 6 shows the comprehensive visit completed with what to bring, and week 12 the reviewed summaries and the transition', () => {
    const w6 = stateAt(store, t('2026-04-14', 12, 0));
    const ep6 = episodeFor(w6, P);
    const visits = Object.values(w6.visits).filter((v) => v.episode_id === ep6.id);
    expect(visits.map((v) => [v.type, v.state])).toEqual([['early_postpartum', 'completed'], ['comprehensive', 'completed']]);
    expect(visits.every((v) => v.bring.length > 0)).toBe(true);
    expect(w6.usefulness.filter((u) => u.episode_id === ep6.id).map((u) => u.week)).toEqual([6]);

    const w12 = stateAt(store, t('2026-05-27', 10, 0));
    const ep = episodeFor(w12, P);
    expect(checkinsFor(w12, ep.id).map((c) => c.state)).toEqual(Array(7).fill('completed'));
    const summaries = Object.values(w12.summaries).filter((s) => s.episode_id === ep.id);
    expect(summaries.map((s) => [s.period, s.state])).toEqual([['week9', 'reviewed'], ['week12', 'reviewed']]);
    expect(summaries.every((s) => s.narrative === LOADED.config.ai_exemplars.summary_narrative[`dana:${s.period}`])).toBe(true);
    expect(ep.status).toBe('completed');
    expect(ep.transition).toMatchObject({ mental_health: 'not_indicated' });
    expect(Object.values(w12.carePlanItems).filter((c) => c.episode_id === ep.id && c.due_at !== null).every((c) => c.state === 'completed')).toBe(true);
    // Never a queue item other than the two summary reviews, which are closed.
    expect(itemsFor(w12, ep.id).map((q) => [q.queue_key, q.state])).toEqual([['summaries', 'resolved'], ['summaries', 'resolved']]);
    expect(w12.notifications.filter((n) => n.episode_id === ep.id && n.kind === 'reminder' && n.simulated_state === 'sent')).toHaveLength(0);
  });
});

describe('6.1 Dana — late enrollment on day 20 by a nurse in person', () => {
  const store = seedStore('dana_late_enrollment');

  it('days 3, 7 and 14 are not_applicable, the first live check-in is enrollment + 1 day, and the in-person enrollment is the day-21 contact', () => {
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    expect(ep.enrolled_by).toBe('staff');
    for (const day of [3, 7, 14]) expect(checkinFor(state, ep.id, day).state, `day ${day}`).toBe('not_applicable');
    expect(checkinFor(state, ep.id, 21).scheduled_at).toBe(t('2026-03-25', 10, 0));
    const contacts = Object.values(state.contacts).filter((c) => c.episode_id === ep.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ type: 'enrollment', day_number: 20 });
    expect(ep.initial_contact_day).toBe(20);
    expect(ep.initial_contact_met_target).toBe(true);
  });

  it('never derives an Unreached item, a day-21 sweep item or a reminder', () => {
    for (const clock of [t('2026-03-24', 13, 0), t('2026-03-27', 12, 0), t('2026-04-30', 12, 0), t('2026-05-28', 12, 0)]) {
      const state = stateAt(store, clock);
      const ep = episodeFor(state, P);
      expect(itemsFor(state, ep.id, 'unreached'), clock).toHaveLength(0);
      expect(derivedFor(state, ep.id, 'no_contact_by_day_21'), clock).toHaveLength(0);
      expect(derivedFor(state, ep.id, 'reminder_sent'), clock).toHaveLength(0);
      expect(state.notifications.filter((n) => n.episode_id === ep.id && n.kind === 'reminder' && n.simulated_state === 'sent'), clock).toHaveLength(0);
      // not_applicable check-ins produce no outbox row at all (FR-02).
      expect(state.notifications.filter((n) => n.episode_id === ep.id && n.kind === 'checkin' && ['3', '7', '14'].some((d) => n.id.endsWith(checkinFor(state, ep.id, Number(d)).id)))).toHaveLength(0);
    }
    const end = stateAt(store, t('2026-05-28', 12, 0));
    const ep = episodeFor(end, P);
    expect(checkinsFor(end, ep.id).map((c) => c.state)).toEqual(['not_applicable', 'not_applicable', 'not_applicable', 'completed', 'completed', 'completed', 'completed']);
    expect(ep.status).toBe('completed');
  });
});
