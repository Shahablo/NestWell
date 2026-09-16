/**
 * Clinician summaries (FR-40–FR-42, AI-02). The structured part is built deterministically from
 * state; withheld screens appear as withheld with no score (FR-06). The narrative comes from the
 * canned exemplar store (ai.ts) and passes a postfilter that refuses instrument names, scores and
 * mood or risk descriptors.
 */
import { formatDateTime, hoursBetween, toMs } from '../clock';
import { activeStatusesFor, checkinsForEpisode, screensForEpisode } from '../projection';
import type { AppConfig } from '../config.schema';
import type { ContentIndex } from '../content';
import type { AnyEvent, Command, CommandContext, Id, ISO, QueueItemState, QueueKey, State, SummaryPeriod, SummaryState, SummaryStructured } from '../types';
import { assertNarrativeClean, narrativeResult, narrativeViolations } from './ai';
import { DomainError } from './errors';
import { newQueueItem, requireEpisode, staffUserId } from './shared';

export interface StructuredBuild { structured: SummaryStructured; withheld_notices: string[] }

export function buildStructured(input: { state: State; config: AppConfig; content: ContentIndex }, episode_id: Id, now: ISO): StructuredBuild {
  const { state, config, content } = input;
  const ep = state.episodes[episode_id];
  if (!ep) throw new DomainError('unknown_episode', `Unknown episode ${episode_id}`);
  const screens = screensForEpisode(state, episode_id).filter((s) => !s.declined);
  const withheld_notices: string[] = [];
  const when = (iso: ISO): string => formatDateTime(iso, config.practice.timezone);
  const screensOut = screens.map((s) => {
    const withheld = s.shared_with.length === 0;
    if (withheld) withheld_notices.push(`Screening result withheld at patient request (${config.instruments[s.instrument_key]?.short_name ?? s.instrument_key}, ${when(s.administered_at)}).`);
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
  for (const q of items) if (q.state !== 'resolved') unresolved.push(`${q.queue_key} item (${q.trigger_type.replace(/_/g, ' ')}) open since ${when(q.created_at)}`);
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

// ---- AI-02 / AI-14: the narrative must not misstate the record ----------------------------------

const COUNT_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const QUEUE_WORDS: Array<[RegExp, QueueKey]> = [
  [/urgent/, 'urgent'], [/needs[- ]review/, 'needs_review'], [/follow[- ]through/, 'follow_through'], [/unreached/, 'unreached'], [/sensitive[- ]review/, 'sensitive_review'], [/summar/, 'summaries'],
];
const STATE_GROUPS: Record<string, QueueItemState[]> = {
  open: ['open', 'escalated', 'unowned'], acknowledged: ['acknowledged'], resolved: ['resolved'], escalated: ['escalated'], unowned: ['unowned'],
};

/**
 * A canned narrative is served only while its claims about queue items and referrals hold in the
 * structured record built at the same instant. Claims checked: "<n> <queue> item(s) <state>", any
 * mention of a queue's items, "no open queue items" / "none open", "no referrals", "referral: none",
 * and "Referral to <partner>: <state>". Care-plan and visit wording is descriptive and not checked.
 * Returns the contradictions found (empty when the text may be served).
 */
export function narrativeContradictions(text: string, structured: SummaryStructured): string[] {
  const out: string[] = [];
  const t = text.toLowerCase().replace(/-/g, '-');
  const items = structured.escalations;
  const count = (key: QueueKey, states: QueueItemState[] | null): number => items.filter((q) => q.queue_key === key && (states === null || states.includes(q.state))).length;
  const re = /\b(one|two|three|four|five|six|seven|eight|nine|ten|several|\d+)?\s*(urgent|needs[- ]review|follow[- ]through|unreached|sensitive[- ]review|summary|summaries)\s+items?\b(?:\s+(open|acknowledged|resolved|escalated|unowned))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    const key = QUEUE_WORDS.find(([r]) => r.test(m![2]))?.[1];
    if (!key) continue;
    const stateWord = m[3];
    const states = stateWord ? STATE_GROUPS[stateWord] ?? null : null;
    const n = m[1] ? (COUNT_WORDS[m[1]] ?? (m[1] === 'several' ? null : Number(m[1]))) : null;
    const actual = count(key, states);
    if (actual === 0) out.push(`names ${key.replace(/_/g, ' ')} items${stateWord ? ` ${stateWord}` : ''} but the record has none`);
    else if (n !== null && n > actual) out.push(`claims ${n} ${key.replace(/_/g, ' ')} items${stateWord ? ` ${stateWord}` : ''}; the record has ${actual}`);
  }
  const unresolved = items.filter((q) => q.state !== 'resolved').length;
  if (/\b(no open queue items|queue items: none open|none open)\b/.test(t) && unresolved > 0) out.push(`says no queue item is open; ${unresolved} open`);
  if (/\bno referrals?\b|referral: none/.test(t) && structured.referrals.length > 0) out.push('says there is no referral; the record has one');
  const refRe = /referral to [^:.;]+: ([a-z ]+?)(?:[.;]|$)/g;
  while ((m = refRe.exec(t))) {
    if (structured.referrals.length === 0) { out.push('describes a referral; the record has none'); continue; }
    const claimed = m[1].trim().replace(/ /g, '_');
    if (!structured.referrals.some((r) => r.state === claimed)) out.push(`says the referral is ${m[1].trim()}; the record shows ${structured.referrals.map((r) => r.state.replace(/_/g, ' ')).join(', ')}`);
  }
  return out;
}

const countWord = (n: number): string => Object.entries(COUNT_WORDS).find(([, v]) => v === n)?.[0] ?? String(n);

/**
 * A narrative composed from the structured record alone (the AI-02 allowlist: what happened, which
 * items resolved, what is still open), served when no exemplar fits the record. Deterministic; no
 * instrument names, scores or descriptors.
 */
export function composeNarrative(structured: SummaryStructured, config: AppConfig, period: SummaryPeriod): string {
  const parts: string[] = [period === 'on_demand' ? 'On-demand summary.' : `Episode week ${structured.episode_week}.`];
  const byQueue = new Map<QueueKey, { open: number; resolved: number }>();
  for (const q of structured.escalations) {
    const c = byQueue.get(q.queue_key) ?? { open: 0, resolved: 0 };
    if (q.state === 'resolved') c.resolved += 1; else c.open += 1;
    byQueue.set(q.queue_key, c);
  }
  const queueLabel = (k: QueueKey): string => (config.queues.find((d) => d.key === k)?.label ?? k).toLowerCase();
  const queueBits: string[] = [];
  for (const [k, c] of byQueue) {
    if (c.resolved) queueBits.push(`${countWord(c.resolved)} ${queueLabel(k)} item${c.resolved === 1 ? '' : 's'} resolved`);
    if (c.open) queueBits.push(`${countWord(c.open)} ${queueLabel(k)} item${c.open === 1 ? '' : 's'} open`);
  }
  parts.push(queueBits.length ? `Queue items: ${queueBits.join('; ')}.` : 'No queue items.');
  parts.push(structured.referrals.length ? structured.referrals.map((r) => `Referral to ${r.partner}: ${r.state.replace(/_/g, ' ')}.`).join(' ') : 'No referrals.');
  parts.push(structured.visits.length ? `Visits: ${structured.visits.map((v) => `${v.type.replace(/_/g, ' ')} visit ${v.state}`).join('; ')}.` : 'No visits on record.');
  const open = structured.care_plan.filter((c) => c.state === 'open').map((c) => c.title.toLowerCase());
  parts.push(open.length ? `Care plan items open: ${open.join('; ')}.` : 'No care plan items open.');
  parts.push(`Saved questions: ${structured.saved_questions.length === 0 ? 'none' : countWord(structured.saved_questions.length)}.`);
  return parts.join(' ');
}

/** The narrative to store: the exemplar when it fits the record, else a composed narrative (or the generic fallback when even that fails the postfilter). */
export function narrativeFor(ctx: CommandContext, episode_id: Id, period: SummaryPeriod, structured: SummaryStructured): { text: string; events: AnyEvent[] } {
  const nar = narrativeResult(ctx, { episode_id, period });
  const events: AnyEvent[] = [...nar.events];
  if (nar.fallback) return { text: nar.text, events };
  const contradictions = narrativeContradictions(nar.text, structured);
  if (contradictions.length === 0) return { text: nar.text, events };
  const ep = ctx.state.episodes[episode_id];
  events.push(ctx.makeEvent('ai_fallback_used', { feature: 'summary_narrative', key: nar.key, reason: `exemplar_inconsistent: ${contradictions.join('; ')}`, episode_id }, { patient_id: ep?.patient_id ?? null, episode_id }));
  const composed = composeNarrative(structured, ctx.config, period);
  return { text: narrativeViolations(ctx, episode_id, composed).length === 0 ? composed : ctx.config.ai_exemplars.generic_fallback, events };
}

export function draftSummary(input: { episode_id: Id; period: SummaryPeriod }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    const built = buildStructured(ctx, ep.id, ctx.now);
    const nar = narrativeFor(ctx, ep.id, input.period, built.structured);
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
