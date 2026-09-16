/**
 * Patient-surface hook: the current synthetic persona (chosen with the home-screen picker and
 * remembered under nestwell.currentPatient), her active episode, content bound to her locale
 * (FR-63), the contact-card variables (FR-04), the sensitive statuses in force (FR-54) and a
 * `run` wrapper that dispatches a service command and returns the events or a readable error.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { addMinutes, dayNumber, toMs } from '../../domain/clock';
import type { AppConfig } from '../../domain/config.schema';
import { coverageDeadline, isInsideCoverage, isLossSubtype } from '../../domain/derive';
import { activeEpisodeFor, activeStatusesFor, suppressedTagsFor } from '../../domain/projection';
import { sharedWithFor } from '../../domain/services/screening';
import type { AnyEvent, Command, ContentTag, Episode, ISO, Id, Patient, QueueKey, SensitiveStatus, SharingCategory, State } from '../../domain/types';
import { useApp, type AppStore } from '../shell/useApp';
import { useContent, type ContentApi } from '../shell/useContent';

// ---- persona selection (per browser) ---------------------------------------

export const CURRENT_PATIENT_KEY = 'nestwell.currentPatient';

const listeners = new Set<() => void>();
let cachedId: string | null | undefined;

function readId(): string | null {
  if (cachedId !== undefined) return cachedId;
  try {
    cachedId = window.localStorage.getItem(CURRENT_PATIENT_KEY);
  } catch {
    cachedId = null;
  }
  return cachedId;
}

export function setCurrentPatientId(id: string | null): void {
  cachedId = id;
  try {
    if (id) window.localStorage.setItem(CURRENT_PATIENT_KEY, id);
    else window.localStorage.removeItem(CURRENT_PATIENT_KEY);
  } catch {
    // Storage may be unavailable; the in-memory value still drives this session.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrentPatientId(): string | null {
  return useSyncExternalStore(subscribe, readId, () => null);
}

// ---- labels ------------------------------------------------------------------

export const SHARING_LABELS: Record<SharingCategory, string> = {
  clinician_only: 'My OB clinician only',
  clinician_and_coordinator: 'My OB clinician and my care coordinator',
  clinician_coordinator_partner: 'My OB clinician, my care coordinator, and a referral partner',
  nobody_yet: 'Nobody yet',
};

export const SHARING_EXPLANATIONS: Record<SharingCategory, string> = {
  clinician_only: 'Only the OB clinician at your practice sees your mood answers. This is the most private choice and the one you start with.',
  clinician_and_coordinator: 'Your OB clinician and your care coordinator both see your mood answers, so the coordinator can help arrange follow-up.',
  clinician_coordinator_partner: 'Your clinician, your coordinator, and a mental health referral partner see your mood answers, so a referral can include them.',
  nobody_yet: 'Your mood answers are saved but not shown to anyone at the practice. You can change this later. You will be asked once more at the next set of mood questions.',
};

export const SHARING_ORDER: SharingCategory[] = ['clinician_only', 'clinician_and_coordinator', 'clinician_coordinator_partner', 'nobody_yet'];

const ROLE_PLAIN: Record<string, string> = {
  clinician: 'your OB clinician',
  coordinator: 'your care coordinator',
  referral_partner: 'a referral partner',
};

/** Plain-words list of who sees a screen result for the category (FR-27). */
export function sharedWithText(category: SharingCategory): string {
  const roles = sharedWithFor(category);
  if (roles.length === 0) return 'nobody yet (saved, not shown to the practice)';
  return roles.map((r) => ROLE_PLAIN[r] ?? r).join(', ');
}

export const BARRIER_LABELS: Record<string, string> = {
  transport: 'getting a ride',
  childcare: 'childcare',
  phone_data: 'your phone or data plan',
  interpreter: 'needing an interpreter',
  cost: 'the cost',
};

export const QUEUE_ROLE_PLAIN: Record<string, string> = {
  coordinator: 'care coordinator',
  clinician: 'OB clinician',
  budget_owner: 'budget owner',
  referral_partner: 'referral partner',
  patient: 'patient',
  admin: 'admin',
};

// ---- targets and coverage ------------------------------------------------------

/** The instant by which a queue's owner should have acknowledged an item created at `from` (FR-15, FR-25). */
export function ackTargetFor(config: AppConfig, key: QueueKey, from: ISO): ISO | null {
  const def = config.queues.find((q) => q.key === key);
  if (!def) return null;
  const entries = config.coverage.filter((e) => e.queue_key === key);
  return def.timer_basis === 'coverage_hours'
    ? coverageDeadline(from, def.ack_target_minutes, entries, config.practice.timezone)
    : addMinutes(from, def.ack_target_minutes);
}

export function insideCoverage(config: AppConfig, key: QueueKey, at: ISO): boolean {
  return isInsideCoverage(at, config.coverage.filter((e) => e.queue_key === key), config.practice.timezone);
}

/** Plain-words description of the Needs-review acknowledgment target, used by the acknowledgment (FR-05). */
export function readByPhrase(config: AppConfig): string {
  const def = config.queues.find((q) => q.key === 'needs_review');
  if (!def) return 'the practice target time';
  const hours = Math.round(def.ack_target_minutes / 60);
  if (def.timer_basis === 'coverage_hours') return `the same business day (${hours} coverage hours, a placeholder target)`;
  return `${hours} hours (a placeholder target)`;
}

// ---- screen offers (FR-29) ---------------------------------------------------------

export interface PendingScreenOffer {
  instrument_key: string;
  checkin_id: Id | null;
  reason: 'scheduled' | 'coping_trigger' | 'loss_pathway';
  offered_at: ISO;
}

/**
 * The most recent screen offer for the episode that has not been answered, set aside or declined
 * and has not been overtaken by a later check-in submission. Derived from the log at the clock.
 */
export function pendingScreenOfferFor(events: readonly AnyEvent[], state: State, episode_id: Id, clock: ISO): PendingScreenOffer | null {
  const T = toMs(clock);
  const offers = events.filter((e) => e.type === 'screen_offered' && e.payload.episode_id === episode_id && toMs(e.occurred_at) <= T);
  for (let i = offers.length - 1; i >= 0; i--) {
    const offer = offers[i];
    if (offer.type !== 'screen_offered') continue;
    const at = toMs(offer.occurred_at);
    const p = offer.payload;
    const answered = Object.values(state.screens).some((s) => s.episode_id === episode_id && s.instrument_key === p.instrument_key && toMs(s.administered_at) >= at);
    if (answered) return null;
    const setAside = events.some((e) =>
      (e.type === 'screen_skipped' || e.type === 'screen_declined') && e.payload.episode_id === episode_id && e.payload.instrument_key === p.instrument_key
      && toMs(e.occurred_at) >= at && toMs(e.occurred_at) <= T);
    if (setAside) return null;
    const overtaken = Object.values(state.checkins).some((c) => c.episode_id === episode_id && c.id !== p.checkin_id && c.submitted_at !== null && toMs(c.submitted_at) > at);
    if (overtaken) return null;
    return { instrument_key: p.instrument_key, checkin_id: p.checkin_id, reason: p.reason, offered_at: offer.occurred_at };
  }
  return null;
}

// ---- the hook --------------------------------------------------------------------

export interface ContactVars extends Record<string, string> {
  contact_name: string;
  contact_phone: string;
  coverage_hours: string;
  after_hours_phone: string;
  phone: string;
}

export interface RunResult {
  events: AnyEvent[];
  error: string | null;
}

export interface PatientApi {
  app: AppStore;
  state: State;
  config: AppConfig;
  clock: ISO;
  events: AnyEvent[];
  patients: Patient[];
  patient: Patient | null;
  /** The open episode, or the most recently closed one when none is open. */
  episode: Episode | null;
  content: ContentApi;
  locale: ContentApi['locale'];
  contactVars: ContactVars;
  /** Day number relative to delivery (or expected delivery), or null before an episode exists. */
  day: number | null;
  statuses: SensitiveStatus[];
  suppressed: Set<ContentTag>;
  lossActive: boolean;
  acknowledged: boolean;
  demoParticipantMode: boolean;
  run: (command: Command) => RunResult;
  fmt: AppStore['fmt'];
  fmtTime: AppStore['fmtTime'];
}

function latestClosedEpisode(state: State, patient_id: Id): Episode | undefined {
  return Object.values(state.episodes)
    .filter((e) => e.patient_id === patient_id && e.closed_at !== null)
    .sort((a, b) => toMs(b.closed_at ?? b.enrolled_at) - toMs(a.closed_at ?? a.enrolled_at))[0];
}

export function usePatient(): PatientApi {
  const app = useApp();
  const { state, config, clock, events, demoParticipantMode } = app;
  const storedId = useCurrentPatientId();
  const patient = (storedId && state.patients[storedId]) || null;
  const content = useContent(patient?.id ?? null);

  const patients = useMemo(
    () => Object.values(state.patients).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [state],
  );

  const episode = useMemo(() => (patient ? activeEpisodeFor(state, patient.id) ?? latestClosedEpisode(state, patient.id) ?? null : null), [state, patient]);

  const contactVars = useMemo<ContactVars>(() => {
    const p = config.practice;
    const inside = insideCoverage(config, 'urgent', clock);
    return {
      contact_name: p.named_contact.display_name,
      contact_phone: p.named_contact.phone,
      coverage_hours: p.named_contact.coverage_hours_label,
      after_hours_phone: p.after_hours_phone,
      phone: inside ? p.named_contact.phone : p.after_hours_phone,
    };
  }, [config, clock]);

  const statuses = useMemo(() => (episode ? activeStatusesFor(state, episode.id, clock) : []), [state, episode, clock]);
  const suppressed = useMemo(() => (episode ? suppressedTagsFor(state, episode.id, clock) : new Set<ContentTag>()), [state, episode, clock]);

  const run = useCallback(
    (command: Command): RunResult => {
      try {
        return { events: app.dispatch(command), error: null };
      } catch (err) {
        return { events: [], error: err instanceof Error ? err.message : String(err) };
      }
    },
    [app],
  );

  const anchor = episode?.delivery_date ?? episode?.expected_date ?? null;
  const day = anchor ? dayNumber(anchor, clock) : null;

  return {
    app, state, config, clock, events, patients, patient, episode, content, locale: content.locale, contactVars, day, statuses, suppressed,
    lossActive: statuses.some((s) => isLossSubtype(s.subtype)),
    acknowledged: episode?.acknowledged_at !== null && episode?.acknowledged_at !== undefined,
    demoParticipantMode, run, fmt: app.fmt, fmtTime: app.fmtTime,
  };
}
