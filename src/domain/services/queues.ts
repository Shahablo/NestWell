/**
 * Queue commands (FR-25, FR-34, FR-38, FR-45, FR-13). A queue item never closes without an
 * outcome; minutes go through the single staff_time ledger exactly once.
 */
import type { AccessBarrier, Command, EscalationRating, Id, OutreachOutcome, QueueKey, TriggerType } from '../types';
import { roleOfActor } from '../projection';
import { DomainError } from './errors';
import { evaluateRules } from './rules';
import { contactEvents, newQueueItem, requireEpisode, requireOpenEpisode, requirePatient, staffTimeEvent, staffUserId } from './shared';

/**
 * A queue item normally belongs to an episode. A pre-enrollment item (the FR-63a "interpreter or
 * Spanish-speaking staff needed" outreach in 6.6, which registerPatient also creates) names the
 * patient explicitly and carries a placeholder episode id such as `no-episode:<patient_id>`.
 */
export function createQueueItem(input: { queue_key: QueueKey; episode_id: Id; patient_id?: Id; trigger_type: TriggerType; trigger_ref?: Id | null; note?: string | null; open_clinical_flag?: boolean }): Command {
  return (ctx) => {
    if (input.patient_id) requirePatient(ctx, input.patient_id);
    else requireEpisode(ctx, input.episode_id);
    return [newQueueItem(ctx, input).event];
  };
}

function requireItem(ctx: Parameters<Command>[0], id: Id) {
  const item = ctx.state.queueItems[id];
  if (!item) throw new DomainError('unknown_queue_item', `Unknown queue item ${id}`);
  return item;
}

export function acknowledge(input: { queue_item_id: Id; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    const item = requireItem(ctx, input.queue_item_id);
    if (item.state === 'resolved') throw new DomainError('item_resolved', 'A resolved item cannot be acknowledged');
    if (item.acknowledged_at !== null) throw new DomainError('already_acknowledged', 'Item already acknowledged');
    return [ctx.makeEvent('queue_item_acknowledged', { queue_item_id: item.id, staff_user_id: staffUserId(ctx, input.staff_user_id), role: roleOfActor(ctx.actor) }, { patient_id: item.patient_id, episode_id: item.episode_id })];
  };
}

/**
 * FR-45: every close goes through an outcome. Minutes create one staff_time row (source queue_item)
 * unless `contact_id` references a contact whose minutes were already logged (FR-38: no second row).
 */
export function resolve(input: { queue_item_id: Id; outcome: string; note?: string | null; minutes?: number | null; contact_id?: Id | null; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    const item = requireItem(ctx, input.queue_item_id);
    if (item.state === 'resolved') throw new DomainError('item_resolved', 'Item already resolved');
    if (!input.outcome || input.outcome.trim() === '') throw new DomainError('outcome_required', 'A queue item never closes without an outcome (FR-34, FR-45)');
    // FR-25: an Urgent item's resolution means a contact was attempted and the outcome logged: the close references a
    // logged contact, or the outcome itself describes the attempt.
    if (item.queue_key === 'urgent' && !input.contact_id && !/\b(contact|call|called|reach|reached|attempt|voicemail|message|spoke|visit)/i.test(`${input.outcome} ${input.note ?? ''}`)) {
      throw new DomainError('contact_required', 'An Urgent item closes only when a contact was attempted: choose the contact it refers to, or describe the attempt in the outcome (FR-25)');
    }
    // FR-33: a reopened Needs-review item for a referral dead end closes only with a documented plan.
    if (item.trigger_type === 'referral_dead_end' && !(input.note && input.note.trim().length >= 10) && !/\bplan\b/i.test(input.outcome)) {
      throw new DomainError('plan_required', 'A referral dead end closes only with a documented plan: write the plan in the note (FR-33)');
    }
    const staff = staffUserId(ctx, input.staff_user_id);
    const opts = { patient_id: item.patient_id, episode_id: item.episode_id };
    const events: ReturnType<Command> = [ctx.makeEvent('queue_item_resolved', { queue_item_id: item.id, staff_user_id: staff, outcome: input.outcome, note: input.note ?? null, contact_id: input.contact_id ?? null }, opts)];
    if (input.minutes && input.minutes > 0 && !input.contact_id) {
      events.push(staffTimeEvent(ctx, { episode_id: item.episode_id, user_id: staff, source_type: 'queue_item', source_id: item.id, minutes: input.minutes }));
    }
    return events;
  };
}

export function reopen(input: { queue_item_id: Id; reason: string }): Command {
  return (ctx) => {
    const item = requireItem(ctx, input.queue_item_id);
    if (item.state !== 'resolved') throw new DomainError('item_open', 'Only a resolved item can be reopened');
    return [ctx.makeEvent('queue_item_reopened', { queue_item_id: item.id, reason: input.reason }, { patient_id: item.patient_id, episode_id: item.episode_id })];
  };
}

export function rate(input: { queue_item_id: Id; rating: EscalationRating; clinician_id?: Id | null }): Command {
  return (ctx) => {
    const item = requireItem(ctx, input.queue_item_id);
    return [ctx.makeEvent('escalation_rated', { queue_item_id: item.id, clinician_id: staffUserId(ctx, input.clinician_id), rating: input.rating }, { patient_id: item.patient_id, episode_id: item.episode_id })];
  };
}

/** FR-13 outreach: `reached` is a human contact (resets the Unreached count); minutes are logged once. */
export function logOutreach(input: { queue_item_id: Id; outcome: OutreachOutcome; note?: string | null; barrier?: AccessBarrier | null; minutes?: number | null; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    const item = requireItem(ctx, input.queue_item_id);
    const staff = staffUserId(ctx, input.staff_user_id);
    const opts = { patient_id: item.patient_id, episode_id: item.episode_id };
    const events: ReturnType<Command> = [];
    let contact_id: Id | null = null;
    if (input.outcome === 'reached') {
      const c = contactEvents(ctx, { episode_id: item.episode_id, type: 'phone_call', outcome: `outreach reached${input.barrier ? `: ${input.barrier} barrier` : ''}`, note: input.note ?? null, minutes: input.minutes ?? null, staff_user_id: staff });
      contact_id = c.contact_id;
      events.push(...c.events);
    } else if (input.minutes && input.minutes > 0) {
      // FR-45: the ledger row points at the Unreached item the attempt was logged on, so it can be traced.
      events.push(staffTimeEvent(ctx, { episode_id: item.episode_id, user_id: staff, source_type: 'outreach', source_id: item.id, minutes: input.minutes }));
    }
    events.push(ctx.makeEvent('outreach_logged', { queue_item_id: item.id, episode_id: item.episode_id, outcome: input.outcome, note: input.note ?? null, barrier: input.barrier ?? null, staff_user_id: staff, contact_id }, opts));
    return events;
  };
}

/** FR-21/FR-34: a callback request creates a Follow-through item when none is given; it closes only with an outcome. */
export function requestCallback(input: { episode_id: Id; queue_item_id?: Id | null; preferred_window?: string | null }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const events: ReturnType<Command> = [];
    let queue_item_id = input.queue_item_id ?? null;
    if (!queue_item_id) {
      const q = newQueueItem(ctx, { queue_key: 'follow_through', episode_id: ep.id, trigger_type: 'callback', note: input.preferred_window ? `callback requested; preferred window ${input.preferred_window}` : 'callback requested' });
      events.push(q.event);
      queue_item_id = q.id;
    }
    const item = ctx.state.queueItems[queue_item_id];
    // Preferred windows apply to Follow-through callbacks only; Urgent ignores them (FR-21).
    const preferred_window = item?.queue_key === 'urgent' ? null : input.preferred_window ?? null;
    events.push(ctx.makeEvent('callback_requested', { callback_id: ctx.nextId('cb'), episode_id: ep.id, queue_item_id, preferred_window }, opts));
    return events;
  };
}

export function completeCallback(input: { callback_id: Id; occurred: boolean; outcome: string; minutes?: number | null; contact_id?: Id | null; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    const cb = ctx.state.callbacks[input.callback_id];
    if (!cb) throw new DomainError('unknown_callback', `Unknown callback ${input.callback_id}`);
    if (cb.occurred !== null) throw new DomainError('callback_done', 'Callback already completed');
    if (!input.outcome || input.outcome.trim() === '') throw new DomainError('outcome_required', 'A callback needs an outcome (FR-34)');
    const ep = requireEpisode(ctx, cb.episode_id);
    const staff = staffUserId(ctx, input.staff_user_id);
    const events: ReturnType<Command> = [];
    let contact_id = input.contact_id ?? null;
    if (input.occurred && !contact_id) {
      const c = contactEvents(ctx, { episode_id: ep.id, type: 'phone_call', outcome: `callback: ${input.outcome}`, minutes: input.minutes ?? null, staff_user_id: staff });
      contact_id = c.contact_id;
      events.push(...c.events);
    } else if (input.minutes && input.minutes > 0 && !contact_id) {
      events.push(staffTimeEvent(ctx, { episode_id: ep.id, user_id: staff, source_type: 'callback', source_id: cb.id, minutes: input.minutes }));
    }
    events.push(ctx.makeEvent('callback_completed', { callback_id: cb.id, episode_id: ep.id, queue_item_id: cb.queue_item_id, occurred: input.occurred, outcome: input.outcome, contact_id }, { patient_id: ep.patient_id, episode_id: ep.id }));
    return events;
  };
}

/** FR-21 "I need help now": locked instruction, one Urgent item, help_requested(patient); rules on help_now are logged. */
export function helpNow(input: { episode_id: Id }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const q = newQueueItem(ctx, { queue_key: 'urgent', episode_id: ep.id, trigger_type: 'help_now', note: 'patient tapped I need help now; call now' });
    const events: ReturnType<Command> = [
      ctx.makeEvent('emergency_instruction_shown', { episode_id: ep.id, layout: 'full_screen', trigger: 'help_now' }, opts),
      q.event,
      ctx.makeEvent('help_requested', { episode_id: ep.id, source: 'patient', lexicon_version: null, queue_item_id: q.id }, opts),
    ];
    const rules = evaluateRules('help_now', { episode_id: ep.id, patient_id: ep.patient_id, checkin_id: null, trigger_ref: q.id, facts: { 'help.source': 'patient' }, handled: { show_emergency_instruction: q.id, 'create_queue_item:urgent': q.id } }, ctx);
    return [...events, ...rules.events];
  };
}
