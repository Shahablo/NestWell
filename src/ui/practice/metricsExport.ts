/** FR-53: metrics export rows (CSV or JSONL) with versions on every row. */
import type { CoreMeasures, Metrics, Rate, Stats } from '../../domain/metrics';

export interface MetricRow {
  measure: string;
  group_type: string;
  group: string;
  numerator: number | null;
  denominator: number | null;
  value: number | null;
  unit: string;
  clock: string;
  cadence_version: string;
  careplan_version: string;
  freetext_version: string;
}

function coreRows(m: CoreMeasures, group_type: string, group: string, base: Pick<MetricRow, 'clock' | 'cadence_version' | 'careplan_version' | 'freetext_version'>): MetricRow[] {
  const rows: MetricRow[] = [];
  const rate = (measure: string, r: Rate, unit = 'rate') => rows.push({ measure, group_type, group, numerator: r.numerator, denominator: r.denominator, value: r.rate, unit, ...base });
  const count = (measure: string, n: number, unit = 'count') => rows.push({ measure, group_type, group, numerator: n, denominator: null, value: n, unit, ...base });
  const statRows = (measure: string, s: Stats, unit: string) => {
    rows.push({ measure: `${measure}_median`, group_type, group, numerator: null, denominator: s.n, value: s.median, unit, ...base });
    rows.push({ measure: `${measure}_mean`, group_type, group, numerator: null, denominator: s.n, value: s.mean, unit, ...base });
    rows.push({ measure: `${measure}_p90`, group_type, group, numerator: null, denominator: s.n, value: s.p90, unit, ...base });
    rows.push({ measure: `${measure}_top_decile_mean`, group_type, group, numerator: null, denominator: s.n, value: s.top_decile_mean, unit, ...base });
  };
  count('eligible', m.eligible);
  count('enrolled', m.enrolled);
  rate('enrollment', m.enrollment);
  for (const [k, ps] of [['program_completion', m.program_completion], ['care_completion', m.care_completion], ['planned_visits', m.planned_visits], ['initial_contact_by_day_21', m.initial_contact_by_day_21]] as const) {
    rate(`${k}_all_eligible`, ps.all_eligible);
    rate(`${k}_enrolled`, ps.enrolled);
  }
  rate('dropout_enrolled', m.dropout.enrolled);
  rate('dropout_all_eligible', m.dropout.all_eligible);
  count('no_contact_by_day_21', m.dropout.no_contact_by_day_21);
  for (const [trigger, n] of Object.entries(m.dropout.unreached_by_trigger)) count(`unreached_${trigger}`, n);
  count('referrals_created', m.referral_completion.created);
  count('referrals_completed', m.referral_completion.completed);
  count('referrals_no_capacity', m.referral_completion.no_capacity);
  count('referrals_not_covered', m.referral_completion.not_covered);
  count('referrals_declined', m.referral_completion.declined);
  rows.push({ measure: 'referral_completion', group_type, group, numerator: m.referral_completion.completed, denominator: m.referral_completion.created, value: m.referral_completion.rate, unit: 'rate', ...base });
  statRows('staff_minutes_per_episode', m.staff_minutes, 'minutes');
  rate('transition_destination_gap', m.transition_destination_gap);
  return rows;
}

export function metricsRows(metrics: Metrics): MetricRow[] {
  const base = { clock: metrics.clock, cadence_version: metrics.versions.cadence, careplan_version: metrics.versions.careplan, freetext_version: metrics.versions.freetext };
  const rows = coreRows(metrics, 'all', 'all', base);
  const push = (measure: string, value: number | null, unit: string, numerator: number | null = null, denominator: number | null = null) =>
    rows.push({ measure, group_type: 'all', group: 'all', numerator, denominator, value, unit, ...base });
  push('screen_to_assessment_hours_median', metrics.screen_to_assessment_hours.median, 'hours', null, metrics.screen_to_assessment_hours.n);
  push('screen_to_assessment_hours_p90', metrics.screen_to_assessment_hours.p90, 'hours', null, metrics.screen_to_assessment_hours.n);
  push('screen_to_connection_hours_median', metrics.screen_to_connection_hours.median, 'hours', null, metrics.screen_to_connection_hours.n);
  push('screen_to_connection_hours_p90', metrics.screen_to_connection_hours.p90, 'hours', null, metrics.screen_to_connection_hours.n);
  push('referrals_without_screen', metrics.referrals_without_screen, 'count');
  for (const [rating, n] of Object.entries(metrics.escalation.ratings)) push(`escalation_rating_${rating}`, n, 'count', n);
  push('escalations_flagged_not_caught', metrics.escalation.missed_escalations, 'count');
  push('escalation_timeouts', metrics.escalation.timeouts, 'count');
  for (const [q, n] of Object.entries(metrics.escalation.timeouts_by_queue)) push(`escalation_timeouts_${q}`, n ?? 0, 'count');
  push('unreached_open_clinical_timeouts', metrics.escalation.unreached_open_clinical_timeouts, 'count');
  push('false_reassurance_reports', metrics.false_reassurance_reports, 'count');
  for (const week of ['6', '12'] as const) {
    push(`usefulness_week${week}_mean`, metrics.usefulness[week].mean, 'rating', null, metrics.usefulness[week].n);
    for (const [r, n] of Object.entries(metrics.usefulness[week].distribution)) push(`usefulness_week${week}_rating_${r}`, n, 'count', n);
  }
  push('practice_setup_minutes', metrics.delivery_cost.practice_setup_minutes, 'minutes');
  for (const [k, n] of Object.entries(metrics.free_text_routing.by_field_and_queue)) push(`free_text_routed_${k}`, n, 'count', n);
  for (const [k, n] of Object.entries(metrics.free_text_routing.help_requested_by_source)) push(`help_requested_${k}`, n, 'count', n);
  push('free_text_ack_minutes_median', metrics.free_text_routing.free_text_ack_minutes.median, 'minutes', null, metrics.free_text_routing.free_text_ack_minutes.n);
  for (const [type, groups] of Object.entries(metrics.breakdowns)) {
    for (const [group, m] of Object.entries(groups)) rows.push(...coreRows(m, type, group, base));
  }
  return rows;
}

const COLUMNS: Array<keyof MetricRow> = ['measure', 'group_type', 'group', 'numerator', 'denominator', 'value', 'unit', 'clock', 'cadence_version', 'careplan_version', 'freetext_version'];

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: MetricRow[]): string {
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n');
}

export function toJsonl(rows: MetricRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}

export function toCsvGeneric(columns: string[], rows: Array<Record<string, unknown>>): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\n');
}
