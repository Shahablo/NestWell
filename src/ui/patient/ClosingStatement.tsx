/**
 * FR-15 closing statement, computed from state by the checkins service: the no-follow-up form only
 * when nothing is pending; otherwise the pending form naming what is pending, the computed target,
 * the call-by sentence and the 911 sentence, with the locked instruction inline (FR-22). It never
 * characterizes her answers. After any free text the pending form is mandatory (FR-17).
 */
import { toMs } from '../../domain/clock';
import { closingStatementFor } from '../../domain/services/checkins';
import type { Checkin } from '../../domain/types';
import { DemoNote, LockedContent } from '../components';
import { usePatient } from './usePatient';

function joinPending(items: string[]): string {
  const list = items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  return list.charAt(0).toUpperCase() + list.slice(1);
}

export function ClosingStatement({ checkin }: { checkin: Checkin }) {
  const { state, config, clock, contactVars, locale, fmt } = usePatient();
  const closing = closingStatementFor(state, config, checkin.id, clock);
  const nextVisit = Object.values(state.visits)
    .filter((v) => v.episode_id === checkin.episode_id && v.state === 'scheduled' && toMs(v.scheduled_for) >= toMs(clock))
    .sort((a, b) => toMs(a.scheduled_for) - toMs(b.scheduled_for))[0];

  if (closing.kind === 'no_follow_up') {
    return (
      <div className="stack-sm">
        <LockedContent
          id={closing.content_id}
          layout="inline"
          locale={locale}
          vars={{ next_visit_date: nextVisit ? fmt(nextVisit.scheduled_for, { withTime: false }) : 'not yet scheduled', contact_name: contactVars.contact_name, contact_phone: contactVars.contact_phone }}
        />
        <DemoNote label="FR-15">
          The no-follow-up form renders only because every item was answered, no free text was entered, no screen was set aside, no rule fired and no queue item is open for this episode. It describes what the practice will do, never her answers.
        </DemoNote>
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <LockedContent
        id={closing.content_id}
        layout="inline"
        locale={locale}
        vars={{
          pending_what: joinPending(closing.pending),
          target_time: closing.target_time ? fmt(closing.target_time) : 'the next coverage window',
          phone: contactVars.contact_phone,
        }}
      />
      <LockedContent id="emergency_instruction" layout="inline" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} />
      <DemoNote label="FR-15 / FR-17">
        Pending: {closing.pending.join('; ')}. The target is computed from the Needs-review queue's next coverage window ({config.queues.find((q) => q.key === 'needs_review')?.timer_basis} basis). After any free text this pending form is mandatory, whatever the scan flag says.
      </DemoNote>
    </div>
  );
}
