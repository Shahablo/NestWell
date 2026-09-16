/**
 * FR-23 rules engine. Rules are config (SR-06): trigger + conditions (all/any) + one action.
 * evaluateRules is pure; it returns the events for every rule that fires. A caller that has
 * already performed an action itself (for example administerScreen creating the FR-30/FR-30a
 * items under the sharing policy, or submitCheckin creating the typed barrier items) passes it
 * in `handled` so the rule is still logged as fired (rule id and version, FR-23 AC) without a
 * duplicate action.
 *
 * `handled` keys, most specific first: the rule key; `<actionKey>:<trigger_type>` (for example
 * `create_queue_item:follow_through:barrier`); the bare action key (`create_queue_item:urgent`,
 * `show_emergency_instruction`). The value is the queue item the caller created, or null when the
 * caller decided that no item exists (a threshold positive with sharing withheld, FR-06).
 */
import { toMs } from '../clock';
import type { Rule, RuleCondition } from '../config.schema';
import type { AnyEvent, CommandContext, Id, QueueKey, TriggerType } from '../types';
import { newQueueItem } from './shared';

export type Facts = Record<string, unknown>;

export interface RuleInput {
  episode_id: Id;
  patient_id: Id;
  checkin_id: Id | null;
  trigger_ref: Id | null;
  facts: Facts;
  /** Actions already performed by the caller (see the module comment), mapped to the queue item id created (or null). */
  handled?: Record<string, Id | null>;
}

export interface RuleOutcome {
  events: AnyEvent[];
  fired: Rule[];
  created: Array<{ queue_item_id: Id; queue_key: QueueKey; trigger_type: TriggerType; rule_key: string }>;
  emergency_shown: boolean;
  screens_offered: string[];
  paused: boolean;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function sameScalar(a: unknown, b: unknown): boolean {
  const na = asNumber(a);
  const nb = asNumber(b);
  if (na !== null && nb !== null && typeof a !== 'boolean' && typeof b !== 'boolean') return na === nb;
  return String(a) === String(b);
}

export function conditionHolds(cond: RuleCondition, facts: Facts): boolean {
  const fact = facts[cond.field];
  if (fact === undefined || fact === null) return false;
  const values = Array.isArray(cond.value) ? cond.value : [cond.value];
  switch (cond.op) {
    case 'eq':
      return Array.isArray(fact) ? fact.some((f) => sameScalar(f, cond.value)) : sameScalar(fact, cond.value);
    case 'gte': {
      const f = asNumber(fact); const v = asNumber(cond.value);
      return f !== null && v !== null && f >= v;
    }
    case 'lte': {
      const f = asNumber(fact); const v = asNumber(cond.value);
      return f !== null && v !== null && f <= v;
    }
    case 'in':
    case 'any_of': {
      const facts_ = Array.isArray(fact) ? fact : [fact];
      return facts_.some((f) => values.some((v) => sameScalar(f, v)));
    }
  }
}

export function ruleMatches(rule: Rule, facts: Facts): boolean {
  const all = rule.conditions.all ?? [];
  const any = rule.conditions.any ?? [];
  if (!all.every((c) => conditionHolds(c, facts))) return false;
  if (any.length > 0 && !any.some((c) => conditionHolds(c, facts))) return false;
  return true;
}

export function actionKey(action: Rule['action']): string {
  switch (action.type) {
    case 'show_emergency_instruction': return 'show_emergency_instruction';
    case 'create_queue_item': return `create_queue_item:${action.queue_key ?? 'urgent'}`;
    case 'administer_screen': return `administer_screen:${action.instrument_key ?? ''}`;
    case 'pause_checkins': return 'pause_checkins';
  }
}

/** The queue-item trigger type implied by a rule's trigger and conditions (used for typed queue items and metrics). */
export function triggerTypeForRule(rule: Rule): TriggerType {
  const conds = [...(rule.conditions.all ?? []), ...(rule.conditions.any ?? [])];
  const mentions = (needle: string): boolean => conds.some((c) => {
    const vals = Array.isArray(c.value) ? c.value.map(String) : [String(c.value)];
    return c.field === needle || vals.includes(needle);
  });
  if (mentions('screen.critical_item_hit')) return 'critical_item';
  if (mentions('screen.positive')) return 'positive_screen';
  if (mentions('free_text_entered') || rule.trigger === 'saved_question_added') return 'free_text';
  if (mentions('coping_difficulty') || mentions('coping_difficulty_mild')) return 'coping_difficulty';
  if (mentions('callback_requested')) return 'callback';
  if (conds.some((c) => (Array.isArray(c.value) ? c.value : [c.value]).some((v) => String(v).startsWith('barrier_')))) return 'barrier';
  if (rule.trigger === 'status_set' || mentions('status.subtype')) return 'sensitive_status';
  if (rule.trigger === 'help_now') return 'help_now';
  return 'rule';
}

/** The `handled` entry that covers a rule, most specific first (rule key, action + trigger type, action). */
function handledEntry(rule: Rule, key: string, handled: Record<string, Id | null>): { found: true; id: Id | null } | { found: false } {
  for (const k of [rule.key, `${key}:${triggerTypeForRule(rule)}`, key]) {
    if (k in handled) return { found: true, id: handled[k] ?? null };
  }
  return { found: false };
}

export function evaluateRules(trigger: Rule['trigger'], input: RuleInput, ctx: CommandContext): RuleOutcome {
  const out: RuleOutcome = { events: [], fired: [], created: [], emergency_shown: false, screens_offered: [], paused: false };
  const handled = input.handled ?? {};
  const opts = { patient_id: input.patient_id, episode_id: input.episode_id };
  const rules = ctx.config.rules.filter((r) => r.trigger === trigger && toMs(r.effective_from) <= toMs(ctx.now));
  for (const rule of rules) {
    if (!ruleMatches(rule, input.facts)) continue;
    out.fired.push(rule);
    const key = actionKey(rule.action);
    const fired = (queue_item_id: Id | null): AnyEvent => ctx.makeEvent('rule_fired', {
      episode_id: input.episode_id, rule_key: rule.key, rule_version: rule.version, trigger, action: key, checkin_id: input.checkin_id, queue_item_id,
    }, opts);
    const already = handledEntry(rule, key, handled);
    if (already.found) {
      out.events.push(fired(already.id));
      continue;
    }
    switch (rule.action.type) {
      case 'show_emergency_instruction': {
        const queue_key = rule.action.queue_key ?? 'urgent';
        const q = newQueueItem(ctx, { queue_key, episode_id: input.episode_id, patient_id: input.patient_id, trigger_type: 'rule', trigger_ref: input.trigger_ref, note: rule.action.note ?? `rule ${rule.key} v${rule.version}: urgent answer`, open_clinical_flag: rule.action.open_clinical_flag ?? false });
        out.events.push(fired(q.id), q.event);
        out.events.push(ctx.makeEvent('emergency_instruction_shown', { episode_id: input.episode_id, layout: 'full_screen', trigger: `rule:${rule.key}` }, opts));
        out.events.push(ctx.makeEvent('help_requested', { episode_id: input.episode_id, source: 'rule', lexicon_version: null, queue_item_id: q.id }, opts));
        out.created.push({ queue_item_id: q.id, queue_key, trigger_type: 'rule', rule_key: rule.key });
        out.emergency_shown = true;
        handled['show_emergency_instruction'] = q.id;
        break;
      }
      case 'create_queue_item': {
        const queue_key = rule.action.queue_key ?? 'needs_review';
        const trigger_type = triggerTypeForRule(rule);
        const q = newQueueItem(ctx, { queue_key, episode_id: input.episode_id, patient_id: input.patient_id, trigger_type, trigger_ref: input.trigger_ref, note: rule.action.note ?? `rule ${rule.key} v${rule.version}`, open_clinical_flag: rule.action.open_clinical_flag ?? false });
        out.events.push(fired(q.id), q.event);
        out.created.push({ queue_item_id: q.id, queue_key, trigger_type, rule_key: rule.key });
        handled[`${key}:${trigger_type}`] = q.id;
        break;
      }
      case 'administer_screen': {
        const instrument_key = rule.action.instrument_key ?? '';
        out.events.push(fired(null));
        if (instrument_key && !out.screens_offered.includes(instrument_key)) {
          out.events.push(ctx.makeEvent('screen_offered', { episode_id: input.episode_id, checkin_id: input.checkin_id, instrument_key, reason: 'coping_trigger' }, opts));
          out.screens_offered.push(instrument_key);
        }
        handled[key] = null;
        break;
      }
      case 'pause_checkins': {
        out.events.push(fired(null));
        if (!out.paused) {
          out.events.push(ctx.makeEvent('checkins_paused', { episode_id: input.episode_id, actor: 'staff', until: null, duration_label: `rule:${rule.key}` }, opts));
          out.paused = true;
        }
        handled[key] = null;
        break;
      }
    }
  }
  return out;
}
