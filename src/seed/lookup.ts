/** Read helpers over the runner's projected state, so scripts refer to entities by meaning, not by id. */
import { toMs } from '../domain/clock';
import type { SeedRunner } from '../domain/store';
import type {
  Callback, CarePlanItem, Checkin, Contact, Episode, Id, QueueItem, QueueKey, Referral, ScreenResult, Summary, SummaryPeriod, TriggerType, Visit, VisitType,
} from '../domain/types';

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`seed lookup: ${what} not found`);
  return value;
}

/** The patient's open episode, or the latest one when it is closed. */
export function episodeOf(r: SeedRunner, patient_id: Id): Episode {
  const eps = Object.values(r.state().episodes).filter((e) => e.patient_id === patient_id);
  return need(eps.find((e) => e.closed_at === null) ?? eps[eps.length - 1], `episode for ${patient_id}`);
}

export function checkinOn(r: SeedRunner, patient_id: Id, day: number): Checkin {
  const ep = episodeOf(r, patient_id);
  return need(Object.values(r.state().checkins).find((c) => c.episode_id === ep.id && c.day_number === day), `day-${day} check-in for ${patient_id}`);
}

export interface ItemPick {
  id?: Id;
  queue_key?: QueueKey;
  trigger_type?: TriggerType;
  /** true = not resolved; false = resolved. */
  open?: boolean;
  derived?: boolean;
}

export function itemsOf(r: SeedRunner, episode_id: Id, pick: ItemPick = {}): QueueItem[] {
  return Object.values(r.state().queueItems)
    .filter((q) => q.episode_id === episode_id)
    .filter((q) => (pick.id === undefined || q.id === pick.id)
      && (pick.queue_key === undefined || q.queue_key === pick.queue_key)
      && (pick.trigger_type === undefined || q.trigger_type === pick.trigger_type)
      && (pick.open === undefined || (q.state !== 'resolved') === pick.open)
      && (pick.derived === undefined || q.derived === pick.derived))
    .sort((a, b) => toMs(a.created_at) - toMs(b.created_at) || a.id.localeCompare(b.id));
}

/** The most recently created item matching the pick. */
export function itemOf(r: SeedRunner, episode_id: Id, pick: ItemPick = {}): QueueItem {
  const list = itemsOf(r, episode_id, pick);
  return need(list[list.length - 1], `queue item ${JSON.stringify(pick)} for ${episode_id}`);
}

export function latestScreen(r: SeedRunner, episode_id: Id): ScreenResult {
  const list = Object.values(r.state().screens).filter((s) => s.episode_id === episode_id && !s.declined).sort((a, b) => toMs(a.administered_at) - toMs(b.administered_at));
  return need(list[list.length - 1], `screen for ${episode_id}`);
}

export function latestContact(r: SeedRunner, episode_id: Id): Contact {
  const list = Object.values(r.state().contacts).filter((c) => c.episode_id === episode_id).sort((a, b) => toMs(a.occurred_at) - toMs(b.occurred_at) || a.id.localeCompare(b.id));
  return need(list[list.length - 1], `contact for ${episode_id}`);
}

export function referralOf(r: SeedRunner, episode_id: Id): Referral {
  const list = Object.values(r.state().referrals).filter((x) => x.episode_id === episode_id).sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
  return need(list[list.length - 1], `referral for ${episode_id}`);
}

export function visitOf(r: SeedRunner, episode_id: Id, type: VisitType): Visit {
  return need(Object.values(r.state().visits).find((v) => v.episode_id === episode_id && v.type === type), `${type} visit for ${episode_id}`);
}

export function planItemOf(r: SeedRunner, episode_id: Id, key: string): CarePlanItem {
  return need(Object.values(r.state().carePlanItems).find((c) => c.episode_id === episode_id && c.key === key), `care plan item ${key} for ${episode_id}`);
}

export function summaryOf(r: SeedRunner, episode_id: Id, period: SummaryPeriod): Summary {
  const list = Object.values(r.state().summaries).filter((s) => s.episode_id === episode_id && s.period === period).sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
  return need(list[list.length - 1], `${period} summary for ${episode_id}`);
}

/** The latest callback not yet completed. */
export function pendingCallback(r: SeedRunner, episode_id: Id): Callback {
  const list = Object.values(r.state().callbacks).filter((c) => c.episode_id === episode_id && c.occurred === null).sort((a, b) => toMs(a.requested_at) - toMs(b.requested_at));
  return need(list[list.length - 1], `pending callback for ${episode_id}`);
}
