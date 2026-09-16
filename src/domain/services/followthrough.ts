/**
 * Follow-through (FR-33–FR-38): referrals, contacts, visits, care-plan completion.
 * A referral is never "done" because a link was sent; only appointment_completed counts.
 */
import type { Command, ContactType, Id, ISO, ReferralState, VisitState, VisitType } from '../types';
import { coverageStatusFor } from '../projection';
import { DomainError } from './errors';
import { contactEvents, newQueueItem, requireEpisode, requirePatient } from './shared';

export const DEAD_END_STATES: readonly ReferralState[] = ['appointment_missed', 'no_capacity', 'not_covered', 'declined_by_patient'];

export function createReferral(input: { episode_id: Id; partner_id: Id; screen_result_id?: Id | null; reason: string }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    if (!ctx.config.practice.referral_partners.some((p) => p.id === input.partner_id)) throw new DomainError('unknown_partner', `Unknown referral partner ${input.partner_id}`);
    if (input.screen_result_id && !ctx.state.screens[input.screen_result_id]) throw new DomainError('unknown_screen', `Unknown screen result ${input.screen_result_id}`);
    return [ctx.makeEvent('referral_created', { referral_id: ctx.nextId('ref'), episode_id: ep.id, patient_id: ep.patient_id, partner_id: input.partner_id, screen_result_id: input.screen_result_id ?? null, reason: input.reason }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

/**
 * FR-33: state change with consent on sent_to_partner, kept-on date on appointment_completed, and the
 * reopen rule — a dead end on a referral tied to a positive screen or critical item reopens a
 * Needs-review item that closes only with a documented plan. Coverage is partner insurance vs patient (FR-36).
 */
export function setReferralState(input: { referral_id: Id; state: ReferralState; note?: string | null; consent_basis?: string | null; consent_version?: string | null; scheduled_for?: ISO | null; completed_at?: ISO | null }): Command {
  return (ctx) => {
    const r = ctx.state.referrals[input.referral_id];
    if (!r) throw new DomainError('unknown_referral', `Unknown referral ${input.referral_id}`);
    if (r.state === 'closed') throw new DomainError('referral_closed', 'A closed referral cannot change state');
    const ep = requireEpisode(ctx, r.episode_id);
    const patient = requirePatient(ctx, r.patient_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    if (input.state === 'sent_to_partner' && !input.consent_basis) throw new DomainError('consent_required', 'sent_to_partner records the consent basis and version (FR-33)');
    if (input.state === 'appointment_scheduled' && !input.scheduled_for) throw new DomainError('date_required', 'appointment_scheduled needs a date');
    // FR-33: completed_at is the kept-on date entered by staff; an appointment cannot have been kept after the clock.
    if (input.state === 'appointment_completed' && !input.completed_at) throw new DomainError('date_required', 'appointment_completed needs the date the appointment was kept (FR-33)');
    if (input.state === 'appointment_completed' && input.completed_at && Date.parse(input.completed_at) > Date.parse(ctx.now)) throw new DomainError('future_date', 'The kept-on date cannot be after the current time (FR-33)');
    const completed_at = input.completed_at ?? null;
    const events: ReturnType<Command> = [
      ctx.makeEvent('referral_state_changed', {
        referral_id: r.id, episode_id: ep.id, state: input.state, note: input.note ?? null, consent_basis: input.consent_basis ?? null,
        consent_version: input.consent_version ?? (input.consent_basis ? '1' : null), scheduled_for: input.scheduled_for ?? null, completed_at,
        coverage_status: coverageStatusFor(ctx.config, r.partner_id, patient),
      }, opts),
    ];
    if (DEAD_END_STATES.includes(input.state)) {
      const screen = r.screen_result_id ? ctx.state.screens[r.screen_result_id] : undefined;
      // One reopened item per referral: a second dead end while the first plan is still open adds nothing (FR-33).
      const alreadyOpen = Object.values(ctx.state.queueItems).some((q) => q.trigger_type === 'referral_dead_end' && q.trigger_ref === r.id && q.state !== 'resolved');
      if (screen && !screen.declined && (screen.positive || screen.critical_item_hit) && !alreadyOpen) {
        const q = newQueueItem(ctx, { queue_key: 'needs_review', episode_id: ep.id, trigger_type: 'referral_dead_end', trigger_ref: r.id, note: `referral ${input.state.replace(/_/g, ' ')}; an alternative plan is needed before this closes` });
        events.push(q.event, ctx.makeEvent('referral_reopened_for_plan', { referral_id: r.id, episode_id: ep.id, queue_item_id: q.id }, opts));
      }
    }
    return events;
  };
}

/** FR-38: contact_logged (+ initial_contact_confirmed on the first human contact) + exactly one staff_time row. */
export function logContact(input: { episode_id: Id; type: ContactType; outcome: string; note?: string | null; minutes?: number | null; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    requireEpisode(ctx, input.episode_id);
    if (!input.outcome || input.outcome.trim() === '') throw new DomainError('outcome_required', 'A contact needs an outcome');
    return contactEvents(ctx, input).events;
  };
}

export function scheduleVisit(input: { patient_id: Id; episode_id?: Id | null; type: VisitType; scheduled_for: ISO; purpose: string; bring?: string[] }): Command {
  return (ctx) => {
    requirePatient(ctx, input.patient_id);
    if (input.episode_id) requireEpisode(ctx, input.episode_id);
    return [ctx.makeEvent('visit_scheduled', { visit_id: ctx.nextId('vis'), patient_id: input.patient_id, episode_id: input.episode_id ?? null, type: input.type, scheduled_for: input.scheduled_for, purpose: input.purpose, bring: input.bring ?? [] }, { patient_id: input.patient_id, episode_id: input.episode_id ?? null })];
  };
}

export function setVisitState(input: { visit_id: Id; state: VisitState; completed_at?: ISO | null; rescheduled_to?: ISO | null }): Command {
  return (ctx) => {
    const v = ctx.state.visits[input.visit_id];
    if (!v) throw new DomainError('unknown_visit', `Unknown visit ${input.visit_id}`);
    if (input.state === 'rescheduled' && !input.rescheduled_to) throw new DomainError('date_required', 'A rescheduled visit needs a new date');
    const completed_at = input.state === 'completed' ? input.completed_at ?? ctx.now : null;
    return [ctx.makeEvent('visit_state_changed', { visit_id: v.id, state: input.state, completed_at, rescheduled_to: input.rescheduled_to ?? null }, { patient_id: v.patient_id, episode_id: v.episode_id })];
  };
}

export function completeCarePlanItem(input: { episode_id: Id; item_id: Id }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    const item = ctx.state.carePlanItems[input.item_id];
    if (!item || item.episode_id !== ep.id) throw new DomainError('unknown_care_plan_item', `Unknown care plan item ${input.item_id}`);
    if (item.state === 'completed') return [];
    return [ctx.makeEvent('care_plan_item_completed', { episode_id: ep.id, item_id: item.id }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}
