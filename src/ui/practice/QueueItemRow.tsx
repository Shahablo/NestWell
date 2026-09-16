/**
 * One queue item (FR-43): age, owner or NOT YET ASSIGNED, state, target status against the demo
 * clock, the open-clinical flag, and the actions the current role may take. "Acknowledged by [role]
 * at [time]" is always paired with "a call is expected by [computed time]" (FR-25).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { callByFor } from '../../domain/derive';
import { splitRoutedNote } from '../../domain/services/freetext';
import { acknowledgeQueueItem } from '../../domain/services';
import type { QueueItem } from '../../domain/types';
import { Banner, Button, Chip } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { patientName } from './episodeHelpers';
import { QUEUE_STATE, RATING_LABELS, TRIGGER_LABELS, ageLabel, dueLabel, humanize } from './labels';
import { CallbackSheet, OutreachSheet, RateSheet, ReopenSheet, ResolveSheet } from './QueueActions';
import { FreeTextReveal } from './ScreenResultView';
import { StaffName } from './StaffName';
import { useStaffAction } from './useStaffAction';

type SheetKind = 'resolve' | 'rate' | 'outreach' | 'callback' | 'reopen' | null;

export function QueueItemRow({ item, showPatient = true }: { item: QueueItem; showPatient?: boolean }) {
  const { state, clock, role, config } = useApp();
  const { fmt, queueDef, staff } = usePractice();
  const { run, error } = useStaffAction();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const def = queueDef(item.queue_key);
  const st = QUEUE_STATE[item.state];
  const canAct = role === 'coordinator' || role === 'clinician';
  const openCallback = Object.values(state.callbacks).find((c) => c.queue_item_id === item.id && c.occurred === null);
  const callbacks = Object.values(state.callbacks).filter((c) => c.queue_item_id === item.id);
  const ackRole = item.acknowledged_by ? staff(item.acknowledged_by)?.role ?? 'staff' : null;
  // FR-25: one computed call-by time, the same helper the patient's closing statement and coverage notice use.
  const callBy = item.acknowledged_at ? callByFor(item, def, config.coverage, config.practice.timezone) : null;
  // FR-17: free text carried on the item (usefulness comment, sensitive-preferences note) is revealed only through a recorded read.
  const note = splitRoutedNote(item.note);
  const cls = ['queue-item', item.state === 'unowned' ? 'queue-item--unowned' : '', item.open_clinical_flag && item.state !== 'unowned' ? 'queue-item--flagged' : '', item.state === 'resolved' ? 'queue-item--resolved' : ''].filter(Boolean).join(' ');

  return (
    <article className={cls} aria-label={`${def?.label ?? item.queue_key} item ${item.id}`}>
      <div className="queue-item__head">
        <Chip variant={st.variant}>{st.label}</Chip>
        {item.open_clinical_flag && <Chip variant="warning" title="FR-13: an open Needs-review or Urgent item, a positive screen in the last 30 days, an open referral, or an active sensitive status">open clinical item</Chip>}
        <strong>{TRIGGER_LABELS[item.trigger_type] ?? humanize(item.trigger_type)}</strong>
        {showPatient && <Link to={`/practice/patients/${item.patient_id}`}>{patientName(state, item.patient_id)}</Link>}
        <span className="muted small">age {ageLabel(item.created_at, clock)}</span>
        {item.derived && <Chip variant="neutral" title="Derived from the clock; it disappears if the clock moves back before its trigger">derived</Chip>}
        <code className="small muted">{item.id}</code>
      </div>
      {note.summary && <p className="small" style={{ margin: '0 0 8px' }}>{note.summary}</p>}
      {note.text && (
        <div style={{ margin: '0 0 8px' }}>
          {canAct ? <FreeTextReveal episode_id={item.episode_id} text={note.text} label="her note" /> : <span className="muted small">free text entered (not shown to this view)</span>}
        </div>
      )}
      <dl className="queue-item__meta">
        <div><dt>Owner</dt><dd><StaffName id={item.owner_user_id} /> <span className="muted small">({humanize(item.owner_role)}{def ? `, ${def.employer}` : ''})</span></dd></div>
        <div><dt>Created</dt><dd>{fmt(item.created_at)}</dd></div>
        <div>
          <dt>Acknowledgment target</dt>
          <dd>{fmt(item.ack_target_at)} <span className={item.acknowledged_at || item.resolved_at ? 'muted small' : 'small'}>({item.acknowledged_at ? 'met' : dueLabel(item.ack_target_at, clock)})</span></dd>
        </div>
        <div>
          <dt>Backup target (UNOWNED after)</dt>
          <dd>{fmt(item.backup_target_at)}{item.unowned_at && <> · <span className="small">UNOWNED since {fmt(item.unowned_at)}; the patient sees the not-yet-reached instruction</span></>}</dd>
        </div>
        {item.resolution_target_at && <div><dt>Resolution target</dt><dd>{fmt(item.resolution_target_at)} <span className="small muted">({item.resolved_at ? 'closed' : dueLabel(item.resolution_target_at, clock)})</span></dd></div>}
        {item.acknowledged_at && (
          <div>
            <dt>Acknowledged</dt>
            <dd>
              by {humanize(ackRole)} at {fmt(item.acknowledged_at)}; a call is expected by {callBy ? fmt(callBy) : '—'}
              {item.minutes_to_ack !== null && <span className="muted small"> · {item.minutes_to_ack} min to acknowledge</span>}
            </dd>
          </div>
        )}
        {item.escalated_at && !item.unowned_at && <div><dt>Escalated</dt><dd>{fmt(item.escalated_at)}</dd></div>}
        {item.resolved_at && <div><dt>Resolved</dt><dd>{fmt(item.resolved_at)} by <StaffName id={item.resolved_by} /> · outcome: {item.outcome ?? '—'}</dd></div>}
        {item.rating && <div><dt>Escalation rating</dt><dd>{RATING_LABELS[item.rating]}</dd></div>}
        {def && <div><dt>Timer basis</dt><dd>{humanize(def.timer_basis)}{def.placeholder && <> · <span className="muted small">targets are placeholders</span></>}</dd></div>}
        {callbacks.length > 0 && (
          <div>
            <dt>Callback</dt>
            <dd>
              {callbacks.map((c) => (
                <div key={c.id}>
                  requested {fmt(c.requested_at)}{c.preferred_window ? ` (window: ${c.preferred_window})` : ''} ·{' '}
                  {c.occurred === null ? 'pending' : c.occurred ? `completed ${c.occurred_at ? fmt(c.occurred_at) : ''}: ${c.outcome}` : `not completed: ${c.outcome}`}
                </div>
              ))}
            </dd>
          </div>
        )}
      </dl>
      {error && <Banner variant="warning">{error}</Banner>}
      {canAct && (
        <div className="card-actions">
          {item.state !== 'resolved' && item.acknowledged_at === null && <Button size="sm" variant="primary" onClick={() => run(acknowledgeQueueItem({ queue_item_id: item.id }))}>Acknowledge</Button>}
          {item.state !== 'resolved' && item.queue_key === 'unreached' && <Button size="sm" variant="primary" onClick={() => setSheet('outreach')}>Log outreach</Button>}
          {item.state !== 'resolved' && openCallback && <Button size="sm" onClick={() => setSheet('callback')}>Complete callback</Button>}
          {item.state !== 'resolved' && item.queue_key !== 'unreached' && <Button size="sm" onClick={() => setSheet('resolve')}>Resolve with outcome</Button>}
          {item.state !== 'resolved' && item.queue_key === 'unreached' && !item.derived && <Button size="sm" variant="quiet" onClick={() => setSheet('resolve')}>Resolve with outcome</Button>}
          {role === 'clinician' && <Button size="sm" variant="quiet" onClick={() => setSheet('rate')}>{item.rating ? 'Change rating' : 'Rate escalation'}</Button>}
          {item.state === 'resolved' && !item.derived && <Button size="sm" variant="quiet" onClick={() => setSheet('reopen')}>Reopen</Button>}
          {item.queue_key === 'summaries' && item.trigger_ref && <Button size="sm" variant="quiet" to={`/practice/summaries/${item.trigger_ref}`}>Open summary</Button>}
          {item.trigger_ref && state.screens[item.trigger_ref] && role === 'clinician' && <Button size="sm" variant="quiet" to="/practice/screening">Open screening review</Button>}
        </div>
      )}
      {sheet === 'resolve' && <ResolveSheet item={item} onClose={() => setSheet(null)} />}
      {sheet === 'rate' && <RateSheet item={item} onClose={() => setSheet(null)} />}
      {sheet === 'outreach' && <OutreachSheet item={item} onClose={() => setSheet(null)} />}
      {sheet === 'callback' && openCallback && <CallbackSheet callback={openCallback} onClose={() => setSheet(null)} />}
      {sheet === 'reopen' && <ReopenSheet item={item} onClose={() => setSheet(null)} />}
    </article>
  );
}
