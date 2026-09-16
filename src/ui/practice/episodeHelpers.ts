/** Read helpers over State for the practice screens. Pure; no dispatch. */
import { toMs } from '../../domain/clock';
import type { AppConfig } from '../../domain/config.schema';
import { dayNumberFor } from '../../domain/services';
import type { Checkin, Episode, Id, ISO, QueueItem, ScreenResult, State } from '../../domain/types';

export function patientName(state: State, patient_id: Id | null | undefined): string {
  if (!patient_id) return '—';
  return state.patients[patient_id]?.display_name ?? patient_id;
}

export function episodesFor(state: State, patient_id: Id): Episode[] {
  return Object.values(state.episodes).filter((e) => e.patient_id === patient_id).sort((a, b) => toMs(b.enrolled_at) - toMs(a.enrolled_at));
}

/** The open episode, or the most recently enrolled one. */
export function latestEpisodeFor(state: State, patient_id: Id): Episode | undefined {
  const eps = episodesFor(state, patient_id);
  return eps.find((e) => e.closed_at === null) ?? eps[0];
}

export function episodeDay(ep: Episode | undefined, at: ISO): number | null {
  if (!ep) return null;
  if (!ep.delivery_date && !ep.expected_date) return null;
  return dayNumberFor(ep, at);
}

export function itemsForEpisode(state: State, episode_id: Id): QueueItem[] {
  return Object.values(state.queueItems).filter((q) => q.episode_id === episode_id).sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
}

export function openItemsForEpisode(state: State, episode_id: Id): QueueItem[] {
  return itemsForEpisode(state, episode_id).filter((q) => q.state !== 'resolved');
}

/** Queue items whose trigger_ref points at this screen (Needs-review positive, Urgent critical). */
export function itemsForScreen(state: State, screen_id: Id): QueueItem[] {
  return Object.values(state.queueItems).filter((q) => q.trigger_ref === screen_id);
}

export function instrumentShortName(config: AppConfig, key: string): string {
  return config.instruments[key]?.short_name ?? key;
}

export function screenTitle(config: AppConfig, screen: ScreenResult): string {
  return `${instrumentShortName(config, screen.instrument_key)} v${screen.instrument_version || '?'}`;
}

/** Readable answer for a check-in response using the template's option labels. */
export function responseLabel(config: AppConfig, checkin: Checkin, question_key: string, value: string | string[] | null): string {
  if (value === null) return 'skipped';
  const template = config.checkins[checkin.template_key];
  const item = template?.items.find((i) => i.key === question_key);
  const values = Array.isArray(value) ? value : [value];
  return values.map((v) => item?.options.find((o) => o.value === v)?.label ?? v).join(', ');
}

/** Sort: UNOWNED first, then open-clinical flag, then escalated, then oldest first (FR-43). */
export function sortQueueItems(items: QueueItem[]): QueueItem[] {
  const rank = (q: QueueItem): number => (q.state === 'unowned' ? 0 : q.open_clinical_flag ? 1 : q.state === 'escalated' ? 2 : q.state === 'resolved' ? 4 : 3);
  return [...items].sort((a, b) => rank(a) - rank(b) || toMs(a.created_at) - toMs(b.created_at) || a.id.localeCompare(b.id));
}

export function isoDateOnly(iso: ISO | null): string {
  return iso ? iso.slice(0, 10) : '';
}
