/** Helpers shared by the services: lookups, actor resolution, queue item and contact event bundles. */
import { dayNumber } from '../clock';
import type { AnyEvent, CommandContext, ContactType, DomainEvent, Episode, Id, ISO, Patient, QueueKey, TriggerType } from '../types';
import { DomainError } from './errors';

export function requireEpisode(ctx: CommandContext, episode_id: Id): Episode {
  const ep = ctx.state.episodes[episode_id];
  if (!ep) throw new DomainError('unknown_episode', `Unknown episode ${episode_id}`);
  return ep;
}

export function requireOpenEpisode(ctx: CommandContext, episode_id: Id): Episode {
  const ep = requireEpisode(ctx, episode_id);
  if (ep.closed_at !== null) throw new DomainError('episode_closed', `Episode ${episode_id} is closed`);
  return ep;
}

export function requirePatient(ctx: CommandContext, patient_id: Id): Patient {
  const p = ctx.state.patients[patient_id];
  if (!p) throw new DomainError('unknown_patient', `Unknown patient ${patient_id}`);
  return p;
}

/** The staff user acting: an explicit override, the actor's id, or the first configured user for the actor's role. */
export function staffUserId(ctx: CommandContext, override?: Id | null): Id {
  if (override) return override;
  if (ctx.actor.id) return ctx.actor.id;
  const role = ctx.actor.role;
  const byRole = role ? ctx.config.practice.staff_users.find((u) => u.role === role) : undefined;
  const user = byRole ?? ctx.config.practice.staff_users[0];
  if (!user) throw new DomainError('no_staff_user', 'No staff user is configured');
  return user.id;
}

/** FR-37 day number relative to delivery (or expected delivery when delivery is unknown). */
export function dayNumberFor(episode: Episode, at: ISO): number {
  const anchor = episode.delivery_date ?? episode.expected_date;
  return anchor ? dayNumber(anchor, at) : 0;
}

export interface NewQueueItemInput {
  queue_key: QueueKey;
  episode_id: Id;
  patient_id?: Id;
  trigger_type: TriggerType;
  trigger_ref?: Id | null;
  note?: string | null;
  open_clinical_flag?: boolean;
}

/** Builds a queue_item_created event with a fresh id (the caller appends it, possibly among other events). */
export function newQueueItem(ctx: CommandContext, input: NewQueueItemInput): { id: Id; event: DomainEvent<'queue_item_created'> } {
  const patient_id = input.patient_id ?? ctx.state.episodes[input.episode_id]?.patient_id;
  if (!patient_id) throw new DomainError('unknown_episode', `Unknown episode ${input.episode_id}`);
  const id = ctx.nextId('qi');
  const event = ctx.makeEvent('queue_item_created', {
    queue_item_id: id, queue_key: input.queue_key, episode_id: input.episode_id, patient_id, trigger_type: input.trigger_type,
    trigger_ref: input.trigger_ref ?? null, note: input.note ?? null, open_clinical_flag: input.open_clinical_flag ?? false,
  }, { patient_id, episode_id: input.episode_id });
  return { id, event };
}

export function isFirstContact(ctx: CommandContext, episode_id: Id): boolean {
  return !Object.values(ctx.state.contacts).some((c) => c.episode_id === episode_id);
}

export interface ContactInput {
  episode_id: Id;
  type: ContactType;
  outcome: string;
  note?: string | null;
  /** Minutes create exactly one staff_time row with source_type contact (FR-38). */
  minutes?: number | null;
  staff_user_id?: Id | null;
}

/** contact_logged (+ initial_contact_confirmed on the first human contact, FR-37) (+ one staff_time row, FR-38). */
export function contactEvents(ctx: CommandContext, input: ContactInput): { contact_id: Id; events: AnyEvent[] } {
  const ep = requireEpisode(ctx, input.episode_id);
  const staff = staffUserId(ctx, input.staff_user_id);
  const contact_id = ctx.nextId('ct');
  const day_number = dayNumberFor(ep, ctx.now);
  const opts = { patient_id: ep.patient_id, episode_id: ep.id };
  const events: AnyEvent[] = [
    ctx.makeEvent('contact_logged', { contact_id, episode_id: ep.id, type: input.type, staff_user_id: staff, outcome: input.outcome, note: input.note ?? null, day_number }, opts),
  ];
  if (isFirstContact(ctx, ep.id)) {
    events.push(ctx.makeEvent('initial_contact_confirmed', { episode_id: ep.id, contact_id, day_number, met_target: day_number <= ctx.config.cadence.initial_contact_target_day }, opts));
  }
  if (input.minutes && input.minutes > 0) {
    events.push(ctx.makeEvent('staff_time_logged', { staff_time_id: ctx.nextId('st'), episode_id: ep.id, user_id: staff, source_type: 'contact', source_id: contact_id, minutes: input.minutes }, opts));
  }
  return { contact_id, events };
}

export function staffTimeEvent(ctx: CommandContext, input: { episode_id: Id; user_id: Id; source_type: 'contact' | 'queue_item' | 'callback' | 'assessment' | 'outreach' | 'setup' | 'other'; source_id: Id; minutes: number }): AnyEvent {
  const ep = ctx.state.episodes[input.episode_id];
  return ctx.makeEvent('staff_time_logged', { staff_time_id: ctx.nextId('st'), episode_id: input.episode_id, user_id: input.user_id, source_type: input.source_type, source_id: input.source_id, minutes: input.minutes }, { patient_id: ep?.patient_id ?? null, episode_id: input.episode_id });
}
