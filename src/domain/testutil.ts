/**
 * Test utilities: a minimal valid AppConfig and ContentIndex built programmatically (no JSON
 * files), an in-memory store with one trivial branch, and a pure CommandContext factory.
 */
import { buildContentIndex, type ContentIndex } from './content';
import type { AppConfig, CheckinItem, CheckinTemplate, ContentItem, Instrument, Rule } from './config.schema';
import { project } from './projection';
import { DEFAULT_CLOCK, NestWellStore, type ScenarioBranch } from './store';
import { SAFETY_CRITICAL_CONTENT_IDS } from './services/enrollment';
import type { Actor, AnyEvent, CommandContext, EventPayloads, EventType, ISO, Locale, Patient, State } from './types';

export const TZ = 'America/New_York';

function item(key: string, template: string, domain: CheckinItem['domain'], response_type: CheckinItem['response_type'], options: CheckinItem['options'], tags: CheckinItem['tags']): CheckinItem {
  return { key, domain, prompt_content_id: `checkin.${template}.${key}`, response_type, options, skippable: true, tags };
}

const opt = (value: string, rule_tags: CheckinItem['options'][number]['rule_tags'] = []) => ({ value, label: value.replace(/_/g, ' '), rule_tags });

function template(key: string, set: CheckinTemplate['set'], items: (t: string) => CheckinItem[], extra: Partial<CheckinTemplate> = {}): CheckinTemplate {
  return {
    key, version: '1', set, title_content_id: `checkin.${key}.title`, items: items(key), instrument_key: null, usefulness_item: false, visit_preparation: false,
    closing_statement_ids: { no_follow_up: 'closing.no_follow_up', pending: 'closing.pending' }, placeholder: true, ...extra,
  };
}

const recovery = (t: string) => item('recovery', t, 'recovery', 'single_tap', [opt('ok'), opt('sore'), opt('bleeding_heavy', ['urgent_candidate'])], ['recovery']);
const coping = (t: string) => item('coping', t, 'mood', 'single_tap', [opt('managing'), opt('hard', ['coping_difficulty_mild']), opt('very_hard', ['coping_difficulty'])], ['mood']);
const ride = (t: string) => item('ride', t, 'barriers', 'single_tap', [opt('have_ride'), opt('no_ride', ['barrier_transport'])], ['barriers']);
const callback = (t: string) => item('callback', t, 'general', 'yes_no', [opt('yes', ['callback_requested']), opt('no')], ['general']);
const note = (t: string) => item('note', t, 'general', 'free_text_optional', [], ['general']);
const feeding = (t: string) => item('feeding', t, 'recovery', 'single_tap', [opt('going_ok'), opt('struggling')], ['infant', 'feeding']);
const contactPref = (t: string) => item('contact_pref', t, 'general', 'single_tap', [opt('call'), opt('message'), opt('not_now')], ['general']);

function epds(): Instrument {
  const forward = [0, 1, 2, 3].map((s) => ({ label: `option ${s}`, score: s }));
  const reverse = [3, 2, 1, 0].map((s) => ({ label: `option ${3 - s}`, score: s }));
  const items = Array.from({ length: 10 }, (_, i) => ({ key: `q${i + 1}`, prompt: `EPDS placeholder item ${i + 1}`, options: [1, 2, 4].includes(i + 1) ? forward : reverse, critical: i + 1 === 10 }));
  return { key: 'epds', version: '1', name: 'Edinburgh Postnatal Depression Scale', short_name: 'EPDS', attribution: 'Cox, Holden & Sagovsky, 1987, British Journal of Psychiatry 150:782–786', license_note: 'reproduced with attribution', items, scoring: 'sum', threshold_positive: 10, critical_item_min_score: 1, thresholds_confirmed_by: null, placeholder: true, framing_content_id: 'screen.framing.epds', loss_pathway_framing_content_id: 'screen.framing.loss' };
}

function phq9(): Instrument {
  const forward = [0, 1, 2, 3].map((s) => ({ label: `option ${s}`, score: s }));
  const items = Array.from({ length: 9 }, (_, i) => ({ key: `q${i + 1}`, prompt: `PHQ-9 item ${i + 1}`, options: forward, critical: i + 1 === 9 }));
  return { key: 'phq9', version: '1', name: 'Patient Health Questionnaire-9', short_name: 'PHQ-9', attribution: 'Pfizer / Spitzer, Kroenke, Williams; public domain', license_note: 'public domain', items, scoring: 'sum', threshold_positive: 10, critical_item_min_score: 1, thresholds_confirmed_by: null, placeholder: true, framing_content_id: 'screen.framing.phq9', loss_pathway_framing_content_id: null };
}

function rule(key: string, trigger: Rule['trigger'], conditions: Rule['conditions'], action: Rule['action']): Rule {
  return { key, version: '1', description: `test rule ${key}`, author: 'engineer', approved_by: null, effective_from: '2026-01-01T00:00:00.000Z', trigger, conditions, action, placeholder: true };
}

const lex = (key: string, entries: Array<[string, string]>) => ({ key, version: '1', author: 'engineer', approved_by: null, purpose: `${key} deny-list`, entries: entries.map(([term, term_class]) => ({ term, term_class })) });

export function makeTestConfig(mutate?: (c: AppConfig) => void): AppConfig {
  const queue = (key: AppConfig['queues'][number]['key'], owner_role: AppConfig['queues'][number]['owner_role'], ack: number, backup: number, resolution: number | null, extra: Partial<AppConfig['queues'][number]> = {}) => ({
    key, label: key, description: `${key} queue`, owner_role, owner_permission: null, owner_user_id: null, backup_role: owner_role === 'coordinator' ? 'clinician' as const : 'coordinator' as const,
    backup_user_id: null, employer: 'practice' as const, ack_target_minutes: ack, backup_ack_target_minutes: backup, resolution_target_minutes: resolution,
    timer_basis: 'wall' as const, no_answer_content_id: `queue.no_answer.${key}`, open_clinical_ack_target_minutes: null, placeholder: true, ...extra,
  });
  const coverage: AppConfig['coverage'] = [];
  for (const q of ['urgent', 'needs_review', 'follow_through', 'unreached', 'sensitive_review', 'summaries'] as const) {
    for (const weekday of [1, 2, 3, 4, 5]) coverage.push({ queue_key: q, weekday, start: '09:00', end: '17:00', on_duty_user_id: q === 'urgent' ? 'coord-1' : null, backup_user_id: null });
  }
  const config: AppConfig = {
    practice: {
      id: 'practice-1', name: 'Placeholder OB Practice', jurisdiction: 'Ohio', state_review_memo_ref: null, state_review_memo_date: null, timezone: TZ,
      named_contact: { role: 'coordinator', display_name: 'Care coordinator (placeholder)', phone: '555-0100', phone_is_placeholder: true, coverage_hours_label: 'Mon–Fri 9–5' },
      after_hours_phone: '555-0199', after_hours_phone_is_placeholder: true,
      staff_users: [
        { id: 'coord-1', role: 'coordinator', permissions: [], display_name: 'Coordinator One', employer: 'practice' },
        { id: 'ob-1', role: 'clinician', permissions: ['config_approver', 'content_approver'], display_name: 'Dr. OB One', employer: 'practice' },
        { id: 'budget-1', role: 'budget_owner', permissions: [], display_name: 'Budget Owner', employer: 'practice' },
        { id: 'partner-1', role: 'referral_partner', permissions: [], display_name: 'Partner Intake', employer: 'partner' },
      ],
      referral_partners: [{ id: 'bh-partner-1', name: 'Placeholder Behavioral Health', specialty: 'perinatal mental health', capacity_state: 'accepting', typical_wait_days: 10, accepted_insurance_types: ['commercial', 'medicaid'], consented_fields_allowed: ['name', 'phone', 'reason'], secured: false }],
      barrier_resources: { transport: null, childcare: null, phone_data: null, interpreter: null, cost: null },
    },
    queues: [
      queue('urgent', 'coordinator', 30, 30, 120),
      queue('needs_review', 'clinician', 240, 480, null),
      queue('follow_through', 'coordinator', 4320, 8640, null),
      queue('unreached', 'coordinator', 1440, 2880, null, { open_clinical_ack_target_minutes: 240 }),
      queue('sensitive_review', 'clinician', 1440, 2880, null),
      queue('summaries', 'clinician', 4320, 8640, null),
    ],
    coverage,
    cadence: {
      version: '1',
      points: [
        { key: 'day03', day: 3, template_key: 'day03' }, { key: 'day07', day: 7, template_key: 'day07' }, { key: 'day14', day: 14, template_key: 'day14' },
        { key: 'day21', day: 21, template_key: 'day21' }, { key: 'week06', day: 42, template_key: 'week06' }, { key: 'week09', day: 63, template_key: 'week09' },
        { key: 'week12', day: 84, template_key: 'week12' },
      ],
      response_window_hours: 48, reminder_offset_hours: 24, send_hour_local: 9, unreached_after_consecutive_unopened: 2, initial_contact_target_day: 21,
      weekly_burden_cap_items: 10, max_items_per_checkin: 5, loss_not_for_now_contact_days: 7, placeholder: true,
    },
    checkins: {
      day03: template('day03', 'standard', (t) => [recovery(t), coping(t), ride(t), callback(t), note(t)]),
      day07: template('day07', 'standard', (t) => [recovery(t), coping(t), feeding(t), callback(t), note(t)]),
      day14: template('day14', 'standard', (t) => [recovery(t), coping(t), note(t)], { instrument_key: 'epds' }),
      day21: template('day21', 'standard', (t) => [recovery(t), coping(t), callback(t), note(t)]),
      week06: template('week06', 'standard', (t) => [recovery(t), coping(t), note(t)], { instrument_key: 'phq9', usefulness_item: true, visit_preparation: true }),
      week09: template('week09', 'standard', (t) => [recovery(t), coping(t), note(t)]),
      week12: template('week12', 'standard', (t) => [coping(t), note(t)], { usefulness_item: true }),
      loss_checkin: template('loss_checkin', 'loss', (t) => [recovery(t), coping(t), contactPref(t), note(t)]),
      nicu_checkin: template('nicu_checkin', 'nicu', (t) => [recovery(t), coping(t), note(t)]),
      trauma_checkin: template('trauma_checkin', 'trauma', (t) => [contactPref(t), note(t)]),
    },
    instruments: { epds: epds(), phq9: phq9() },
    rules: [
      rule('urgent_symptom', 'checkin_submitted', { any: [{ field: 'response_tags', op: 'any_of', value: ['urgent_candidate'] }] }, { type: 'show_emergency_instruction', queue_key: 'urgent', instrument_key: null, note: 'urgent symptom answer on a check-in; call now' }),
      rule('coping_worst', 'checkin_submitted', { all: [{ field: 'response_tags', op: 'any_of', value: ['coping_difficulty'] }] }, { type: 'create_queue_item', queue_key: 'needs_review', instrument_key: null, note: 'reported difficulty coping (worst option); instrument offered now or at next check-in' }),
      rule('coping_screen', 'checkin_submitted', { any: [{ field: 'response_tags', op: 'any_of', value: ['coping_difficulty'] }, { field: 'response_tags_consecutive', op: 'any_of', value: ['coping_difficulty_mild'] }] }, { type: 'administer_screen', queue_key: null, instrument_key: 'epds', note: null }),
      rule('callback_requested', 'checkin_submitted', { all: [{ field: 'response_tags', op: 'any_of', value: ['callback_requested'] }] }, { type: 'create_queue_item', queue_key: 'follow_through', instrument_key: null, note: 'callback requested on a check-in' }),
      rule('critical_item', 'screen_scored', { all: [{ field: 'screen.critical_item_hit', op: 'eq', value: true }] }, { type: 'show_emergency_instruction', queue_key: 'urgent', instrument_key: null, note: 'critical safety item positive' }),
      rule('positive_screen', 'screen_scored', { all: [{ field: 'screen.positive', op: 'eq', value: true }] }, { type: 'create_queue_item', queue_key: 'needs_review', instrument_key: null, note: 'screen at or above threshold' }),
      rule('help_now', 'help_now', {}, { type: 'create_queue_item', queue_key: 'urgent', instrument_key: null, note: 'I need help now' }),
      // The two rules the shipped config uses to document routing the services perform themselves (FR-36a, FR-17).
      rule('barrier_item', 'checkin_submitted', { all: [{ field: 'response_tags', op: 'any_of', value: ['barrier_transport', 'barrier_childcare', 'barrier_phone_data', 'barrier_interpreter', 'barrier_cost'] }] }, { type: 'create_queue_item', queue_key: 'follow_through', instrument_key: null, note: 'barrier reported on a check-in' }),
      rule('free_text_present', 'checkin_submitted', { all: [{ field: 'free_text_entered', op: 'eq', value: true }] }, { type: 'create_queue_item', queue_key: 'needs_review', instrument_key: null, note: 'patient wrote a note; read by a person on the same-business-day target' }),
    ],
    lexicons: {
      burden: lex('burden', [['streak', 'burden'], ['missed', 'burden'], ['badge', 'burden'], ['keep it up', 'burden'], ["don't forget", 'burden']]),
      monitoring: lex('monitoring', [['monitored', 'monitoring'], ['watching', 'monitoring'], ['24/7', 'monitoring'], ['always here', 'monitoring'], ["we'll know", 'monitoring']]),
      claims: lex('claims', [['first-of-its-kind', 'claim'], ['better than', 'claim'], ['guaranteed', 'claim'], ['proven', 'claim'], ['HIPAA compliant', 'claim'], ['FDA cleared', 'claim'], ['non-device', 'claim'], ['decides nothing', 'claim'], ['just shows information', 'claim']]),
      reassurance: lex('reassurance', [['nothing needs follow-up', 'reassurance'], ['you are doing fine', 'reassurance'], ['all clear', 'reassurance'], ['looks fine', 'reassurance'], ['no concerns', 'reassurance']]),
      emergency: lex('emergency', [['hurt myself', 'self_harm'], ['end my life', 'self_harm'], ['heavy bleeding', 'hemorrhage'], ['chest pain', 'cardiac'], ['afraid of my partner', 'domestic_violence']]),
      therapy_intent: lex('therapy_intent', [['can you help me cope', 'therapy_intent'], ['talk me through', 'therapy_intent'], ['what should i do about my feelings', 'therapy_intent']]),
      medications: lex('medications', [['sertraline', 'medication'], ['ibuprofen', 'medication']]),
    },
    freetext: { version: '1', free_text_urgency_scan: false, free_text_urgency_scan_set_by: null, ai_enabled: false, critical_item_overrides_sharing: true, critical_item_policy_set_by: null, screening_in_loss_status: 'loss_framed_instrument' },
    careplan: {
      version: '1',
      items: [
        { key: 'recovery_visit', version: '1', title_content_id: 'careplan.recovery_visit.title', body_content_id: null, owner_role: 'coordinator', due_day: 21, tags: ['recovery'], sets: ['standard', 'loss', 'nicu', 'trauma'] },
        { key: 'feeding_support', version: '1', title_content_id: 'careplan.feeding_support.title', body_content_id: null, owner_role: 'coordinator', due_day: 7, tags: ['infant', 'feeding'], sets: ['standard', 'nicu'] },
        { key: 'milestones', version: '1', title_content_id: 'careplan.milestones.title', body_content_id: null, owner_role: 'coordinator', due_day: 42, tags: ['milestone'], sets: ['standard'] },
        { key: 'birth_story_note', version: '1', title_content_id: 'careplan.birth_story_note.title', body_content_id: null, owner_role: 'clinician', due_day: 14, tags: ['birth_story'], sets: ['standard', 'nicu'] },
        { key: 'mood_support', version: '1', title_content_id: 'careplan.mood_support.title', body_content_id: null, owner_role: 'clinician', due_day: null, tags: ['mood'], sets: ['standard', 'loss', 'nicu', 'trauma'] },
      ],
      visits: [
        { type: 'early_postpartum', day: 21, purpose: 'early postpartum visit', bring: ['insurance card', 'your questions'] },
        { type: 'comprehensive', day: 84, purpose: 'comprehensive postpartum visit', bring: ['insurance card', 'your questions', 'medication list'] },
      ],
    },
    ai_exemplars: {
      version: '1', approved_by: null,
      reword: { 'careplan.recovery_visit.title': 'Your recovery visit is a short visit with your care team to check how you are healing.' },
      summary_narrative: { 'dana:week12': 'Over twelve weeks the care plan items were completed and both visits took place. No items remain open.' },
      question_organizer: { tamsin: [{ title: 'Feeding', question_texts: ['How often should the twins feed?'] }, { title: 'Sleep', question_texts: ['When will they sleep longer?'] }] },
      generic_fallback: 'This summary lists the care plan, visits, referrals and open items recorded for this episode. Please read the structured section for details.',
      patient_label: "Written from your care team's approved materials. This is not medical advice. For urgent symptoms, follow the after-hours instruction.",
      staff_label: 'AI draft, not reviewed',
    },
  };
  mutate?.(config);
  return config;
}

/** Every content id the test config (and ARCHITECTURE section 4) refers to, as approved English items. */
export function testContentIds(config: AppConfig = makeTestConfig()): string[] {
  const ids = new Set<string>([
    'emergency_instruction', 'urgent_symptom_list', 'after_hours_instruction', 'contact_card', 'help_resources', 'nobody_reached_yet',
    'acknowledgment.standard', 'acknowledgment.demo_participant', 'acknowledgment.critical_shared', 'acknowledgment.critical_not_shared',
    'acknowledgment.free_text_scan_on', 'acknowledgment.free_text_scan_off', 'screen.framing.epds', 'screen.framing.phq9', 'screen.framing.loss',
    'screen.disclosure.critical_shared', 'screen.disclosure.critical_not_shared', 'closing.no_follow_up', 'closing.pending',
    'visit.prep.bring_baby_interpreter', 'transition.intro', 'sensitive.dialog.intro', 'sensitive.control.loss', 'sensitive.control.nicu',
    'sensitive.control.stop_baby', 'sensitive.control.hard_birth', 'sensitive.not_for_now', 'pause.confirm', 'stop.confirm', 'stop.done',
    'notification.neutral', 'ai.patient_label', 'ai.staff_label', 'ai.block_response', 'demo.handout',
  ]);
  for (const t of Object.values(config.checkins)) {
    ids.add(t.title_content_id); ids.add(t.closing_statement_ids.no_follow_up); ids.add(t.closing_statement_ids.pending);
    for (const i of t.items) ids.add(i.prompt_content_id);
  }
  for (const q of config.queues) ids.add(q.no_answer_content_id);
  for (const i of Object.values(config.instruments)) { ids.add(i.framing_content_id); if (i.loss_pathway_framing_content_id) ids.add(i.loss_pathway_framing_content_id); }
  for (const c of config.careplan.items) { ids.add(c.title_content_id); if (c.body_content_id) ids.add(c.body_content_id); }
  return [...ids];
}

const LOCKED = new Set(['emergency_instruction', 'help_resources', 'nobody_reached_yet', 'closing.no_follow_up', 'closing.pending', 'screen.disclosure.critical_shared', 'screen.disclosure.critical_not_shared']);

function contentItem(id: string, locale: Locale, extra: Partial<ContentItem> = {}): ContentItem {
  const locked = LOCKED.has(id);
  return {
    id, locale, title: `${id} (${locale})`, body: `${id} body (${locale}). Call 555-0100 (placeholder).`, tags: [], status: 'approved', version: '1',
    approver: locale === 'en' ? 'ob-1' : 'placeholder-translator', approved_at: '2026-01-01', tone_review_by: 'tone-reviewer', claims_checked_by: 'counsel',
    locked, safety_critical: locked || id.startsWith('acknowledgment.') || id === 'after_hours_instruction' || id === 'contact_card',
    counsel_review_pending: id.startsWith('acknowledgment.'), placeholder: locale !== 'en', layouts: id === 'emergency_instruction' ? ['full_screen', 'inline'] : undefined, ...extra,
  };
}

export function makeTestContent(config: AppConfig = makeTestConfig(), opts: { spanishSafetyClass?: boolean; extra?: ContentItem[] } = {}): ContentIndex {
  const items: ContentItem[] = testContentIds(config).map((id) => contentItem(id, 'en'));
  if (opts.spanishSafetyClass) for (const id of SAFETY_CRITICAL_CONTENT_IDS) items.push(contentItem(id, 'es'));
  if (opts.extra) items.push(...opts.extra);
  return buildContentIndex(items);
}

export function memoryStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

export const EMPTY_BRANCH: ScenarioBranch = { key: 'empty', label: 'Empty', description: 'No seeded events', scenario: 'tests', clock: DEFAULT_CLOCK, run: () => {} };

/** A store over an in-memory storage stub with a single trivial branch, already initialised. */
export function makeTestStore(config: AppConfig = makeTestConfig(), content: ContentIndex = makeTestContent(config), branches: Record<string, ScenarioBranch> = { empty: EMPTY_BRANCH }): NestWellStore {
  const store = new NestWellStore(config, content, branches, memoryStorage());
  store.init();
  return store;
}

export interface TestContextOptions {
  config?: AppConfig;
  content?: ContentIndex;
  events?: AnyEvent[];
  now: ISO;
  actor?: Actor;
  state?: State;
}

/** A pure CommandContext for service unit tests (mirrors the store's context and id scheme). */
export function makeTestContext(opts: TestContextOptions): CommandContext & { events: AnyEvent[]; counter: { n: number } } {
  const config = opts.config ?? makeTestConfig();
  const content = opts.content ?? makeTestContent(config);
  const events = opts.events ?? [];
  const actor: Actor = opts.actor ?? { type: 'seed' };
  const counter = { n: events.length * 10 };
  const nextId = (prefix: string) => `${prefix}-${String(++counter.n).padStart(5, '0')}`;
  const makeEvent = <T extends EventType>(type: T, payload: EventPayloads[T], o: { patient_id?: string | null; episode_id?: string | null; client_reported?: boolean; occurred_at?: ISO } = {}) => ({
    id: nextId('evt'), type, occurred_at: o.occurred_at ?? opts.now, wall_at: '2026-01-01T00:00:00.000Z', actor, patient_id: o.patient_id ?? null, episode_id: o.episode_id ?? null,
    client_reported: o.client_reported ?? false, demo_session_id: 'test', payload,
  });
  return { state: opts.state ?? project(events, opts.now, config, content), config, content, now: opts.now, actor, demo_session_id: 'test', nextId, makeEvent, events, counter };
}

export type PatientOverrides = Omit<Partial<Patient>, 'preferences'> & { preferences?: Partial<Patient['preferences']> };

export function makePatient(id: string, over: PatientOverrides = {}): Patient {
  const { preferences, ...rest } = over;
  return {
    id, is_synthetic: true, is_adult: true, display_name: `Synthetic ${id}`, persona_key: null, insurance_type: 'commercial', access_barriers: [], registered_at: '2026-01-05T15:00:00.000Z',
    preferences: {
      locale: 'en', formality: null, preferred_name: null, form_of_address: null, contact_windows: ['morning'], safe_to_message: true, baby_reference_permission: 'unset', baby_name: null,
      sharing_category: 'clinician_and_coordinator', contact_frequency: null, ...preferences,
    },
    ...rest,
  };
}
