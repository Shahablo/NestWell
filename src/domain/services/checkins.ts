/**
 * Check-in commands (FR-08–FR-17, FR-29, FR-36a, FR-52). submitCheckin is the one place where a
 * submission fans out: free-text routing, barrier and callback items, rules, the coping trigger,
 * the burden cap and the instrument offer — all in one command so the events commit together.
 *
 * Items the service owns (free text, barriers, callbacks) are created first and passed to the
 * rules engine as `handled`, so a configured rule that documents the same routing is logged as
 * fired with the item it refers to and never creates a duplicate (FR-23 AC, FR-36a).
 */
import { DAY, addHours, toMs } from '../clock';
import type { AppConfig, CheckinTemplate, Instrument } from '../config.schema';
import { coverageDeadline, isLossSubtype } from '../derive';
import { activeStatusesFor, checkinsForEpisode, openQueueItemsFor } from '../projection';
import type { AccessBarrier, AnyEvent, Checkin, CheckinResponse, Command, CommandContext, Id, RuleTag, State } from '../types';
import { DomainError } from './errors';
import { routeFreeTextEvents } from './freetext';
import { evaluateRules, triggerTypeForRule } from './rules';
import { dayNumberFor, newQueueItem, requireOpenEpisode, requirePatient } from './shared';

const BARRIER_FOR_TAG: Partial<Record<RuleTag, AccessBarrier>> = {
  barrier_transport: 'transport', barrier_childcare: 'childcare', barrier_phone_data: 'phone_data', barrier_interpreter: 'interpreter', barrier_cost: 'cost',
};

function requireCheckin(ctx: CommandContext, checkin_id: Id): Checkin {
  const c = ctx.state.checkins[checkin_id];
  if (!c) throw new DomainError('unknown_checkin', `Unknown check-in ${checkin_id}`);
  return c;
}

function requireOpenCheckin(ctx: CommandContext, checkin_id: Id): Checkin {
  const c = requireCheckin(ctx, checkin_id);
  if (c.state !== 'sent' && c.state !== 'opened') throw new DomainError('checkin_not_open', `Check-in ${checkin_id} is ${c.state} at ${ctx.now}`);
  return c;
}

/** Rule tags carried by the chosen options of a submission (multi-tap values contribute every chosen option). */
export function tagsForResponses(template: CheckinTemplate, responses: ReadonlyArray<{ question_key: string; value: string | string[] | null }>): RuleTag[] {
  const tags = new Set<RuleTag>();
  for (const r of responses) {
    if (r.value === null) continue;
    const item = template.items.find((i) => i.key === r.question_key);
    if (!item) continue;
    const values = Array.isArray(r.value) ? r.value : [r.value];
    for (const v of values) for (const t of item.options.find((o) => o.value === v)?.rule_tags ?? []) if (t !== 'none') tags.add(t);
  }
  return [...tags];
}

export function openCheckin(input: { checkin_id: Id }): Command {
  return (ctx) => {
    const c = requireOpenCheckin(ctx, input.checkin_id);
    if (c.opened_at !== null) return [];
    return [ctx.makeEvent('checkin_opened', { checkin_id: c.id, episode_id: c.episode_id }, { episode_id: c.episode_id, patient_id: ctx.state.episodes[c.episode_id]?.patient_id ?? null, client_reported: true })];
  };
}

export interface SubmitResponse { question_key: string; value: string | string[] | null; free_text?: string | null }

/**
 * FR-16: instrument items administered in the trailing seven days plus this instrument's items
 * must stay within the weekly cap. Only a *scheduled* instrument step is ever dropped; a screen
 * triggered by a rule or a coping answer is never deferred.
 */
export function burdenCapAllows(state: State, config: AppConfig, episode_id: Id, instrument: Instrument, now: string): boolean {
  const cap = config.cadence.weekly_burden_cap_items;
  const t = toMs(now);
  const used = Object.values(state.screens)
    .filter((s) => s.episode_id === episode_id && !s.declined && toMs(s.administered_at) > t - 7 * DAY && toMs(s.administered_at) <= t)
    .reduce((sum, s) => sum + s.item_responses.length, 0);
  return used + instrument.items.length <= cap;
}

export function submitCheckin(input: { checkin_id: Id; responses: SubmitResponse[]; complete?: boolean }): Command {
  return (ctx) => {
    const c = requireOpenCheckin(ctx, input.checkin_id);
    const ep = requireOpenEpisode(ctx, c.episode_id);
    const patient = requirePatient(ctx, ep.patient_id);
    const template = ctx.config.checkins[c.template_key];
    if (!template) throw new DomainError('unknown_template', `Unknown check-in template ${c.template_key}`);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const events: AnyEvent[] = [];
    const handled: Record<string, Id | null> = {};

    // Responses in template order; free text routes through FR-17 in this same command (one item per field).
    const responses: CheckinResponse[] = [];
    let freeTextEntered = false;
    let firstFreeTextItem: Id | null = null;
    for (const item of template.items) {
      const given = input.responses.find((r) => r.question_key === item.key);
      const value = given?.value ?? null;
      const free_text = given?.free_text && given.free_text.trim() !== '' ? given.free_text : null;
      let queue_item_id: Id | null = null;
      let lexicon_match: CheckinResponse['lexicon_match'] = null;
      if (free_text !== null) {
        freeTextEntered = true;
        const routed = routeFreeTextEvents(ctx, { episode_id: ep.id, field: 'checkin_free_text', text: free_text, checkin_id: c.id });
        events.push(...routed.events);
        queue_item_id = routed.queue_item_id;
        lexicon_match = routed.lexicon_match;
        if (firstFreeTextItem === null) firstFreeTextItem = routed.queue_item_id;
      }
      responses.push({ question_key: item.key, value, free_text, lexicon_match, queue_item_id });
    }
    if (freeTextEntered) {
      // A rule documenting the free-text routing is logged as fired against the item the service created (an Urgent
      // item takes the place of the Needs-review item on a lexicon match, FR-17).
      handled['create_queue_item:needs_review:free_text'] = firstFreeTextItem;
      handled['create_queue_item:urgent:free_text'] = firstFreeTextItem;
    }
    const answerable = template.items.filter((i) => i.response_type !== 'free_text_optional');
    const allAnswered = answerable.every((i) => {
      const v = responses.find((r) => r.question_key === i.key)?.value;
      return v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
    });
    const complete = allAnswered && input.complete !== false;
    events.unshift(ctx.makeEvent('checkin_submitted', { checkin_id: c.id, episode_id: ep.id, responses, complete, free_text_entered: freeTextEntered }, opts));

    const tags = tagsForResponses(template, responses);

    // FR-36a: one typed Follow-through item per barrier answer, with the practice resource (NOT YET PROVIDED until supplied).
    for (const tag of tags) {
      const barrier = BARRIER_FOR_TAG[tag];
      if (!barrier) continue;
      const resource = ctx.config.practice.barrier_resources[barrier] ?? null;
      const q = newQueueItem(ctx, { queue_key: 'follow_through', episode_id: ep.id, trigger_type: 'barrier', trigger_ref: c.id, note: `barrier: ${barrier}; practice resource: ${resource ?? 'NOT YET PROVIDED'}` });
      events.push(q.event, ctx.makeEvent('barrier_item_created', { episode_id: ep.id, queue_item_id: q.id, barrier }, opts));
      if (!('create_queue_item:follow_through:barrier' in handled)) handled['create_queue_item:follow_through:barrier'] = q.id;
    }

    // FR-21/FR-34: a callback request creates one Follow-through item and the callback record; it closes only with an outcome.
    if (tags.includes('callback_requested')) {
      const q = newQueueItem(ctx, { queue_key: 'follow_through', episode_id: ep.id, trigger_type: 'callback', trigger_ref: c.id, note: 'callback requested on a check-in' });
      events.push(q.event, ctx.makeEvent('callback_requested', { callback_id: ctx.nextId('cb'), episode_id: ep.id, queue_item_id: q.id, preferred_window: null }, opts));
      handled['create_queue_item:follow_through:callback'] = q.id;
    }

    // Facts for the rules (FR-23): response.<key>, response_tags, response_tags_consecutive, episode.day_number, free_text_entered.
    const previous = checkinsForEpisode(ctx.state, ep.id).filter((x) => x.submitted_at !== null && toMs(x.scheduled_at) < toMs(c.scheduled_at)).pop();
    const previousTags = previous ? tagsForResponses(ctx.config.checkins[previous.template_key] ?? template, previous.responses) : [];
    const consecutive = tags.filter((t) => previousTags.includes(t));
    const facts: Record<string, unknown> = {
      response_tags: tags, response_tags_consecutive: consecutive, free_text_entered: freeTextEntered, complete,
      'episode.day_number': dayNumberFor(ep, ctx.now), 'patient.sharing_category': patient.preferences.sharing_category,
      'checkin.template_key': template.key, 'checkin.set': template.set, 'checkin.day_number': c.day_number,
    };
    for (const r of responses) facts[`response.${r.question_key}`] = r.value;
    const rules = evaluateRules('checkin_submitted', { episode_id: ep.id, patient_id: ep.patient_id, checkin_id: c.id, trigger_ref: c.id, facts, handled }, ctx);
    events.push(...rules.events);

    // FR-29 coping trigger: worst option → one Needs-review item now (a configured rule usually creates it, with its
    // open-clinical flag); worst, or middle twice in a row → the instrument is offered now or at the next check-in.
    const copingWorst = tags.includes('coping_difficulty');
    const copingMildTwice = consecutive.includes('coping_difficulty_mild');
    if (copingWorst && !rules.created.some((x) => x.trigger_type === 'coping_difficulty')) {
      const q = newQueueItem(ctx, { queue_key: 'needs_review', episode_id: ep.id, trigger_type: 'coping_difficulty', trigger_ref: c.id, note: 'reported difficulty coping (worst option); instrument offered now or at the next check-in', open_clinical_flag: true });
      events.push(q.event);
    }
    const lossActive = activeStatusesFor(ctx.state, ep.id, ctx.now).some((s) => isLossSubtype(s.subtype));
    const copingRuleInstrument = rules.fired.find((r) => triggerTypeForRule(r) === 'coping_difficulty' && r.action.instrument_key)?.action.instrument_key ?? null;
    const copingInstrument = copingRuleInstrument ?? template.instrument_key ?? Object.keys(ctx.config.instruments).sort()[0] ?? null;
    if ((copingWorst || copingMildTwice) && copingInstrument && !rules.screens_offered.includes(copingInstrument)) {
      events.push(ctx.makeEvent('screen_offered', { episode_id: ep.id, checkin_id: c.id, instrument_key: copingInstrument, reason: 'coping_trigger' }, opts));
      rules.screens_offered.push(copingInstrument);
    }
    // The scheduled instrument step (FR-16: dropped, never a triggered one, when the weekly cap would be exceeded).
    if (template.instrument_key && !rules.screens_offered.includes(template.instrument_key)) {
      const instrument = ctx.config.instruments[template.instrument_key];
      if (instrument && !burdenCapAllows(ctx.state, ctx.config, ep.id, instrument, ctx.now)) {
        events.push(ctx.makeEvent('burden_cap_deferred', { episode_id: ep.id, checkin_id: c.id, item_key: template.instrument_key }, opts));
      } else {
        events.push(ctx.makeEvent('screen_offered', { episode_id: ep.id, checkin_id: c.id, instrument_key: template.instrument_key, reason: lossActive ? 'loss_pathway' : 'scheduled' }, opts));
      }
    }
    return events;
  };
}

export function skipItem(input: { checkin_id: Id; question_key: string }): Command {
  return (ctx) => {
    const c = requireOpenCheckin(ctx, input.checkin_id);
    return [ctx.makeEvent('checkin_item_skipped', { checkin_id: c.id, episode_id: c.episode_id, question_key: input.question_key }, { episode_id: c.episode_id, patient_id: ctx.state.episodes[c.episode_id]?.patient_id ?? null })];
  };
}

export function skipCheckin(input: { checkin_id: Id }): Command {
  return (ctx) => {
    const c = requireOpenCheckin(ctx, input.checkin_id);
    return [ctx.makeEvent('checkin_skipped', { checkin_id: c.id, episode_id: c.episode_id }, { episode_id: c.episode_id, patient_id: ctx.state.episodes[c.episode_id]?.patient_id ?? null })];
  };
}

/** FR-10: "Not now" reschedules once, within the window; it never counts toward FR-13. */
export function notNow(input: { checkin_id: Id; hours?: number }): Command {
  return (ctx) => {
    const c = requireOpenCheckin(ctx, input.checkin_id);
    if (c.rescheduled_once) throw new DomainError('already_rescheduled', 'A check-in can be moved once');
    const hours = input.hours ?? 4;
    const wanted = addHours(ctx.now, hours);
    const rescheduled_to = toMs(wanted) < toMs(c.window_end_at) ? wanted : c.window_end_at;
    if (toMs(rescheduled_to) <= toMs(ctx.now)) throw new DomainError('window_closing', 'The window closes too soon to move this check-in');
    return [ctx.makeEvent('checkin_not_now', { checkin_id: c.id, episode_id: c.episode_id, rescheduled_to }, { episode_id: c.episode_id, patient_id: ctx.state.episodes[c.episode_id]?.patient_id ?? null })];
  };
}

/** FR-52: optional usefulness rating; the comment is free text governed by FR-17. */
export function rateUsefulness(input: { episode_id: Id; week: 6 | 12; rating: number; comment?: string | null }): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    if (!Number.isFinite(input.rating)) throw new DomainError('bad_rating', 'A rating must be a number');
    const events: AnyEvent[] = [];
    let comment_queue_item_id: Id | null = null;
    if (input.comment && input.comment.trim() !== '') {
      const routed = routeFreeTextEvents(ctx, { episode_id: ep.id, field: 'usefulness_comment', text: input.comment });
      events.push(...routed.events);
      comment_queue_item_id = routed.queue_item_id;
    }
    events.push(ctx.makeEvent('usefulness_rated', { episode_id: ep.id, week: input.week, rating: input.rating, comment_queue_item_id }, { patient_id: ep.patient_id, episode_id: ep.id }));
    return events;
  };
}

export interface ClosingStatement {
  kind: 'no_follow_up' | 'pending';
  content_id: string;
  pending: string[];
  /** Computed from the next coverage window of the Needs-review queue (FR-15). */
  target_time: string | null;
}

/**
 * FR-15: the no-follow-up statement only when every item was answered, no free text was entered,
 * no screen was deferred, no rule fired, and no queue item is open for the episode; otherwise the
 * pending form naming what is pending and the computed target.
 */
export function closingStatementFor(state: State, config: AppConfig, checkin_id: Id, now: string): ClosingStatement {
  const c = state.checkins[checkin_id];
  const template = c ? config.checkins[c.template_key] : undefined;
  if (!c || !template) return { kind: 'pending', content_id: 'closing.pending', pending: ['this check-in'], target_time: null };
  const pending: string[] = [];
  if (c.state !== 'completed') pending.push('unanswered items');
  if (c.responses.some((r) => r.free_text !== null)) pending.push('your written note');
  const itemsForCheckin = Object.values(state.queueItems).filter((q) => q.trigger_ref === c.id || c.responses.some((r) => r.queue_item_id === q.id));
  if (itemsForCheckin.length) pending.push('your answers');
  if (template.instrument_key && !Object.values(state.screens).some((s) => s.checkin_id === c.id)) pending.push('the questionnaire you set aside');
  if (openQueueItemsFor(state, c.episode_id).length) pending.push('an open item with your care team');
  if (pending.length === 0) return { kind: 'no_follow_up', content_id: template.closing_statement_ids.no_follow_up, pending: [], target_time: null };
  const def = config.queues.find((q) => q.key === 'needs_review');
  const entries = config.coverage.filter((e) => e.queue_key === 'needs_review');
  const target = def ? (def.timer_basis === 'coverage_hours' ? coverageDeadline(now, def.ack_target_minutes, entries, config.practice.timezone) : addHours(now, def.ack_target_minutes / 60)) : null;
  return { kind: 'pending', content_id: template.closing_statement_ids.pending, pending: [...new Set(pending)], target_time: target };
}
