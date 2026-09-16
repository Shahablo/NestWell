/**
 * Pure derivation helpers used by projection.ts (ARCHITECTURE 3.1). Everything here is a
 * function of stored facts plus the demo clock; nothing is scheduled and nothing is stored.
 */
import { addDays, addHours, addMinutes, atLocalHour, localHHMM, minutesBetween, toMs, weekdayInZone, DAY } from './clock';
import type { CoverageEntry, QueueDef } from './config.schema';
import type { CheckinSet, CheckinState, ContentTag, DeliveryOutcome, ISO, Id, QueueItemState, QueueKey, ReferralState, SensitiveStatus, SensitiveSubtype } from './types';

// ---------------------------------------------------------------------------
// FR-55 suppression matrix and check-in sets
// ---------------------------------------------------------------------------

export const LOSS_TAGS: readonly ContentTag[] = ['infant', 'feeding', 'milestone', 'celebration', 'newborn_visit', 'birth_story'];

const LOSS_OUTCOMES: readonly DeliveryOutcome[] = ['stillbirth', 'pregnancy_loss', 'neonatal_loss'];

/** A recorded delivery outcome that is itself a loss (FR-54): the loss suppression applies from the moment it is recorded. */
export const isLossOutcome = (o: DeliveryOutcome | null | undefined): boolean => o !== null && o !== undefined && LOSS_OUTCOMES.includes(o);

/** FR-55: tags suppressed per active subtype. Suppression is the union over active subtypes (FR-54). */
export const SUPPRESSION_MATRIX: Readonly<Record<SensitiveSubtype, readonly ContentTag[]>> = {
  pregnancy_loss: LOSS_TAGS,
  stillbirth: LOSS_TAGS,
  neonatal_loss: LOSS_TAGS,
  nicu: ['milestone', 'celebration'],
  trauma: ['celebration', 'birth_story', 'pregnancy_progress'],
};

export const CHECKIN_SET_FOR_SUBTYPE: Readonly<Record<SensitiveSubtype, CheckinSet>> = {
  pregnancy_loss: 'loss',
  stillbirth: 'loss',
  neonatal_loss: 'loss',
  nicu: 'nicu',
  trauma: 'trauma',
};

const SET_PRIORITY: readonly CheckinSet[] = ['loss', 'nicu', 'trauma'];

export const isLossSubtype = (s: SensitiveSubtype): boolean => CHECKIN_SET_FOR_SUBTYPE[s] === 'loss';

/** Statuses in force at an instant: set at or before it and not lifted by then. */
export function activeStatusesAt(statuses: readonly SensitiveStatus[], at: ISO): SensitiveStatus[] {
  const t = toMs(at);
  return statuses.filter((s) => toMs(s.set_at) <= t && (s.lifted_at === null || t < toMs(s.lifted_at)));
}

/**
 * Union of suppressed tags over the active statuses given, plus the loss set when the episode's
 * recorded delivery outcome is a loss (FR-54: a recorded stillbirth suppresses infant content at
 * once, whether or not the woman has tapped a control herself).
 */
export function suppressionFor(statuses: readonly SensitiveStatus[], delivery_outcome: DeliveryOutcome | null = null): Set<ContentTag> {
  const tags = new Set<ContentTag>();
  for (const s of statuses) if (s.active) for (const t of SUPPRESSION_MATRIX[s.subtype]) tags.add(t);
  if (isLossOutcome(delivery_outcome)) for (const t of LOSS_TAGS) tags.add(t);
  return tags;
}

/** Check-in set for the active statuses: loss > nicu > trauma > standard. */
export function checkinSetFor(statuses: readonly SensitiveStatus[]): CheckinSet {
  const sets = new Set(statuses.filter((s) => s.active).map((s) => CHECKIN_SET_FOR_SUBTYPE[s.subtype]));
  for (const p of SET_PRIORITY) if (sets.has(p)) return p;
  return 'standard';
}

// ---------------------------------------------------------------------------
// Pauses (FR-13a)
// ---------------------------------------------------------------------------

export interface PauseInterval {
  from: ISO;
  /** null = until turned back on. */
  until: ISO | null;
  resumed_at: ISO | null;
  actor: 'patient' | 'staff';
}

function pauseEnd(p: PauseInterval): number | null {
  const ends = [p.until, p.resumed_at].filter((x): x is ISO => x !== null).map(toMs);
  return ends.length ? Math.min(...ends) : null;
}

export function isPausedAt(pauses: readonly PauseInterval[], at: ISO): boolean {
  const t = toMs(at);
  return pauses.some((p) => {
    const end = pauseEnd(p);
    return toMs(p.from) <= t && (end === null || t < end);
  });
}

/** True when any pause overlaps the interval [from, to]. */
export function isPausedDuring(pauses: readonly PauseInterval[], from: ISO, to: ISO): boolean {
  const a = toMs(from);
  const b = toMs(to);
  return pauses.some((p) => {
    const end = pauseEnd(p);
    return toMs(p.from) <= b && (end === null || a < end);
  });
}

/** The pause in force at `at`, if any (the latest one started). */
export function activePauseAt(pauses: readonly PauseInterval[], at: ISO): PauseInterval | null {
  const t = toMs(at);
  let best: PauseInterval | null = null;
  for (const p of pauses) {
    const end = pauseEnd(p);
    if (toMs(p.from) <= t && (end === null || t < end)) {
      if (!best || toMs(p.from) >= toMs(best.from)) best = p;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Check-in state (FR-08, FR-10, FR-11, FR-13a)
// ---------------------------------------------------------------------------

export interface CheckinFacts {
  scheduled_at: ISO;
  window_end_at: ISO;
  not_applicable: boolean;
  opened_at: ISO | null;
  submitted_at: ISO | null;
  complete: boolean;
  skipped_at: ISO | null;
}

export interface EpisodeFacts {
  pauses: readonly PauseInterval[];
  closed_at: ISO | null;
}

export function checkinStateAt(c: CheckinFacts, ep: EpisodeFacts, clock: ISO): CheckinState {
  const T = toMs(clock);
  if (c.not_applicable) return 'not_applicable';
  if (ep.closed_at !== null && toMs(ep.closed_at) <= toMs(c.scheduled_at)) return 'not_applicable';
  // A check-in the closure cut short (window still open at closure, never opened, submitted or skipped) is moot, not unopened.
  if (ep.closed_at !== null && toMs(ep.closed_at) < toMs(c.window_end_at) && c.opened_at === null && c.submitted_at === null && c.skipped_at === null) return 'not_applicable';
  if (isPausedAt(ep.pauses, c.scheduled_at)) return 'paused';
  if (T < toMs(c.scheduled_at)) return 'scheduled';
  if (c.submitted_at !== null) return c.complete ? 'completed' : 'partial';
  if (c.skipped_at !== null) return 'skipped';
  const windowOpen = T < toMs(c.window_end_at);
  if (c.opened_at !== null && windowOpen) return 'opened';
  if (windowOpen) return 'sent';
  if (c.opened_at === null) return 'unopened';
  return 'partial';
}

// ---------------------------------------------------------------------------
// Reminder (FR-14)
// ---------------------------------------------------------------------------

export interface ReminderContext {
  reminder_offset_hours: number;
  safe_to_message: boolean | null;
  /** True when an Unreached item (derived or stored) is open at the instant given. */
  unreachedOpenAt: (at: ISO) => boolean;
  /** True when the latest human-contact signal before the instant is an outreach logged as not_reached. */
  lastOutreachNotReachedBefore: (at: ISO) => boolean;
  /** FR-56 "reduced" contact frequency under an active sensitive status. */
  reducedContact: boolean;
}

export interface ReminderResult {
  at: ISO;
  /** null when the reminder goes; 'responded' means it was never needed (no outbox row). */
  suppressed_reason: string | null;
  sent: boolean;
}

export function reminderFor(c: CheckinFacts, state: CheckinState, ep: EpisodeFacts, rc: ReminderContext, clock: ISO): ReminderResult | null {
  if (state === 'not_applicable' || state === 'paused') return null;
  const at = addHours(c.scheduled_at, rc.reminder_offset_hours);
  const t = toMs(at);
  const before = (x: ISO | null) => x !== null && toMs(x) <= t;
  let reason: string | null = null;
  if (before(c.opened_at) || before(c.submitted_at) || before(c.skipped_at)) reason = 'responded';
  else if (t >= toMs(c.window_end_at)) reason = 'window_closed';
  else if (ep.closed_at !== null && toMs(ep.closed_at) <= t) reason = 'episode_closed';
  else if (isPausedAt(ep.pauses, at)) reason = 'paused';
  else if (rc.safe_to_message === false) reason = 'safe_to_message_no';
  else if (rc.unreachedOpenAt(at)) reason = 'unreached_open';
  else if (rc.lastOutreachNotReachedBefore(at)) reason = 'unreached_not_reached';
  else if (rc.reducedContact) reason = 'sensitive_reduced_contact';
  return { at, suppressed_reason: reason, sent: reason === null && toMs(clock) >= t };
}

// ---------------------------------------------------------------------------
// Coverage schedule and queue timers (FR-25, 5.4)
// ---------------------------------------------------------------------------

function localTimeOn(dayIso: ISO, hhmm: string, tz: string): ISO {
  const [h, m] = hhmm.split(':').map(Number);
  return addMinutes(atLocalHour(dayIso, h, tz), m);
}

export function isInsideCoverage(at: ISO, entries: readonly CoverageEntry[], tz: string): boolean {
  if (entries.length === 0) return false;
  const wd = weekdayInZone(at, tz);
  const hhmm = localHHMM(at, tz);
  return entries.some((e) => e.weekday === wd && e.start <= hhmm && hhmm < e.end);
}

/** The first instant at or after `at` that lies inside a coverage window, or null when none within 14 days. */
export function nextCoverageStart(at: ISO, entries: readonly CoverageEntry[], tz: string): ISO | null {
  if (entries.length === 0) return null;
  if (isInsideCoverage(at, entries, tz)) return at;
  const t = toMs(at);
  for (let d = 0; d <= 14; d++) {
    const dayIso = addDays(at, d);
    const wd = weekdayInZone(dayIso, tz);
    const starts = entries
      .filter((e) => e.weekday === wd)
      .map((e) => localTimeOn(dayIso, e.start, tz))
      .filter((s) => toMs(s) >= t)
      .sort((a, b) => toMs(a) - toMs(b));
    if (starts.length) return starts[0];
  }
  return null;
}

/**
 * A target on the `coverage_hours` basis: the wall target, deferred to the next coverage
 * start when it falls outside coverage. This is the semantics the FR-25 acceptance criterion
 * fixes ("Marisol at 7 p.m. ... coverage_hours basis: UNOWNED at 9:00 a.m. next day"): an item
 * at 7 p.m. with 30/30 targets and 9–17 weekday coverage becomes UNOWNED at 9:00, not 9:30.
 * With no coverage entries for the queue the wall target is used, so an item can never sit
 * open forever.
 */
export function coverageDeadline(start: ISO, minutes: number, entries: readonly CoverageEntry[], tz: string): ISO {
  const wall = addMinutes(start, minutes);
  if (entries.length === 0) return wall;
  return nextCoverageStart(wall, entries, tz) ?? wall;
}

/**
 * FR-25: the one computed "a call is expected by" instant for a queue item, the same on every
 * surface (queue row, patient closing statement, coverage notice). Before acknowledgment it is the
 * acknowledgment target; after acknowledgment it is the resolution target when the queue has one,
 * otherwise the queue's acknowledgment minutes counted from the acknowledgment on the queue's basis.
 */
export function callByFor(
  item: { acknowledged_at: ISO | null; ack_target_at: ISO; resolution_target_at: ISO | null },
  def: QueueDef | undefined,
  coverage: readonly CoverageEntry[],
  tz: string,
): ISO {
  if (item.resolution_target_at) return item.resolution_target_at;
  if (item.acknowledged_at === null) return item.ack_target_at;
  const minutes = def?.ack_target_minutes ?? 60;
  const entries = def ? coverage.filter((e) => e.queue_key === def.key) : [];
  return def?.timer_basis === 'coverage_hours' ? coverageDeadline(item.acknowledged_at, minutes, entries, tz) : addMinutes(item.acknowledged_at, minutes);
}

export interface TimerInput {
  created_at: ISO;
  acknowledged_at: ISO | null;
  resolved_at: ISO | null;
  open_clinical_flag: boolean;
  /**
   * FR-56: an explicit acknowledgment deadline (the loss "not for now" human-contact deadline) replaces the
   * queue's acknowledgment target; the backup target follows it by the queue's usual backup delta, so the item
   * escalates like a Needs-review item once the deadline passes.
   */
  ack_deadline_at?: ISO | null;
}

export interface TimerResult {
  ack_target_at: ISO;
  backup_target_at: ISO;
  resolution_target_at: ISO | null;
  state: QueueItemState;
  escalated_at: ISO | null;
  unowned_at: ISO | null;
  minutes_to_ack: number | null;
}

export function minutesToAck(created_at: ISO, acknowledged_at: ISO | null): number | null {
  return acknowledged_at === null ? null : minutesBetween(created_at, acknowledged_at);
}

export function queueTimersFor(item: TimerInput, def: QueueDef | undefined, coverage: readonly CoverageEntry[], tz: string, clock: ISO): TimerResult {
  const T = toMs(clock);
  const ackMinutes = item.open_clinical_flag && def?.open_clinical_ack_target_minutes
    ? def.open_clinical_ack_target_minutes
    : def?.ack_target_minutes ?? 60;
  const backupMinutes = Math.max(def?.backup_ack_target_minutes ?? ackMinutes * 2, ackMinutes);
  const entries = def ? coverage.filter((e) => e.queue_key === def.key) : [];
  const deadlineFrom = (start: ISO, m: number): ISO =>
    def?.timer_basis === 'coverage_hours' ? coverageDeadline(start, m, entries, tz) : addMinutes(start, m);
  const deadline = (m: number): ISO => deadlineFrom(item.created_at, m);
  const explicit = item.ack_deadline_at ?? null;
  const ack_target_at = explicit ?? deadline(ackMinutes);
  // The backup target follows the acknowledgment target by the queue's backup delta, on the same basis. On the
  // coverage-hours basis this keeps "escalated" and "UNOWNED" distinct instants when both wall targets would
  // otherwise defer to the same coverage start (a 480/960 item created at 10:35 escalates at 8:00 the next
  // business day and becomes UNOWNED at 16:00, not 8:00). With equal targets (30/30) both stay at the coverage start.
  const backup_target_at = deadlineFrom(ack_target_at, Math.max(0, backupMinutes - ackMinutes));
  const resolution_target_at = def?.resolution_target_minutes != null ? deadline(def.resolution_target_minutes) : null;

  const handled = [item.acknowledged_at, item.resolved_at].filter((x): x is ISO => x !== null).map(toMs);
  const handledAt = handled.length ? Math.min(...handled) : null;
  const passed = (target: ISO): boolean => (handledAt === null ? T >= toMs(target) : handledAt > toMs(target));
  const escalated_at = passed(ack_target_at) ? ack_target_at : null;
  const unowned_at = passed(backup_target_at) ? backup_target_at : null;
  const state: QueueItemState = item.resolved_at !== null
    ? 'resolved'
    : item.acknowledged_at !== null
      ? 'acknowledged'
      : unowned_at !== null
        ? 'unowned'
        : escalated_at !== null
          ? 'escalated'
          : 'open';
  return { ack_target_at, backup_target_at, resolution_target_at, state, escalated_at, unowned_at, minutes_to_ack: minutesToAck(item.created_at, item.acknowledged_at) };
}

// ---------------------------------------------------------------------------
// Unreached (FR-13) and the day-21 sweep (FR-37)
// ---------------------------------------------------------------------------

export interface UnreachedCheckin {
  id: Id;
  scheduled_at: ISO;
  window_end_at: ISO;
  state: CheckinState;
}

export interface DerivedUnreached {
  id: Id;
  checkin_id: Id;
  created_at: ISO;
}

export const unreachedItemId = (episode_id: Id, checkin_id: Id): Id => `unreached:${episode_id}:${checkin_id}`;
export const day21ItemId = (episode_id: Id): Id => `day21:${episode_id}`;

/**
 * Walk an episode's check-ins in order and derive Unreached items: `threshold` consecutive
 * check-ins that ended `unopened` or `skipped` while not paused, with no completed/partial
 * check-in and no human contact (`resets`) in between. Exactly one item per run; a new run
 * after the item is resolved creates a new item.
 */
export function unreachedItemsFor(
  episode_id: Id,
  checkins: readonly UnreachedCheckin[],
  pauses: readonly PauseInterval[],
  resets: readonly ISO[],
  threshold: number,
  resolvedAt: (itemId: Id) => ISO | null,
  /** True when an Unreached item from another source (the day-21 sweep, a stored item) is open at the instant. */
  otherOpenAt: (at: ISO) => boolean = () => false,
): DerivedUnreached[] {
  const items: DerivedUnreached[] = [];
  const resetMs = resets.map(toMs).sort((a, b) => a - b);
  let count = 0;
  let lastCountedEnd: number | null = null;
  for (const c of checkins) {
    if (c.state === 'not_applicable' || c.state === 'paused') continue;
    if (c.state === 'scheduled' || c.state === 'sent' || c.state === 'opened') break;
    if (c.state === 'completed' || c.state === 'partial') {
      count = 0;
      lastCountedEnd = toMs(c.window_end_at);
      continue;
    }
    // unopened or skipped
    if (isPausedDuring(pauses, c.scheduled_at, c.window_end_at)) continue;
    const end = toMs(c.window_end_at);
    if (resetMs.some((r) => (lastCountedEnd === null || r > lastCountedEnd) && r <= end)) count = 0;
    count += 1;
    if (count >= threshold) {
      const openAlready = otherOpenAt(c.window_end_at) || items.some((i) => {
        const r = resolvedAt(i.id);
        return r === null || toMs(r) > end;
      });
      if (!openAlready) items.push({ id: unreachedItemId(episode_id, c.id), checkin_id: c.id, created_at: c.window_end_at });
      count = 0;
    }
    lastCountedEnd = end;
  }
  return items;
}

export interface Day21Input {
  episode_id: Id;
  delivery_date: ISO | null;
  enrolled_at: ISO;
  closed_at: ISO | null;
  /** occurred_at of every logged human contact for the episode. */
  contacts: readonly ISO[];
  target_day: number;
  tz: string;
  /** True when an Unreached item is open at the instant given. */
  unreachedOpenAt: (at: ISO) => boolean;
  /** FR-13a: a pause in force at the sweep is never an Unreached signal (the fact is still recorded). */
  pausedAt?: (at: ISO) => boolean;
}

export interface Day21Result {
  sweep_at: ISO;
  /** An Unreached item is derived only when no other Unreached item was open at the sweep. */
  item: DerivedUnreached | null;
}

/** Returns null when the sweep has not happened yet, the episode was closed before it, or a contact was logged before it. */
export function day21SweepFor(input: Day21Input, clock: ISO): Day21Result | null {
  if (input.delivery_date === null) return null;
  const sweep_at = atLocalHour(addDays(input.delivery_date, input.target_day), 12, input.tz);
  const s = toMs(sweep_at);
  if (toMs(clock) < s) return null;
  if (toMs(input.enrolled_at) > s) return null;
  if (input.closed_at !== null && toMs(input.closed_at) <= s) return null;
  if (input.contacts.some((c) => toMs(c) < s)) return null;
  const item = input.unreachedOpenAt(sweep_at) || input.pausedAt?.(sweep_at)
    ? null
    : { id: day21ItemId(input.episode_id), checkin_id: '', created_at: sweep_at };
  return { sweep_at, item };
}

// ---------------------------------------------------------------------------
// Open clinical flag (FR-13), indicated (FR-39), initial contact (FR-37)
// ---------------------------------------------------------------------------

export interface OpenClinicalInput {
  queueItems: ReadonlyArray<{ queue_key: QueueKey; created_at: ISO; resolved_at: ISO | null }>;
  screens: ReadonlyArray<{ positive: boolean; declined: boolean; administered_at: ISO }>;
  referrals: ReadonlyArray<{ created_at: ISO; history: ReadonlyArray<{ state: ReferralState; at: ISO }> }>;
  statuses: readonly SensitiveStatus[];
}

const CLOSED_REFERRAL: readonly ReferralState[] = ['appointment_completed', 'closed'];

export function referralStateAt(history: ReadonlyArray<{ state: ReferralState; at: ISO }>, at: ISO): ReferralState {
  const t = toMs(at);
  let state: ReferralState = 'created';
  for (const h of history) if (toMs(h.at) <= t) state = h.state;
  return state;
}

export function openClinicalFlagAt(at: ISO, input: OpenClinicalInput): boolean {
  const t = toMs(at);
  const openItem = input.queueItems.some((q) =>
    (q.queue_key === 'needs_review' || q.queue_key === 'urgent') && toMs(q.created_at) <= t && (q.resolved_at === null || toMs(q.resolved_at) > t));
  if (openItem) return true;
  const recentPositive = input.screens.some((s) => s.positive && !s.declined && toMs(s.administered_at) <= t && t - toMs(s.administered_at) <= 30 * DAY);
  if (recentPositive) return true;
  const openReferral = input.referrals.some((r) => toMs(r.created_at) <= t && !CLOSED_REFERRAL.includes(referralStateAt(r.history, at)));
  if (openReferral) return true;
  return activeStatusesAt(input.statuses, at).length > 0;
}

export function isIndicated(input: {
  screens: ReadonlyArray<{ positive: boolean; critical_item_hit: boolean; declined: boolean }>;
  referrals: ReadonlyArray<unknown>;
  statuses: readonly SensitiveStatus[];
}): boolean {
  return input.screens.some((s) => !s.declined && (s.positive || s.critical_item_hit)) || input.referrals.length > 0 || input.statuses.length > 0;
}

export function initialContactFor(
  contacts: ReadonlyArray<{ occurred_at: ISO; day_number: number }>,
  targetDay: number,
): { day: number | null; met: boolean | null } {
  if (contacts.length === 0) return { day: null, met: null };
  const first = [...contacts].sort((a, b) => toMs(a.occurred_at) - toMs(b.occurred_at))[0];
  return { day: first.day_number, met: first.day_number <= targetDay };
}
