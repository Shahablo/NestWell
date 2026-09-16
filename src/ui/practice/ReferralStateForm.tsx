/** FR-33 referral state change: consent basis on sent_to_partner, a date on scheduled, the kept-on date on completed. */
import { useState } from 'react';
import { setReferralState } from '../../domain/services';
import type { Referral, ReferralState } from '../../domain/types';
import { Banner, Button, Field, Sheet } from '../components';
import { useApp } from '../shell/useApp';
import { isoToLocalInput, localInputToIso } from '../shell/timeInput';
import { usePractice } from '../shell/usePractice';
import { REFERRAL_NEXT_STATES, REFERRAL_STATE_LABELS } from './labels';
import { useStaffAction } from './useStaffAction';

const CONSENT_OPTIONS = ['verbal consent recorded by staff', 'signed release on file', 'consent basis to be confirmed by counsel'];

export function ReferralStateForm({ referral, allowed, onClose }: { referral: Referral; allowed: ReferralState[]; onClose: () => void }) {
  const { clock } = useApp();
  const { timezone } = usePractice();
  const { run, error } = useStaffAction();
  const next = REFERRAL_NEXT_STATES[referral.state] ?? [];
  const choices = allowed.filter((s) => s !== referral.state && s !== 'created' && next.includes(s));
  const [state, setState] = useState<ReferralState>(choices[0] ?? 'closed');
  const [consent, setConsent] = useState(CONSENT_OPTIONS[0]);
  const [version, setVersion] = useState('1');
  // No default date: an appointment date or kept-on date is entered by staff, never taken from the clock (FR-33).
  const [when, setWhen] = useState('');
  const maxInput = isoToLocalInput(clock, timezone);
  const [note, setNote] = useState('');
  const submit = () => {
    const iso = localInputToIso(when, timezone);
    const ok = run(setReferralState({
      referral_id: referral.id,
      state,
      note: note.trim() || null,
      consent_basis: state === 'sent_to_partner' ? consent : null,
      consent_version: state === 'sent_to_partner' ? version.trim() || '1' : null,
      scheduled_for: state === 'appointment_scheduled' ? iso : null,
      completed_at: state === 'appointment_completed' ? iso : null,
    }));
    if (ok) onClose();
  };
  return (
    <Sheet open title="Change referral state" onClose={onClose} footer={<><Button variant="primary" onClick={submit} disabled={choices.length === 0 || ((state === 'appointment_scheduled' || state === 'appointment_completed') && when === '')}>Save</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">Current state: {REFERRAL_STATE_LABELS[referral.state]}. Only a kept appointment counts as completion; "sent" never renders as success (FR-33).</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="New state" htmlFor="rs-state">
        <select id="rs-state" value={state} onChange={(e) => setState(e.target.value as ReferralState)}>
          {choices.map((s) => <option key={s} value={s}>{REFERRAL_STATE_LABELS[s]}</option>)}
        </select>
      </Field>
      {state === 'sent_to_partner' && (
        <>
          <Field label="Consent basis" htmlFor="rs-consent" hint="Recorded with its version (FR-33). Only consented fields go to the partner.">
            <select id="rs-consent" value={consent} onChange={(e) => setConsent(e.target.value)}>
              {CONSENT_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Consent version" htmlFor="rs-version">
            <input id="rs-version" type="text" value={version} onChange={(e) => setVersion(e.target.value)} />
          </Field>
        </>
      )}
      {state === 'appointment_scheduled' && (
        <Field label={`Appointment date and time (${timezone})`} htmlFor="rs-when">
          <input id="rs-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      )}
      {state === 'appointment_completed' && (
        <Field label={`Kept on (${timezone})`} htmlFor="rs-kept" hint="The date the appointment was kept, entered by staff.">
          <input id="rs-kept" type="datetime-local" max={maxInput} value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      )}
      <Field label="Note" htmlFor="rs-note">
        <textarea id="rs-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}
