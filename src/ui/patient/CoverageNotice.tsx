/**
 * FR-24 / FR-25 coverage honesty for the patient. Every help request and closing statement shows
 * the owning role and coverage hours. While an Urgent item is escalated, UNOWNED, or open outside
 * coverage, the patient sees the locked "we have not reached a nurse yet" item, never a waiting
 * message. An acknowledged item shows "acknowledged by [role] at [time]" paired with the
 * computed call-by time.
 */
import { toMs } from '../../domain/clock';
import { openQueueItemsFor } from '../../domain/projection';
import type { QueueItem } from '../../domain/types';
import { LockedContent, PhoneNumber } from '../components';
import { QUEUE_ROLE_PLAIN, insideCoverage, usePatient } from './usePatient';

export function latestOpenUrgent(items: QueueItem[]): QueueItem | null {
  return items.filter((q) => q.queue_key === 'urgent').sort((a, b) => toMs(b.created_at) - toMs(a.created_at))[0] ?? null;
}

export function CoverageNotice({ compact = false }: { compact?: boolean }) {
  const { state, config, clock, episode, contactVars, fmt, locale } = usePatient();
  const def = config.queues.find((q) => q.key === 'urgent');
  const roleLabel = QUEUE_ROLE_PLAIN[def?.owner_role ?? 'coordinator'] ?? 'care coordinator';
  const item = episode ? latestOpenUrgent(openQueueItemsFor(state, episode.id, ['urgent'])) : null;
  const covered = insideCoverage(config, 'urgent', clock);

  if (item && (item.state === 'escalated' || item.state === 'unowned' || (item.state === 'open' && !covered))) {
    return <LockedContent id="nobody_reached_yet" layout="inline" locale={locale} vars={{ phone: contactVars.phone }} />;
  }

  return (
    <div className={compact ? 'small stack-sm' : 'patient-notice stack-sm'}>
      {item && item.state === 'acknowledged' && item.acknowledged_at && (
        <LockedContent
          id="closing.acknowledged"
          layout="inline"
          locale={locale}
          vars={{
            role: QUEUE_ROLE_PLAIN[item.owner_role] ?? item.owner_role,
            acknowledged_time: fmt(item.acknowledged_at),
            call_by_time: fmt(item.resolution_target_at ?? item.backup_target_at),
            phone: contactVars.phone,
          }}
        />
      )}
      {item && item.state === 'open' && covered && (
        <p>
          Your request went to the {roleLabel} at {fmt(item.created_at)}. A call is expected by {fmt(item.ack_target_at)}. If you have not heard from us by then,
          call <PhoneNumber number={contactVars.contact_phone} />. If this is an emergency, call <PhoneNumber number="911" />.
        </p>
      )}
      <p className="small muted">
        Owning role for urgent requests: {roleLabel}. Coverage hours: {contactVars.coverage_hours}. {covered ? 'The practice is inside its coverage hours now.' : 'The practice is outside its coverage hours now; after hours, call the after-hours number.'}
      </p>
    </div>
  );
}
