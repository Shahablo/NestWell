/**
 * Labels and option lists for the practice dashboard. Domain enum values (including strings the
 * burden lexicon would flag if they appeared as UI copy) live here, in a .ts file, and the .tsx
 * screens import them; the visible labels are worded for staff.
 */
import { DAY, HOUR, MINUTE, toMs } from '../../domain/clock';
import type {
  AccessBarrier, AssessmentOutcome, CheckinState, CloseReason, ContactType, EscalationRating, ISO, MentalHealthDestination,
  QueueItemState, ReferralState, SensitiveSubtype, SharingCategory, TriggerType, VisitState, VisitType,
} from '../../domain/types';
import type { ChipVariant } from '../components';

export interface Option<T extends string> { value: T; label: string }

export const RATING_OPTIONS: Option<EscalationRating>[] = [
  { value: 'appropriate', label: 'Appropriate' },
  { value: 'unnecessary', label: 'Unnecessary' },
  { value: 'missed', label: 'Not caught in time' },
  { value: 'unsure', label: 'Unsure' },
];

export const RATING_LABELS: Record<EscalationRating, string> = Object.fromEntries(RATING_OPTIONS.map((o) => [o.value, o.label])) as Record<EscalationRating, string>;

export const QUEUE_STATE: Record<QueueItemState, { label: string; variant: ChipVariant }> = {
  open: { label: 'Open', variant: 'neutral' },
  acknowledged: { label: 'Acknowledged', variant: 'accent' },
  escalated: { label: 'Escalated', variant: 'warning' },
  unowned: { label: 'UNOWNED', variant: 'danger' },
  resolved: { label: 'Resolved', variant: 'neutral' },
};

export const REFERRAL_STATE_LABELS: Record<ReferralState, string> = {
  created: 'Created',
  sent_to_partner: 'Sent to partner (not a completion)',
  appointment_scheduled: 'Appointment scheduled',
  appointment_completed: 'Appointment kept',
  appointment_missed: 'Appointment not kept',
  no_capacity: 'No capacity',
  not_covered: 'Not covered',
  declined_by_patient: 'Declined by patient',
  closed: 'Closed',
};

export const REFERRAL_STATES: ReferralState[] = [
  'created', 'sent_to_partner', 'appointment_scheduled', 'appointment_completed', 'appointment_missed', 'no_capacity', 'not_covered', 'declined_by_patient', 'closed',
];

/** Writes the referral partner view may make (4.2): booking, kept, not kept, capacity and coverage. */
export const PARTNER_REFERRAL_STATES: ReferralState[] = ['appointment_scheduled', 'appointment_completed', 'appointment_missed', 'no_capacity', 'not_covered'];

export const SUBTYPE_LABELS: Record<SensitiveSubtype, string> = {
  pregnancy_loss: 'Pregnancy loss',
  stillbirth: 'Stillbirth',
  neonatal_loss: 'Neonatal loss',
  nicu: 'NICU stay',
  trauma: 'Trauma (hard birth)',
};
export const SUBTYPES: SensitiveSubtype[] = ['pregnancy_loss', 'stillbirth', 'neonatal_loss', 'nicu', 'trauma'];

export const ASSESSMENT_OUTCOMES: Option<AssessmentOutcome>[] = [
  { value: 'assessed_no_action', label: 'Assessed, no further action' },
  { value: 'referral', label: 'Referral' },
  { value: 'follow_up_call', label: 'Follow-up call' },
  { value: 'treatment_started', label: 'Treatment started' },
  { value: 'other', label: 'Other' },
];

export const VISIT_STATES: VisitState[] = ['scheduled', 'completed', 'missed', 'rescheduled', 'cancelled'];
export const VISIT_STATE_LABELS: Record<VisitState, string> = {
  scheduled: 'Scheduled', completed: 'Completed', missed: 'Not kept', rescheduled: 'Rescheduled', cancelled: 'Cancelled',
};
export const VISIT_TYPES: Option<VisitType>[] = [
  { value: 'early_postpartum', label: 'Early postpartum visit' },
  { value: 'comprehensive', label: 'Comprehensive visit' },
  { value: 'other', label: 'Other visit' },
];

export const CONTACT_TYPES: Option<ContactType>[] = [
  { value: 'phone_call', label: 'Phone call' },
  { value: 'in_person', label: 'In person' },
  { value: 'message', label: 'Message' },
  { value: 'video', label: 'Video' },
  { value: 'enrollment', label: 'Enrollment' },
];

export const CLOSE_REASONS: Option<CloseReason>[] = [
  { value: 'patient_withdrew', label: 'Patient withdrew' },
  { value: 'unreachable_after_attempts', label: 'Unreachable after attempts' },
  { value: 'moved_or_transferred', label: 'Moved or transferred' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'other', label: 'Other' },
];

export const BARRIERS: Option<AccessBarrier>[] = [
  { value: 'transport', label: 'Transport' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'phone_data', label: 'Phone or data' },
  { value: 'interpreter', label: 'Interpreter' },
  { value: 'cost', label: 'Cost' },
];

export const MH_DESTINATIONS: Option<MentalHealthDestination>[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'none_identified', label: 'No destination identified' },
  { value: 'not_indicated', label: 'Not indicated' },
];

export const SHARING_LABELS: Record<SharingCategory, string> = {
  clinician_only: 'Clinician only',
  clinician_and_coordinator: 'Clinician and coordinator',
  clinician_coordinator_partner: 'Clinician, coordinator and referral partner',
  nobody_yet: 'Nobody yet',
};

export const TRIGGER_LABELS: Partial<Record<TriggerType, string>> = {
  rule: 'Rule',
  critical_item: 'Critical item',
  help_now: 'I need help now',
  lexicon_match: 'Emergency lexicon match',
  positive_screen: 'Screen at or above threshold',
  coping_difficulty: 'Coping difficulty',
  free_text: 'Free text entered',
  therapy_intent: 'Therapy-intent block',
  referral_dead_end: 'Referral dead end',
  referral: 'Referral',
  visit: 'Visit',
  callback: 'Callback requested',
  barrier: 'Barrier reported',
  unreached: 'Unreached',
  day21_sweep: 'Day-21 sweep',
  sensitive_status: 'Sensitive status',
  summary: 'Summary to review',
  withdrawal: 'Patient stopped the program',
  screen_declined: 'Screen declined',
};

export const CHECKIN_STATE_VARIANT: Record<CheckinState, ChipVariant> = {
  scheduled: 'neutral', sent: 'accent', opened: 'accent', completed: 'accent', partial: 'warning', skipped: 'warning',
  unopened: 'warning', not_applicable: 'neutral', paused: 'neutral',
};

export function humanize(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/_/g, ' ');
}

export function durationLabel(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < HOUR) return `${Math.max(1, Math.round(abs / MINUTE))} min`;
  if (abs < DAY) {
    const h = Math.floor(abs / HOUR);
    const m = Math.round((abs - h * HOUR) / MINUTE);
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(abs / DAY);
  const h = Math.round((abs - d * DAY) / HOUR);
  return h ? `${d} d ${h} h` : `${d} d`;
}

/** Age of something created at `from`, as seen at the clock. */
export function ageLabel(from: ISO, clock: ISO): string {
  const ms = toMs(clock) - toMs(from);
  if (ms < 0) return 'in the future';
  return durationLabel(ms);
}

/** "due in 25 min" or "overdue by 3 h" for a target instant seen at the clock. */
export function dueLabel(target: ISO, clock: ISO): string {
  const ms = toMs(target) - toMs(clock);
  return ms >= 0 ? `due in ${durationLabel(ms)}` : `overdue by ${durationLabel(ms)}`;
}

export function hoursLabel(h: number | null): string {
  if (h === null) return 'not yet recorded';
  return `${Math.round(h * 10) / 10} h`;
}

export function pct(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 1000) / 10}%`;
}

export function num(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function money(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}
