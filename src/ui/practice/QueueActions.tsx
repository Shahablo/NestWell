/**
 * Queue action sheets (FR-45, FR-51, FR-13, FR-34). Every close goes through the outcome form;
 * minutes create exactly one staff_time row unless the outcome references a contact whose minutes
 * were already logged (FR-38).
 */
import { useState } from 'react';
import { toMs } from '../../domain/clock';
import { completeCallback, logOutreach, rateEscalation, reopenQueueItem, resolveQueueItem } from '../../domain/services';
import type { AccessBarrier, Callback, EscalationRating, OutreachOutcome, QueueItem } from '../../domain/types';
import { Banner, Button, Field, Sheet } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { BARRIERS, RATING_OPTIONS } from './labels';
import { parseMinutes, useStaffAction } from './useStaffAction';

const OUTCOME_SUGGESTIONS = [
  'contact attempted, patient reached',
  'contact attempted, no answer, message left',
  'plan documented with the clinician',
  'appointment confirmed',
  'callback completed',
  'reviewed, no further action at this time',
];

export function ResolveSheet({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const { state } = useApp();
  const { fmt } = usePractice();
  const { run, error } = useStaffAction();
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const [contactId, setContactId] = useState('');
  const contacts = Object.values(state.contacts).filter((c) => c.episode_id === item.episode_id).sort((a, b) => toMs(b.occurred_at) - toMs(a.occurred_at));
  const submit = () => {
    const ok = run(resolveQueueItem({ queue_item_id: item.id, outcome: outcome.trim(), note: note.trim() || null, minutes: contactId ? null : parseMinutes(minutes), contact_id: contactId || null }));
    if (ok) onClose();
  };
  return (
    <Sheet open title="Resolve with an outcome" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Resolve</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">A queue item never closes without an outcome (FR-34, FR-45). Minutes entered here create one staff_time row with source queue_item.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Outcome" htmlFor="resolve-outcome" hint="Required. Pick a suggestion or write your own.">
        <input id="resolve-outcome" type="text" list="resolve-outcomes" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
        <datalist id="resolve-outcomes">{OUTCOME_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      {item.queue_key === 'urgent' && <p className="small">FR-25: an Urgent item closes only when a contact was attempted. Choose the contact below, or describe the attempt in the outcome.</p>}
      <Field label={item.trigger_type === 'referral_dead_end' ? 'Documented plan' : 'Note'} htmlFor="resolve-note" hint={item.trigger_type === 'referral_dead_end' ? 'Required (FR-33): the alternative plan agreed for this referral dead end.' : undefined}>
        <textarea id="resolve-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label="Contact this outcome refers to" htmlFor="resolve-contact" hint="When the minutes were logged on a contact already, choose it and no second staff_time row is created (FR-38).">
        <select id="resolve-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">None</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{fmt(c.occurred_at)} · {c.type.replace(/_/g, ' ')} · {c.outcome}</option>)}
        </select>
      </Field>
      <Field label="Minutes spent" htmlFor="resolve-minutes" hint={contactId ? 'Disabled: minutes were logged on the selected contact.' : undefined}>
        <input id="resolve-minutes" type="number" min={0} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={!!contactId} />
      </Field>
    </Sheet>
  );
}

export function RateSheet({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const { run, error } = useStaffAction();
  const [rating, setRating] = useState<EscalationRating | ''>(item.rating ?? '');
  const submit = () => {
    if (!rating) return;
    if (run(rateEscalation({ queue_item_id: item.id, rating }))) onClose();
  };
  return (
    <Sheet open title="Rate this escalation" onClose={onClose} footer={<><Button variant="primary" onClick={submit} disabled={!rating}>Save rating</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-51: the clinician's view of whether this escalation was appropriate. Ratings feed the metrics view.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      {RATING_OPTIONS.map((o) => (
        <Field key={o.value} label={o.label} inline htmlFor={`rate-${o.value}`}>
          <input id={`rate-${o.value}`} type="radio" name="rating" checked={rating === o.value} onChange={() => setRating(o.value)} />
        </Field>
      ))}
    </Sheet>
  );
}

export function OutreachSheet({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const { run, error } = useStaffAction();
  const [outcome, setOutcome] = useState<OutreachOutcome>('reached');
  const [barrier, setBarrier] = useState<AccessBarrier | ''>('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const submit = () => {
    if (run(logOutreach({ queue_item_id: item.id, outcome, barrier: barrier || null, minutes: parseMinutes(minutes), note: note.trim() || null }))) onClose();
  };
  return (
    <Sheet open title="Log outreach" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Log outreach</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-13: "reached" is a human contact and resets the Unreached count; after "not reached" later check-ins go out without reminders. Minutes create one staff_time row.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Reached her" inline htmlFor="outreach-reached">
        <input id="outreach-reached" type="radio" name="outreach" checked={outcome === 'reached'} onChange={() => setOutcome('reached')} />
      </Field>
      <Field label="Not reached" inline htmlFor="outreach-not">
        <input id="outreach-not" type="radio" name="outreach" checked={outcome === 'not_reached'} onChange={() => setOutcome('not_reached')} />
      </Field>
      <Field label="Barrier identified" htmlFor="outreach-barrier">
        <select id="outreach-barrier" value={barrier} onChange={(e) => setBarrier(e.target.value as AccessBarrier | '')}>
          <option value="">None identified</option>
          {BARRIERS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
        </select>
      </Field>
      <Field label="Minutes spent" htmlFor="outreach-minutes">
        <input id="outreach-minutes" type="number" min={0} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </Field>
      <Field label="Note" htmlFor="outreach-note">
        <textarea id="outreach-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function CallbackSheet({ callback, onClose }: { callback: Callback; onClose: () => void }) {
  const { run, error } = useStaffAction();
  const [occurred, setOccurred] = useState(true);
  const [outcome, setOutcome] = useState('');
  const [minutes, setMinutes] = useState('');
  const submit = () => {
    if (run(completeCallback({ callback_id: callback.id, occurred, outcome: outcome.trim(), minutes: parseMinutes(minutes) }))) onClose();
  };
  return (
    <Sheet open title="Complete callback" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Record callback</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-34: a callback records its outcome and time; when the call happened it is also logged as a contact with the minutes once. The queue item still closes through its own outcome form.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="The call happened" inline htmlFor="cb-occurred">
        <input id="cb-occurred" type="radio" name="cb" checked={occurred} onChange={() => setOccurred(true)} />
      </Field>
      <Field label="Could not complete the call" inline htmlFor="cb-not">
        <input id="cb-not" type="radio" name="cb" checked={!occurred} onChange={() => setOccurred(false)} />
      </Field>
      <Field label="Outcome" htmlFor="cb-outcome" hint="Required.">
        <input id="cb-outcome" type="text" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </Field>
      <Field label="Minutes spent" htmlFor="cb-minutes">
        <input id="cb-minutes" type="number" min={0} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ReopenSheet({ item, onClose }: { item: QueueItem; onClose: () => void }) {
  const { run, error } = useStaffAction();
  const [reason, setReason] = useState('');
  const submit = () => {
    if (!reason.trim()) return;
    if (run(reopenQueueItem({ queue_item_id: item.id, reason: reason.trim() }))) onClose();
  };
  return (
    <Sheet open title="Reopen this item" onClose={onClose} footer={<><Button variant="primary" onClick={submit} disabled={!reason.trim()}>Reopen</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Reason" htmlFor="reopen-reason">
        <input id="reopen-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Sheet>
  );
}
