/** 6.4 Elena: pregnancy loss and sensitive mode (FR-07, FR-54–FR-59, FR-68). */
import { describe, expect, it } from 'vitest';
import { addDays } from '../domain/clock';
import { suppressedTagsFor } from '../domain/projection';
import { LOADED, checkinsFor, derivedFor, episodeFor, eventsOf, itemsFor, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-elena';
const LOSS_TAGS = ['infant', 'feeding', 'milestone', 'celebration', 'newborn_visit', 'birth_story'];

describe('6.4 Elena — pregnancy loss and sensitive mode', () => {
  const store = seedStore('elena');

  it('the stillbirth is day 0 and the schedule regenerates with the loss check-in set from that date', () => {
    const state = stateAt(store, t('2026-04-01', 16, 0));
    const ep = episodeFor(state, P);
    expect(ep.enrollment_point).toBe('late_pregnancy');
    expect(ep.delivery_outcome).toBe('stillbirth');
    expect(ep.delivery_date).toBe(t('2026-04-01', 6));
    const checkins = checkinsFor(state, ep.id);
    expect(checkins).toHaveLength(7);
    expect(checkins.every((c) => c.set === 'loss' && c.template_key === 'loss_checkin')).toBe(true);
    expect(checkins[0].scheduled_at).toBe(t('2026-04-04', 10));
  });

  it('her tap applies suppression at once, creates a Sensitive-review item, asks nothing further, and the outbox shows the reasons', () => {
    const state = stateAt(store, opening(store));
    const ep = episodeFor(state, P);
    const status = state.sensitiveStatuses.filter((s) => s.episode_id === ep.id);
    expect(status).toHaveLength(1);
    expect(status[0]).toMatchObject({ subtype: 'stillbirth', set_by: 'patient', active: true, confirmed_by_staff: false });
    const items = itemsFor(state, ep.id);
    expect(items.map((q) => [q.queue_key, q.trigger_type, q.state])).toEqual([['sensitive_review', 'sensitive_status', 'open']]);
    expect(items[0].note).toContain('confirm the subtype');
    expect([...suppressedTagsFor(state, ep.id)].sort()).toEqual([...LOSS_TAGS].sort());
    const plan = Object.values(state.carePlanItems).filter((c) => c.episode_id === ep.id);
    const suppressed = plan.filter((c) => c.tags.some((tag) => LOSS_TAGS.includes(tag)));
    expect(suppressed.map((c) => c.key).sort()).toEqual(['feeding_support', 'newborn_visit']);
    expect(suppressed.every((c) => c.state === 'suppressed')).toBe(true);
    expect(plan.filter((c) => !c.tags.some((tag) => LOSS_TAGS.includes(tag))).every((c) => c.state === 'open')).toBe(true);
    expect(derivedFor(state, ep.id, 'content_suppressed').length).toBeGreaterThan(0);
    for (const c of suppressed) {
      const row = state.notifications.find((n) => n.id === `ntf:careplan:${c.id}`)!;
      expect(row.simulated_state).toBe('suppressed');
      expect(row.suppressed_reason).toMatch(/^sensitive_status:/);
    }
    // Nothing else was asked in that session: the preferences dialog comes next, once.
    expect(state.patients[P].preferences.contact_frequency).toBeNull();
  });

  it('"not for now" pauses every check-in and creates the review item with the 7-day contact deadline and the week-12 due date', () => {
    const state = stateAt(store, t('2026-04-02', 9, 6));
    const ep = episodeFor(state, P);
    expect(ep).toMatchObject({ status: 'paused', paused: true, paused_until: null });
    expect(state.patients[P].preferences).toMatchObject({ contact_frequency: 'not_for_now', baby_reference_permission: 'no', form_of_address: 'Elena' });
    const review = itemsFor(state, ep.id, 'sensitive_review');
    expect(review).toHaveLength(2);
    const deadline = review[1];
    expect(deadline.note).toContain(`${LOADED.config.cadence.loss_not_for_now_contact_days}-day contact deadline`);
    expect(deadline.note).toContain(addDays(ep.delivery_date!, 84));
    expect(deadline.ack_target_at).toBe(addDays(t('2026-04-02', 9, 5), LOADED.config.cadence.loss_not_for_now_contact_days));
    expect(checkinsFor(state, ep.id).every((c) => c.state === 'paused')).toBe(true);
    expect(state.notifications.filter((n) => n.episode_id === ep.id && n.kind === 'checkin').every((n) => n.simulated_state === 'suppressed' && n.suppressed_reason === 'paused')).toBe(true);
    expect(eventsOf(store.getEvents(), 'sensitive_preferences_set', ep.id)).toHaveLength(1);
  });

  it('the coordinator confirms the subtype and calls inside the deadline; recovery visits, the mental-health referral and the transition continue', () => {
    const state = stateAt(store, t('2026-04-22', 12, 0));
    const ep = episodeFor(state, P);
    expect(state.sensitiveStatuses.find((s) => s.episode_id === ep.id)?.confirmed_by_staff).toBe(true);
    const review = itemsFor(state, ep.id, 'sensitive_review');
    expect(review.every((q) => q.state === 'resolved' && q.escalated_at === null)).toBe(true);
    const call = Object.values(state.contacts).find((c) => c.episode_id === ep.id && c.type === 'phone_call')!;
    expect(call.day_number).toBe(6);
    expect(call.occurred_at < review[1].ack_target_at).toBe(true);
    expect(ep.initial_contact_met_target).toBe(true);
    const referral = Object.values(state.referrals).find((r) => r.episode_id === ep.id)!;
    expect(referral.state).toBe('appointment_completed');
    expect(Object.values(state.visits).find((v) => v.episode_id === ep.id && v.type === 'early_postpartum')?.state).toBe('completed');
  });

  it('nothing resumes automatically: at week 12 the status is still active, suppressed items stay suppressed, check-ins stay paused; the episode closes with a confirmed destination', () => {
    const state = stateAt(store, t('2026-06-24', 12, 0));
    const ep = episodeFor(state, P);
    expect(state.sensitiveStatuses.find((s) => s.episode_id === ep.id)).toMatchObject({ active: true, lifted_at: null });
    expect([...suppressedTagsFor(state, ep.id)].sort()).toEqual([...LOSS_TAGS].sort());
    expect(Object.values(state.carePlanItems).filter((c) => c.episode_id === ep.id && c.tags.some((tag) => LOSS_TAGS.includes(tag))).every((c) => c.state === 'suppressed')).toBe(true);
    expect(checkinsFor(state, ep.id).every((c) => c.state === 'paused')).toBe(true);
    expect(eventsOf(store.getEvents(), 'checkins_resumed', ep.id)).toHaveLength(0);
    expect(eventsOf(store.getEvents(), 'sensitive_status_lifted', ep.id)).toHaveLength(0);
    expect(derivedFor(state, ep.id, 'reminder_sent')).toHaveLength(0);
    expect(state.notifications.filter((n) => n.episode_id === ep.id && n.simulated_state === 'sent')).toHaveLength(0);
    expect(itemsFor(state, ep.id, 'unreached')).toHaveLength(0);
    expect(Object.values(state.summaries).filter((s) => s.episode_id === ep.id).map((s) => s.state)).toEqual(['reviewed', 'reviewed']);
    const closed = stateAt(store, t('2026-06-25', 10, 0));
    expect(episodeFor(closed, P)).toMatchObject({ status: 'completed', indicated: true });
    expect(episodeFor(closed, P).transition?.mental_health).toBe('confirmed');
  });
});
