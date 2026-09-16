/** Time helpers. All instants are ISO UTC strings; display uses the practice timezone. */
import type { ISO } from './types';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

export const toMs = (iso: ISO): number => Date.parse(iso);
export const fromMs = (ms: number): ISO => new Date(ms).toISOString();
export const addMinutes = (iso: ISO, minutes: number): ISO => fromMs(toMs(iso) + minutes * MINUTE);
export const addHours = (iso: ISO, hours: number): ISO => fromMs(toMs(iso) + hours * HOUR);
export const addDays = (iso: ISO, days: number): ISO => fromMs(toMs(iso) + days * DAY);
export const isBefore = (a: ISO, b: ISO): boolean => toMs(a) < toMs(b);
export const isSameOrBefore = (a: ISO, b: ISO): boolean => toMs(a) <= toMs(b);
export const minutesBetween = (a: ISO, b: ISO): number => Math.round((toMs(b) - toMs(a)) / MINUTE);
export const hoursBetween = (a: ISO, b: ISO): number => (toMs(b) - toMs(a)) / HOUR;

/** FR-37: day_number = floor((at − delivery_date) in days). Day 0 is the delivery date. */
export const dayNumber = (deliveryDate: ISO, at: ISO): number => Math.floor((toMs(at) - toMs(deliveryDate)) / DAY);

// ---------------------------------------------------------------------------
// Formatter cache. Constructing an Intl.DateTimeFormat is the most expensive step in the
// projection: every queue timer, reminder, sweep and coverage walk converts instants to
// practice-local time, and the store re-projects after every seeded command. Formatters are
// therefore built once per (options, timeZone) and reused — a formatter is stateless, so
// sharing one is safe — and the three pure local-time lookups below are memoized by their
// string inputs (FR-48: a branch must reseed in under five seconds). No result changes.
// ---------------------------------------------------------------------------

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(kind: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, ...options });
    formatters.set(key, f);
  }
  return f;
}

/** Memo tables are cleared when they grow past this, so a long demo session cannot leak. */
const MEMO_LIMIT = 50_000;

function memoized<T>(cache: Map<string, T>, key: string, compute: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (cache.size >= MEMO_LIMIT) cache.clear();
  const value = compute();
  cache.set(key, value);
  return value;
}

const localHourMemo = new Map<string, ISO>();
const weekdayMemo = new Map<string, number>();
const hhmmMemo = new Map<string, string>();

/** Sets the local hour on a date in the given timezone, returning a UTC ISO instant. */
export function atLocalHour(dateIso: ISO, hour: number, timeZone: string): ISO {
  return memoized(localHourMemo, `${dateIso}|${hour}|${timeZone}`, () => {
    const ms = toMs(dateIso);
    const parts = formatter('ymdhm', timeZone, { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const localHour = get('hour') % 24;
    const localMinute = get('minute');
    const deltaMinutes = (hour - localHour) * 60 - localMinute;
    return fromMs(ms + deltaMinutes * MINUTE);
  });
}

export function formatDateTime(iso: ISO, timeZone: string, opts: { withTime?: boolean } = {}): string {
  const d = new Date(toMs(iso));
  return opts.withTime !== false
    ? formatter('datetime', timeZone, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d)
    : formatter('date', timeZone, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

export function formatTime(iso: ISO, timeZone: string): string {
  return formatter('time', timeZone, { hour: 'numeric', minute: '2-digit' }).format(new Date(toMs(iso)));
}

export function weekdayInZone(iso: ISO, timeZone: string): number {
  return memoized(weekdayMemo, `${iso}|${timeZone}`, () => {
    const name = formatter('weekday', timeZone, { weekday: 'short' }).format(new Date(toMs(iso)));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  });
}

export function localHHMM(iso: ISO, timeZone: string): string {
  return memoized(hhmmMemo, `${iso}|${timeZone}`, () => {
    const parts = formatter('hm', timeZone, { hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(toMs(iso)));
    const h = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${h === '24' ? '00' : h}:${m}`;
  });
}

/** Human label such as "Day 14" or "Week 6" for a day number. */
export function dayLabel(day: number): string {
  if (day < 0) return `${Math.abs(day)} days before delivery`;
  if (day < 28) return `Day ${day}`;
  return `Week ${Math.floor(day / 7)}`;
}
