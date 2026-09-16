/**
 * The AI gateway in fallback mode (section 8, AI-21): a canned-exemplar store keyed by
 * (feature, key). No model is ever called from this module and there is no network code path.
 * A missing key serves the generic fallback and emits ai_fallback_used(reason no_canned_key).
 * Locked, draft and retired content ids abort (AI-11) with ai_call_blocked.
 */
import { interpolate, stableHash } from '../content';
import type { AiFeature, AnyEvent, Command, CommandContext, Id, SummaryPeriod } from '../types';
import { DomainError } from './errors';
import { requireEpisode, requirePatient } from './shared';

export const AI_PATIENT_LABEL_ID = 'ai.patient_label';
export const AI_STAFF_LABEL_ID = 'ai.staff_label';
export const AI_BLOCK_RESPONSE_ID = 'ai.block_response';

/** AI-13 patient-facing label with the practice after-hours number filled in (the approved body carries {{after_hours_phone}}). */
export function patientLabel(ctx: CommandContext): string {
  const item = ctx.content.get(AI_PATIENT_LABEL_ID);
  const body = item && item.status === 'approved' ? item.body : ctx.config.ai_exemplars.patient_label;
  return interpolate(body, { after_hours_phone: ctx.config.practice.after_hours_phone });
}

export function staffLabel(ctx: CommandContext): string {
  const item = ctx.content.get(AI_STAFF_LABEL_ID);
  return item && item.status === 'approved' ? item.body : ctx.config.ai_exemplars.staff_label;
}

function interaction(ctx: CommandContext, feature: AiFeature, key: string, episode_id: Id | null, content_ids: string[]): { id: Id; event: AnyEvent } {
  const id = ctx.nextId('ai');
  const prompt_hash = stableHash(`${feature}|${key}|exemplars:${ctx.config.ai_exemplars.version}`);
  const ep = episode_id ? ctx.state.episodes[episode_id] : undefined;
  return { id, event: ctx.makeEvent('ai_call', { ai_interaction_id: id, feature, episode_id, prompt_hash, content_ids }, { patient_id: ep?.patient_id ?? null, episode_id }) };
}

function fallbackEvent(ctx: CommandContext, feature: AiFeature, key: string, episode_id: Id | null): AnyEvent {
  const ep = episode_id ? ctx.state.episodes[episode_id] : undefined;
  return ctx.makeEvent('ai_fallback_used', { feature, key, reason: 'no_canned_key', episode_id }, { patient_id: ep?.patient_id ?? null, episode_id });
}

// ---- AI-01 reword ---------------------------------------------------------

export interface RewordResult {
  text: string;
  label: string;
  ai_interaction_id: Id | null;
  fallback: boolean;
  blocked: boolean;
  events: AnyEvent[];
}

export function rewordResult(ctx: CommandContext, input: { content_id: string; episode_id: Id | null }): RewordResult {
  const item = ctx.content.get(input.content_id);
  const ep = input.episode_id ? ctx.state.episodes[input.episode_id] : undefined;
  const opts = { patient_id: ep?.patient_id ?? null, episode_id: input.episode_id };
  if (!item || item.status !== 'approved' || item.locked) {
    const reason = !item ? 'missing_content' : item.locked ? 'locked_content' : `content_${item.status}`;
    return {
      text: item && item.status === 'approved' ? item.body : '', label: '', ai_interaction_id: null, fallback: false, blocked: true,
      events: [ctx.makeEvent('ai_call_blocked', { feature: 'reword', episode_id: input.episode_id, reason, queue_item_id: null }, opts)],
    };
  }
  const exemplar = ctx.config.ai_exemplars.reword[input.content_id];
  const call = interaction(ctx, 'reword', input.content_id, input.episode_id, [input.content_id]);
  const events: AnyEvent[] = [call.event];
  if (exemplar === undefined) events.push(fallbackEvent(ctx, 'reword', input.content_id, input.episode_id));
  return { text: exemplar ?? ctx.config.ai_exemplars.generic_fallback, label: patientLabel(ctx), ai_interaction_id: call.id, fallback: exemplar === undefined, blocked: false, events };
}

export function reword(input: { content_id: string; episode_id: Id | null }): Command {
  return (ctx) => rewordResult(ctx, input).events;
}

// ---- AI-02 summary narrative ---------------------------------------------

export interface NarrativeResult { text: string; label: string; ai_interaction_id: Id; fallback: boolean; key: string; events: AnyEvent[] }

export function narrativeResult(ctx: CommandContext, input: { episode_id: Id; period: SummaryPeriod }): NarrativeResult {
  const ep = requireEpisode(ctx, input.episode_id);
  const patient = requirePatient(ctx, ep.patient_id);
  const key = `${patient.persona_key ?? 'unknown'}:${input.period}`;
  const exemplar = ctx.config.ai_exemplars.summary_narrative[key];
  const call = interaction(ctx, 'summary_narrative', key, ep.id, []);
  const events: AnyEvent[] = [call.event];
  if (exemplar === undefined) events.push(fallbackEvent(ctx, 'summary_narrative', key, ep.id));
  return { text: exemplar ?? ctx.config.ai_exemplars.generic_fallback, label: staffLabel(ctx), ai_interaction_id: call.id, fallback: exemplar === undefined, key, events };
}

export function narrative(input: { episode_id: Id; period: SummaryPeriod }): Command {
  return (ctx) => narrativeResult(ctx, input).events;
}

// ---- AI-03 question organizer ---------------------------------------------

export interface OrganizeResult {
  groups: Array<{ title: string; question_ids: Id[] }>;
  ai_interaction_id: Id;
  fallback: boolean;
  /** Questions with a lexicon match are never sent to the organizer and keep their place in her list. */
  excluded_question_ids: Id[];
  events: AnyEvent[];
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function organizeQuestionsResult(ctx: CommandContext, input: { episode_id: Id }): OrganizeResult {
  const ep = requireEpisode(ctx, input.episode_id);
  const patient = requirePatient(ctx, ep.patient_id);
  const all = Object.values(ctx.state.savedQuestions).filter((q) => q.episode_id === ep.id).sort((a, b) => a.order - b.order);
  const excluded = all.filter((q) => q.lexicon_match !== null).map((q) => q.id);
  const eligible = all.filter((q) => q.lexicon_match === null);
  const key = patient.persona_key ?? 'unknown';
  const exemplar = ctx.config.ai_exemplars.question_organizer[key];
  const call = interaction(ctx, 'question_organizer', key, ep.id, []);
  const events: AnyEvent[] = [call.event];
  let groups: Array<{ title: string; question_ids: Id[] }> = [];
  if (exemplar) {
    const used = new Set<Id>();
    for (const g of exemplar) {
      const ids = eligible.filter((q) => !used.has(q.id) && g.question_texts.some((t) => norm(t) === norm(q.text))).map((q) => q.id);
      ids.forEach((id) => used.add(id));
      if (ids.length) groups.push({ title: g.title, question_ids: ids });
    }
    const rest = eligible.filter((q) => !used.has(q.id)).map((q) => q.id);
    if (rest.length) groups.push({ title: 'Other questions', question_ids: rest });
  } else {
    events.push(fallbackEvent(ctx, 'question_organizer', key, ep.id));
    groups = eligible.length ? [{ title: 'Your questions', question_ids: eligible.map((q) => q.id) }] : [];
  }
  events.push(ctx.makeEvent('saved_questions_grouped', { episode_id: ep.id, groups, ai_interaction_id: call.id }, { patient_id: ep.patient_id, episode_id: ep.id }));
  return { groups, ai_interaction_id: call.id, fallback: !exemplar, excluded_question_ids: excluded, events };
}

export function organizeQuestions(input: { episode_id: Id }): Command {
  return (ctx) => organizeQuestionsResult(ctx, input).events;
}

// ---- AI-16 postfilter used by summaries.ts --------------------------------------

/**
 * Mood or risk descriptors that never appear in a narrative (AI-02, AI-16). Each entry matches at the start of a
 * word ("depress" covers "depressed" and "depression"); the entries in NARRATIVE_WHOLE_WORDS match whole words only.
 */
export const NARRATIVE_DENY_WORDS: readonly string[] = [
  'depress', 'anxi', 'suicid', 'selfharm', 'self harm', 'harm', 'risk', 'mood', 'score', 'crisis', 'urgent', 'critical', 'positive screen',
  'negative screen', 'threshold', 'symptom', 'hopeless', 'danger', 'safe', 'unsafe',
];
const NARRATIVE_WHOLE_WORDS = new Set(['safe']);

/** Lower case, hyphens removed ("check-in" → "checkin", "PHQ-9" → "phq9"), whitespace collapsed. */
export const normalizeNarrative = (s: string): string => s.toLowerCase().replace(/-/g, '').replace(/\s+/g, ' ').trim();

/**
 * The AI-02 allowlist as phrases: queue-item names ("urgent item", "needs review items"), care-plan titles and keys,
 * visit purposes and partner names. They are removed from the text before the deny-list runs, so "one urgent item
 * resolved" passes while "her situation is urgent" does not.
 */
export function narrativeAllowlist(ctx: Pick<CommandContext, 'config' | 'content'>): string[] {
  const phrases = new Set<string>();
  for (const q of ctx.config.queues) {
    for (const v of [q.key.replace(/_/g, ' '), q.key.replace(/_/g, ''), normalizeNarrative(q.label)]) {
      for (const suffix of [' item', ' items', ' queue']) phrases.add(`${v}${suffix}`);
    }
  }
  for (const item of ctx.config.careplan.items) {
    const title = ctx.content.get(item.title_content_id)?.title;
    if (title) phrases.add(normalizeNarrative(title));
    phrases.add(item.key.replace(/_/g, ' '));
  }
  for (const v of ctx.config.careplan.visits) phrases.add(normalizeNarrative(v.purpose));
  for (const p of ctx.config.practice.referral_partners) phrases.add(normalizeNarrative(p.name));
  return [...phrases].filter((p) => p.length > 0).sort((a, b) => b.length - a.length);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Returns the violations found in a narrative: instrument names, scores of this episode's screens, and deny-list words. */
export function narrativeViolations(ctx: CommandContext, episode_id: Id, text: string): string[] {
  const found = new Set<string>();
  const raw = normalizeNarrative(text);
  for (const inst of Object.values(ctx.config.instruments)) {
    for (const name of [inst.key, inst.short_name, inst.name]) {
      const n = normalizeNarrative(name);
      if (n && raw.includes(n)) found.add(`instrument:${name}`);
    }
  }
  let hay = raw;
  for (const phrase of narrativeAllowlist(ctx)) if (hay.includes(phrase)) hay = hay.split(phrase).join(' ');
  for (const w of NARRATIVE_DENY_WORDS) {
    const re = new RegExp(`\\b${escapeRe(w)}${NARRATIVE_WHOLE_WORDS.has(w) ? '\\b' : ''}`);
    if (re.test(hay)) found.add(`word:${w}`);
  }
  // Numbers: the episode week, day numbers, dates and clock times are allowlisted; a screen score is not (AI-02, AI-08).
  const numbers = hay.replace(/\b(week|day)\s*\d+/g, ' ').replace(/\d{8}t[\d:.]*z?/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  for (const s of Object.values(ctx.state.screens)) {
    if (s.episode_id !== episode_id || s.declined) continue;
    if (new RegExp(`(^|[^0-9])${s.score}([^0-9]|$)`).test(numbers)) found.add(`score:${s.score}`);
  }
  return [...found];
}

export function assertNarrativeClean(ctx: CommandContext, episode_id: Id, text: string): void {
  const v = narrativeViolations(ctx, episode_id, text);
  if (v.length) throw new DomainError('narrative_postfilter', `Narrative blocked by the postfilter: ${v.join(', ')}`);
}
