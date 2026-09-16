/** FR-43 queue views: one tab per queue; UNOWNED and open-clinical items sort first. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { QueueKey } from '../../domain/types';
import { Card, DemoNote, EmptyState } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { sortQueueItems } from './episodeHelpers';
import { QueueItemRow } from './QueueItemRow';
import { StaffName } from './StaffName';

type Show = 'open' | 'resolved' | 'all';

export function QueuesPage() {
  const { state, config, clock } = useApp();
  const { onDuty, coverageLabel } = usePractice();
  const [params, setParams] = useSearchParams();
  const [show, setShow] = useState<Show>('open');
  const keys = config.queues.map((q) => q.key);
  const requested = params.get('queue') as QueueKey | null;
  const tab: QueueKey = requested && keys.includes(requested) ? requested : keys[0];
  const def = config.queues.find((q) => q.key === tab);

  const byQueue = useMemo(() => {
    const m = new Map<QueueKey, { open: number; unowned: number; flagged: number }>();
    for (const k of keys) m.set(k, { open: 0, unowned: 0, flagged: 0 });
    for (const q of Object.values(state.queueItems)) {
      const c = m.get(q.queue_key);
      if (!c || q.state === 'resolved') continue;
      c.open += 1;
      if (q.state === 'unowned') c.unowned += 1;
      if (q.open_clinical_flag) c.flagged += 1;
    }
    return m;
  }, [state.queueItems, keys]);

  const items = useMemo(() => {
    const all = Object.values(state.queueItems).filter((q) => q.queue_key === tab);
    const filtered = show === 'all' ? all : all.filter((q) => (show === 'open' ? q.state !== 'resolved' : q.state === 'resolved'));
    return sortQueueItems(filtered);
  }, [state.queueItems, tab, show]);

  const duty = onDuty(tab, clock);

  return (
    <div className="stack">
      <h2>Queues</h2>
      <DemoNote label="FR-43">Items are sorted UNOWNED first, then "open clinical item", then escalated, then oldest first. Targets are derived from the demo clock; move the clock on the admin panel and the states change.</DemoNote>
      <div className="admin-tabs" role="tablist" aria-label="Queues">
        {config.queues.map((q) => {
          const c = byQueue.get(q.key);
          return (
            <button key={q.key} type="button" role="tab" className="admin-tab" aria-selected={tab === q.key} onClick={() => setParams({ queue: q.key })}>
              {q.label} <span className="muted">({c?.open ?? 0})</span>
              {c && c.unowned > 0 && <span className="chip chip--danger" style={{ marginLeft: 6 }}>{c.unowned} UNOWNED</span>}
            </button>
          );
        })}
      </div>
      {def && (
        <Card flat title={def.label} aside={<span className="muted small">owner: <StaffName id={def.owner_user_id} /> ({def.owner_role.replace(/_/g, ' ')}, {def.employer})</span>}>
          <p className="muted small" style={{ margin: 0 }}>{def.description}</p>
          <p className="small" style={{ margin: '8px 0 0' }}>
            Targets: acknowledge within {def.ack_target_minutes} min, backup at {def.backup_ack_target_minutes} min{def.resolution_target_minutes ? `, resolve within ${def.resolution_target_minutes} min` : ''}
            {def.open_clinical_ack_target_minutes ? `; ${def.open_clinical_ack_target_minutes} min when flagged` : ''} · basis {def.timer_basis.replace(/_/g, ' ')} · coverage {coverageLabel(tab)} ·{' '}
            {duty.covered ? <>on duty now: <StaffName id={duty.onDutyUserId} /></> : <strong>nobody on duty now</strong>}
          </p>
        </Card>
      )}
      <div className="filter-chips" role="group" aria-label="Show">
        {(['open', 'resolved', 'all'] as Show[]).map((s) => (
          <button key={s} type="button" className="filter-chip" aria-pressed={show === s} onClick={() => setShow(s)}>{s}</button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState title={show === 'open' ? 'No open items in this queue' : 'No items match'} body="Items appear here when a rule, a screen, a patient action, or the clock creates them." />
      ) : (
        <div className="stack">{items.map((q) => <QueueItemRow key={q.id} item={q} />)}</div>
      )}
    </div>
  );
}
