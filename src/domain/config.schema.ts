/**
 * Zod schemas for everything under /config and /content. Config is data, not code (FR-61):
 * the app validates every file at startup and refuses to run on a violation.
 */
import { z } from 'zod';

const iso = z.string().min(10);
const role = z.enum(['patient', 'coordinator', 'clinician', 'budget_owner', 'referral_partner', 'admin']);
const queueKey = z.enum(['urgent', 'needs_review', 'follow_through', 'unreached', 'sensitive_review', 'summaries']);
const contentTag = z.enum([
  'infant', 'feeding', 'milestone', 'celebration', 'newborn_visit', 'pregnancy_progress', 'birth_story',
  'recovery', 'mood', 'symptoms', 'barriers', 'general',
]);
const ruleTag = z.enum([
  'urgent_candidate', 'coping_difficulty', 'coping_difficulty_mild',
  'barrier_transport', 'barrier_childcare', 'barrier_phone_data', 'barrier_interpreter', 'barrier_cost',
  'callback_requested', 'none',
]);

export const StaffUserSchema = z.object({
  id: z.string(),
  role: z.enum(['coordinator', 'clinician', 'budget_owner', 'referral_partner']),
  permissions: z.array(z.enum(['config_approver', 'content_approver', 'on_call'])),
  display_name: z.string(),
  employer: z.enum(['practice', 'nestwell', 'partner']),
});

export const ReferralPartnerSchema = z.object({
  id: z.string(),
  name: z.string(),
  specialty: z.string(),
  capacity_state: z.enum(['accepting', 'waitlist', 'no_capacity', 'unknown']),
  typical_wait_days: z.number().nullable(),
  accepted_insurance_types: z.array(z.enum(['commercial', 'medicaid', 'uninsured', 'other'])),
  consented_fields_allowed: z.array(z.string()),
  /** A9: false until a real partner has agreed; the UI shows NOT YET SECURED. */
  secured: z.boolean(),
});

export const PracticeSchema = z.object({
  id: z.string(),
  name: z.string(),
  jurisdiction: z.string(),
  /** SR-17: null until an admin records the counsel memo reference for this state. */
  state_review_memo_ref: z.string().nullable(),
  state_review_memo_date: z.string().nullable(),
  timezone: z.string(),
  named_contact: z.object({
    role: role,
    display_name: z.string(),
    /** SR-02: non-dialable 555 number, labelled as a placeholder in the UI. */
    phone: z.string(),
    phone_is_placeholder: z.boolean(),
    coverage_hours_label: z.string(),
  }),
  after_hours_phone: z.string(),
  after_hours_phone_is_placeholder: z.boolean(),
  staff_users: z.array(StaffUserSchema),
  referral_partners: z.array(ReferralPartnerSchema),
  /** Practice-supplied resources for barrier items (FR-36a); null renders NOT YET PROVIDED. */
  barrier_resources: z.record(z.string(), z.string().nullable()),
});

export const QueueDefSchema = z.object({
  key: queueKey,
  label: z.string(),
  description: z.string(),
  owner_role: role,
  owner_permission: z.enum(['config_approver', 'content_approver', 'on_call']).nullable(),
  /** null means NOT YET ASSIGNED (A9). */
  owner_user_id: z.string().nullable(),
  backup_role: role,
  backup_user_id: z.string().nullable(),
  employer: z.enum(['practice', 'nestwell', 'partner']),
  ack_target_minutes: z.number().int().positive(),
  backup_ack_target_minutes: z.number().int().positive(),
  resolution_target_minutes: z.number().int().positive().nullable(),
  timer_basis: z.enum(['wall', 'coverage_hours']),
  no_answer_content_id: z.string(),
  /** FR-13: shorter target when an Unreached item carries an open clinical item. */
  open_clinical_ack_target_minutes: z.number().int().positive().nullable(),
  placeholder: z.boolean(),
});

export const CoverageEntrySchema = z.object({
  queue_key: queueKey,
  /** 0 = Sunday … 6 = Saturday. */
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  on_duty_user_id: z.string().nullable(),
  backup_user_id: z.string().nullable(),
});

export const CadenceSchema = z.object({
  version: z.string(),
  points: z.array(z.object({ key: z.string(), day: z.number().int().nonnegative(), template_key: z.string() })),
  response_window_hours: z.number().positive(),
  reminder_offset_hours: z.number().positive(),
  /** Local hour (practice timezone) at which a check-in is released. */
  send_hour_local: z.number().int().min(0).max(23),
  unreached_after_consecutive_unopened: z.number().int().positive(),
  initial_contact_target_day: z.number().int().positive(),
  weekly_burden_cap_items: z.number().int().positive(),
  max_items_per_checkin: z.number().int().positive(),
  /** FR-56: days the practice has to log a human contact after a loss "not for now". */
  loss_not_for_now_contact_days: z.number().int().positive(),
  placeholder: z.boolean(),
});

export const CheckinItemSchema = z.object({
  key: z.string(),
  domain: z.enum(['recovery', 'mood', 'symptoms', 'barriers', 'general']),
  prompt_content_id: z.string(),
  response_type: z.enum(['single_tap', 'multi_tap', 'yes_no', 'free_text_optional']),
  options: z.array(z.object({
    value: z.string(),
    label: z.string(),
    rule_tags: z.array(ruleTag),
  })),
  skippable: z.literal(true),
  tags: z.array(contentTag),
});

export const CheckinTemplateSchema = z.object({
  key: z.string(),
  version: z.string(),
  set: z.enum(['standard', 'loss', 'nicu', 'trauma']),
  title_content_id: z.string(),
  items: z.array(CheckinItemSchema),
  /** Instrument administered as its own attributed step at this check-in (FR-16: at most one). */
  instrument_key: z.string().nullable(),
  usefulness_item: z.boolean(),
  visit_preparation: z.boolean(),
  closing_statement_ids: z.object({ no_follow_up: z.string(), pending: z.string() }),
  placeholder: z.boolean(),
});

export const InstrumentSchema = z.object({
  key: z.string(),
  version: z.string(),
  name: z.string(),
  short_name: z.string(),
  attribution: z.string(),
  license_note: z.string(),
  items: z.array(z.object({
    key: z.string(),
    prompt: z.string(),
    options: z.array(z.object({ label: z.string(), score: z.number().int() })),
    critical: z.boolean(),
  })),
  scoring: z.literal('sum'),
  threshold_positive: z.number().int(),
  /** Any score at or above this on a critical item counts as a critical hit. */
  critical_item_min_score: z.number().int(),
  thresholds_confirmed_by: z.string().nullable(),
  placeholder: z.boolean(),
  framing_content_id: z.string(),
  loss_pathway_framing_content_id: z.string().nullable(),
});

export const RuleConditionSchema = z.object({
  field: z.string(),
  op: z.enum(['eq', 'gte', 'lte', 'in', 'any_of']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export const RuleSchema = z.object({
  key: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.string(),
  approved_by: z.string().nullable(),
  effective_from: iso,
  trigger: z.enum(['checkin_submitted', 'screen_scored', 'checkin_window_closed', 'status_set', 'help_now', 'saved_question_added']),
  conditions: z.object({ all: z.array(RuleConditionSchema).optional(), any: z.array(RuleConditionSchema).optional() }),
  action: z.object({
    type: z.enum(['show_emergency_instruction', 'create_queue_item', 'administer_screen', 'pause_checkins']),
    queue_key: queueKey.nullable(),
    instrument_key: z.string().nullable(),
    note: z.string().nullable(),
    open_clinical_flag: z.boolean().optional(),
  }),
  placeholder: z.boolean(),
});

export const LexiconSchema = z.object({
  key: z.string(),
  version: z.string(),
  author: z.string(),
  approved_by: z.string().nullable(),
  purpose: z.string(),
  entries: z.array(z.object({ term: z.string().min(1), term_class: z.string() })).min(1),
});

export const FreeTextConfigSchema = z.object({
  version: z.string(),
  /** FR-17: off until the clinical safety owner sets it under their name. */
  free_text_urgency_scan: z.boolean(),
  free_text_urgency_scan_set_by: z.string().nullable(),
  /** A5 / section 8: canned exemplars unless the founders opt in. */
  ai_enabled: z.boolean(),
  /** FR-30a placeholder policy. */
  critical_item_overrides_sharing: z.boolean(),
  critical_item_policy_set_by: z.string().nullable(),
  /** FR-57 placeholder pending open question 12. */
  screening_in_loss_status: z.enum(['loss_framed_instrument', 'single_mood_item']),
});

export const CarePlanConfigSchema = z.object({
  version: z.string(),
  items: z.array(z.object({
    key: z.string(),
    version: z.string(),
    title_content_id: z.string(),
    body_content_id: z.string().nullable(),
    owner_role: role,
    due_day: z.number().int().nullable(),
    tags: z.array(contentTag),
    sets: z.array(z.enum(['standard', 'loss', 'nicu', 'trauma'])),
  })),
  visits: z.array(z.object({
    type: z.enum(['early_postpartum', 'comprehensive']),
    day: z.number().int(),
    purpose: z.string(),
    bring: z.array(z.string()),
  })),
});

export const AiExemplarsSchema = z.object({
  version: z.string(),
  approved_by: z.string().nullable(),
  reword: z.record(z.string(), z.string()),
  summary_narrative: z.record(z.string(), z.string()),
  question_organizer: z.record(z.string(), z.array(z.object({ title: z.string(), question_texts: z.array(z.string()) }))),
  generic_fallback: z.string(),
  patient_label: z.string(),
  staff_label: z.string(),
});

export const ContentItemSchema = z.object({
  id: z.string(),
  locale: z.enum(['en', 'es']),
  title: z.string(),
  body: z.string(),
  tags: z.array(contentTag),
  status: z.enum(['draft', 'approved', 'retired']),
  version: z.string(),
  approver: z.string().nullable(),
  approved_at: z.string().nullable(),
  tone_review_by: z.string().nullable(),
  claims_checked_by: z.string().nullable(),
  locked: z.boolean(),
  safety_critical: z.boolean(),
  counsel_review_pending: z.boolean(),
  /** "placeholder, not clinically set" label in the UI. */
  placeholder: z.boolean(),
  layouts: z.array(z.enum(['full_screen', 'inline'])).optional(),
});

export const AppConfigSchema = z.object({
  practice: PracticeSchema,
  queues: z.array(QueueDefSchema),
  coverage: z.array(CoverageEntrySchema),
  cadence: CadenceSchema,
  checkins: z.record(z.string(), CheckinTemplateSchema),
  instruments: z.record(z.string(), InstrumentSchema),
  rules: z.array(RuleSchema),
  lexicons: z.record(z.string(), LexiconSchema),
  freetext: FreeTextConfigSchema,
  careplan: CarePlanConfigSchema,
  ai_exemplars: AiExemplarsSchema,
});

export type StaffUserConfig = z.infer<typeof StaffUserSchema>;
export type ReferralPartner = z.infer<typeof ReferralPartnerSchema>;
export type PracticeConfig = z.infer<typeof PracticeSchema>;
export type QueueDef = z.infer<typeof QueueDefSchema>;
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;
export type CadenceConfig = z.infer<typeof CadenceSchema>;
export type CheckinItem = z.infer<typeof CheckinItemSchema>;
export type CheckinTemplate = z.infer<typeof CheckinTemplateSchema>;
export type Instrument = z.infer<typeof InstrumentSchema>;
export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type Lexicon = z.infer<typeof LexiconSchema>;
export type FreeTextConfig = z.infer<typeof FreeTextConfigSchema>;
export type CarePlanConfig = z.infer<typeof CarePlanConfigSchema>;
export type AiExemplars = z.infer<typeof AiExemplarsSchema>;
export type ContentItem = z.infer<typeof ContentItemSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

/**
 * Cross-file invariants that a single schema cannot express (FR-61, FR-16, FR-09, FR-55).
 * Returns a list of readable problems; empty means valid.
 */
export function validateConfigInvariants(config: AppConfig, contentIds: Set<string>): string[] {
  const problems: string[] = [];
  const queueKeys = new Set(config.queues.map((q) => q.key));
  for (const rule of config.rules) {
    if (rule.action.type === 'create_queue_item' && (!rule.action.queue_key || !queueKeys.has(rule.action.queue_key))) {
      problems.push(`rule ${rule.key}: unknown or missing queue_key`);
    }
    if (rule.action.type === 'administer_screen' && (!rule.action.instrument_key || !config.instruments[rule.action.instrument_key])) {
      problems.push(`rule ${rule.key}: unknown or missing instrument_key`);
    }
  }
  for (const point of config.cadence.points) {
    if (!config.checkins[point.template_key]) problems.push(`cadence point ${point.key}: unknown template ${point.template_key}`);
  }
  const instrumentsByCheckin = new Map<string, string[]>();
  for (const t of Object.values(config.checkins)) {
    const nonScreening = t.items.length;
    if (nonScreening > config.cadence.max_items_per_checkin) {
      problems.push(`check-in ${t.key}: ${nonScreening} items exceeds the cap of ${config.cadence.max_items_per_checkin} (FR-09)`);
    }
    if (t.instrument_key) {
      if (!config.instruments[t.instrument_key]) problems.push(`check-in ${t.key}: unknown instrument ${t.instrument_key}`);
      instrumentsByCheckin.set(t.key, [t.instrument_key]);
    }
    for (const item of t.items) {
      if (!contentIds.has(item.prompt_content_id)) problems.push(`check-in ${t.key}: item ${item.key} prompt content ${item.prompt_content_id} not found`);
      if (item.tags.length === 0) problems.push(`check-in ${t.key}: item ${item.key} has no content tags (FR-55 requires tags for suppression)`);
    }
    for (const id of [t.title_content_id, t.closing_statement_ids.no_follow_up, t.closing_statement_ids.pending]) {
      if (!contentIds.has(id)) problems.push(`check-in ${t.key}: content ${id} not found`);
    }
  }
  for (const q of config.queues) {
    if (!contentIds.has(q.no_answer_content_id)) problems.push(`queue ${q.key}: no_answer content ${q.no_answer_content_id} not found`);
    if (q.backup_ack_target_minutes < q.ack_target_minutes) problems.push(`queue ${q.key}: backup target must not be earlier than the acknowledgment target`);
  }
  for (const inst of Object.values(config.instruments)) {
    if (!contentIds.has(inst.framing_content_id)) problems.push(`instrument ${inst.key}: framing content ${inst.framing_content_id} not found`);
    if (!inst.items.some((i) => i.critical)) problems.push(`instrument ${inst.key}: no critical item marked (FR-30 needs one)`);
  }
  for (const [key, lex] of Object.entries(config.lexicons)) {
    if (lex.entries.length === 0) problems.push(`lexicon ${key}: empty (FR-61a)`);
  }
  if (config.freetext.ai_enabled && !config.freetext.free_text_urgency_scan) {
    problems.push('freetext: ai_enabled=true requires free_text_urgency_scan=true (FR-17, FR-61)');
  }
  if (config.freetext.ai_enabled) {
    problems.push('freetext: ai_enabled=true is not supported in this build (no model path; the AI-15 prefilter is not implemented). The gateway serves canned exemplars only (AI-21).');
  }
  for (const item of config.careplan.items) {
    if (!contentIds.has(item.title_content_id)) problems.push(`care plan ${item.key}: title content ${item.title_content_id} not found`);
  }
  const required = ['burden', 'monitoring', 'claims', 'reassurance', 'emergency', 'therapy_intent', 'medications'];
  for (const r of required) if (!config.lexicons[r]) problems.push(`lexicon ${r} missing (FR-61a)`);
  return problems;
}
