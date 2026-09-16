/**
 * FR-24 / FR-25 coverage honesty for the patient. Every help request and closing statement shows
 * the owning role and coverage hours. While ANY Urgent item of hers is escalated, UNOWNED, or open
 * outside coverage, the patient sees the locked "we have not reached a nurse yet" item, never a
 * waiting or acknowledged message, even when a newer item was acknowledged. An acknowledged item
 * shows "acknowledged by [role] at [time]" paired with the one computed call-by time (callByFor,
 * the same on every surface).
 */
import { toMs } from '../../domain/clock';
import { callByFor } from '../../domain/derive';
import { openQueueItemsFor } from '../../domain/projection';
import type { QueueItem } from '../../domain/types';
import { LockedContent, PhoneNumber } from '../components';
import { QUEUE_ROLE_PLAIN, insideCoverage, usePatient } from './usePatient';

export function latestOpenUrgent(items: QueueItem[]): QueueItem | null {
  return items.filter((q) => q.queue_key === 'urgent').sort((a, b) => toMs(b.created_at) - toMs(a.created_at))[0] ?? null;
}

/** FR-24: true when any open Urgent item has nobody reaching her (escalated, UNOWNED, or open outside coverage). */
export function nobodyReachedFor(items: QueueItem[], covered: boolean): boolean {
  return items.some((q) => q.queue_key === 'urgent' && (q.state === 'escalated' || q.state === 'unowned' || (q.state === 'open' && !covered)));
}

export function CoverageNotice({ compact = false }: { compact?: boolean }) {
  const { state, config, clock, episode, contactVars, fmt, locale } = usePatient();
  const def = config.queues.find((q) => q.key === 'urgent');
  const roleLabel = QUEUE_ROLE_PLAIN[def?.owner_role ?? 'coordinator'] ?? 'care coordinator';
  const open = episode ? openQueueItemsFor(state, episode.id, ['urgent']) : [];
  const item = latestOpenUrgent(open);
  const covered = insideCoverage(config, 'urgent', clock);

  if (nobodyReachedFor(open, covered)) {
    return <LockedContent id="nobody_reached_yet" layout="inline" locale={locale} vars={{ phone: contactVars.phone }} />;
  }

  const callBy = item ? callByFor(item, def, config.coverage, config.practice.timezone) : null;

  return (
    <div className={compact ? 'small stack-sm' : 'patient-notice stack-sm'}>
      {item && item.state === 'acknowledged' && item.acknowledged_at && callBy && (
        <LockedContent
          id="closing.acknowledged"
          layout="inline"
          locale={locale}
          vars={{
            role: QUEUE_ROLE_PLAIN[item.owner_role] ?? item.owner_role,
            acknowledged_time: fmt(item.acknowledged_at),
            call_by_time: fmt(callBy),
            phone: contactVars.phone,
          }}
        />
      )}
      {item && item.state === 'open' && covered && callBy && (
        <p>
          Your request went to the {roleLabel} at {fmt(item.created_at)}. A call is expected by {fmt(callBy)}. If you have not heard from us by then,
          call <PhoneNumber number={contactVars.contact_phone} />. If this is an emergency, call <PhoneNumber number="911" />.
        </p>
      )}
      <p className="small muted">
        Owning role for urgent requests: {roleLabel}. Coverage hours: {contactVars.coverage_hours}. {covered ? 'The practice is inside its coverage hours now.' : 'The practice is outside its coverage hours now; after hours, call the after-hours number.'}
      </p>
    </div>
  );
}
