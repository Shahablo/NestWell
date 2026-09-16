import { describe, expect, it } from 'vitest';
import { addMinutes } from './clock';
import { project } from './projection';
import { pauseCheckins } from './services/enrollment';
import { logContact } from './services/followthrough';
import { acknowledge, helpNow, logOutreach } from './services/queues';
import { skipCheckin } from './services/checkins';
import { makeTestConfig, makeTestContent, makeTestStore } from './testutil';
import { ADMIN, COORD, DELIVERY, OK_DAY03, OK_DAY07, PATIENT, checkinByDay, dayAt, enrolled, itemsIn, submitAt } from './testflows';

describe('enrollment scheduling (FR-02, FR-08)', () => {
  it('schedules every cadence point from the delivery date at the send hour', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    const c3 = checkinByDay(store, episode_id, 3);
    expect(c3.scheduled_at).toBe(dayAt(3));
    expect(c3.window_end_at).toBe(dayAt(5));
    expect(Object.values(store.getState().checkins).filter((c) => c.episode_id === episode_id)).toHaveLength(7);
    store.setClock(dayAt(3));
    expect(checkinByDay(store, episode_id, 3).state).toBe('sent');
    store.setClock(dayAt(5));
    expect(checkinByDay(store, episode_id, 3).state).toBe('unopened');
    expect(store.getState().derivedEvents.some((e) => e.type === 'checkin_unopened' && e.related_id === c3.id)).toBe(true);
  });

  it('sends one reminder per check-in and materializes the neutral outbox', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(4, 10));
    const c3 = checkinByDay(store, episode_id, 3);
    expect(c3.reminder_at).toBe(dayAt(4));
    expect(c3.reminder_suppressed_reason).toBeNull();
    const reminders = store.getState().derivedEvents.filter((e) => e.type === 'reminder_sent');
    expect(reminders).toHaveLength(1);
    const rows = store.getState().notifications.filter((n) => n.episode_id === episode_id && n.simulated_state === 'sent');
    expect(rows.map((n) => n.kind)).toEqual(['checkin', 'reminder']);
    expect(rows.every((n) => n.content_id === 'notification.neutral')).toBe(true);
  });

  it('late enrollment: closed windows are not_applicable, no Unreached, no reminders, enrollment counts as the day-21 contact', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { at: dayAt(20, 11), performed_by: 'staff' });
    const state = store.getState();
    expect([3, 7, 14].map((d) => checkinByDay(store, episode_id, d).state)).toEqual(['not_applicable', 'not_applicable', 'not_applicable']);
    const c21 = checkinByDay(store, episode_id, 21);
    expect(c21.state).toBe('scheduled');
    expect(c21.scheduled_at).toBe(dayAt(22)); // no sooner than enrollment + 1 day
    expect(state.episodes[episode_id].initial_contact_day).toBe(20);
    expect(state.episodes[episode_id].initial_contact_met_target).toBe(true);
    store.setClock(dayAt(30));
    expect(itemsIn(store, 'unreached', episode_id)).toHaveLength(0);
    expect(store.getState().derivedEvents.filter((e) => e.type === 'no_contact_by_day_21')).toHaveLength(0);
    // Not-applicable check-ins have no outbox rows at all (no check-in, no reminder); the live day-21 check-in keeps its single reminder.
    expect(store.getState().notifications.filter((n) => [3, 7, 14].map((d) => checkinByDay(store, episode_id, d).id).some((id) => n.id.endsWith(id)))).toHaveLength(0);
    const sentReminders = store.getState().notifications.filter((n) => n.episode_id === episode_id && n.kind === 'reminder' && n.simulated_state === 'sent');
    expect(sentReminders.map((n) => n.id)).toEqual([`ntf:reminder:${c21.id}`]);
  });
});

describe('Unreached and the day-21 sweep (FR-13, FR-37)', () => {
  function keisha(withContact: boolean) {
    const store = makeTestStore();
    const { episode_id } = enrolled(store, { patient: { insurance_type: 'uninsured', access_barriers: ['phone_data'] } });
    submitAt(store, checkinByDay(store, episode_id, 3), OK_DAY03);
    submitAt(store, checkinByDay(store, episode_id, 7), OK_DAY07);
    if (withContact) {
      store.setClock(dayAt(10, 14));
      store.dispatch(logContact({ episode_id, type: 'phone_call', outcome: 'welcome call' }), COORD);
    }
    return { store, episode_id };
  }

  it('two consecutive unopened check-ins derive exactly one Unreached item with the specified id', () => {
    const { store, episode_id } = keisha(true);
    store.setClock(dayAt(25));
    const items = itemsIn(store, 'unreached', episode_id);
    expect(items).toHaveLength(1);
    const c21 = checkinByDay(store, episode_id, 21);
    expect(items[0].id).toBe(`unreached:${episode_id}:${c21.id}`);
    expect(items[0].created_at).toBe(c21.window_end_at);
    expect(items[0].derived).toBe(true);
    expect(items[0].trigger_type).toBe('unreached');
    expect(items[0].owner_role).toBe('coordinator');
    expect(items[0].open_clinical_flag).toBe(false);
    expect(store.getState().derivedEvents.filter((e) => e.type === 'unreached_item_created')).toHaveLength(1);
    // Moving the clock back makes the derived item disappear.
    store.setClock(dayAt(22));
    expect(itemsIn(store, 'unreached', episode_id)).toHaveLength(0);
  });

  it('reminders are suppressed while the item is open and after not_reached; a second skip creates no second item', () => {
    const { store, episode_id } = keisha(true);
    store.setClock(dayAt(44));
    const c42 = checkinByDay(store, episode_id, 42);
    expect(c42.reminder_suppressed_reason).toBe('unreached_open');
    expect(store.getState().notifications.find((n) => n.id === `ntf:reminder:${c42.id}`)?.simulated_state).toBe('suppressed');
    store.setClock(dayAt(42, 10));
    store.dispatch(skipCheckin({ checkin_id: c42.id }), PATIENT);
    store.setClock(dayAt(45));
    expect(itemsIn(store, 'unreached', episode_id)).toHaveLength(1);
    // Outreach resolves the derived item with its outcome; not_reached keeps reminders off for later check-ins.
    const item = itemsIn(store, 'unreached', episode_id)[0];
    store.dispatch(logOutreach({ queue_item_id: item.id, outcome: 'not_reached', note: 'no answer' }), COORD);
    store.setClock(dayAt(66));
    const resolved = store.getState().queueItems[item.id];
    expect(resolved.state).toBe('resolved');
    expect(resolved.outcome).toBe('not_reached');
    expect(checkinByDay(store, episode_id, 63).reminder_suppressed_reason).toBe('unreached_not_reached');
    // A new run of two after resolution (the week-6 skip and the unopened week-9 check-in) creates a new item.
    const second = itemsIn(store, 'unreached', episode_id).filter((q) => q.state !== 'resolved');
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(`unreached:${episode_id}:${checkinByDay(store, episode_id, 63).id}`);
    // "reached" resolves it, counts as a human contact and restores reminders from the next check-in.
    store.setClock(dayAt(70, 10));
    store.dispatch(logOutreach({ queue_item_id: second[0].id, outcome: 'reached', barrier: 'transport', note: 'visit rescheduled' }), COORD);
    store.setClock(dayAt(86));
    expect(store.getState().queueItems[second[0].id].outcome).toBe('reached');
    expect(checkinByDay(store, episode_id, 84).reminder_suppressed_reason).toBeNull();
    expect(itemsIn(store, 'unreached', episode_id).filter((q) => q.state !== 'resolved')).toHaveLength(0);
  });

  it('a patient pause is never an Unreached signal', () => {
    const { store, episode_id } = keisha(true);
    store.setClock(dayAt(7, 12));
    store.dispatch(pauseCheckins({ episode_id, actor: 'patient', duration_label: '2 weeks', until: dayAt(21, 8) }), PATIENT);
    store.setClock(dayAt(10));
    expect(store.getState().episodes[episode_id].status).toBe('paused');
    expect(store.getState().episodes[episode_id].paused_until).toBe(dayAt(21, 8));
    store.setClock(dayAt(30));
    expect(checkinByDay(store, episode_id, 14).state).toBe('paused');
    expect(checkinByDay(store, episode_id, 21).state).toBe('unopened');
    expect(itemsIn(store, 'unreached', episode_id)).toHaveLength(0);
    expect(store.getState().episodes[episode_id].status).toBe('active');
    expect(store.getState().notifications.find((n) => n.id === `ntf:checkin:${checkinByDay(store, episode_id, 14).id}`)).toMatchObject({ simulated_state: 'suppressed', suppressed_reason: 'paused' });
  });

  it('the day-21 sweep derives no_contact_by_day_21 and one Unreached item when nobody has been reached', () => {
    const { store, episode_id } = keisha(false);
    store.setClock(dayAt(21, 11, 59));
    expect(store.getState().derivedEvents.filter((e) => e.type === 'no_contact_by_day_21')).toHaveLength(0);
    store.setClock(dayAt(27));
    const sweeps = store.getState().derivedEvents.filter((e) => e.type === 'no_contact_by_day_21');
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0].occurred_at).toBe(dayAt(21, 12));
    const items = itemsIn(store, 'unreached', episode_id);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(`day21:${episode_id}`);
    expect(items[0].trigger_type).toBe('day21_sweep');
    // Keisha reached on day 27: first contact day 27, target unmet, visibly.
    store.dispatch(logOutreach({ queue_item_id: items[0].id, outcome: 'reached', barrier: 'transport', note: 'visit rescheduled', minutes: 8 }), COORD);
    const ep = store.getState().episodes[episode_id];
    expect(ep.initial_contact_day).toBe(27);
    expect(ep.initial_contact_met_target).toBe(false);
    expect(store.getState().queueItems[items[0].id].state).toBe('resolved');
  });
});

describe('queue timers through the store (Marisol, FR-25)', () => {
  it('an Urgent item at 7 p.m. is UNOWNED by 8 p.m. on the wall basis and the patient is notified', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(7, 19));
    store.dispatch(helpNow({ episode_id }), PATIENT);
    const item = itemsIn(store, 'urgent', episode_id)[0];
    expect(item.state).toBe('open');
    expect(item.ack_target_at).toBe(dayAt(7, 19, 30));
    store.setClock(dayAt(7, 20));
    const later = store.getState().queueItems[item.id];
    expect(later.state).toBe('unowned');
    expect(later.escalated_at).toBe(dayAt(7, 19, 30));
    expect(later.unowned_at).toBe(dayAt(7, 19, 30));
    const timeout = store.getState().derivedEvents.find((e) => e.type === 'escalation_unacknowledged_timeout');
    expect(timeout?.attributes.patient_notified).toBe(true);
    expect(store.getState().derivedEvents.some((e) => e.type === 'escalation_escalated')).toBe(true);
    store.dispatch(acknowledge({ queue_item_id: item.id }), COORD);
    expect(store.getState().queueItems[item.id].state).toBe('acknowledged');
    expect(store.getState().queueItems[item.id].minutes_to_ack).toBe(60);
  });

  it('on the coverage_hours basis the same item becomes UNOWNED at 9:00 the next business day', () => {
    const config = makeTestConfig((c) => { c.queues.find((q) => q.key === 'urgent')!.timer_basis = 'coverage_hours'; });
    const store = makeTestStore(config, makeTestContent(config));
    const { episode_id } = enrolled(store);
    store.setClock(dayAt(7, 19)); // day 7 = Wednesday 8 April 2026
    store.dispatch(helpNow({ episode_id }), PATIENT);
    const item = itemsIn(store, 'urgent', episode_id)[0];
    expect(item.backup_target_at).toBe(dayAt(8, 9));
    store.setClock(dayAt(8, 8, 59));
    expect(store.getState().queueItems[item.id].state).toBe('open');
    store.setClock(dayAt(8, 9));
    expect(store.getState().queueItems[item.id].state).toBe('unowned');
  });
});

describe('determinism (NFR-04)', () => {
  it('projects the same events to a deep-equal state', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    submitAt(store, checkinByDay(store, episode_id, 3), [{ question_key: 'recovery', value: 'sore' }, { question_key: 'coping', value: 'very_hard' }, { question_key: 'ride', value: 'no_ride' }, { question_key: 'callback', value: 'yes' }, { question_key: 'note', value: null, free_text: 'I feel very tired' }]);
    store.setClock(dayAt(30));
    const events = store.getEvents();
    const clock = store.getClock();
    const a = project(events, clock, store.config, store.content);
    const b = project(JSON.parse(JSON.stringify(events)), clock, store.config, store.content);
    expect(b).toEqual(a);
    expect(a.eventCount).toBe(events.length);
    expect(a.derivedEvents.map((e) => e.occurred_at)).toEqual([...a.derivedEvents.map((e) => e.occurred_at)].sort());
  });

  it('projects a few thousand events quickly', () => {
    const store = makeTestStore();
    for (let i = 0; i < 4; i++) {
      const { episode_id } = enrolled(store, { patient_id: `perf-${i}`, at: addMinutes(DELIVERY, 360 + i) });
      submitAt(store, checkinByDay(store, episode_id, 3), OK_DAY03);
      submitAt(store, checkinByDay(store, episode_id, 7), [...OK_DAY07.slice(0, 3), { question_key: 'callback', value: 'yes' }, { question_key: 'note', value: null, free_text: 'a short note' }]);
      store.setClock(dayAt(10 + i, 10));
      store.dispatch(logContact({ episode_id, type: 'phone_call', outcome: 'call', minutes: 5 }), COORD);
      store.setClock(dayAt(30, 19));
      store.dispatch(helpNow({ episode_id }), PATIENT);
    }
    // Clone the four histories with remapped ids to reach a few thousand events (the store re-projects per dispatch, so
    // seeding thousands of events through it would time the seed loop, not the projection).
    const base = store.getEvents();
    const events = [...base];
    for (let k = 1; k <= 20; k++) {
      const json = JSON.stringify(base).replace(/"((?:perf|pt|ep|ci|qi|cp|vis|ct|cb|st|scr|evt|as|ref)-[0-9a-z]+)"/g, `"$1-c${k}"`);
      events.push(...(JSON.parse(json) as typeof base));
    }
    expect(events.length).toBeGreaterThan(2000);
    const started = performance.now();
    const state = project(events, dayAt(90), store.config, store.content);
    const elapsed = performance.now() - started;
    expect(Object.keys(state.episodes)).toHaveLength(84);
    expect(Object.values(state.queueItems).filter((q) => q.queue_key === 'urgent')).toHaveLength(84);
    expect(elapsed).toBeLessThan(1500);
  });

  it('folds only events at or before the clock and rejects non-synthetic patients', () => {
    const store = makeTestStore();
    const { episode_id } = enrolled(store);
    submitAt(store, checkinByDay(store, episode_id, 3), OK_DAY03);
    const before = project(store.getEvents(), addMinutes(DELIVERY, -1), store.config, store.content);
    expect(Object.keys(before.episodes)).toHaveLength(0);
    const events = store.getEvents().map((e) => (e.type === 'patient_registered' ? { ...e, payload: { patient: { ...e.payload.patient, is_synthetic: false } } } : e));
    const rejected = project(events as typeof store.getEvents extends () => infer R ? R : never, dayAt(30), store.config, store.content);
    expect(Object.keys(rejected.patients)).toHaveLength(0);
    void ADMIN;
  });
});
