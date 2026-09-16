/** Patient-panel staff actions: sensitive status (FR-54), contact log (FR-38), pause/resume (FR-13a), closure (FR-39). */
import { useState } from 'react';
import { addDays } from '../../domain/clock';
import { closeEarly, closeEpisode, liftSensitiveStatus, logContact, pauseCheckins, resumeCheckins, setSensitiveStatus } from '../../domain/services';
import type { CloseReason, ContactType, Episode, MentalHealthDestination, Role, SensitiveSubtype } from '../../domain/types';
import { Banner, Button, Field, Sheet } from '../components';
import { useApp } from '../shell/useApp';
import { localInputToIso } from '../shell/timeInput';
import { usePractice } from '../shell/usePractice';
import { CLOSE_REASONS, CONTACT_TYPES, MH_DESTINATIONS, SUBTYPES, SUBTYPE_LABELS } from './labels';
import { parseMinutes, useStaffAction } from './useStaffAction';

interface EpisodeSheetProps { episode: Episode; onClose: () => void }

export function SensitiveStatusSheet({ episode, onClose }: EpisodeSheetProps) {
  const { role } = useApp();
  const { run, error } = useStaffAction();
  const [subtype, setSubtype] = useState<SensitiveSubtype>('nicu');
  const [note, setNote] = useState('');
  const setBy: 'coordinator' | 'clinician' = role === 'clinician' ? 'clinician' : 'coordinator';
  const submit = () => {
    if (run(setSensitiveStatus({ patient_id: episode.patient_id, episode_id: episode.id, subtype, set_by: setBy, note: note.trim() || null }))) onClose();
  };
  return (
    <Sheet open title="Set a sensitive status" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Set status</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-54: suppression applies immediately and does not wait for review; a Sensitive-review item is created in the same command. Nothing resumes automatically (FR-59).</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Subtype" htmlFor="ss-subtype">
        <select id="ss-subtype" value={subtype} onChange={(e) => setSubtype(e.target.value as SensitiveSubtype)}>
          {SUBTYPES.map((s) => <option key={s} value={s}>{SUBTYPE_LABELS[s]}</option>)}
        </select>
      </Field>
      <Field label="Note (staff only)" htmlFor="ss-note">
        <textarea id="ss-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function LiftStatusSheet({ episode, subtype, onClose }: EpisodeSheetProps & { subtype: SensitiveSubtype }) {
  const { run, error } = useStaffAction();
  const [reason, setReason] = useState('');
  const submit = () => {
    if (run(liftSensitiveStatus({ patient_id: episode.patient_id, subtype, reason: reason.trim() }))) onClose();
  };
  return (
    <Sheet open title={`Lift ${SUBTYPE_LABELS[subtype]}`} onClose={onClose} footer={<><Button variant="primary" onClick={submit} disabled={!reason.trim()}>Lift status</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">NFR-07: loss and NICU statuses are lifted by a coordinator with a reason; the lift is logged.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Reason" htmlFor="lift-reason">
        <input id="lift-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ContactSheet({ episode, onClose }: EpisodeSheetProps) {
  const { run, error } = useStaffAction();
  const [type, setType] = useState<ContactType>('phone_call');
  const [outcome, setOutcome] = useState('');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const submit = () => {
    if (run(logContact({ episode_id: episode.id, type, outcome: outcome.trim(), note: note.trim() || null, minutes: parseMinutes(minutes) }))) onClose();
  };
  return (
    <Sheet open title="Log a contact" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Log contact</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-38: type, time, staff user and outcome; minutes create exactly one staff_time row. The first human contact sets the day-21 flag (FR-37).</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Type" htmlFor="ct-type">
        <select id="ct-type" value={type} onChange={(e) => setType(e.target.value as ContactType)}>
          {CONTACT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Outcome" htmlFor="ct-outcome" hint="Required.">
        <input id="ct-outcome" type="text" value={outcome} onChange={(e) => setOutcome(e.target.value)} />
      </Field>
      <Field label="Minutes spent" htmlFor="ct-minutes">
        <input id="ct-minutes" type="number" min={0} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </Field>
      <Field label="Note" htmlFor="ct-note">
        <textarea id="ct-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function PauseSheet({ episode, onClose }: EpisodeSheetProps) {
  const { clock } = useApp();
  const { run, error } = useStaffAction();
  const [choice, setChoice] = useState<'1w' | '2w' | 'open'>('1w');
  const submit = () => {
    const until = choice === '1w' ? addDays(clock, 7) : choice === '2w' ? addDays(clock, 14) : null;
    const label = choice === '1w' ? 'one week' : choice === '2w' ? 'two weeks' : 'until resumed';
    if (run(pauseCheckins({ episode_id: episode.id, actor: 'staff', duration_label: label, until }))) onClose();
  };
  return (
    <Sheet open title="Pause check-ins" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Pause</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">A pause suppresses check-ins and reminders and creates no Unreached item; contact and help stay unchanged (FR-13a).</p>
      {error && <Banner variant="warning">{error}</Banner>}
      {([['1w', 'One week'], ['2w', 'Two weeks'], ['open', 'Until resumed']] as const).map(([v, l]) => (
        <Field key={v} label={l} inline htmlFor={`pause-${v}`}>
          <input id={`pause-${v}`} type="radio" name="pause" checked={choice === v} onChange={() => setChoice(v)} />
        </Field>
      ))}
    </Sheet>
  );
}

export function ResumeButton({ episode }: { episode: Episode }) {
  const { run, error } = useStaffAction();
  return (
    <>
      <Button size="sm" onClick={() => run(resumeCheckins({ episode_id: episode.id, actor: 'staff' }))}>Resume check-ins</Button>
      {error && <span className="field__error">{error}</span>}
    </>
  );
}

export function CloseEpisodeSheet({ episode, onClose }: EpisodeSheetProps) {
  const { clock, state } = useApp();
  const { timezone } = usePractice();
  const { run, error } = useStaffAction();
  const [primaryCare, setPrimaryCare] = useState('');
  const [mh, setMh] = useState<MentalHealthDestination>(episode.indicated ? 'none_identified' : 'not_indicated');
  const [ownerRole, setOwnerRole] = useState<Role | ''>('coordinator');
  const [nextContact, setNextContact] = useState('');
  const [openItems, setOpenItems] = useState(() => Object.values(state.queueItems).filter((q) => q.episode_id === episode.id && q.state !== 'resolved').map((q) => `${q.queue_key}: ${q.note ?? q.trigger_type}`).join('\n'));
  const submit = () => {
    const next = nextContact ? localInputToIso(nextContact, timezone) : null;
    const ok = run(closeEpisode({
      episode_id: episode.id,
      transition: {
        primary_care: primaryCare.trim() || null,
        mental_health: mh,
        open_items: openItems.split('\n').map((s) => s.trim()).filter(Boolean),
        owner_role: ownerRole || null,
        next_contact_date: next,
      },
    }));
    if (ok) onClose();
  };
  return (
    <Sheet open title="Week-12 transition and closure" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Complete transition</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">
        FR-39: {episode.indicated ? 'this episode is indicated, so it closes only with a confirmed mental-health destination, or "no destination identified" plus a named practice owner and next contact date.' : 'this episode is not indicated.'} The patient sees the same list in plain words.
      </p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Primary care contact" htmlFor="tr-pc">
        <input id="tr-pc" type="text" value={primaryCare} onChange={(e) => setPrimaryCare(e.target.value)} />
      </Field>
      <Field label="Mental-health connection" htmlFor="tr-mh">
        <select id="tr-mh" value={mh} onChange={(e) => setMh(e.target.value as MentalHealthDestination)}>
          {MH_DESTINATIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Open items (one per line)" htmlFor="tr-open">
        <textarea id="tr-open" value={openItems} onChange={(e) => setOpenItems(e.target.value)} />
      </Field>
      <Field label="Named practice owner for open items" htmlFor="tr-owner">
        <select id="tr-owner" value={ownerRole} onChange={(e) => setOwnerRole(e.target.value as Role | '')}>
          <option value="">None</option>
          <option value="coordinator">Coordinator</option>
          <option value="clinician">Clinician</option>
        </select>
      </Field>
      <Field label={`Next contact date (${timezone})`} htmlFor="tr-next" hint={`Clock is ${clock}`}>
        <input id="tr-next" type="datetime-local" value={nextContact} onChange={(e) => setNextContact(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function CloseEarlySheet({ episode, onClose }: EpisodeSheetProps) {
  const { run, error } = useStaffAction();
  const [reason, setReason] = useState<CloseReason>('unreachable_after_attempts');
  const submit = () => {
    if (run(closeEarly({ episode_id: episode.id, close_reason: reason }))) onClose();
  };
  return (
    <Sheet open title="Close early" onClose={onClose} footer={<><Button variant="danger" onClick={submit}>Close episode early</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-39: closed_early emits dropout_recorded; help and the named contact stay visible to the patient.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Reason" htmlFor="ce-reason">
        <select id="ce-reason" value={reason} onChange={(e) => setReason(e.target.value as CloseReason)}>
          {CLOSE_REASONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
    </Sheet>
  );
}
