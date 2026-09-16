/**
 * Pure helpers the projection uses to materialize the simulated outbox (FR-66–FR-69).
 * Every body is the neutral approved item; suppression reasons are recorded, never bodies.
 */
import { toMs } from '../clock';
import type { EpisodeFacts, ReminderResult } from '../derive';
import { isPausedAt } from '../derive';
import type { CarePlanItem, Checkin, CheckinState, ContentTag, ISO, Notification, Preferences } from '../types';

export const NEUTRAL_CONTENT_ID = 'notification.neutral';

/** The check-in release notification (FR-08). Returns null for not_applicable check-ins (no row at all). */
export function checkinNotification(
  c: Checkin,
  state: CheckinState,
  ep: EpisodeFacts,
  prefs: Preferences,
  clock: ISO,
): Notification | null {
  if (state === 'not_applicable') return null;
  let reason: string | null = null;
  if (state === 'paused' || isPausedAt(ep.pauses, c.scheduled_at)) reason = 'paused';
  else if (ep.closed_at !== null && toMs(ep.closed_at) <= toMs(c.scheduled_at)) reason = 'episode_closed';
  else if (prefs.safe_to_message === false) reason = 'safe_to_message_no';
  return {
    id: `ntf:checkin:${c.id}`,
    episode_id: c.episode_id,
    channel: 'sms',
    content_id: NEUTRAL_CONTENT_ID,
    scheduled_at: c.scheduled_at,
    kind: 'checkin',
    simulated_state: reason !== null ? 'suppressed' : toMs(clock) >= toMs(c.scheduled_at) ? 'sent' : 'scheduled',
    suppressed_reason: reason,
  };
}

/** The single reminder (FR-14). Returns null when no reminder was needed ('responded'). */
export function reminderNotification(c: Checkin, r: ReminderResult | null): Notification | null {
  if (r === null || r.suppressed_reason === 'responded') return null;
  return {
    id: `ntf:reminder:${c.id}`,
    episode_id: c.episode_id,
    channel: 'sms',
    content_id: NEUTRAL_CONTENT_ID,
    scheduled_at: r.at,
    kind: 'reminder',
    simulated_state: r.suppressed_reason !== null ? 'suppressed' : r.sent ? 'sent' : 'scheduled',
    suppressed_reason: r.suppressed_reason,
  };
}

/** A care-plan item with a due date is announced at the due date unless suppressed (FR-68). */
export function carePlanNotification(
  item: CarePlanItem,
  suppressedTags: ReadonlySet<ContentTag>,
  ep: EpisodeFacts,
  prefs: Preferences,
  clock: ISO,
): Notification | null {
  if (item.due_at === null) return null;
  const hit = item.tags.filter((t) => suppressedTags.has(t));
  let reason: string | null = null;
  if (hit.length) reason = `sensitive_status:${hit.join(',')}`;
  else if (isPausedAt(ep.pauses, item.due_at)) reason = 'paused';
  else if (ep.closed_at !== null && toMs(ep.closed_at) <= toMs(item.due_at)) reason = 'episode_closed';
  else if (prefs.safe_to_message === false) reason = 'safe_to_message_no';
  return {
    id: `ntf:careplan:${item.id}`,
    episode_id: item.episode_id,
    channel: 'sms',
    content_id: NEUTRAL_CONTENT_ID,
    scheduled_at: item.due_at,
    kind: 'care_plan',
    simulated_state: reason !== null ? 'suppressed' : toMs(clock) >= toMs(item.due_at) ? 'sent' : 'scheduled',
    suppressed_reason: reason,
  };
}

/** FR-66 check used by tests and the admin view: every row carries the neutral content id. */
export function outboxIsNeutral(rows: readonly Notification[]): boolean {
  return rows.every((n) => n.content_id === NEUTRAL_CONTENT_ID);
}
