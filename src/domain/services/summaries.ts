/**
 * Clinician summaries (FR-40–FR-42, AI-02). The structured part is built deterministically from
 * state; withheld screens appear as withheld with no score (FR-06). The narrative comes from the
 * canned exemplar store (ai.ts) and passes a postfilter that refuses instrument names, scores and
 * mood or risk descriptors.
 */
import { hoursBetween, toMs } from '../clock';
import { activeStatusesFor, checkinsForEpisode, screensForEpisode } from '../projection';
import type { AppConfig } from '../config.schema';
import type { ContentIndex } from '../content';
import type { Command, Id, ISO, State, SummaryPeriod, SummaryState, SummaryStructured } from '../types';
import { assertNarrativeClean, narrativeResult } from './ai';
import { DomainError } from './errors';
import { newQueueItem, requireEpisode, staffUserId } from './shared';

export interface StructuredBuild { structured: SummaryStructured; withheld_notices: string[] }

export function buildStructured(input: { state: State; config: AppConfig; content: ContentIndex }, episode_id: Id, now: ISO): StructuredBuild {
  const { state, config, content } = input;
  const ep = state.episodes[episode_id];
  if (!ep) throw new DomainError('unknown_episode', `Unknown episode ${episode_id}`);
  const screens = screensForEpisode(state, episode_id).filter((s) => !s.declined);
  const withheld_notices: string[] = [];
  const screensOut = screens.map((s) => {
    const withheld = s.shared_with.length === 0;
    if (withheld) withheld_notices.push(`Screening result withheld at patient request (${config.instruments[s.instrument_key]?.short_name ?? s.instrument_key}, ${s.administered_at}).`);
    return { instrument: s.instrument_key, administered_at: s.administered_at, score: withheld ? null : s.score, positive: withheld ? null : s.positive, withheld };
  });
  // FR-32: intervals only for referrals/assessments linked to a positive screen; the first linked screen wins.
  let screen_to_assessment_hours: number | null = null;
  let screen_to_connection_hours: number | null = null;
  for (const s of screens.filter((x) => x.positive)) {
    if (screen_to_assessment_hours === null) {
      const a = Object.values(state.assessments).filter((x) => x.screen_result_id === s.id).sort((p, q) => toMs(p.recorded_at) - toMs(q.recorded_at))[0];
      if (a) screen_to_assessment_hours = round1(hoursBetween(s.administered_at, a.recorded_at));
    }
    if (screen_to_connection_hours === null) {
      const r = Object.values(state.referrals).filter((x) => x.screen_result_id === s.id && x.completed_at !== null).sort((p, q) => toMs(p.completed_at as ISO) - toMs(q.completed_at as ISO))[0];
      if (r && r.completed_at) screen_to_connection_hours = round1(hoursBetween(s.administered_at, r.completed_at));
    }
  }
  const items = Object.values(state.queueItems).filter((q) => q.episode_id === episode_id && q.queue_key !== 'summaries').sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
  const referrals = Object.values(state.referrals).filter((r) => r.episode_id === episode_id).sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
  const visits = Object.values(state.visits).filter((v) => v.episode_id === episode_id).sort((a, b) => toMs(a.scheduled_for) - toMs(b.scheduled_for));
  const carePlan = Object.values(state.carePlanItems).filter((c) => c.episode_id === episode_id);
  const unresolved: string[] = [];
  for (const q of items) if (q.state !== 'resolved') unresolved.push(`${q.queue_key} item (${q.trigger_type.replace(/_/g, ' ')}) open since ${q.created_at}`);
  for (const r of referrals) if (r.state !== 'appointment_completed' && r.state !== 'closed') unresolved.push(`referral ${r.state.replace(/_/g, ' ')}`);
  for (const v of visits) if (v.state === 'scheduled' && toMs(v.scheduled_for) < toMs(now)) unresolved.push(`${v.type.replace(/_/g, ' ')} visit not yet recorded`);
  for (const c of carePlan) if (c.state === 'open' && c.due_at !== null && toMs(c.due_at) < toMs(now)) unresolved.push(`care plan item ${c.key} past due`);
  const week = ep.delivery_date ? Math.max(0, Math.floor((toMs(now) - toMs(ep.delivery_date)) / (7 * 86_400_000))) : 0;
  const statuses = activeStatusesFor(state, episode_id, now);
  if (statuses.length) withheld_notices.push(`Sensitive status active (${statuses.map((s) => s.subtype).join(', ')}); suppressed content is not listed.`);
  const structured: SummaryStructured = {
    episode_week: week,
    screens: screensOut,
    intervals: { screen_to_assessment_hours, screen_to_connection_hours },
    escalations: items.map((q) => ({ queue_key: q.queue_key, created_at: q.created_at, state: q.state, outcome: q.outcome })),
    referrals: referrals.map((r) => ({ state: r.state, partner: config.practice.referral_partners.find((p) => p.id === r.partner_id)?.name ?? r.partner_id, created_at: r.created_at })),
    visits: visits.map((v) => ({ type: v.type, state: v.state, scheduled_for: v.scheduled_for })),
    unresolved,
    care_plan: carePlan.map((c) => ({ title: content.get(c.title_content_id)?.title ?? c.title_content_id, state: c.state })),
    saved_questions: Object.values(state.savedQuestions).filter((q) => q.episode_id === episode_id).sort((a, b) => a.order - b.order).map((q) => q.text),
  };
  void checkinsForEpisode;
  return { structured, withheld_notices };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function draftSummary(input: { episode_id: Id; period: SummaryPeriod }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    const built = buildStructured(ctx, ep.id, ctx.now);
    const nar = narrativeResult(ctx, { episode_id: ep.id, period: input.period });
    assertNarrativeClean(ctx, ep.id, nar.text);
    const summary_id = ctx.nextId('sum');
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const q = newQueueItem(ctx, { queue_key: 'summaries', episode_id: ep.id, trigger_type: 'summary', trigger_ref: summary_id, note: `${input.period} summary drafted; review` });
    return [
      ...nar.events,
      ctx.makeEvent('summary_drafted', { summary_id, episode_id: ep.id, period: input.period, structured: built.structured, narrative: nar.text, ai_draft: true, withheld_notices: built.withheld_notices }, opts),
      q.event,
    ];
  };
}

/** FR-41: only a clinician marks reviewed; a draft never becomes delivered without review. */
export function setSummaryState(input: { summary_id: Id; state: SummaryState; reviewer_id?: Id | null }): Command {
  return (ctx) => {
    const sm = ctx.state.summaries[input.summary_id];
    if (!sm) throw new DomainError('unknown_summary', `Unknown summary ${input.summary_id}`);
    const ep = requireEpisode(ctx, sm.episode_id);
    if (input.state === 'reviewed' && ctx.actor.role !== 'clinician' && ctx.actor.type !== 'seed') throw new DomainError('not_permitted', 'Only a clinician marks a summary reviewed (FR-41)');
    if (input.state === 'delivered' && sm.state !== 'reviewed') throw new DomainError('not_reviewed', 'A draft cannot be delivered before review (FR-41)');
    const reviewer_id = input.state === 'reviewed' ? staffUserId(ctx, input.reviewer_id) : input.reviewer_id ?? sm.reviewer_id;
    return [ctx.makeEvent('summary_state_changed', { summary_id: sm.id, state: input.state, reviewer_id }, { patient_id: ep.patient_id, episode_id: ep.id })];
  };
}
