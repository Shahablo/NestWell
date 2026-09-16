/**
 * Practice-level lookups every dashboard screen needs: timezone formatting, staff and partner
 * names, queue definitions by key, coverage summaries and who is on duty for a queue at an
 * instant (FR-44).
 */
import { useMemo } from 'react';
import { formatDateTime, formatTime, localHHMM, weekdayInZone } from '../../domain/clock';
import type { CoverageEntry, PracticeConfig, QueueDef, ReferralPartner, StaffUserConfig } from '../../domain/config.schema';
import { useApp } from './useApp';
import type { ISO, Id, QueueKey, Role } from '../../domain/types';
import { ROLE_LABELS } from './routes';

export const NOT_YET_ASSIGNED = 'NOT YET ASSIGNED';
export const NOT_YET_SECURED = 'NOT YET SECURED';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function roleLabel(role: Role | string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

export interface OnDuty {
  /** True when the clock is inside a coverage window for the queue. */
  covered: boolean;
  entry: CoverageEntry | null;
  onDutyUserId: Id | null;
  backupUserId: Id | null;
}

export interface PracticeApi {
  practice: PracticeConfig;
  timezone: string;
  /** formatDateTime in the practice timezone. `fmt` is the short alias. */
  formatDateTime(iso: ISO, opts?: { withTime?: boolean }): string;
  fmt(iso: ISO, opts?: { withTime?: boolean }): string;
  fmtTime(iso: ISO): string;
  staff(id: Id | null | undefined): StaffUserConfig | undefined;
  staffUser(id: Id | null | undefined): StaffUserConfig | undefined;
  /** Display name, or NOT YET ASSIGNED for a null id, or the raw id when unknown. */
  staffName(id: Id | null | undefined): string;
  staffByRole(role: Role): StaffUserConfig[];
  queueDefs: Record<QueueKey, QueueDef>;
  queueDef(key: QueueKey): QueueDef | undefined;
  queueLabel(key: QueueKey): string;
  partner(id: Id | null | undefined): ReferralPartner | undefined;
  partnerName(id: Id | null | undefined): string;
  coverageFor(key: QueueKey): CoverageEntry[];
  /** Human summary such as "Mon–Fri 08:00–17:00" or "no coverage configured". */
  coverageLabel(key: QueueKey): string;
  onDuty(key: QueueKey, at: ISO): OnDuty;
}

function summarizeCoverage(entries: CoverageEntry[]): string {
  if (entries.length === 0) return 'no coverage configured';
  const byWindow = new Map<string, number[]>();
  for (const e of entries) {
    const k = `${e.start}–${e.end}`;
    byWindow.set(k, [...(byWindow.get(k) ?? []), e.weekday]);
  }
  return [...byWindow.entries()]
    .map(([window, days]) => {
      const sorted = [...new Set(days)].sort((a, b) => a - b);
      const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
      const dayLabel = sorted.length > 2 && contiguous ? `${WEEKDAYS[sorted[0]]}–${WEEKDAYS[sorted[sorted.length - 1]]}` : sorted.map((d) => WEEKDAYS[d]).join(', ');
      return `${dayLabel} ${window}`;
    })
    .join('; ');
}

export function usePractice(): PracticeApi {
  const { config } = useApp();
  return useMemo<PracticeApi>(() => {
    const practice = config.practice;
    const timezone = practice.timezone;
    const staffById = new Map(practice.staff_users.map((s) => [s.id, s]));
    const partnersById = new Map(practice.referral_partners.map((p) => [p.id, p]));
    const queueDefs = Object.fromEntries(config.queues.map((q) => [q.key, q])) as Record<QueueKey, QueueDef>;
    const coverageByQueue = new Map<QueueKey, CoverageEntry[]>();
    for (const c of config.coverage) coverageByQueue.set(c.queue_key, [...(coverageByQueue.get(c.queue_key) ?? []), c]);
    const fmt = (iso: ISO, opts?: { withTime?: boolean }) => formatDateTime(iso, timezone, opts);
    const staff = (id: Id | null | undefined) => (id ? staffById.get(id) : undefined);
    return {
      practice,
      timezone,
      formatDateTime: fmt,
      fmt,
      fmtTime: (iso) => formatTime(iso, timezone),
      staff,
      staffUser: staff,
      staffName: (id) => (id ? staffById.get(id)?.display_name ?? id : NOT_YET_ASSIGNED),
      staffByRole: (role) => practice.staff_users.filter((s) => s.role === role),
      queueDefs,
      queueDef: (key) => queueDefs[key],
      queueLabel: (key) => queueDefs[key]?.label ?? key,
      partner: (id) => (id ? partnersById.get(id) : undefined),
      partnerName: (id) => (id ? partnersById.get(id)?.name ?? id : NOT_YET_SECURED),
      coverageFor: (key) => coverageByQueue.get(key) ?? [],
      coverageLabel: (key) => summarizeCoverage(coverageByQueue.get(key) ?? []),
      onDuty: (key, at) => {
        const weekday = weekdayInZone(at, timezone);
        const hhmm = localHHMM(at, timezone);
        const entry = (coverageByQueue.get(key) ?? []).find((c) => c.weekday === weekday && c.start <= hhmm && hhmm < c.end) ?? null;
        return {
          covered: entry !== null,
          entry,
          onDutyUserId: entry?.on_duty_user_id ?? null,
          backupUserId: entry?.backup_user_id ?? null,
        };
      },
    };
  }, [config]);
}
