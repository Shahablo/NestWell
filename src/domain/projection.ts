/**
 * project(events, clock, config, content): State
 *
 * Folds every stored event with occurred_at <= clock in log order, then derives the
 * clock-driven facts (ARCHITECTURE 3.1): check-in states, reminders, queue timers,
 * Unreached items, the day-21 sweep, initial contact, episode status, sensitive
 * suppression. Pure and deterministic: the same events and clock give a deep-equal state.
 */
import { addDays, toMs } from './clock';
import type { AppConfig, QueueDef } from './config.schema';
import type { ContentIndex } from './content';
import {
  activePauseAt, activeStatusesAt, checkinSetFor, checkinStateAt, day21SweepFor, initialContactFor, isIndicated, isPausedAt,
  openClinicalFlagAt, queueTimersFor, reminderFor, suppressionFor, unreachedItemsFor,
  type CheckinFacts, type DerivedUnreached, type EpisodeFacts, type PauseInterval, type ReminderResult,
} from './derive';
import { carePlanNotification, checkinNotification, reminderNotification } from './services/notifications';
import type {
  AnyEvent, Checkin, ContentTag, DerivedEvent, Episode, ISO, Id, Notification, OutreachOutcome, Patient, QueueItem, QueueKey,
  Role, ScreenResult, SensitiveStatus, State, TriggerType,
} from './types';

interface CheckinExtra { complete: boolean; skipped_at: ISO | null; not_applicable: boolean }
interface EpisodeExtra { pauses: PauseInterval[]; closed_at: ISO | null }
interface QueueAction {
  acknowledged_at: ISO | null; acknowledged_by: Id | null; resolved_at: ISO | null; resolved_by: Id | null;
  outcome: string | null; contact_id: Id | null; rating: QueueItem['rating']; reopened_at: ISO | null;
}
interface OutreachRec { queue_item_id: Id; episode_id: Id; outcome: OutreachOutcome; at: ISO }
interface StoredQueue {
  id: Id; queue_key: QueueKey; episode_id: Id; patient_id: Id; trigger_type: TriggerType; trigger_ref: Id | null;
  note: string | null; created_at: ISO; open_clinical_flag: boolean;
}

interface Draft {
  state: State;
  checkinExtra: Map<Id, CheckinExtra>;
  episodeExtra: Map<Id, EpisodeExtra>;
  queueActions: Map<Id, QueueAction>;
  stored: StoredQueue[];
  outreach: OutreachRec[];
  lastAi: Map<string, Id>;
  /** FR-56: queue item id → the human-contact deadline that replaces its acknowledgment target. */
  deadlines: Map<Id, ISO>;
}

const EMPTY_PREFS: Patient['preferences'] = {
  locale: 'en', formality: null, preferred_name: null, form_of_address: null, contact_windows: [], safe_to_message: null,
  baby_reference_permission: 'unset', baby_name: null, sharing_category: 'clinician_only', contact_frequency: null,
};

function emptyState(clock: ISO): State {
  return {
    clock, patients: {}, eligibility: {}, episodes: {}, checkins: {}, screens: {}, queueItems: {}, assessments: {}, referrals: {},
    visits: {}, contacts: {}, callbacks: {}, staffTime: [], carePlanItems: {}, savedQuestions: {}, summaries: {}, notifications: [],
    sensitiveStatuses: [], readRecords: [], incidents: {}, aiInteractions: {}, usefulness: [], missedEscalations: [], derivedEvents: [],
    practiceSetupMinutes: null, eventCount: 0,
  };
}

function queueAction(d: Draft, id: Id): QueueAction {
  let a = d.queueActions.get(id);
  if (!a) {
    a = { acknowledged_at: null, acknowledged_by: null, resolved_at: null, resolved_by: null, outcome: null, contact_id: null, rating: null, reopened_at: null };
    d.queueActions.set(id, a);
  }
  return a;
}

export function coverageStatusFor(config: AppConfig, partner_id: Id, patient: Patient | undefined): 'unknown' | 'covered' | 'not_covered' {
  const partner = config.practice.referral_partners.find((p) => p.id === partner_id);
  if (!partner || !patient) return 'unknown';
  return partner.accepted_insurance_types.includes(patient.insurance_type) ? 'covered' : 'not_covered';
}

// ---------------------------------------------------------------------------
// Fold
// ---------------------------------------------------------------------------

function apply(d: Draft, e: AnyEvent, config: AppConfig, content: ContentIndex): void {
  const s = d.state;
  const at = e.occurred_at;
  switch (e.type) {
    case 'patient_registered': {
      const p = e.payload.patient;
      if (p.is_synthetic !== true) return; // SR-01: the projection rejects anything else
      s.patients[p.id] = { ...p, access_barriers: [...p.access_barriers], preferences: { ...EMPTY_PREFS, ...p.preferences, contact_windows: [...p.preferences.contact_windows] } };
      return;
    }
    case 'eligibility_changed':
      s.eligibility[e.payload.patient_id] = { patient_id: e.payload.patient_id, status: e.payload.status, reason: e.payload.reason, recorded_at: at };
      return;
    case 'enrolled': {
      const p = e.payload;
      s.episodes[p.episode_id] = {
        id: p.episode_id, patient_id: p.patient_id, expected_date: p.expected_date, delivery_date: p.delivery_date, delivery_outcome: p.delivery_outcome,
        enrollment_point: p.enrollment_point, enrolled_at: at, enrolled_by: p.performed_by, acknowledged_at: null, acknowledgment_mode: null,
        status: 'active', paused_until: null, paused: false, close_reason: null, closed_at: null, transition: null,
        initial_contact_day: null, initial_contact_met_target: null, indicated: false,
      };
      d.episodeExtra.set(p.episode_id, { pauses: [], closed_at: null });
      return;
    }
    case 'delivery_recorded': {
      const ep = s.episodes[e.payload.episode_id];
      if (ep) { ep.delivery_date = e.payload.delivery_date; ep.delivery_outcome = e.payload.outcome; }
      return;
    }
    case 'acknowledged': {
      const ep = s.episodes[e.payload.episode_id];
      if (ep) { ep.acknowledged_at = at; ep.acknowledgment_mode = e.payload.mode; }
      return;
    }
    case 'preferences_changed': {
      const p = s.patients[e.payload.patient_id];
      if (p) Object.assign(p.preferences, { [e.payload.field]: e.payload.value });
      return;
    }
    case 'checkins_paused':
      d.episodeExtra.get(e.payload.episode_id)?.pauses.push({ from: at, until: e.payload.until, resumed_at: null, actor: e.payload.actor });
      return;
    case 'checkins_resumed':
      for (const p of d.episodeExtra.get(e.payload.episode_id)?.pauses ?? []) if (p.resumed_at === null) p.resumed_at = at;
      return;
    case 'episode_closed': {
      const ep = s.episodes[e.payload.episode_id];
      if (ep) {
        ep.status = e.payload.status; ep.close_reason = e.payload.close_reason; ep.closed_at = at;
        if (e.payload.transition) ep.transition = e.payload.transition;
        const x = d.episodeExtra.get(ep.id); if (x) x.closed_at = at;
      }
      return;
    }
    case 'transition_completed': {
      const ep = s.episodes[e.payload.episode_id];
      if (ep) ep.transition = e.payload.transition;
      return;
    }
    case 'checkin_scheduled': {
      const p = e.payload;
      const existing = s.checkins[p.checkin_id];
      if (existing) {
        Object.assign(existing, { template_key: p.template_key, template_version: p.template_version, set: p.set, day_number: p.day_number, scheduled_at: p.scheduled_at, window_end_at: p.window_end_at });
        const x = d.checkinExtra.get(p.checkin_id); if (x) x.not_applicable = false;
      } else {
        s.checkins[p.checkin_id] = {
          id: p.checkin_id, episode_id: p.episode_id, template_key: p.template_key, template_version: p.template_version, set: p.set, day_number: p.day_number,
          scheduled_at: p.scheduled_at, window_end_at: p.window_end_at, state: 'scheduled', opened_at: null, submitted_at: null, responses: [],
          reminder_at: null, reminder_suppressed_reason: null, rescheduled_once: false,
        };
        d.checkinExtra.set(p.checkin_id, { complete: false, skipped_at: null, not_applicable: false });
      }
      return;
    }
    case 'checkin_not_applicable': {
      const x = d.checkinExtra.get(e.payload.checkin_id); if (x) x.not_applicable = true;
      return;
    }
    case 'checkin_opened': {
      const c = s.checkins[e.payload.checkin_id];
      if (c && c.opened_at === null) c.opened_at = at;
      return;
    }
    case 'checkin_submitted': {
      const c = s.checkins[e.payload.checkin_id];
      const x = d.checkinExtra.get(e.payload.checkin_id);
      if (c && x) { c.submitted_at = at; c.responses = e.payload.responses.map((r) => ({ ...r })); x.complete = e.payload.complete; }
      return;
    }
    case 'checkin_skipped': {
      const x = d.checkinExtra.get(e.payload.checkin_id); if (x && x.skipped_at === null) x.skipped_at = at;
      return;
    }
    case 'checkin_not_now': {
      const c = s.checkins[e.payload.checkin_id];
      if (c) { c.scheduled_at = e.payload.rescheduled_to; c.rescheduled_once = true; if (toMs(c.window_end_at) < toMs(c.scheduled_at)) c.window_end_at = c.scheduled_at; }
      return;
    }
    case 'outreach_logged':
      d.outreach.push({ queue_item_id: e.payload.queue_item_id, episode_id: e.payload.episode_id, outcome: e.payload.outcome, at });
      return;
    case 'queue_item_created': {
      const p = e.payload;
      d.stored.push({ id: p.queue_item_id, queue_key: p.queue_key, episode_id: p.episode_id, patient_id: p.patient_id, trigger_type: p.trigger_type, trigger_ref: p.trigger_ref, note: p.note, created_at: at, open_clinical_flag: p.open_clinical_flag });
      return;
    }
    case 'queue_item_acknowledged': {
      const a = queueAction(d, e.payload.queue_item_id);
      if (a.acknowledged_at === null) { a.acknowledged_at = at; a.acknowledged_by = e.payload.staff_user_id; }
      return;
    }
    case 'queue_item_resolved': {
      const a = queueAction(d, e.payload.queue_item_id);
      a.resolved_at = at; a.resolved_by = e.payload.staff_user_id; a.outcome = e.payload.outcome; a.contact_id = e.payload.contact_id;
      return;
    }
    case 'queue_item_reopened': {
      const a = queueAction(d, e.payload.queue_item_id);
      a.reopened_at = at; a.resolved_at = null; a.resolved_by = null; a.outcome = null; a.acknowledged_at = null; a.acknowledged_by = null;
      return;
    }
    case 'escalation_rated':
      queueAction(d, e.payload.queue_item_id).rating = e.payload.rating;
      return;
    case 'missed_escalation_recorded': {
      const p = e.payload;
      s.missedEscalations.push({ id: p.missed_escalation_id, episode_id: p.episode_id, related_entity: p.related_entity, related_id: p.related_id, flagged_by: p.flagged_by, reason: p.reason, occurred_at: at });
      return;
    }
    case 'callback_requested': {
      const p = e.payload;
      s.callbacks[p.callback_id] = { id: p.callback_id, episode_id: p.episode_id, queue_item_id: p.queue_item_id, requested_at: at, preferred_window: p.preferred_window, occurred: null, occurred_at: null, outcome: null };
      return;
    }
    case 'callback_completed': {
      const cb = s.callbacks[e.payload.callback_id];
      if (cb) { cb.occurred = e.payload.occurred; cb.occurred_at = at; cb.outcome = e.payload.outcome; }
      return;
    }
    case 'screen_administered': {
      const p = e.payload;
      s.screens[p.screen_result_id] = {
        id: p.screen_result_id, episode_id: p.episode_id, patient_id: p.patient_id, instrument_key: p.instrument_key, instrument_version: p.instrument_version,
        checkin_id: p.checkin_id, item_responses: [...p.item_responses], score: p.score, positive: p.positive, critical_item_hit: p.critical_item_hit,
        administered_at: at, shared_with: [...p.shared_with], declined: false, framing: p.framing,
      };
      return;
    }
    case 'screen_declined': {
      const ep = s.episodes[e.payload.episode_id];
      const id = `declined:${e.id}`;
      s.screens[id] = {
        id, episode_id: e.payload.episode_id, patient_id: ep?.patient_id ?? e.patient_id ?? '', instrument_key: e.payload.instrument_key,
        instrument_version: config.instruments[e.payload.instrument_key]?.version ?? '', checkin_id: null, item_responses: [], score: 0, positive: false,
        critical_item_hit: false, administered_at: at, shared_with: [], declined: true, framing: 'standard',
      };
      return;
    }
    case 'sharing_changed': {
      const p = s.patients[e.payload.patient_id];
      if (p) p.preferences.sharing_category = e.payload.category;
      return;
    }
    case 'screen_responses_read': {
      const p = e.payload;
      s.readRecords.push({ patient_id: p.patient_id, episode_id: p.episode_id, field: p.field, role: p.role, staff_user_id: p.staff_user_id, at });
      return;
    }
    case 'assessment_recorded': {
      const p = e.payload;
      s.assessments[p.assessment_id] = { id: p.assessment_id, episode_id: p.episode_id, screen_result_id: p.screen_result_id, trigger_ref: p.trigger_ref, clinician_id: p.clinician_id, outcome: p.outcome, note: p.note, recorded_at: at };
      return;
    }
    case 'referral_created': {
      const p = e.payload;
      s.referrals[p.referral_id] = {
        id: p.referral_id, episode_id: p.episode_id, patient_id: p.patient_id, partner_id: p.partner_id, screen_result_id: p.screen_result_id, reason: p.reason,
        state: 'created', coverage_status: coverageStatusFor(config, p.partner_id, s.patients[p.patient_id]), consent_basis: null, consent_version: null,
        created_at: at, sent_at: null, scheduled_for: null, completed_at: null, closed_at: null, history: [{ state: 'created', at, note: null }],
      };
      return;
    }
    case 'referral_state_changed': {
      const r = s.referrals[e.payload.referral_id];
      if (!r) return;
      const p = e.payload;
      r.state = p.state;
      r.history.push({ state: p.state, at, note: p.note });
      if (p.state === 'sent_to_partner') r.sent_at = at;
      if (p.state === 'closed') r.closed_at = at;
      if (p.scheduled_for !== null) r.scheduled_for = p.scheduled_for;
      if (p.completed_at !== null) r.completed_at = p.completed_at;
      if (p.coverage_status !== null) r.coverage_status = p.coverage_status;
      if (p.consent_basis !== null) r.consent_basis = p.consent_basis;
      if (p.consent_version !== null) r.consent_version = p.consent_version;
      return;
    }
    case 'contact_logged': {
      const p = e.payload;
      s.contacts[p.contact_id] = { id: p.contact_id, episode_id: p.episode_id, type: p.type, occurred_at: at, staff_user_id: p.staff_user_id, outcome: p.outcome, note: p.note, day_number: p.day_number };
      return;
    }
    case 'visit_scheduled': {
      const p = e.payload;
      s.visits[p.visit_id] = { id: p.visit_id, patient_id: p.patient_id, episode_id: p.episode_id, type: p.type, scheduled_for: p.scheduled_for, state: 'scheduled', completed_at: null, purpose: p.purpose, bring: [...p.bring] };
      return;
    }
    case 'visit_state_changed': {
      const v = s.visits[e.payload.visit_id];
      if (v) {
        v.state = e.payload.state;
        if (e.payload.completed_at !== null) v.completed_at = e.payload.completed_at;
        else if (e.payload.state === 'completed') v.completed_at = at;
        if (e.payload.rescheduled_to !== null) v.scheduled_for = e.payload.rescheduled_to;
      }
      return;
    }
    case 'care_plan_instantiated':
      for (const item of e.payload.items) s.carePlanItems[item.id] = { ...item, tags: [...item.tags], state: 'open', completed_at: null };
      return;
    case 'care_plan_item_completed': {
      const item = s.carePlanItems[e.payload.item_id];
      if (item) { item.state = 'completed'; item.completed_at = at; }
      return;
    }
    case 'staff_time_logged': {
      const p = e.payload;
      s.staffTime.push({ id: p.staff_time_id, user_id: p.user_id, episode_id: p.episode_id, source_type: p.source_type, source_id: p.source_id, minutes: p.minutes, recorded_at: at });
      return;
    }
    case 'summary_drafted': {
      const p = e.payload;
      s.summaries[p.summary_id] = { id: p.summary_id, episode_id: p.episode_id, period: p.period, structured: p.structured, narrative: p.narrative, ai_draft: p.ai_draft, state: 'draft', reviewer_id: null, reviewed_at: null, withheld_notices: [...p.withheld_notices], created_at: at };
      return;
    }
    case 'summary_state_changed': {
      const sm = s.summaries[e.payload.summary_id];
      if (sm) { sm.state = e.payload.state; if (e.payload.reviewer_id !== null) sm.reviewer_id = e.payload.reviewer_id; if (e.payload.state === 'reviewed') sm.reviewed_at = at; }
      return;
    }
    case 'saved_question_added': {
      const p = e.payload;
      const order = Object.values(s.savedQuestions).filter((q) => q.episode_id === p.episode_id).length + 1;
      s.savedQuestions[p.question_id] = { id: p.question_id, episode_id: p.episode_id, text: p.text, order, group_title: null, queue_item_id: p.queue_item_id, lexicon_match: p.lexicon_match, created_at: at };
      return;
    }
    case 'saved_questions_grouped':
      for (const g of e.payload.groups) for (const qid of g.question_ids) { const q = s.savedQuestions[qid]; if (q) q.group_title = g.title; }
      return;
    case 'usefulness_rated':
      s.usefulness.push({ episode_id: e.payload.episode_id, week: e.payload.week, rating: e.payload.rating, comment_queue_item_id: e.payload.comment_queue_item_id, recorded_at: at });
      return;
    case 'sensitive_status_set': {
      const p = e.payload;
      s.sensitiveStatuses.push({ patient_id: p.patient_id, episode_id: p.episode_id, subtype: p.subtype, active: true, set_by: p.set_by, set_at: at, lifted_by: null, lifted_at: null, lift_reason: null, confirmed_by_staff: p.set_by !== 'patient' });
      return;
    }
    case 'sensitive_status_confirmed': {
      const st = s.sensitiveStatuses.find((x) => x.patient_id === e.payload.patient_id && x.subtype === e.payload.subtype && x.active);
      if (st) st.confirmed_by_staff = true;
      return;
    }
    case 'sensitive_status_lifted': {
      const st = s.sensitiveStatuses.find((x) => x.patient_id === e.payload.patient_id && x.subtype === e.payload.subtype && x.active);
      if (st) { st.active = false; st.lifted_by = e.payload.lifted_by; st.lifted_at = at; st.lift_reason = e.payload.reason; }
      return;
    }
    case 'sensitive_preferences_set': {
      const p = s.patients[e.payload.patient_id];
      if (p) { p.preferences.form_of_address = e.payload.form_of_address; p.preferences.contact_frequency = e.payload.contact_frequency; p.preferences.baby_reference_permission = e.payload.use_baby_name ? 'welcome' : 'no'; }
      // FR-56: the "not for now" review item must see a logged human contact within the configured days, then escalates.
      if (e.payload.contact_frequency === 'not_for_now' && e.payload.queue_item_id) {
        d.deadlines.set(e.payload.queue_item_id, addDays(at, config.cadence.loss_not_for_now_contact_days));
      }
      return;
    }
    case 'ai_call': {
      const p = e.payload;
      s.aiInteractions[p.ai_interaction_id] = { id: p.ai_interaction_id, feature: p.feature, episode_id: p.episode_id, content_ids: [...p.content_ids], prompt_hash: p.prompt_hash, content_manifest_hash: content.manifestHash, model_id: null, prefilter_result: 'not_run', postfilter_result: 'not_run', fallback_used: false, blocked_reason: null, occurred_at: at };
      d.lastAi.set(`${p.feature}:${p.episode_id ?? ''}`, p.ai_interaction_id);
      return;
    }
    case 'ai_fallback_used': {
      const id = d.lastAi.get(`${e.payload.feature}:${e.payload.episode_id ?? ''}`);
      const ai = id ? s.aiInteractions[id] : undefined;
      if (ai) ai.fallback_used = true;
      return;
    }
    case 'ai_call_blocked': {
      const id = `blocked:${e.id}`;
      s.aiInteractions[id] = { id, feature: e.payload.feature, episode_id: e.payload.episode_id, content_ids: [], prompt_hash: '', content_manifest_hash: content.manifestHash, model_id: null, prefilter_result: 'blocked', postfilter_result: 'not_run', fallback_used: false, blocked_reason: e.payload.reason, occurred_at: at };
      return;
    }
    case 'incident_recorded': {
      const p = e.payload;
      s.incidents[p.incident_id] = { id: p.incident_id, type: p.type, related_entity: p.related_entity, related_id: p.related_id, reported_by: p.reported_by, description: p.description, occurred_at: at, resolved_at: null, resolution: null };
      return;
    }
    case 'incident_resolved': {
      const inc = s.incidents[e.payload.incident_id];
      if (inc) { inc.resolved_at = at; inc.resolution = e.payload.resolution; }
      return;
    }
    case 'practice_setup_minutes_recorded':
      s.practiceSetupMinutes = e.payload.minutes;
      return;
    // Audit-only events: no entity state changes; metrics read them from the log.
    case 'dropout_recorded': case 'demo_session_reset': case 'checkin_item_skipped': case 'burden_cap_deferred': case 'free_text_routed':
    case 'help_requested': case 'emergency_instruction_shown': case 'rule_fired': case 'false_reassurance_reported': case 'screen_offered':
    case 'screen_skipped': case 'critical_item_hit': case 'sharing_reasked': case 'referral_reopened_for_plan': case 'initial_contact_confirmed':
    case 'barrier_item_created': case 'config_changed':
      return;
  }
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

function byEpisode<T extends { episode_id: Id | null }>(rows: readonly T[]): Map<Id, T[]> {
  const m = new Map<Id, T[]>();
  for (const r of rows) {
    if (r.episode_id === null) continue;
    const list = m.get(r.episode_id);
    if (list) list.push(r); else m.set(r.episode_id, [r]);
  }
  return m;
}

function derived(type: DerivedEvent['type'], occurred_at: ISO, episode_id: Id | null, patient_id: Id | null, related_id: Id | null, attributes: DerivedEvent['attributes'] = {}): DerivedEvent {
  return { type, occurred_at, episode_id, patient_id, related_id, attributes };
}

export function project(events: readonly AnyEvent[], clock: ISO, config: AppConfig, content: ContentIndex): State {
  const d: Draft = { state: emptyState(clock), checkinExtra: new Map(), episodeExtra: new Map(), queueActions: new Map(), stored: [], outreach: [], lastAi: new Map(), deadlines: new Map() };
  const T = toMs(clock);
  for (const e of events) {
    if (toMs(e.occurred_at) > T) continue;
    apply(d, e, config, content);
    d.state.eventCount += 1;
  }
  const s = d.state;
  const tz = config.practice.timezone;
  const cadence = config.cadence;
  const queueDefs = new Map<QueueKey, QueueDef>(config.queues.map((q) => [q.key, q]));
  const unreachedDef = queueDefs.get('unreached');
  const derivedEvents: DerivedEvent[] = [];
  const notifications: Notification[] = [];

  // ---- stored queue items (timers, actions) ------------------------------
  const storedItems: QueueItem[] = [];
  for (const q of d.stored) {
    const a = d.queueActions.get(q.id);
    const def = queueDefs.get(q.queue_key);
    const timers = queueTimersFor({
      created_at: a?.reopened_at ?? q.created_at, acknowledged_at: a?.acknowledged_at ?? null, resolved_at: a?.resolved_at ?? null,
      open_clinical_flag: q.open_clinical_flag, ack_deadline_at: a?.reopened_at ? null : d.deadlines.get(q.id) ?? null,
    }, def, config.coverage, tz, clock);
    storedItems.push({
      id: q.id, queue_key: q.queue_key, episode_id: q.episode_id, patient_id: q.patient_id, trigger_type: q.trigger_type, trigger_ref: q.trigger_ref, note: q.note,
      created_at: q.created_at, owner_role: def?.owner_role ?? 'coordinator', owner_user_id: a?.acknowledged_by ?? def?.owner_user_id ?? null,
      acknowledged_at: a?.acknowledged_at ?? null, acknowledged_by: a?.acknowledged_by ?? null, escalated_at: timers.escalated_at, unowned_at: timers.unowned_at,
      ack_target_at: timers.ack_target_at, backup_target_at: timers.backup_target_at, resolution_target_at: timers.resolution_target_at,
      resolved_at: a?.resolved_at ?? null, resolved_by: a?.resolved_by ?? null, outcome: a?.outcome ?? null, state: timers.state, open_clinical_flag: q.open_clinical_flag,
      rating: a?.rating ?? null, derived: false, minutes_to_ack: timers.minutes_to_ack,
    });
  }
  const storedByEp = byEpisode(storedItems);
  const outreachByItem = new Map<Id, OutreachRec[]>();
  for (const o of d.outreach) { const l = outreachByItem.get(o.queue_item_id); if (l) l.push(o); else outreachByItem.set(o.queue_item_id, [o]); }
  const outreachByEp = byEpisode(d.outreach);
  const firstOutreachAt = (id: Id): ISO | null => outreachByItem.get(id)?.[0]?.at ?? null;

  const checkinsByEp = byEpisode(Object.values(s.checkins));
  const contactsByEp = byEpisode(Object.values(s.contacts));
  const screensByEp = byEpisode(Object.values(s.screens));
  const referralsByEp = byEpisode(Object.values(s.referrals));
  const statusesByEp = byEpisode(s.sensitiveStatuses);
  const carePlanByEp = byEpisode(Object.values(s.carePlanItems));
  const templatesBySet = new Map<string, AppConfig['checkins'][string]>();
  for (const t of Object.values(config.checkins).sort((a, b) => a.key.localeCompare(b.key))) if (!templatesBySet.has(t.set)) templatesBySet.set(t.set, t);

  const derivedItems: QueueItem[] = [];

  for (const ep of Object.values(s.episodes)) {
    const patient = s.patients[ep.patient_id];
    const prefs = patient?.preferences ?? EMPTY_PREFS;
    const extra = d.episodeExtra.get(ep.id) ?? { pauses: [], closed_at: ep.closed_at };
    const epFacts: EpisodeFacts = { pauses: extra.pauses, closed_at: extra.closed_at };
    const statuses = statusesByEp.get(ep.id) ?? [];
    const activeNow = statuses.filter((st) => st.active);
    const suppressed = suppressionFor(activeNow);
    const setNow = checkinSetFor(activeNow);
    const contacts = contactsByEp.get(ep.id) ?? [];
    const screens = screensByEp.get(ep.id) ?? [];
    const referrals = referralsByEp.get(ep.id) ?? [];
    const stored = storedByEp.get(ep.id) ?? [];
    const outreach = outreachByEp.get(ep.id) ?? [];

    // Episode status (FR-39, FR-13a)
    if (ep.closed_at === null) {
      const pause = activePauseAt(extra.pauses, clock);
      ep.paused = pause !== null;
      ep.paused_until = pause?.until ?? null;
      ep.status = pause ? 'paused' : 'active';
    } else {
      ep.paused = false; ep.paused_until = null;
    }

    // Check-ins: subtype set re-mapping (FR-55), then states (FR-08)
    const checkins = (checkinsByEp.get(ep.id) ?? []).sort((a, b) => toMs(a.scheduled_at) - toMs(b.scheduled_at) || a.id.localeCompare(b.id));
    const statusFrom = activeNow.length ? Math.min(...activeNow.map((st) => toMs(st.set_at))) : null;
    for (const c of checkins) {
      if (statusFrom !== null && setNow !== 'standard' && c.set !== setNow && c.submitted_at === null && toMs(c.scheduled_at) >= statusFrom) {
        const t = templatesBySet.get(setNow);
        if (t) { c.set = setNow; c.template_key = t.key; c.template_version = t.version; }
      }
      const x = d.checkinExtra.get(c.id) ?? { complete: false, skipped_at: null, not_applicable: false };
      const facts: CheckinFacts = { scheduled_at: c.scheduled_at, window_end_at: c.window_end_at, not_applicable: x.not_applicable, opened_at: c.opened_at, submitted_at: c.submitted_at, complete: x.complete, skipped_at: x.skipped_at };
      c.state = checkinStateAt(facts, epFacts, clock);
      if (c.state === 'unopened') derivedEvents.push(derived('checkin_unopened', c.window_end_at, ep.id, ep.patient_id, c.id, { template_key: c.template_key, day_number: c.day_number }));
    }

    // Human-contact signals (FR-13 resets, reminder resumption)
    const resets: ISO[] = [...contacts.map((c) => c.occurred_at), ...outreach.filter((o) => o.outcome === 'reached').map((o) => o.at)];
    const signals = [...contacts.map((c) => ({ at: c.occurred_at, notReached: false })), ...outreach.map((o) => ({ at: o.at, notReached: o.outcome === 'not_reached' }))]
      .sort((a, b) => toMs(a.at) - toMs(b.at));
    const lastOutreachNotReachedBefore = (at: ISO): boolean => {
      let last: { at: ISO; notReached: boolean } | null = null;
      for (const sg of signals) if (toMs(sg.at) < toMs(at)) last = sg;
      return last !== null && last.notReached;
    };

    // Unreached (FR-13) and the day-21 sweep (FR-37). Two passes: the sweep only creates an item when no
    // Unreached item is open at the sweep instant, and a count-based item is not created while the
    // sweep item is still open (exactly one item per episode at a time).
    const resolvedAtOf = (id: Id): ISO | null => {
      const a = d.queueActions.get(id);
      const candidates = [firstOutreachAt(id), a?.resolved_at ?? null].filter((x): x is ISO => x !== null);
      return candidates.length ? candidates.sort((p, q) => toMs(p) - toMs(q))[0] : null;
    };
    const openAt = (created_at: ISO, id: Id, at: ISO): boolean => {
      const r = resolvedAtOf(id);
      return toMs(created_at) <= toMs(at) && (r === null || toMs(r) > toMs(at));
    };
    const storedOpenAt = (at: ISO): boolean => stored.some((q) => q.queue_key === 'unreached' && toMs(q.created_at) <= toMs(at) && (q.resolved_at === null || toMs(q.resolved_at) > toMs(at)));
    const walkInput = checkins.map((c) => ({ id: c.id, scheduled_at: c.scheduled_at, window_end_at: c.window_end_at, state: c.state }));
    const firstPass = unreachedItemsFor(ep.id, walkInput, extra.pauses, resets, cadence.unreached_after_consecutive_unopened, firstOutreachAt, storedOpenAt);
    const sweep = day21SweepFor({
      episode_id: ep.id, delivery_date: ep.delivery_date, enrolled_at: ep.enrolled_at, closed_at: ep.closed_at, contacts: contacts.map((c) => c.occurred_at),
      target_day: cadence.initial_contact_target_day, tz, unreachedOpenAt: (at) => storedOpenAt(at) || firstPass.some((u) => openAt(u.created_at, u.id, at)),
      pausedAt: (at) => isPausedAt(extra.pauses, at),
    }, clock);
    if (sweep) derivedEvents.push(derived('no_contact_by_day_21', sweep.sweep_at, ep.id, ep.patient_id, sweep.item?.id ?? null, { item_created: sweep.item !== null }));
    const sweepItem = sweep?.item ?? null;
    const unreached: DerivedUnreached[] = sweepItem
      ? unreachedItemsFor(ep.id, walkInput, extra.pauses, resets, cadence.unreached_after_consecutive_unopened, firstOutreachAt, (at) => storedOpenAt(at) || openAt(sweepItem.created_at, sweepItem.id, at))
      : firstPass;
    const unreachedOpenAt = (at: ISO): boolean =>
      storedOpenAt(at) || unreached.some((u) => openAt(u.created_at, u.id, at)) || (sweepItem !== null && openAt(sweepItem.created_at, sweepItem.id, at));

    const clinicalInput = { queueItems: stored, screens, referrals, statuses };
    const materialize = (u: DerivedUnreached, trigger_type: TriggerType, note: string): void => {
      const a = d.queueActions.get(u.id);
      const first = outreachByItem.get(u.id)?.[0];
      const resolved_at = resolvedAtOf(u.id);
      const flag = openClinicalFlagAt(u.created_at, clinicalInput);
      const timers = queueTimersFor({ created_at: u.created_at, acknowledged_at: a?.acknowledged_at ?? null, resolved_at, open_clinical_flag: flag }, unreachedDef, config.coverage, tz, clock);
      const item: QueueItem = {
        id: u.id, queue_key: 'unreached', episode_id: ep.id, patient_id: ep.patient_id, trigger_type, trigger_ref: u.checkin_id || null, note,
        created_at: u.created_at, owner_role: unreachedDef?.owner_role ?? 'coordinator', owner_user_id: a?.acknowledged_by ?? unreachedDef?.owner_user_id ?? null,
        acknowledged_at: a?.acknowledged_at ?? null, acknowledged_by: a?.acknowledged_by ?? null, escalated_at: timers.escalated_at, unowned_at: timers.unowned_at,
        ack_target_at: timers.ack_target_at, backup_target_at: timers.backup_target_at, resolution_target_at: timers.resolution_target_at,
        resolved_at, resolved_by: a?.resolved_by ?? null, outcome: first?.outcome ?? a?.outcome ?? null, state: timers.state, open_clinical_flag: flag,
        rating: a?.rating ?? null, derived: true, minutes_to_ack: timers.minutes_to_ack,
      };
      derivedItems.push(item);
      derivedEvents.push(derived('unreached_item_created', u.created_at, ep.id, ep.patient_id, u.id, { open_clinical_flag: flag, trigger: trigger_type, checkin_id: u.checkin_id || null }));
    };
    for (const u of unreached) materialize(u, 'unreached', `${cadence.unreached_after_consecutive_unopened} consecutive check-ins unopened or skipped; outreach needed`);
    if (sweep?.item) materialize(sweep.item, 'day21_sweep', `no human contact logged by day ${cadence.initial_contact_target_day}; outreach needed`);

    // Reminders (FR-14) and the outbox (FR-66–FR-68)
    const rc = { reminder_offset_hours: cadence.reminder_offset_hours, safe_to_message: prefs.safe_to_message, unreachedOpenAt, lastOutreachNotReachedBefore, reducedContact: activeNow.length > 0 && prefs.contact_frequency === 'reduced' };
    for (const c of checkins) {
      const x = d.checkinExtra.get(c.id) ?? { complete: false, skipped_at: null, not_applicable: false };
      const facts: CheckinFacts = { scheduled_at: c.scheduled_at, window_end_at: c.window_end_at, not_applicable: x.not_applicable, opened_at: c.opened_at, submitted_at: c.submitted_at, complete: x.complete, skipped_at: x.skipped_at };
      const r: ReminderResult | null = reminderFor(facts, c.state, epFacts, rc, clock);
      c.reminder_at = r?.at ?? null;
      c.reminder_suppressed_reason = r?.suppressed_reason ?? null;
      const n = checkinNotification(c, c.state, epFacts, prefs, clock);
      if (n) {
        notifications.push(n);
        if (toMs(c.scheduled_at) <= T) {
          if (n.simulated_state === 'suppressed') derivedEvents.push(derived('notification_suppressed', c.scheduled_at, ep.id, ep.patient_id, c.id, { kind: 'checkin', reason: n.suppressed_reason, channel: n.channel }));
          else derivedEvents.push(derived('notification_scheduled', c.scheduled_at, ep.id, ep.patient_id, c.id, { kind: 'checkin', channel: n.channel }));
        }
      }
      const rn = reminderNotification(c, r);
      if (rn) {
        notifications.push(rn);
        if (r && toMs(r.at) <= T) {
          if (r.sent) derivedEvents.push(derived('reminder_sent', r.at, ep.id, ep.patient_id, c.id, { channel: rn.channel }));
          else derivedEvents.push(derived('notification_suppressed', r.at, ep.id, ep.patient_id, c.id, { kind: 'reminder', reason: r.suppressed_reason, channel: rn.channel }));
        }
      }
    }

    // Initial contact (FR-37) and indicated (FR-39)
    const ic = initialContactFor(contacts, cadence.initial_contact_target_day);
    ep.initial_contact_day = ic.day;
    ep.initial_contact_met_target = ic.met;
    ep.indicated = isIndicated({ screens, referrals, statuses });

    // Care-plan suppression (FR-54, FR-55, FR-59) and care-plan notifications
    const counts = new Map<ContentTag, number>();
    for (const item of carePlanByEp.get(ep.id) ?? []) {
      const hit = item.tags.filter((t) => suppressed.has(t));
      if (hit.length && item.state === 'open') { item.state = 'suppressed'; for (const t of hit) counts.set(t, (counts.get(t) ?? 0) + 1); }
      const n = carePlanNotification(item, suppressed, epFacts, prefs, clock);
      if (n) notifications.push(n);
    }
    if (statusFrom !== null) {
      const from = new Date(statusFrom).toISOString();
      for (const [tag, count] of counts) derivedEvents.push(derived('content_suppressed', from, ep.id, ep.patient_id, null, { tag, count, entity: 'care_plan_item' }));
    }
  }

  // ---- queue items into state, escalation events --------------------------
  for (const item of [...storedItems, ...derivedItems]) {
    s.queueItems[item.id] = item;
    if (item.escalated_at !== null) derivedEvents.push(derived('escalation_escalated', item.escalated_at, item.episode_id, item.patient_id, item.id, { queue_key: item.queue_key, open_clinical_flag: item.open_clinical_flag }));
    if (item.unowned_at !== null) derivedEvents.push(derived('escalation_unacknowledged_timeout', item.unowned_at, item.episode_id, item.patient_id, item.id, { queue_key: item.queue_key, patient_notified: true, open_clinical_flag: item.open_clinical_flag }));
  }

  s.derivedEvents = derivedEvents
    .map((ev, i) => ({ ev, i }))
    .sort((a, b) => toMs(a.ev.occurred_at) - toMs(b.ev.occurred_at) || a.i - b.i)
    .map((x) => x.ev);
  s.notifications = notifications.sort((a, b) => toMs(a.scheduled_at) - toMs(b.scheduled_at) || a.id.localeCompare(b.id));
  return s;
}

// ---------------------------------------------------------------------------
// Small read helpers used by services and the UI
// ---------------------------------------------------------------------------

export function activeEpisodeFor(state: State, patient_id: Id): Episode | undefined {
  return Object.values(state.episodes).find((e) => e.patient_id === patient_id && e.closed_at === null);
}

export function activeStatusesFor(state: State, episode_id: Id, at: ISO): SensitiveStatus[] {
  return activeStatusesAt(state.sensitiveStatuses.filter((s) => s.episode_id === episode_id), at);
}

/** FR-54/FR-55: the content tags suppressed for an episode at an instant (union over the statuses in force). */
export function suppressedTagsFor(state: State, episode_id: Id, at: ISO = state.clock): Set<ContentTag> {
  return suppressionFor(activeStatusesFor(state, episode_id, at));
}

export function checkinsForEpisode(state: State, episode_id: Id): Checkin[] {
  return Object.values(state.checkins).filter((c) => c.episode_id === episode_id).sort((a, b) => toMs(a.scheduled_at) - toMs(b.scheduled_at) || a.id.localeCompare(b.id));
}

export function screensForEpisode(state: State, episode_id: Id): ScreenResult[] {
  return Object.values(state.screens).filter((x) => x.episode_id === episode_id).sort((a, b) => toMs(a.administered_at) - toMs(b.administered_at));
}

export function openQueueItemsFor(state: State, episode_id: Id, keys?: readonly QueueKey[]): QueueItem[] {
  return Object.values(state.queueItems).filter((q) => q.episode_id === episode_id && q.state !== 'resolved' && (!keys || keys.includes(q.queue_key)));
}

export function roleOfActor(actor: { role?: Role; type: string }): Role {
  if (actor.role) return actor.role;
  if (actor.type === 'patient') return 'patient';
  if (actor.type === 'admin' || actor.type === 'seed' || actor.type === 'system') return 'admin';
  if (actor.type === 'partner') return 'referral_partner';
  return 'coordinator';
}
