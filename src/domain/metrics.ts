/**
 * Metrics from events plus derived events (requirements 11.3). Every completion-type measure
 * reports all-eligible as primary and enrolled as secondary; every measure is also grouped by
 * locale, insurance type and access barrier (FR-50). Nothing here reads the wall clock.
 */
import { DAY, hoursBetween, toMs } from './clock';
import type { AppConfig } from './config.schema';
import type { AnyEvent, EscalationRating, Id, ISO, Patient, QueueKey, State } from './types';

export interface Rate { numerator: number; denominator: number; rate: number | null }
export interface Stats { n: number; median: number | null; mean: number | null; p90: number | null; top_decile_mean: number | null }
export interface PrimarySecondary { all_eligible: Rate; enrolled: Rate }

export interface CoreMeasures {
  eligible: number;
  enrolled: number;
  enrollment: Rate;
  program_completion: PrimarySecondary;
  care_completion: PrimarySecondary;
  planned_visits: PrimarySecondary;
  initial_contact_by_day_21: PrimarySecondary;
  dropout: { enrolled: Rate; all_eligible: Rate; no_contact_by_day_21: number; unreached_by_trigger: Record<string, number> };
  referral_completion: { created: number; completed: number; no_capacity: number; not_covered: number; declined: number; rate: number | null };
  staff_minutes: Stats & { per_episode: Record<Id, number> };
  transition_destination_gap: Rate;
}

export interface Metrics extends CoreMeasures {
  clock: ISO;
  range: { from: ISO; to: ISO } | null;
  screen_to_assessment_hours: Stats;
  screen_to_connection_hours: Stats;
  referrals_without_screen: number;
  escalation: {
    ratings: Record<EscalationRating, number>;
    missed_escalations: number;
    timeouts: number;
    timeouts_by_queue: Partial<Record<QueueKey, number>>;
    unreached_open_clinical_timeouts: number;
  };
  false_reassurance_reports: number;
  usefulness: Record<'6' | '12', { n: number; mean: number | null; distribution: Record<string, number> }>;
  delivery_cost: { practice_setup_minutes: number | null; minutes_per_episode: Stats; note: string };
  free_text_routing: { by_field_and_queue: Record<string, number>; help_requested_by_source: Record<string, number>; free_text_ack_minutes: Stats };
  breakdowns: { locale: Record<string, CoreMeasures>; insurance_type: Record<string, CoreMeasures>; access_barrier: Record<string, CoreMeasures> };
  versions: { cadence: string; careplan: string; freetext: string };
}

export const DAY21 = 21;
export const WEEK6 = 42;
export const WEEK12 = 84;

export function rate(numerator: number, denominator: number): Rate {
  return { numerator, denominator, rate: denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 1000 };
}

export function stats(values: readonly number[]): Stats {
  if (values.length === 0) return { n: 0, median: null, mean: null, p90: null, top_decile_mean: null };
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  const median = n % 2 === 1 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const p90 = v[Math.min(n - 1, Math.ceil(0.9 * n) - 1)];
  const top = v.slice(Math.max(0, n - Math.max(1, Math.ceil(n / 10))));
  const top_decile_mean = top.reduce((a, b) => a + b, 0) / top.length;
  const r = (x: number): number => Math.round(x * 10) / 10;
  return { n, median: r(median), mean: r(mean), p90: r(p90), top_decile_mean: r(top_decile_mean) };
}

interface PatientView {
  patient: Patient;
  episode: State['episodes'][string] | undefined;
  enrolled: boolean;
  /** Delivery date from the episode, when known. */
  delivery: ISO | null;
}

function views(state: State): PatientView[] {
  const episodesByPatient = new Map<Id, State['episodes'][string]>();
  for (const ep of Object.values(state.episodes)) {
    const cur = episodesByPatient.get(ep.patient_id);
    if (!cur || toMs(ep.enrolled_at) > toMs(cur.enrolled_at)) episodesByPatient.set(ep.patient_id, ep);
  }
  return Object.values(state.patients).map((patient) => {
    const episode = episodesByPatient.get(patient.id);
    return { patient, episode, enrolled: state.eligibility[patient.id]?.status === 'enrolled', delivery: episode?.delivery_date ?? null };
  });
}

function pastBoundary(v: PatientView, days: number, clock: ISO): boolean {
  const anchor = v.delivery ?? (v.episode ? null : v.patient.registered_at);
  return anchor !== null && toMs(anchor) + days * DAY <= toMs(clock);
}

function coreMeasures(state: State, events: readonly AnyEvent[], cohort: PatientView[]): CoreMeasures {
  const clock = state.clock;
  const ids = new Set(cohort.map((v) => v.patient.id));
  const episodeIds = new Set(cohort.map((v) => v.episode?.id).filter((x): x is Id => !!x));
  const enrolledViews = cohort.filter((v) => v.enrolled);
  const ps = (pred: (v: PatientView) => boolean, days: number): PrimarySecondary => ({
    all_eligible: rate(cohort.filter((v) => pastBoundary(v, days, clock) && pred(v)).length, cohort.filter((v) => pastBoundary(v, days, clock)).length),
    enrolled: rate(enrolledViews.filter((v) => pastBoundary(v, days, clock) && pred(v)).length, enrolledViews.filter((v) => pastBoundary(v, days, clock)).length),
  });
  const transitions = new Set(events.filter((e) => e.type === 'transition_completed' && toMs(e.occurred_at) <= toMs(clock) && e.episode_id && episodeIds.has(e.episode_id)).map((e) => e.episode_id as Id));
  const completedComprehensive = (v: PatientView): boolean =>
    Object.values(state.visits).some((x) => x.type === 'comprehensive' && x.state === 'completed' && (x.patient_id === v.patient.id || (x.episode_id !== null && x.episode_id === v.episode?.id)));
  const positiveHandled = (v: PatientView): boolean => {
    if (!v.episode) return true;
    const ep = v.episode.id;
    const positives = Object.values(state.screens).filter((s) => s.episode_id === ep && !s.declined && s.positive);
    if (positives.length === 0) return true;
    const completedReferral = Object.values(state.referrals).some((r) => r.episode_id === ep && r.history.some((h) => h.state === 'appointment_completed'));
    const documentedAlternative = Object.values(state.assessments).some((a) => a.episode_id === ep && a.outcome !== 'referral')
      || Object.values(state.queueItems).some((q) => q.episode_id === ep && q.trigger_type === 'referral_dead_end' && q.state === 'resolved');
    return completedReferral || documentedAlternative;
  };
  const dropouts = new Set(events.filter((e) => e.type === 'dropout_recorded' && toMs(e.occurred_at) <= toMs(clock) && e.episode_id && episodeIds.has(e.episode_id)).map((e) => e.episode_id as Id));
  const derivedFor = state.derivedEvents.filter((e) => e.episode_id !== null && episodeIds.has(e.episode_id));
  const unreached_by_trigger: Record<string, number> = {};
  for (const e of derivedFor.filter((x) => x.type === 'unreached_item_created')) {
    const k = String(e.attributes.trigger ?? 'unreached');
    unreached_by_trigger[k] = (unreached_by_trigger[k] ?? 0) + 1;
  }
  const referrals = Object.values(state.referrals).filter((r) => ids.has(r.patient_id));
  const perEpisode: Record<Id, number> = {};
  for (const ep of episodeIds) perEpisode[ep] = 0;
  for (const st of state.staffTime) if (episodeIds.has(st.episode_id)) perEpisode[st.episode_id] = (perEpisode[st.episode_id] ?? 0) + st.minutes;
  const transitionsDone = cohort.filter((v) => v.episode?.transition !== null && v.episode?.transition !== undefined && transitions.has(v.episode.id));
  return {
    eligible: cohort.length,
    enrolled: enrolledViews.length,
    enrollment: rate(enrolledViews.length, cohort.length),
    program_completion: ps((v) => !!v.episode && transitions.has(v.episode.id), WEEK12),
    care_completion: ps((v) => completedComprehensive(v) && positiveHandled(v), WEEK12),
    planned_visits: ps(completedComprehensive, WEEK12),
    initial_contact_by_day_21: ps((v) => v.episode?.initial_contact_met_target === true, DAY21),
    dropout: {
      enrolled: rate(enrolledViews.filter((v) => pastBoundary(v, WEEK12, clock) && !!v.episode && dropouts.has(v.episode.id)).length, enrolledViews.filter((v) => pastBoundary(v, WEEK12, clock)).length),
      all_eligible: rate(cohort.filter((v) => pastBoundary(v, WEEK12, clock) && !!v.episode && dropouts.has(v.episode.id)).length, cohort.filter((v) => pastBoundary(v, WEEK12, clock)).length),
      no_contact_by_day_21: derivedFor.filter((e) => e.type === 'no_contact_by_day_21').length,
      unreached_by_trigger,
    },
    referral_completion: {
      created: referrals.length,
      completed: referrals.filter((r) => r.history.some((h) => h.state === 'appointment_completed')).length,
      no_capacity: referrals.filter((r) => r.state === 'no_capacity').length,
      not_covered: referrals.filter((r) => r.state === 'not_covered').length,
      declined: referrals.filter((r) => r.state === 'declined_by_patient').length,
      rate: referrals.length === 0 ? null : Math.round((referrals.filter((r) => r.history.some((h) => h.state === 'appointment_completed')).length / referrals.length) * 1000) / 1000,
    },
    staff_minutes: { ...stats(Object.values(perEpisode)), per_episode: perEpisode },
    transition_destination_gap: rate(transitionsDone.filter((v) => v.episode?.transition?.mental_health === 'none_identified').length, transitionsDone.length),
  };
}

export function computeMetrics(state: State, events: readonly AnyEvent[], config: AppConfig, options: { range?: { from: ISO; to: ISO } } = {}): Metrics {
  const clock = state.clock;
  const range = options.range ?? null;
  const folded = events.filter((e) => toMs(e.occurred_at) <= toMs(clock));
  const all = views(state).filter((v) => {
    if (!range) return true;
    return v.delivery !== null && toMs(v.delivery) >= toMs(range.from) && toMs(v.delivery) <= toMs(range.to);
  });
  const core = coreMeasures(state, folded, all);
  const episodeIds = new Set(all.map((v) => v.episode?.id).filter((x): x is Id => !!x));

  // FR-32 intervals: only screens with a linked assessment or completed referral.
  const toAssessment: number[] = [];
  const toConnection: number[] = [];
  for (const s of Object.values(state.screens)) {
    if (!episodeIds.has(s.episode_id) || s.declined || !s.positive) continue;
    const a = Object.values(state.assessments).filter((x) => x.screen_result_id === s.id).sort((p, q) => toMs(p.recorded_at) - toMs(q.recorded_at))[0];
    if (a) toAssessment.push(hoursBetween(s.administered_at, a.recorded_at));
    const r = Object.values(state.referrals).filter((x) => x.screen_result_id === s.id && x.completed_at !== null).sort((p, q) => toMs(p.completed_at as ISO) - toMs(q.completed_at as ISO))[0];
    if (r && r.completed_at) toConnection.push(hoursBetween(s.administered_at, r.completed_at));
  }
  const referrals_without_screen = Object.values(state.referrals).filter((r) => episodeIds.has(r.episode_id) && r.screen_result_id === null).length;

  const ratings: Record<EscalationRating, number> = { appropriate: 0, unnecessary: 0, missed: 0, unsure: 0 };
  for (const q of Object.values(state.queueItems)) if (episodeIds.has(q.episode_id) && q.rating) ratings[q.rating] += 1;
  const timeouts = state.derivedEvents.filter((e) => e.type === 'escalation_unacknowledged_timeout' && e.episode_id !== null && episodeIds.has(e.episode_id));
  const timeouts_by_queue: Partial<Record<QueueKey, number>> = {};
  for (const t of timeouts) { const k = String(t.attributes.queue_key) as QueueKey; timeouts_by_queue[k] = (timeouts_by_queue[k] ?? 0) + 1; }

  const usefulness = { '6': bucket(state.usefulness.filter((u) => u.week === 6 && episodeIds.has(u.episode_id)).map((u) => u.rating)), '12': bucket(state.usefulness.filter((u) => u.week === 12 && episodeIds.has(u.episode_id)).map((u) => u.rating)) };

  const by_field_and_queue: Record<string, number> = {};
  const help_requested_by_source: Record<string, number> = {};
  for (const e of folded) {
    if (e.episode_id !== null && !episodeIds.has(e.episode_id)) continue;
    if (e.type === 'free_text_routed') { const k = `${e.payload.field}:${e.payload.queue_key}`; by_field_and_queue[k] = (by_field_and_queue[k] ?? 0) + 1; }
    if (e.type === 'help_requested') help_requested_by_source[e.payload.source] = (help_requested_by_source[e.payload.source] ?? 0) + 1;
  }
  const freeTextAck = Object.values(state.queueItems).filter((q) => episodeIds.has(q.episode_id) && q.trigger_type === 'free_text' && q.minutes_to_ack !== null).map((q) => q.minutes_to_ack as number);

  const group = (key: (v: PatientView) => string[]): Record<string, CoreMeasures> => {
    const groups = new Map<string, PatientView[]>();
    for (const v of all) for (const k of key(v)) { const l = groups.get(k); if (l) l.push(v); else groups.set(k, [v]); }
    const out: Record<string, CoreMeasures> = {};
    for (const [k, vs] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) out[k] = coreMeasures(state, folded, vs);
    return out;
  };

  return {
    ...core,
    clock,
    range,
    screen_to_assessment_hours: stats(toAssessment),
    screen_to_connection_hours: stats(toConnection),
    referrals_without_screen,
    escalation: {
      ratings,
      missed_escalations: state.missedEscalations.filter((m) => episodeIds.has(m.episode_id)).length,
      timeouts: timeouts.length,
      timeouts_by_queue,
      unreached_open_clinical_timeouts: timeouts.filter((t) => t.attributes.queue_key === 'unreached' && t.attributes.open_clinical_flag === true).length,
    },
    false_reassurance_reports: folded.filter((e) => e.type === 'false_reassurance_reported').length,
    usefulness,
    delivery_cost: { practice_setup_minutes: state.practiceSetupMinutes, minutes_per_episode: stats(Object.values(core.staff_minutes.per_episode)), note: 'Illustrative, not market prices or a forecast. Cost inputs are entered by the practice during the session (FR-47).' },
    free_text_routing: { by_field_and_queue, help_requested_by_source, free_text_ack_minutes: stats(freeTextAck) },
    breakdowns: {
      locale: group((v) => [v.patient.preferences.locale]),
      insurance_type: group((v) => [v.patient.insurance_type]),
      access_barrier: group((v) => (v.patient.access_barriers.length ? v.patient.access_barriers : ['none'])),
    },
    versions: { cadence: config.cadence.version, careplan: config.careplan.version, freetext: config.freetext.version },
  };
}

function bucket(values: readonly number[]): { n: number; mean: number | null; distribution: Record<string, number> } {
  const distribution: Record<string, number> = {};
  for (const v of values) distribution[String(v)] = (distribution[String(v)] ?? 0) + 1;
  return { n: values.length, mean: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null, distribution };
}
