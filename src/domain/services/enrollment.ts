/**
 * Enrollment and episode lifecycle (FR-01–FR-05, FR-13a, FR-37, FR-39, FR-63a).
 */
import { addDays, addHours, atLocalHour, toMs } from '../clock';
import type { ContentIndex } from '../content';
import { isLossOutcome, isLossSubtype } from '../derive';
import { activeEpisodeFor, checkinsForEpisode } from '../projection';
import type {
  AnyEvent, CheckinSet, CloseReason, Command, CommandContext, DeliveryOutcome, EligibilityStatus, EnrollmentPoint, Id, ISO, Locale, Patient, Preferences, Transition,
} from '../types';
import { carePlanItemsFor, visitsFor } from './careplan';
import { DomainError } from './errors';
import { contactEvents, newQueueItem, requireEpisode, requireOpenEpisode, requirePatient } from './shared';

/** FR-63a: the safety-critical class that must exist approved in the patient's locale before enrollment. */
export const SAFETY_CRITICAL_CONTENT_IDS: readonly string[] = [
  'emergency_instruction', 'after_hours_instruction', 'contact_card', 'help_resources', 'nobody_reached_yet',
  'acknowledgment.standard', 'acknowledgment.demo_participant', 'acknowledgment.critical_shared', 'acknowledgment.critical_not_shared',
  'acknowledgment.free_text_scan_on', 'acknowledgment.free_text_scan_off', 'closing.no_follow_up', 'closing.pending', 'pause.confirm', 'stop.confirm',
];

export function safetyClassStatus(content: ContentIndex, locale: Locale): { ok: boolean; missing: string[] } {
  const missing = SAFETY_CRITICAL_CONTENT_IDS.filter((id) => content.byId.get(`${id}::${locale}`)?.status !== 'approved');
  return { ok: missing.length === 0, missing };
}

export { isLossOutcome };

export function registerPatient(input: { patient: Patient }): Command {
  return (ctx) => {
    const p = input.patient;
    if (p.is_synthetic !== true) throw new DomainError('not_synthetic', 'Only synthetic patients exist in this prototype (SR-01)');
    if (ctx.state.patients[p.id]) throw new DomainError('duplicate_patient', `Patient ${p.id} already registered`);
    const events: AnyEvent[] = [ctx.makeEvent('patient_registered', { patient: p }, { patient_id: p.id })];
    if (!p.is_adult) {
      events.push(ctx.makeEvent('eligibility_changed', { patient_id: p.id, status: 'not_offered', reason: 'minor_policy_undefined' }, { patient_id: p.id }));
    } else if (p.preferences.locale !== 'en' && !safetyClassStatus(ctx.content, p.preferences.locale).ok) {
      events.push(ctx.makeEvent('eligibility_changed', { patient_id: p.id, status: 'not_offered', reason: 'language_content_unavailable' }, { patient_id: p.id }));
      // 6.6: a human-only outreach item; no episode exists yet, so the item carries a placeholder episode id.
      const q = newQueueItem(ctx, { queue_key: 'follow_through', episode_id: `no-episode:${p.id}`, patient_id: p.id, trigger_type: 'referral', note: 'interpreter or Spanish-speaking staff needed; enrollment blocked until the safety-critical content class is approved in her language (FR-63a)' });
      events.push(q.event);
    }
    return events;
  };
}

export function recordEligibility(input: { patient_id: Id; status: EligibilityStatus; reason?: string | null }): Command {
  return (ctx) => {
    requirePatient(ctx, input.patient_id);
    return [ctx.makeEvent('eligibility_changed', { patient_id: input.patient_id, status: input.status, reason: input.reason ?? null }, { patient_id: input.patient_id })];
  };
}

/** Schedule (or reschedule, reusing ids) every cadence check-in from the anchor date (FR-02, FR-08). */
export function scheduleCheckinEvents(ctx: CommandContext, episode_id: Id, patient_id: Id, anchor: ISO, set: CheckinSet, existing: ReadonlyArray<{ id: Id; day_number: number }> = []): AnyEvent[] {
  const { cadence, practice } = ctx.config;
  const tz = practice.timezone;
  const opts = { patient_id, episode_id };
  const now = toMs(ctx.now);
  const earliest = toMs(addHours(ctx.now, 24));
  const setTemplate = Object.values(ctx.config.checkins).filter((t) => t.set === set).sort((a, b) => a.key.localeCompare(b.key))[0];
  const events: AnyEvent[] = [];
  for (const point of [...cadence.points].sort((a, b) => a.day - b.day)) {
    const template = (set !== 'standard' && setTemplate) ? setTemplate : ctx.config.checkins[point.template_key];
    if (!template) throw new DomainError('unknown_template', `Cadence point ${point.key} names unknown template ${point.template_key}`);
    let scheduled_at = atLocalHour(addDays(anchor, point.day), cadence.send_hour_local, tz);
    let window_end_at = addHours(scheduled_at, cadence.response_window_hours);
    const notApplicable = toMs(window_end_at) <= now;
    if (!notApplicable && toMs(scheduled_at) < earliest) {
      // FR-02: the first live check-in goes no sooner than enrollment + 1 day.
      let shifted = atLocalHour(addDays(ctx.now, 1), cadence.send_hour_local, tz);
      if (toMs(shifted) < earliest) shifted = atLocalHour(addDays(ctx.now, 2), cadence.send_hour_local, tz);
      scheduled_at = shifted;
      window_end_at = addHours(scheduled_at, cadence.response_window_hours);
    }
    const checkin_id = existing.find((c) => c.day_number === point.day)?.id ?? ctx.nextId('ci');
    events.push(ctx.makeEvent('checkin_scheduled', { checkin_id, episode_id, template_key: template.key, template_version: template.version, set: template.set, day_number: point.day, scheduled_at, window_end_at }, opts));
    if (notApplicable) events.push(ctx.makeEvent('checkin_not_applicable', { checkin_id, episode_id }, opts));
  }
  return events;
}

export interface EnrollInput {
  patient_id: Id;
  enrollment_point: EnrollmentPoint;
  expected_date?: ISO | null;
  delivery_date?: ISO | null;
  delivery_outcome?: DeliveryOutcome | null;
  performed_by: 'patient' | 'staff';
  staff_user_id?: Id | null;
}

export function enroll(input: EnrollInput): Command {
  return (ctx) => {
    const patient = requirePatient(ctx, input.patient_id);
    if (activeEpisodeFor(ctx.state, patient.id)) throw new DomainError('already_enrolled', `Patient ${patient.id} already has an open episode`);
    if (!patient.is_adult) throw new DomainError('minor_policy_undefined', 'Minors are not offered enrollment (FR-01, A17)');
    const locale = patient.preferences.locale;
    if (locale !== 'en') {
      const cls = safetyClassStatus(ctx.content, locale);
      if (!cls.ok) throw new DomainError('language_content_unavailable', `Safety-critical content not approved in ${locale}: ${cls.missing.join(', ')} (FR-63a)`);
    }
    const delivery_date = input.delivery_date ?? null;
    const expected_date = input.expected_date ?? null;
    const anchor = delivery_date ?? expected_date;
    if (!anchor) throw new DomainError('date_required', 'Enrollment needs an expected or actual delivery date (FR-02)');
    const delivery_outcome = input.delivery_outcome ?? null;
    const episode_id = ctx.nextId('ep');
    const opts = { patient_id: patient.id, episode_id };
    const set: CheckinSet = isLossOutcome(delivery_outcome) ? 'loss' : 'standard';
    const events: AnyEvent[] = [
      ctx.makeEvent('eligibility_changed', { patient_id: patient.id, status: 'enrolled', reason: null }, { patient_id: patient.id }),
      ctx.makeEvent('enrolled', { episode_id, patient_id: patient.id, enrollment_point: input.enrollment_point, expected_date, delivery_date, delivery_outcome, performed_by: input.performed_by, staff_user_id: input.staff_user_id ?? null }, opts),
      ...scheduleCheckinEvents(ctx, episode_id, patient.id, anchor, set),
      ctx.makeEvent('care_plan_instantiated', { episode_id, items: carePlanItemsFor(ctx, episode_id, set, anchor) }, opts),
    ];
    for (const v of visitsFor(ctx.config, anchor)) {
      events.push(ctx.makeEvent('visit_scheduled', { visit_id: ctx.nextId('vis'), patient_id: patient.id, episode_id, type: v.type, scheduled_for: v.scheduled_for, purpose: v.purpose, bring: v.bring }, opts));
    }
    if (input.performed_by === 'staff' && input.enrollment_point === 'after_delivery') {
      // FR-37: staff-performed enrollment after delivery is a human contact. The episode is not yet in state,
      // so the contact bundle is built by hand with day 0 relative to the delivery date.
      const contact_id = ctx.nextId('ct');
      const day_number = Math.floor((toMs(ctx.now) - toMs(anchor)) / 86_400_000);
      const staff = input.staff_user_id ?? ctx.actor.id ?? ctx.config.practice.staff_users.find((u) => u.role === 'coordinator')?.id ?? 'staff';
      events.push(ctx.makeEvent('contact_logged', { contact_id, episode_id, type: 'enrollment', staff_user_id: staff, outcome: 'enrolled in person', note: null, day_number }, opts));
      events.push(ctx.makeEvent('initial_contact_confirmed', { episode_id, contact_id, day_number, met_target: day_number <= ctx.config.cadence.initial_contact_target_day }, opts));
    }
    return events;
  };
}

/** FR-02: changing the delivery date regenerates unsent check-ins only (ids are reused). */
export function recordDelivery(input: { episode_id: Id; delivery_date: ISO; outcome: DeliveryOutcome }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const events: AnyEvent[] = [ctx.makeEvent('delivery_recorded', { episode_id: ep.id, delivery_date: input.delivery_date, outcome: input.outcome }, opts)];
    const existing = checkinsForEpisode(ctx.state, ep.id);
    const unsent = existing.filter((c) => c.state === 'scheduled' || c.state === 'not_applicable' || c.state === 'paused');
    const sentDays = new Set(existing.filter((c) => !unsent.includes(c)).map((c) => c.day_number));
    const set: CheckinSet = isLossOutcome(input.outcome) ? 'loss' : 'standard';
    const regenerated = scheduleCheckinEvents(ctx, ep.id, ep.patient_id, input.delivery_date, set, unsent.map((c) => ({ id: c.id, day_number: c.day_number })));
    // Only unsent check-ins are regenerated: drop the schedule (and its not_applicable marker) for days already sent.
    const skipIds = new Set<Id>();
    for (const e of regenerated) if (e.type === 'checkin_scheduled' && sentDays.has(e.payload.day_number)) skipIds.add(e.payload.checkin_id);
    for (const e of regenerated) {
      if ((e.type === 'checkin_scheduled' || e.type === 'checkin_not_applicable') && skipIds.has(e.payload.checkin_id)) continue;
      events.push(e);
    }
    return events;
  };
}

/** FR-05: the acknowledgment records the flags in force so the disclosure text can be asserted later. */
export function acknowledge(input: { episode_id: Id; mode: 'standard' | 'demo_participant' }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    return [ctx.makeEvent('acknowledged', { episode_id: ep.id, mode: input.mode, free_text_scan: ctx.config.freetext.free_text_urgency_scan, critical_item_overrides_sharing: ctx.config.freetext.critical_item_overrides_sharing }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

const PREFERENCE_FIELDS: ReadonlyArray<keyof Preferences> = ['locale', 'formality', 'preferred_name', 'form_of_address', 'contact_windows', 'safe_to_message', 'baby_reference_permission', 'baby_name', 'sharing_category', 'contact_frequency'];

export function setPreference<K extends keyof Preferences>(input: { patient_id: Id; field: K; value: Preferences[K] }): Command {
  return (ctx) => {
    const p = requirePatient(ctx, input.patient_id);
    if (!PREFERENCE_FIELDS.includes(input.field)) throw new DomainError('unknown_preference', `Unknown preference ${String(input.field)}`);
    const events: AnyEvent[] = [ctx.makeEvent('preferences_changed', { patient_id: p.id, field: input.field, value: input.value }, { patient_id: p.id })];
    if (input.field === 'sharing_category') events.push(ctx.makeEvent('sharing_changed', { patient_id: p.id, category: input.value as Preferences['sharing_category'] }, { patient_id: p.id }));
    return events;
  };
}

export function pauseCheckins(input: { episode_id: Id; actor: 'patient' | 'staff'; duration_label: string; until: ISO | null }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    if (ep.paused) throw new DomainError('already_paused', 'Check-ins are already paused');
    return [ctx.makeEvent('checkins_paused', { episode_id: ep.id, actor: input.actor, until: input.until, duration_label: input.duration_label }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

export function resumeCheckins(input: { episode_id: Id; actor: 'patient' | 'staff' }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    if (!ep.paused) throw new DomainError('not_paused', 'Check-ins are not paused');
    return [ctx.makeEvent('checkins_resumed', { episode_id: ep.id, actor: input.actor }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

/** FR-13a "Stop the program": closed_early, dropout recorded, one Follow-through item to confirm destinations. */
export function stopProgram(input: { episode_id: Id }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const q = newQueueItem(ctx, { queue_key: 'follow_through', episode_id: ep.id, trigger_type: 'withdrawal', note: 'patient stopped the program; confirm her care-plan destinations, no further app contact' });
    return [
      ctx.makeEvent('episode_closed', { episode_id: ep.id, status: 'closed_early', close_reason: 'patient_withdrew', transition: null }, opts),
      ctx.makeEvent('dropout_recorded', { episode_id: ep.id, close_reason: 'patient_withdrew' }, opts),
      q.event,
    ];
  };
}

/** FR-39: indicated episodes close only with a confirmed destination or none_identified + owner + next contact date. */
export function closeEpisode(input: { episode_id: Id; transition: Transition }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const t = input.transition;
    if (ep.indicated) {
      const ok = t.mental_health === 'confirmed' || (t.mental_health === 'none_identified' && t.owner_role !== null && t.next_contact_date !== null);
      if (!ok) throw new DomainError('transition_incomplete', 'An indicated episode closes only with a confirmed mental-health destination, or "no destination identified" plus a named owner and next contact date (FR-39)');
    }
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    return [
      ctx.makeEvent('transition_completed', { episode_id: ep.id, transition: t }, opts),
      ctx.makeEvent('episode_closed', { episode_id: ep.id, status: 'completed', close_reason: null, transition: t }, opts),
    ];
  };
}

/** Staff closure for a reason other than withdrawal (FR-39): closed_early with dropout recorded. */
export function closeEarly(input: { episode_id: Id; close_reason: CloseReason }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    return [
      ctx.makeEvent('episode_closed', { episode_id: ep.id, status: 'closed_early', close_reason: input.close_reason, transition: null }, opts),
      ctx.makeEvent('dropout_recorded', { episode_id: ep.id, close_reason: input.close_reason }, opts),
    ];
  };
}

export function episodeOf(ctx: CommandContext, episode_id: Id) {
  return requireEpisode(ctx, episode_id);
}

export { isLossSubtype };
