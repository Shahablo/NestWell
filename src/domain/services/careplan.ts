/**
 * Care plan helpers (FR-18–FR-20) used by enrollment and the patient UI. Items come from
 * config only; explanations are verbatim approved content or a labelled canned rewording (AI-01).
 */
import { addDays, atLocalHour } from '../clock';
import type { AppConfig } from '../config.schema';
import type { CarePlanItem, CheckinSet, CommandContext, Id, ISO, Locale, VisitType } from '../types';
import { rewordResult, type RewordResult } from './ai';

export type CarePlanSeed = Omit<CarePlanItem, 'state' | 'completed_at'>;

/** Items from config filtered by set, due dates relative to the anchor (delivery or expected date). */
export function carePlanItemsFor(ctx: CommandContext, episode_id: Id, set: CheckinSet, anchor: ISO): CarePlanSeed[] {
  const tz = ctx.config.practice.timezone;
  const hour = ctx.config.cadence.send_hour_local;
  return ctx.config.careplan.items
    .filter((item) => item.sets.includes(set))
    .map((item) => ({
      id: ctx.nextId('cp'), episode_id, key: item.key, version: item.version, title_content_id: item.title_content_id, owner_role: item.owner_role,
      due_at: item.due_day === null ? null : atLocalHour(addDays(anchor, item.due_day), hour, tz), tags: [...item.tags],
    }));
}

export function visitsFor(config: AppConfig, anchor: ISO): Array<{ type: VisitType; scheduled_for: ISO; purpose: string; bring: string[] }> {
  return config.careplan.visits.map((v) => ({ type: v.type, scheduled_for: atLocalHour(addDays(anchor, v.day), 10, config.practice.timezone), purpose: v.purpose, bring: [...v.bring] }));
}

export interface Explanation {
  content_id: string;
  version: string | null;
  /** Verbatim approved body (or the visible draft/missing marker). */
  text: string;
  placeholder: boolean;
  /** A labelled canned rewording (AI-01), null for locked or unapproved items. */
  ai: RewordResult | null;
}

/** FR-19: every explanation shows content id and version; drafts render the watermark, never silently. */
export function explanationFor(ctx: CommandContext, item: CarePlanItem, locale: Locale = 'en', withReword = false): Explanation {
  const id = item.title_content_id;
  const content = ctx.content.get(id, locale);
  const ai = withReword ? rewordResult(ctx, { content_id: id, episode_id: item.episode_id }) : null;
  return { content_id: id, version: content?.version ?? null, text: ctx.content.text(id, {}, locale), placeholder: content?.placeholder ?? true, ai: ai && !ai.blocked ? ai : null };
}
