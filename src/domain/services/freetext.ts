/**
 * FR-17: every patient-entered free text is human-routed on entry, in the same command as
 * the save. The emergency lexicon is scanned here only when config.freetext.free_text_urgency_scan
 * is true; a match creates one Urgent item (in place of the Needs-review item), shows the locked
 * instruction full-screen and emits help_requested(lexicon_match). The matched text is never
 * stored — only the lexicon version and term class (SR-11).
 */
import type { AppConfig, Lexicon } from '../config.schema';
import type { AnyEvent, Command, CommandContext, FreeTextField, Id, LexiconMatch } from '../types';
import { DomainError } from './errors';
import { evaluateRules } from './rules';
import { dayNumberFor, newQueueItem, requireOpenEpisode } from './shared';

export interface FreeTextInput {
  episode_id: Id;
  field: FreeTextField;
  text: string;
  checkin_id?: Id | null;
}

export interface FreeTextResult {
  events: AnyEvent[];
  queue_item_id: Id | null;
  lexicon_match: LexiconMatch | null;
  urgent: boolean;
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * FR-17 "never a dead end": a check-in note lives on the check-in response and a saved question on
 * its own record, but the usefulness comment and the sensitive-preferences note have no record of
 * their own, so their text is carried on the queue item that routes them (after this marker) and is
 * revealed to the coordinator or clinician only through a recorded read (FR-03a). The marker keeps
 * the item's summary line free of the text.
 */
export const ROUTED_TEXT_MARKER = '\n[text]\n';
const FIELDS_CARRYING_TEXT: readonly FreeTextField[] = ['usefulness_comment', 'sensitive_preferences'];

/** Splits a queue-item note into its summary line and the routed free text it carries (if any). */
export function splitRoutedNote(note: string | null | undefined): { summary: string | null; text: string | null } {
  if (!note) return { summary: null, text: null };
  const i = note.indexOf(ROUTED_TEXT_MARKER);
  if (i < 0) return { summary: note, text: null };
  return { summary: note.slice(0, i), text: note.slice(i + ROUTED_TEXT_MARKER.length) };
}

const FIELD_LABELS: Record<FreeTextField, string> = {
  checkin_free_text: 'check-in note', saved_question: 'saved question', usefulness_comment: 'usefulness comment', sensitive_preferences: 'note with her contact preferences',
};

function noteFor(summary: string, field: FreeTextField, text: string): string {
  return FIELDS_CARRYING_TEXT.includes(field) ? `${summary}${ROUTED_TEXT_MARKER}${text}` : summary;
}

/** Case-insensitive whole-phrase containment. Returns only { version, term_class }, never the text. */
export function matchLexicon(text: string, lexicon: Lexicon | undefined): LexiconMatch | null {
  if (!lexicon) return null;
  const hay = normalize(text);
  if (!hay) return null;
  for (const entry of lexicon.entries) {
    const term = normalize(entry.term);
    if (term && hay.includes(term)) return { version: lexicon.version, term_class: entry.term_class };
  }
  return null;
}

/** FR-61: live AI without the scan flag is a startup failure; services refuse it too (belt and braces). */
export function assertScanConsistency(config: AppConfig): void {
  if (config.freetext.ai_enabled && !config.freetext.free_text_urgency_scan) {
    throw new DomainError('ai_enabled_without_scan', 'ai_enabled=true requires free_text_urgency_scan=true (FR-17, FR-61)');
  }
}

export function routeFreeTextEvents(ctx: CommandContext, input: FreeTextInput): FreeTextResult {
  assertScanConsistency(ctx.config);
  const text = input.text ?? '';
  if (text.trim() === '') return { events: [], queue_item_id: null, lexicon_match: null, urgent: false };
  const ep = requireOpenEpisode(ctx, input.episode_id);
  const opts = { patient_id: ep.patient_id, episode_id: ep.id };
  const scan = ctx.config.freetext.free_text_urgency_scan;
  const match = scan ? matchLexicon(text, ctx.config.lexicons.emergency) : null;
  const events: AnyEvent[] = [];
  // The locked instruction renders beside the field in every mode (FR-17a); client-side render of it is inline.
  events.push(ctx.makeEvent('emergency_instruction_shown', { episode_id: ep.id, layout: 'inline', trigger: `free_text:${input.field}` }, opts));
  if (match) {
    const q = newQueueItem(ctx, {
      queue_key: 'urgent', episode_id: ep.id, trigger_type: 'lexicon_match', trigger_ref: input.checkin_id ?? null,
      note: noteFor(`emergency lexicon match on the ${FIELD_LABELS[input.field]} (lexicon v${match.version}, class ${match.term_class}); the text is read in the patient record`, input.field, text),
    });
    events.push(q.event);
    events.push(ctx.makeEvent('emergency_instruction_shown', { episode_id: ep.id, layout: 'full_screen', trigger: 'lexicon_match' }, opts));
    events.push(ctx.makeEvent('help_requested', { episode_id: ep.id, source: 'lexicon_match', lexicon_version: match.version, queue_item_id: q.id }, opts));
    events.push(ctx.makeEvent('free_text_routed', { episode_id: ep.id, field: input.field, queue_key: 'urgent', queue_item_id: q.id, lexicon_match: match }, opts));
    return { events, queue_item_id: q.id, lexicon_match: match, urgent: true };
  }
  const q = newQueueItem(ctx, {
    queue_key: 'needs_review', episode_id: ep.id, trigger_type: 'free_text', trigger_ref: input.checkin_id ?? null,
    note: noteFor(`free text entered (${FIELD_LABELS[input.field]}); a clinician reads it by the same-business-day target`, input.field, text),
  });
  events.push(q.event);
  events.push(ctx.makeEvent('free_text_routed', { episode_id: ep.id, field: input.field, queue_key: 'needs_review', queue_item_id: q.id, lexicon_match: null }, opts));
  return { events, queue_item_id: q.id, lexicon_match: null, urgent: false };
}

export function routeFreeText(input: FreeTextInput): Command {
  return (ctx) => routeFreeTextEvents(ctx, input).events;
}

/** FR-20: a saved question is free text governed by FR-17 on entry, in the same command. */
export function addSavedQuestion(input: { episode_id: Id; text: string }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    if (input.text.trim() === '') throw new DomainError('empty_question', 'A saved question needs text');
    const routed = routeFreeTextEvents(ctx, { episode_id: ep.id, field: 'saved_question', text: input.text });
    const question_id = ctx.nextId('q');
    // FR-23 rules on saved_question_added are logged against the item the routing created; none may add a second one.
    const rules = evaluateRules('saved_question_added', {
      episode_id: ep.id, patient_id: ep.patient_id, checkin_id: null, trigger_ref: question_id,
      facts: { free_text_entered: true, 'lexicon.matched': routed.lexicon_match !== null, 'lexicon.term_class': routed.lexicon_match?.term_class ?? null, 'episode.day_number': dayNumberFor(ep, ctx.now) },
      handled: { 'create_queue_item:needs_review': routed.queue_item_id, 'create_queue_item:urgent': routed.queue_item_id, show_emergency_instruction: routed.queue_item_id },
    }, ctx);
    return [
      ...routed.events,
      ctx.makeEvent('saved_question_added', { question_id, episode_id: ep.id, text: input.text, queue_item_id: routed.queue_item_id ?? '', lexicon_match: routed.lexicon_match }, { patient_id: ep.patient_id, episode_id: ep.id }),
      ...rules.events,
    ];
  };
}
