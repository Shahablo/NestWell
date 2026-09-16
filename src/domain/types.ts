/**
 * NestWell prototype — domain contract.
 *
 * Everything in the app is an event. The event log is the only source of truth;
 * entity state is a projection of the log up to the demo clock (see projection.ts),
 * and timer-driven transitions (escalation, UNOWNED, unopened check-ins, reminders,
 * Unreached, the day-21 sweep) are derived from the clock rather than scheduled.
 * Moving the clock re-derives everything; nothing runs in the background.
 *
 * Requirement IDs (FR-xx, AI-xx, SR-xx, NFR-xx) refer to docs/requirements.md.
 */

export type Id = string;
/** ISO-8601 UTC instant, e.g. "2026-04-03T14:00:00.000Z". */
export type ISO = string;

// ---------------------------------------------------------------------------
// Roles and actors
// ---------------------------------------------------------------------------

export type Role = 'patient' | 'coordinator' | 'clinician' | 'budget_owner' | 'referral_partner' | 'admin';
export type Permission = 'config_approver' | 'content_approver' | 'on_call';
export type ActorType = 'patient' | 'staff' | 'partner' | 'admin' | 'system' | 'seed';

export interface Actor {
  type: ActorType;
  id?: Id;
  role?: Role;
}

export interface StaffUser {
  id: Id;
  role: Exclude<Role, 'patient' | 'admin'>;
  permissions: Permission[];
  display_name: string;
  /** Who employs this person. In the prototype every queue owner is a practice employee (A16). */
  employer: 'practice' | 'nestwell' | 'partner';
}

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export type Locale = 'en' | 'es';
export type SharingCategory = 'clinician_only' | 'clinician_and_coordinator' | 'clinician_coordinator_partner' | 'nobody_yet';
export type InsuranceType = 'commercial' | 'medicaid' | 'uninsured' | 'other';
export type AccessBarrier = 'transport' | 'childcare' | 'phone_data' | 'interpreter' | 'cost';
export type EligibilityStatus = 'enrolled' | 'declined' | 'not_offered';
export type EnrollmentPoint = 'late_pregnancy' | 'before_discharge' | 'after_delivery';
export type DeliveryOutcome = 'live_birth' | 'stillbirth' | 'pregnancy_loss' | 'neonatal_loss';
export type EpisodeStatus = 'active' | 'paused' | 'completed' | 'closed_early';
export type CloseReason = 'patient_withdrew' | 'unreachable_after_attempts' | 'moved_or_transferred' | 'deceased' | 'other';
export type MentalHealthDestination = 'confirmed' | 'none_identified' | 'not_indicated';
export type SensitiveSubtype = 'pregnancy_loss' | 'stillbirth' | 'neonatal_loss' | 'nicu' | 'trauma';
export type ContentTag =
  | 'infant' | 'feeding' | 'milestone' | 'celebration' | 'newborn_visit' | 'pregnancy_progress' | 'birth_story'
  | 'recovery' | 'mood' | 'symptoms' | 'barriers' | 'general';
export type CheckinSet = 'standard' | 'loss' | 'nicu' | 'trauma';
export type CheckinState = 'scheduled' | 'sent' | 'opened' | 'completed' | 'partial' | 'skipped' | 'unopened' | 'not_applicable' | 'paused';
export type QueueKey = 'urgent' | 'needs_review' | 'follow_through' | 'unreached' | 'sensitive_review' | 'summaries';
export type QueueItemState = 'open' | 'acknowledged' | 'escalated' | 'unowned' | 'resolved';
export type TriggerType =
  | 'rule' | 'critical_item' | 'help_now' | 'lexicon_match' | 'positive_screen' | 'coping_difficulty'
  | 'free_text' | 'therapy_intent' | 'referral_dead_end' | 'referral' | 'visit' | 'callback' | 'barrier'
  | 'unreached' | 'day21_sweep' | 'sensitive_status' | 'summary' | 'withdrawal' | 'screen_declined';
export type ReferralState =
  | 'created' | 'sent_to_partner' | 'appointment_scheduled' | 'appointment_completed' | 'appointment_missed'
  | 'no_capacity' | 'not_covered' | 'declined_by_patient' | 'closed';
export type VisitType = 'early_postpartum' | 'comprehensive' | 'other';
export type VisitState = 'scheduled' | 'completed' | 'missed' | 'rescheduled' | 'cancelled';
export type ContactType = 'phone_call' | 'in_person' | 'message' | 'enrollment' | 'video';
export type SummaryPeriod = 'week9' | 'week12' | 'on_demand';
export type SummaryState = 'draft' | 'reviewed' | 'delivered';
export type FreeTextField = 'checkin_free_text' | 'saved_question' | 'usefulness_comment' | 'sensitive_preferences';
export type HelpSource = 'patient' | 'lexicon_match' | 'ai_prefilter' | 'critical_item' | 'rule';
export type EscalationRating = 'appropriate' | 'unnecessary' | 'missed' | 'unsure';
export type AiFeature = 'reword' | 'summary_narrative' | 'question_organizer';
export type IncidentType = 'false_reassurance' | 'missed_escalation' | 'unowned_timeout' | 'discovery_session_distress' | 'data_handling' | 'other';
export type AssessmentOutcome = 'assessed_no_action' | 'referral' | 'follow_up_call' | 'treatment_started' | 'other';
export type OutreachOutcome = 'reached' | 'not_reached';
export type CheckinResponseType = 'single_tap' | 'multi_tap' | 'yes_no' | 'free_text_optional';
export type RuleTag =
  | 'urgent_candidate' | 'coping_difficulty' | 'coping_difficulty_mild'
  | 'barrier_transport' | 'barrier_childcare' | 'barrier_phone_data' | 'barrier_interpreter' | 'barrier_cost'
  | 'callback_requested' | 'none';

// ---------------------------------------------------------------------------
// Patient-side records
// ---------------------------------------------------------------------------

export interface Preferences {
  locale: Locale;
  formality: 'usted' | 'tu' | null;
  preferred_name: string | null;
  form_of_address: string | null;
  contact_windows: Array<'morning' | 'afternoon' | 'evening'>;
  /** FR-03 safety question. null = not yet answered. false disables all outbound bodies. */
  safe_to_message: boolean | null;
  baby_reference_permission: 'welcome' | 'no' | 'unset';
  baby_name: string | null;
  sharing_category: SharingCategory;
  /** FR-56 sensitive preferences dialog outcome. */
  contact_frequency: 'continue' | 'reduced' | 'not_for_now' | null;
}

export interface Patient {
  id: Id;
  /** SR-01: always true; the projection rejects anything else. */
  is_synthetic: true;
  is_adult: boolean;
  display_name: string;
  persona_key: string | null;
  insurance_type: InsuranceType;
  access_barriers: AccessBarrier[];
  preferences: Preferences;
  registered_at: ISO;
}

export interface Eligibility {
  patient_id: Id;
  status: EligibilityStatus;
  reason: string | null;
  recorded_at: ISO;
}

export interface Transition {
  primary_care: string | null;
  mental_health: MentalHealthDestination;
  open_items: string[];
  owner_role: Role | null;
  next_contact_date: ISO | null;
}

export interface Episode {
  id: Id;
  patient_id: Id;
  expected_date: ISO | null;
  delivery_date: ISO | null;
  delivery_outcome: DeliveryOutcome | null;
  enrollment_point: EnrollmentPoint;
  enrolled_at: ISO;
  enrolled_by: 'patient' | 'staff';
  acknowledged_at: ISO | null;
  acknowledgment_mode: 'standard' | 'demo_participant' | null;
  /** Derived at clock: paused if a pause is in force. */
  status: EpisodeStatus;
  paused_until: ISO | null; // null while paused indefinitely; undefined semantics: see paused flag
  paused: boolean;
  close_reason: CloseReason | null;
  closed_at: ISO | null;
  transition: Transition | null;
  /** FR-37: day number of the first logged human contact, or null. */
  initial_contact_day: number | null;
  initial_contact_met_target: boolean | null;
  /** FR-39: an "indicated" episode has any positive screen, critical item, referral, or sensitive status. */
  indicated: boolean;
}

export interface CheckinResponse {
  question_key: string;
  value: string | string[] | null;
  free_text: string | null;
  /** FR-17: never the matched text — only the lexicon version and term class. */
  lexicon_match: { version: string; term_class: string } | null;
  queue_item_id: Id | null;
}

export interface Checkin {
  id: Id;
  episode_id: Id;
  template_key: string;
  template_version: string;
  set: CheckinSet;
  day_number: number;
  scheduled_at: ISO;
  window_end_at: ISO;
  /** Derived at the clock. */
  state: CheckinState;
  opened_at: ISO | null;
  submitted_at: ISO | null;
  responses: CheckinResponse[];
  /** Derived: when the single reminder goes (or would have gone), and why it was suppressed if it was. */
  reminder_at: ISO | null;
  reminder_suppressed_reason: string | null;
  /** FR-10 not-now reschedule, at most once. */
  rescheduled_once: boolean;
}

export interface ScreenResult {
  id: Id;
  episode_id: Id;
  patient_id: Id;
  instrument_key: string;
  instrument_version: string;
  checkin_id: Id | null;
  item_responses: number[];
  score: number;
  positive: boolean;
  critical_item_hit: boolean;
  administered_at: ISO;
  /** Roles the result was shared with at the time, per FR-06. */
  shared_with: Role[];
  declined: boolean;
  framing: 'standard' | 'loss_pathway';
}

export interface QueueItem {
  id: Id;
  queue_key: QueueKey;
  episode_id: Id;
  patient_id: Id;
  trigger_type: TriggerType;
  trigger_ref: Id | null;
  note: string | null;
  created_at: ISO;
  owner_role: Role;
  owner_user_id: Id | null;
  acknowledged_at: ISO | null;
  acknowledged_by: Id | null;
  /** Derived from targets and the clock (FR-25). */
  escalated_at: ISO | null;
  unowned_at: ISO | null;
  ack_target_at: ISO;
  backup_target_at: ISO;
  resolution_target_at: ISO | null;
  resolved_at: ISO | null;
  resolved_by: Id | null;
  outcome: string | null;
  state: QueueItemState;
  /** FR-13: "unreached with open clinical item" and similar sort-first flags. */
  open_clinical_flag: boolean;
  rating: EscalationRating | null;
  /** True for items the projection derives (Unreached, day-21 sweep) rather than stores. */
  derived: boolean;
  /** Derived: minutes from creation to acknowledgment, in demo-clock minutes. */
  minutes_to_ack: number | null;
}

export interface Assessment {
  id: Id;
  episode_id: Id;
  screen_result_id: Id | null;
  trigger_ref: Id | null;
  clinician_id: Id;
  outcome: AssessmentOutcome;
  note: string | null;
  recorded_at: ISO;
}

export interface Referral {
  id: Id;
  episode_id: Id;
  patient_id: Id;
  partner_id: Id;
  screen_result_id: Id | null;
  reason: string;
  state: ReferralState;
  coverage_status: 'unknown' | 'covered' | 'not_covered';
  consent_basis: string | null;
  consent_version: string | null;
  created_at: ISO;
  sent_at: ISO | null;
  scheduled_for: ISO | null;
  completed_at: ISO | null;
  closed_at: ISO | null;
  history: Array<{ state: ReferralState; at: ISO; note: string | null }>;
}

export interface Visit {
  id: Id;
  patient_id: Id;
  episode_id: Id | null;
  type: VisitType;
  scheduled_for: ISO;
  state: VisitState;
  completed_at: ISO | null;
  purpose: string;
  bring: string[];
}

export interface Contact {
  id: Id;
  episode_id: Id;
  type: ContactType;
  occurred_at: ISO;
  staff_user_id: Id;
  outcome: string;
  note: string | null;
  day_number: number;
}

export interface Callback {
  id: Id;
  episode_id: Id;
  queue_item_id: Id;
  requested_at: ISO;
  preferred_window: string | null;
  occurred: boolean | null;
  occurred_at: ISO | null;
  outcome: string | null;
}

export interface StaffTime {
  id: Id;
  user_id: Id;
  episode_id: Id;
  source_type: 'contact' | 'queue_item' | 'callback' | 'assessment' | 'outreach' | 'setup' | 'other';
  source_id: Id;
  minutes: number;
  recorded_at: ISO;
}

export interface CarePlanItem {
  id: Id;
  episode_id: Id;
  key: string;
  version: string;
  title_content_id: string;
  owner_role: Role;
  due_at: ISO | null;
  tags: ContentTag[];
  state: 'open' | 'completed' | 'suppressed';
  completed_at: ISO | null;
}

export interface SavedQuestion {
  id: Id;
  episode_id: Id;
  text: string;
  order: number;
  group_title: string | null;
  queue_item_id: Id;
  lexicon_match: { version: string; term_class: string } | null;
  created_at: ISO;
}

export interface SummaryStructured {
  episode_week: number;
  screens: Array<{ instrument: string; administered_at: ISO; score: number | null; positive: boolean | null; withheld: boolean }>;
  intervals: { screen_to_assessment_hours: number | null; screen_to_connection_hours: number | null };
  escalations: Array<{ queue_key: QueueKey; created_at: ISO; state: QueueItemState; outcome: string | null }>;
  referrals: Array<{ state: ReferralState; partner: string; created_at: ISO }>;
  visits: Array<{ type: VisitType; state: VisitState; scheduled_for: ISO }>;
  unresolved: string[];
  care_plan: Array<{ title: string; state: string }>;
  saved_questions: string[];
}

export interface Summary {
  id: Id;
  episode_id: Id;
  period: SummaryPeriod;
  structured: SummaryStructured;
  narrative: string;
  ai_draft: boolean;
  state: SummaryState;
  reviewer_id: Id | null;
  reviewed_at: ISO | null;
  withheld_notices: string[];
  created_at: ISO;
}

export interface Notification {
  id: Id;
  episode_id: Id;
  channel: 'sms' | 'email';
  /** Always a neutral approved item (FR-66). */
  content_id: string;
  scheduled_at: ISO;
  kind: 'checkin' | 'reminder' | 'care_plan' | 'callback' | 'transition';
  simulated_state: 'scheduled' | 'sent' | 'suppressed';
  suppressed_reason: string | null;
}

export interface SensitiveStatus {
  patient_id: Id;
  episode_id: Id;
  subtype: SensitiveSubtype;
  active: boolean;
  set_by: 'patient' | 'coordinator' | 'clinician';
  set_at: ISO;
  lifted_by: string | null;
  lifted_at: ISO | null;
  lift_reason: string | null;
  confirmed_by_staff: boolean;
}

/** FR-03a: every staff view of screening responses or free text. */
export interface ReadRecord {
  patient_id: Id;
  episode_id: Id;
  field: 'screen_items' | 'free_text';
  role: Role;
  staff_user_id: Id;
  at: ISO;
}

export interface Incident {
  id: Id;
  type: IncidentType;
  related_entity: string | null;
  related_id: Id | null;
  reported_by: string;
  description: string;
  occurred_at: ISO;
  resolved_at: ISO | null;
  resolution: string | null;
}

export interface AiInteraction {
  id: Id;
  feature: AiFeature;
  episode_id: Id | null;
  content_ids: string[];
  prompt_hash: string;
  content_manifest_hash: string;
  model_id: string | null;
  prefilter_result: 'pass' | 'blocked' | 'not_run';
  postfilter_result: 'pass' | 'blocked' | 'not_run';
  fallback_used: boolean;
  blocked_reason: string | null;
  occurred_at: ISO;
}

export interface UsefulnessRating {
  episode_id: Id;
  week: 6 | 12;
  rating: number;
  comment_queue_item_id: Id | null;
  recorded_at: ISO;
}

export interface MissedEscalation {
  id: Id;
  episode_id: Id;
  related_entity: string;
  related_id: Id;
  flagged_by: Id;
  reason: string;
  occurred_at: ISO;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export interface LexiconMatch {
  version: string;
  term_class: string;
}

export interface EventPayloads {
  // Registration, eligibility and enrollment
  patient_registered: { patient: Patient };
  eligibility_changed: { patient_id: Id; status: EligibilityStatus; reason: string | null };
  enrolled: {
    episode_id: Id; patient_id: Id; enrollment_point: EnrollmentPoint;
    expected_date: ISO | null; delivery_date: ISO | null; delivery_outcome: DeliveryOutcome | null;
    performed_by: 'patient' | 'staff'; staff_user_id: Id | null;
  };
  delivery_recorded: { episode_id: Id; delivery_date: ISO; outcome: DeliveryOutcome };
  acknowledged: { episode_id: Id; mode: 'standard' | 'demo_participant'; free_text_scan: boolean; critical_item_overrides_sharing: boolean };
  preferences_changed: { patient_id: Id; field: keyof Preferences; value: Preferences[keyof Preferences] };
  checkins_paused: { episode_id: Id; actor: 'patient' | 'staff'; until: ISO | null; duration_label: string };
  checkins_resumed: { episode_id: Id; actor: 'patient' | 'staff' };
  episode_closed: {
    episode_id: Id; status: 'completed' | 'closed_early'; close_reason: CloseReason | null;
    transition: Transition | null;
  };
  dropout_recorded: { episode_id: Id; close_reason: CloseReason };
  transition_completed: { episode_id: Id; transition: Transition };
  demo_session_reset: { branch: string };

  // Check-ins
  checkin_scheduled: {
    checkin_id: Id; episode_id: Id; template_key: string; template_version: string; set: CheckinSet;
    day_number: number; scheduled_at: ISO; window_end_at: ISO;
  };
  checkin_not_applicable: { checkin_id: Id; episode_id: Id };
  checkin_opened: { checkin_id: Id; episode_id: Id };
  checkin_submitted: {
    checkin_id: Id; episode_id: Id; responses: CheckinResponse[]; complete: boolean; free_text_entered: boolean;
  };
  checkin_item_skipped: { checkin_id: Id; episode_id: Id; question_key: string };
  checkin_skipped: { checkin_id: Id; episode_id: Id };
  checkin_not_now: { checkin_id: Id; episode_id: Id; rescheduled_to: ISO };
  outreach_logged: {
    queue_item_id: Id; episode_id: Id; outcome: OutreachOutcome; note: string | null;
    barrier: AccessBarrier | null; staff_user_id: Id; contact_id: Id | null;
  };
  burden_cap_deferred: { episode_id: Id; checkin_id: Id; item_key: string };
  free_text_routed: {
    episode_id: Id; field: FreeTextField; queue_key: QueueKey; queue_item_id: Id; lexicon_match: LexiconMatch | null;
  };

  // Help and escalation
  help_requested: { episode_id: Id; source: HelpSource; lexicon_version: string | null; queue_item_id: Id | null };
  emergency_instruction_shown: { episode_id: Id | null; layout: 'full_screen' | 'inline'; trigger: string };
  rule_fired: {
    episode_id: Id; rule_key: string; rule_version: string; trigger: string; action: string;
    checkin_id: Id | null; queue_item_id: Id | null;
  };
  queue_item_created: {
    queue_item_id: Id; queue_key: QueueKey; episode_id: Id; patient_id: Id; trigger_type: TriggerType;
    trigger_ref: Id | null; note: string | null; open_clinical_flag: boolean;
  };
  queue_item_acknowledged: { queue_item_id: Id; staff_user_id: Id; role: Role };
  queue_item_resolved: {
    queue_item_id: Id; staff_user_id: Id; outcome: string; note: string | null; contact_id: Id | null;
  };
  queue_item_reopened: { queue_item_id: Id; reason: string };
  escalation_rated: { queue_item_id: Id; clinician_id: Id; rating: EscalationRating };
  missed_escalation_recorded: {
    missed_escalation_id: Id; episode_id: Id; related_entity: string; related_id: Id; flagged_by: Id; reason: string;
  };
  false_reassurance_reported: {
    episode_id: Id | null; source: 'content' | 'ai'; content_id: string | null; ai_interaction_id: Id | null;
    reported_by: string; note: string | null;
  };
  callback_requested: { callback_id: Id; episode_id: Id; queue_item_id: Id; preferred_window: string | null };
  callback_completed: {
    callback_id: Id; episode_id: Id; queue_item_id: Id; occurred: boolean; outcome: string; contact_id: Id | null;
  };

  // Screening and sharing
  screen_offered: { episode_id: Id; checkin_id: Id | null; instrument_key: string; reason: 'scheduled' | 'coping_trigger' | 'loss_pathway' };
  screen_administered: {
    screen_result_id: Id; episode_id: Id; patient_id: Id; instrument_key: string; instrument_version: string;
    checkin_id: Id | null; item_responses: number[]; score: number; positive: boolean; critical_item_hit: boolean;
    shared_with: Role[]; framing: 'standard' | 'loss_pathway';
  };
  screen_skipped: { episode_id: Id; instrument_key: string; checkin_id: Id | null };
  screen_declined: { episode_id: Id; instrument_key: string; queue_item_id: Id | null };
  critical_item_hit: { episode_id: Id; screen_result_id: Id; shared: boolean; queue_item_id: Id | null };
  sharing_changed: { patient_id: Id; category: SharingCategory };
  sharing_reasked: { patient_id: Id; count: number };
  screen_responses_read: {
    patient_id: Id; episode_id: Id; screen_result_id: Id | null; field: 'screen_items' | 'free_text'; role: Role; staff_user_id: Id;
  };
  assessment_recorded: {
    assessment_id: Id; episode_id: Id; screen_result_id: Id | null; trigger_ref: Id | null; clinician_id: Id;
    outcome: AssessmentOutcome; note: string | null;
  };

  // Follow-through
  referral_created: {
    referral_id: Id; episode_id: Id; patient_id: Id; partner_id: Id; screen_result_id: Id | null; reason: string;
  };
  referral_state_changed: {
    referral_id: Id; episode_id: Id; state: ReferralState; note: string | null;
    consent_basis: string | null; consent_version: string | null; scheduled_for: ISO | null; completed_at: ISO | null;
    coverage_status: 'unknown' | 'covered' | 'not_covered' | null;
  };
  referral_reopened_for_plan: { referral_id: Id; episode_id: Id; queue_item_id: Id };
  contact_logged: {
    contact_id: Id; episode_id: Id; type: ContactType; staff_user_id: Id; outcome: string; note: string | null; day_number: number;
  };
  initial_contact_confirmed: { episode_id: Id; contact_id: Id; day_number: number; met_target: boolean };
  visit_scheduled: {
    visit_id: Id; patient_id: Id; episode_id: Id | null; type: VisitType; scheduled_for: ISO; purpose: string; bring: string[];
  };
  visit_state_changed: { visit_id: Id; state: VisitState; completed_at: ISO | null; rescheduled_to: ISO | null };
  barrier_item_created: { episode_id: Id; queue_item_id: Id; barrier: AccessBarrier };
  care_plan_instantiated: { episode_id: Id; items: Array<Omit<CarePlanItem, 'state' | 'completed_at'>> };
  care_plan_item_completed: { episode_id: Id; item_id: Id };
  staff_time_logged: {
    staff_time_id: Id; episode_id: Id; user_id: Id; source_type: StaffTime['source_type']; source_id: Id; minutes: number;
  };

  // Summaries, questions and notifications
  summary_drafted: { summary_id: Id; episode_id: Id; period: SummaryPeriod; structured: SummaryStructured; narrative: string; ai_draft: boolean; withheld_notices: string[] };
  summary_state_changed: { summary_id: Id; state: SummaryState; reviewer_id: Id | null };
  saved_question_added: { question_id: Id; episode_id: Id; text: string; queue_item_id: Id; lexicon_match: LexiconMatch | null };
  saved_questions_grouped: { episode_id: Id; groups: Array<{ title: string; question_ids: Id[] }>; ai_interaction_id: Id | null };
  usefulness_rated: { episode_id: Id; week: 6 | 12; rating: number; comment_queue_item_id: Id | null };

  // Sensitive paths
  sensitive_status_set: { patient_id: Id; episode_id: Id; subtype: SensitiveSubtype; set_by: 'patient' | 'coordinator' | 'clinician'; queue_item_id: Id | null };
  sensitive_status_confirmed: { patient_id: Id; subtype: SensitiveSubtype; staff_user_id: Id };
  sensitive_status_lifted: { patient_id: Id; subtype: SensitiveSubtype; lifted_by: string; reason: string };
  sensitive_preferences_set: {
    patient_id: Id; episode_id: Id; form_of_address: string | null; use_baby_name: boolean;
    contact_frequency: 'continue' | 'reduced' | 'not_for_now'; queue_item_id: Id | null;
  };

  // AI, configuration, incidents, admin
  ai_call: { ai_interaction_id: Id; feature: AiFeature; episode_id: Id | null; prompt_hash: string; content_ids: string[] };
  ai_call_blocked: { feature: AiFeature; episode_id: Id | null; reason: string; queue_item_id: Id | null };
  ai_fallback_used: { feature: AiFeature; key: string; reason: string; episode_id: Id | null };
  config_changed: { file: string; version_from: string | null; version_to: string; author: string };
  incident_recorded: {
    incident_id: Id; type: IncidentType; related_entity: string | null; related_id: Id | null; reported_by: string; description: string;
  };
  incident_resolved: { incident_id: Id; resolution: string };
  practice_setup_minutes_recorded: { minutes: number; recorded_by: string };
}

export type EventType = keyof EventPayloads;

export interface DomainEvent<T extends EventType = EventType> {
  id: Id;
  type: T;
  /** Demo-clock time the event happened. Drives every projection and metric. */
  occurred_at: ISO;
  /** Wall-clock time the event was written. Excluded from determinism checks (NFR-04). */
  wall_at: ISO;
  actor: Actor;
  patient_id: Id | null;
  episode_id: Id | null;
  /** True for view events posted from the client (FR-21). Never drive state transitions. */
  client_reported: boolean;
  demo_session_id: string;
  payload: EventPayloads[T];
}

export type AnyEvent = { [K in EventType]: DomainEvent<K> }[EventType];

/**
 * Derived events are computed by the projection from the clock (timeouts, reminders,
 * Unreached, the day-21 sweep, content suppression). They are never stored, so moving the
 * clock backwards makes them disappear. Metrics count them alongside stored events.
 */
export type DerivedEventType =
  | 'escalation_escalated' | 'escalation_unacknowledged_timeout' | 'reminder_sent' | 'unreached_item_created'
  | 'no_contact_by_day_21' | 'checkin_unopened' | 'notification_scheduled' | 'notification_suppressed' | 'content_suppressed';

export interface DerivedEvent {
  type: DerivedEventType;
  occurred_at: ISO;
  episode_id: Id | null;
  patient_id: Id | null;
  related_id: Id | null;
  attributes: Record<string, string | number | boolean | null>;
}

// ---------------------------------------------------------------------------
// Projected state
// ---------------------------------------------------------------------------

export interface State {
  clock: ISO;
  patients: Record<Id, Patient>;
  eligibility: Record<Id, Eligibility>;
  episodes: Record<Id, Episode>;
  checkins: Record<Id, Checkin>;
  screens: Record<Id, ScreenResult>;
  queueItems: Record<Id, QueueItem>;
  assessments: Record<Id, Assessment>;
  referrals: Record<Id, Referral>;
  visits: Record<Id, Visit>;
  contacts: Record<Id, Contact>;
  callbacks: Record<Id, Callback>;
  staffTime: StaffTime[];
  carePlanItems: Record<Id, CarePlanItem>;
  savedQuestions: Record<Id, SavedQuestion>;
  summaries: Record<Id, Summary>;
  notifications: Notification[];
  sensitiveStatuses: SensitiveStatus[];
  readRecords: ReadRecord[];
  incidents: Record<Id, Incident>;
  aiInteractions: Record<Id, AiInteraction>;
  usefulness: UsefulnessRating[];
  missedEscalations: MissedEscalation[];
  derivedEvents: DerivedEvent[];
  /** Flags recorded at acknowledgment time and the practice setup minutes (FR-47). */
  practiceSetupMinutes: number | null;
  /** Count of stored events folded into this state (for debugging and the audit view). */
  eventCount: number;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Services are pure: (ctx, input) -> events. The store appends the events and re-projects.
 * A command that must be atomic (e.g. free text save + queue item + lexicon match, FR-17)
 * simply returns all of its events from one call.
 */
export interface CommandContext {
  state: State;
  config: import('./config.schema').AppConfig;
  content: import('./content').ContentIndex;
  now: ISO;
  actor: Actor;
  demo_session_id: string;
  nextId: (prefix: string) => Id;
  makeEvent: <T extends EventType>(type: T, payload: EventPayloads[T], opts?: { patient_id?: Id | null; episode_id?: Id | null; client_reported?: boolean; occurred_at?: ISO }) => DomainEvent<T>;
}

export type Command = (ctx: CommandContext) => AnyEvent[];
