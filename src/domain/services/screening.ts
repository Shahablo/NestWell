/**
 * Screening (FR-26–FR-32), sharing enforcement (FR-06, SR-14) and the FR-30a critical-item policy.
 * Scoring is deterministic and per-option (reverse-scored items carry their scores in config).
 */
import { toMs } from '../clock';
import type { Instrument } from '../config.schema';
import { lossPathwayActive, roleOfActor } from '../projection';
import type { AssessmentOutcome, Command, CommandContext, Id, Role, ScreenResult, SharingCategory, State } from '../types';
import { DomainError } from './errors';
import { evaluateRules } from './rules';
import { dayNumberFor, newQueueItem, requireEpisode, requireOpenEpisode, requirePatient, staffTimeEvent, staffUserId } from './shared';

export const CRITICAL_WITHHELD_NOTE = 'critical safety item positive; other results withheld at patient request; policy unconfirmed (FR-30a)';
export const SHARING_WITHHELD_NOTICE = 'screen completed, sharing withheld';
/** The category-neutral item note when the sharing category excludes the coordinator (FR-06). */
export const SCREEN_COMPLETED_NOTE = 'screen completed; details for the clinician in the screening review';

export interface ScoreResult { score: number; positive: boolean; critical_item_hit: boolean }

/** Pure: responses are option indexes per item, in instrument order. */
export function score(instrument: Instrument, responses: readonly number[]): ScoreResult {
  if (responses.length !== instrument.items.length) {
    throw new DomainError('bad_responses', `${instrument.key} expects ${instrument.items.length} responses, got ${responses.length}`);
  }
  let total = 0;
  let critical = false;
  instrument.items.forEach((item, i) => {
    const option = item.options[responses[i]];
    if (!option) throw new DomainError('bad_responses', `${instrument.key} item ${item.key}: option index ${responses[i]} out of range`);
    total += option.score;
    if (item.critical && option.score >= instrument.critical_item_min_score) critical = true;
  });
  return { score: total, positive: total >= instrument.threshold_positive, critical_item_hit: critical };
}

/** FR-06: the roles a result routes to, recorded at administration time. */
export function sharedWithFor(category: SharingCategory): Role[] {
  switch (category) {
    case 'clinician_only': return ['clinician'];
    case 'clinician_and_coordinator': return ['clinician', 'coordinator'];
    case 'clinician_coordinator_partner': return ['clinician', 'coordinator', 'referral_partner'];
    case 'nobody_yet': return [];
  }
}

export interface AdministerInput {
  episode_id: Id;
  instrument_key: string;
  checkin_id?: Id | null;
  item_responses: number[];
  framing?: 'standard' | 'loss_pathway';
}

export function administerScreen(input: AdministerInput): Command {
  return (ctx) => {
    const ep = requireOpenEpisode(ctx, input.episode_id);
    const patient = requirePatient(ctx, ep.patient_id);
    const instrument = ctx.config.instruments[input.instrument_key];
    if (!instrument) throw new DomainError('unknown_instrument', `Unknown instrument ${input.instrument_key}`);
    const result = score(instrument, input.item_responses);
    const category = patient.preferences.sharing_category;
    const shared_with = sharedWithFor(category);
    const shared = shared_with.length > 0;
    const lossActive = lossPathwayActive(ctx.state, ep.id, ctx.now);
    const framing = input.framing ?? (lossActive ? 'loss_pathway' : 'standard');
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const screen_result_id = ctx.nextId('scr');
    const events: ReturnType<Command> = [
      ctx.makeEvent('screen_administered', {
        screen_result_id, episode_id: ep.id, patient_id: ep.patient_id, instrument_key: instrument.key, instrument_version: instrument.version,
        checkin_id: input.checkin_id ?? null, item_responses: [...input.item_responses], score: result.score, positive: result.positive,
        critical_item_hit: result.critical_item_hit, shared_with, framing,
      }, opts),
    ];

    // FR-06: the sharing question is re-asked once, at the next instrument step after a "nobody yet".
    if (category === 'nobody_yet') {
      const previous = Object.values(ctx.state.screens).filter((s) => s.patient_id === patient.id && !s.declined && s.shared_with.length === 0).length;
      if (previous < 1) events.push(ctx.makeEvent('sharing_reasked', { patient_id: patient.id, count: previous + 1 }, opts));
    }

    const handled: Record<string, Id | null> = {};
    if (result.positive) {
      let nrId: Id | null = null;
      if (shared) {
        // FR-06 / SR-14 coordinator exclusion: the Needs-review queue is visible to both staff roles, so when the
        // category excludes the coordinator the item itself carries nothing about the result; the clinician opens
        // the screening review for the details.
        const coordinatorSees = shared_with.includes('coordinator');
        const q = coordinatorSees
          ? newQueueItem(ctx, { queue_key: 'needs_review', episode_id: ep.id, trigger_type: 'positive_screen', trigger_ref: screen_result_id, note: `screen at or above threshold (${instrument.short_name}); result shared with ${shared_with.join(', ')}` })
          : newQueueItem(ctx, { queue_key: 'needs_review', episode_id: ep.id, trigger_type: 'rule', trigger_ref: screen_result_id, note: SCREEN_COMPLETED_NOTE });
        events.push(q.event);
        nrId = q.id;
      }
      handled['create_queue_item:needs_review'] = nrId; // null = withheld at patient request (FR-06)
    }
    if (result.critical_item_hit) {
      const overrides = ctx.config.freetext.critical_item_overrides_sharing;
      if (shared || overrides) {
        const q = newQueueItem(ctx, { queue_key: 'urgent', episode_id: ep.id, trigger_type: 'critical_item', trigger_ref: screen_result_id, note: shared ? `critical safety item positive (${instrument.short_name})` : CRITICAL_WITHHELD_NOTE });
        events.push(q.event);
        events.push(ctx.makeEvent('emergency_instruction_shown', { episode_id: ep.id, layout: 'full_screen', trigger: 'critical_item' }, opts));
        events.push(ctx.makeEvent('help_requested', { episode_id: ep.id, source: 'critical_item', lexicon_version: null, queue_item_id: q.id }, opts));
        events.push(ctx.makeEvent('critical_item_hit', { episode_id: ep.id, screen_result_id, shared: true, queue_item_id: q.id }, opts));
        handled['show_emergency_instruction'] = q.id;
        handled['create_queue_item:urgent'] = q.id;
      } else {
        events.push(ctx.makeEvent('emergency_instruction_shown', { episode_id: ep.id, layout: 'full_screen', trigger: 'critical_item' }, opts));
        events.push(ctx.makeEvent('critical_item_hit', { episode_id: ep.id, screen_result_id, shared: false, queue_item_id: null }, opts));
        handled['show_emergency_instruction'] = null;
        handled['create_queue_item:urgent'] = null;
      }
    }
    const rules = evaluateRules('screen_scored', {
      episode_id: ep.id, patient_id: ep.patient_id, checkin_id: input.checkin_id ?? null, trigger_ref: screen_result_id, handled,
      facts: {
        'screen.score': result.score, 'screen.positive': result.positive, 'screen.critical_item_hit': result.critical_item_hit,
        'screen.instrument_key': instrument.key, 'patient.sharing_category': category, 'episode.day_number': dayNumberFor(ep, ctx.now),
      },
    }, ctx);
    return [...events, ...rules.events];
  };
}

export function skipScreen(input: { episode_id: Id; instrument_key: string; checkin_id?: Id | null }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    return [ctx.makeEvent('screen_skipped', { episode_id: ep.id, instrument_key: input.instrument_key, checkin_id: input.checkin_id ?? null }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

/** FR-29: a decline is recorded on the coping Needs-review item so it reads "reported difficulty coping; screen declined". */
export function declineScreen(input: { episode_id: Id; instrument_key: string; queue_item_id?: Id | null }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    return [ctx.makeEvent('screen_declined', { episode_id: ep.id, instrument_key: input.instrument_key, queue_item_id: input.queue_item_id ?? null }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

/** FR-03a / SR-13: every staff read of item responses or free text is recorded; SR-14 refuses reads outside the sharing category. */
export function readScreen(input: { screen_result_id: Id | null; episode_id?: Id; field: 'screen_items' | 'free_text'; staff_user_id?: Id | null }): Command {
  return (ctx) => {
    const role = roleOfActor(ctx.actor);
    const screen = input.screen_result_id ? ctx.state.screens[input.screen_result_id] : undefined;
    if (input.screen_result_id && !screen) throw new DomainError('unknown_screen', `Unknown screen result ${input.screen_result_id}`);
    const episode_id = screen?.episode_id ?? input.episode_id;
    if (!episode_id) throw new DomainError('episode_required', 'A free-text read needs an episode');
    const ep = requireEpisode(ctx, episode_id);
    if (role === 'budget_owner') throw new DomainError('not_permitted', 'The budget owner never sees item-level data (SR-14)');
    if (screen && !visibleScreenFor(ctx.state, screen, role).visible) throw new DomainError('sharing_withheld', SHARING_WITHHELD_NOTICE);
    return [ctx.makeEvent('screen_responses_read', { patient_id: ep.patient_id, episode_id: ep.id, screen_result_id: screen?.id ?? null, field: input.field, role, staff_user_id: staffUserId(ctx, input.staff_user_id) }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}

export function recordAssessment(input: { episode_id: Id; screen_result_id?: Id | null; trigger_ref?: Id | null; outcome: AssessmentOutcome; note?: string | null; minutes?: number | null; clinician_id?: Id | null }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    const clinician = staffUserId(ctx, input.clinician_id);
    const assessment_id = ctx.nextId('as');
    const events: ReturnType<Command> = [
      ctx.makeEvent('assessment_recorded', { assessment_id, episode_id: ep.id, screen_result_id: input.screen_result_id ?? null, trigger_ref: input.trigger_ref ?? null, clinician_id: clinician, outcome: input.outcome, note: input.note ?? null }, { patient_id: ep.patient_id, episode_id: ep.id }),
    ];
    if (input.minutes && input.minutes > 0) events.push(staffTimeEvent(ctx, { episode_id: ep.id, user_id: clinician, source_type: 'assessment', source_id: assessment_id, minutes: input.minutes }));
    return events;
  };
}

export interface VisibleScreen {
  visible: boolean;
  score: number | null;
  positive: boolean | null;
  critical_item_hit: boolean | null;
  items: number[] | null;
  withheld_notice: string | null;
  /** True when an admin is shown data outside the sharing category (audit view only). */
  admin_override: boolean;
}

/** SR-14 data-layer enforcement: the practice UI must call this before rendering any screen data. */
export function visibleScreenFor(state: State, screen: ScreenResult, role: Role): VisibleScreen {
  void state;
  const hidden = (notice: string, admin_override = false): VisibleScreen => ({ visible: false, score: null, positive: null, critical_item_hit: null, items: null, withheld_notice: notice, admin_override });
  if (role === 'budget_owner') return hidden('item-level screening data is never shown to the budget owner');
  if (screen.declined) return hidden('screen declined');
  const full = (admin_override: boolean): VisibleScreen => ({ visible: true, score: screen.score, positive: screen.positive, critical_item_hit: screen.critical_item_hit, items: [...screen.item_responses], withheld_notice: null, admin_override });
  // The admin (the founder running the demo) sees everything, always flagged as an audit-only override of the category.
  if (role === 'admin') return full(true);
  if (role === 'patient') return full(false);
  if (screen.shared_with.includes(role)) return full(false);
  return hidden(SHARING_WITHHELD_NOTICE);
}

/** Screens an episode has on record, oldest first (helper for the practice UI and summaries). */
export function screensFor(state: State, episode_id: Id): ScreenResult[] {
  return Object.values(state.screens).filter((s) => s.episode_id === episode_id).sort((a, b) => toMs(a.administered_at) - toMs(b.administered_at));
}

export function latestPositiveScreen(state: State, episode_id: Id): ScreenResult | undefined {
  return screensFor(state, episode_id).filter((s) => !s.declined && s.positive).pop();
}

export function ctxRole(ctx: CommandContext): Role {
  return roleOfActor(ctx.actor);
}
