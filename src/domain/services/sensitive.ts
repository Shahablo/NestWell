/**
 * Sensitive paths (FR-07, FR-54–FR-59). Setting a status creates the Sensitive-review item in the
 * same command; suppression itself is derived by the projection and never waits. Nothing resumes
 * automatically: a lift is an explicit, logged command.
 */
import { addDays } from '../clock';
import { activeStatusesAt } from '../derive';
import type { AnyEvent, Command, Episode, Id, SensitiveSubtype } from '../types';
import { DomainError } from './errors';
import { routeFreeTextEvents } from './freetext';
import { evaluateRules } from './rules';
import { dayNumberFor, newQueueItem, requireEpisode, requireOpenEpisode, requirePatient } from './shared';

export type PatientControl = 'loss' | 'nicu' | 'stop_baby' | 'hard_birth';

/**
 * FR-07 patient controls, mapped to the subtype that gives the intended suppression. "Please stop all
 * messages about the baby" needs the full infant-related suppression, which only the loss set gives;
 * the coordinator confirms or adjusts the subtype afterwards (the item says so).
 */
export function patientControlSubtype(control: PatientControl, episode: Episode): SensitiveSubtype {
  switch (control) {
    case 'loss':
    case 'stop_baby':
      if (episode.delivery_outcome === 'stillbirth') return 'stillbirth';
      if (episode.delivery_outcome === 'pregnancy_loss' || episode.delivery_date === null) return 'pregnancy_loss';
      return 'neonatal_loss';
    case 'nicu': return 'nicu';
    case 'hard_birth': return 'trauma';
  }
}

export interface SetStatusInput {
  patient_id: Id;
  episode_id: Id;
  subtype: SensitiveSubtype;
  set_by: 'patient' | 'coordinator' | 'clinician';
  /** Staff may add a note; the patient never gives a reason (FR-07). */
  note?: string | null;
  /** The patient control tapped, recorded on the review item so the coordinator can confirm the subtype. */
  control?: PatientControl | null;
}

export function setSensitiveStatus(input: SetStatusInput): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    requirePatient(ctx, input.patient_id);
    if (activeStatusesAt(ctx.state.sensitiveStatuses.filter((s) => s.patient_id === input.patient_id), ctx.now).some((s) => s.subtype === input.subtype)) {
      throw new DomainError('status_active', `Sensitive status ${input.subtype} is already active`);
    }
    const opts = { patient_id: input.patient_id, episode_id: ep.id };
    const staffNote = input.set_by !== 'patient' && input.note ? `; note: ${input.note}` : '';
    const controlNote = input.control ? `; patient control: ${input.control}` : '';
    const q = newQueueItem(ctx, { queue_key: 'sensitive_review', episode_id: ep.id, trigger_type: 'sensitive_status', note: `sensitive status ${input.subtype} set by ${input.set_by}${controlNote}${staffNote}; ${input.set_by === 'patient' ? 'confirm the subtype with her' : 'review'}` });
    const events: AnyEvent[] = [
      ctx.makeEvent('sensitive_status_set', { patient_id: input.patient_id, episode_id: ep.id, subtype: input.subtype, set_by: input.set_by, queue_item_id: q.id }, opts),
      q.event,
    ];
    // FR-23 rules on status_set (for example trauma → clinician review rather than a screen, FR-55). The review item is already made.
    const rules = evaluateRules('status_set', {
      episode_id: ep.id, patient_id: input.patient_id, checkin_id: null, trigger_ref: q.id,
      facts: { 'status.subtype': input.subtype, 'status.set_by': input.set_by, 'episode.day_number': dayNumberFor(ep, ctx.now) },
      handled: { 'create_queue_item:sensitive_review': q.id },
    }, ctx);
    return [...events, ...rules.events];
  };
}

export function confirmSensitiveStatus(input: { patient_id: Id; subtype: SensitiveSubtype; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    const st = ctx.state.sensitiveStatuses.find((s) => s.patient_id === input.patient_id && s.subtype === input.subtype && s.active);
    if (!st) throw new DomainError('no_active_status', `No active ${input.subtype} status for ${input.patient_id}`);
    const staff = input.staff_user_id ?? ctx.actor.id ?? ctx.config.practice.staff_users.find((u) => u.role === 'coordinator')?.id ?? 'staff';
    return [ctx.makeEvent('sensitive_status_confirmed', { patient_id: input.patient_id, subtype: input.subtype, staff_user_id: staff }, { patient_id: input.patient_id, episode_id: st.episode_id })];
  };
}

/** NFR-07: loss and NICU lifted by a coordinator with a reason; trauma by the patient or a coordinator. */
export function liftSensitiveStatus(input: { patient_id: Id; subtype: SensitiveSubtype; reason: string }): Command {
  return (ctx) => {
    const st = ctx.state.sensitiveStatuses.find((s) => s.patient_id === input.patient_id && s.subtype === input.subtype && s.active);
    if (!st) throw new DomainError('no_active_status', `No active ${input.subtype} status for ${input.patient_id}`);
    if (ctx.actor.type === 'patient' && input.subtype !== 'trauma') throw new DomainError('not_permitted', 'Only a coordinator lifts a loss or NICU status (NFR-07)');
    if (!input.reason || input.reason.trim() === '') throw new DomainError('reason_required', 'A lift needs a reason (FR-55)');
    const lifted_by = ctx.actor.type === 'patient' ? 'patient' : ctx.actor.id ?? ctx.actor.role ?? ctx.actor.type;
    return [ctx.makeEvent('sensitive_status_lifted', { patient_id: input.patient_id, subtype: input.subtype, lifted_by, reason: input.reason }, { patient_id: input.patient_id, episode_id: st.episode_id })];
  };
}

export interface SensitivePreferencesInput {
  patient_id: Id;
  episode_id: Id;
  form_of_address: string | null;
  use_baby_name: boolean;
  contact_frequency: 'continue' | 'reduced' | 'not_for_now';
  /** Optional free text, governed by FR-17 in this same command. */
  free_text?: string | null;
}

/** FR-56: once; "not for now" pauses every scheduled check-in and creates the review item with the 7-day contact deadline. */
export function setSensitivePreferences(input: SensitivePreferencesInput): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const patient = requirePatient(ctx, input.patient_id);
    if (patient.preferences.contact_frequency !== null) throw new DomainError('already_set', 'The sensitive preferences dialog is asked once (FR-56)');
    const opts = { patient_id: patient.id, episode_id: ep.id };
    const events: AnyEvent[] = [];
    if (input.free_text && input.free_text.trim() !== '') events.push(...routeFreeTextEvents(ctx, { episode_id: ep.id, field: 'sensitive_preferences', text: input.free_text }).events);
    let queue_item_id: Id | null = null;
    const tail: AnyEvent[] = [];
    if (input.contact_frequency === 'not_for_now') {
      const days = ctx.config.cadence.loss_not_for_now_contact_days;
      const deadline = addDays(ctx.now, days);
      const week12 = ep.delivery_date ? addDays(ep.delivery_date, 84) : null;
      const q = newQueueItem(ctx, {
        queue_key: 'sensitive_review', episode_id: ep.id, trigger_type: 'sensitive_status',
        note: `loss "not for now": ${ctx.config.practice.named_contact.display_name} calls once by ${deadline} (${days}-day contact deadline) to agree how to stay in touch; she can say no. Week-12 due ${week12 ?? 'unknown'}. Check-ins paused.`,
      });
      queue_item_id = q.id;
      tail.push(ctx.makeEvent('checkins_paused', { episode_id: ep.id, actor: 'patient', until: null, duration_label: 'not_for_now' }, opts), q.event);
    }
    events.push(ctx.makeEvent('sensitive_preferences_set', { patient_id: patient.id, episode_id: ep.id, form_of_address: input.form_of_address, use_baby_name: input.use_baby_name, contact_frequency: input.contact_frequency, queue_item_id }, opts));
    return [...events, ...tail];
  };
}
