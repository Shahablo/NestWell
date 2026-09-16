/**
 * FR-17: every free-text field is optional, shows the locked emergency instruction beside it before
 * she types (FR-22 inline), states who will read the note and by when, and is replaced by the
 * "not available in this demo" item in demo participant mode (SR-27).
 */
import { useId } from 'react';
import { LockedContent, Placeholder } from '../components';
import { T } from './PatientFrame';
import { ackTargetFor, usePatient } from './usePatient';

export interface FreeTextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}

export function FreeTextField({ label, value, onChange, rows = 4 }: FreeTextFieldProps) {
  const { config, clock, contactVars, locale, demoParticipantMode, fmt } = usePatient();
  const id = useId();
  const target = ackTargetFor(config, 'needs_review', clock);

  if (demoParticipantMode) {
    return (
      <div className="stack-sm">
        <div className="field__label">{label}</div>
        <LockedContent id="demo.free_text_unavailable" layout="inline" locale={locale} />
      </div>
    );
  }

  return (
    <div className="stack-sm">
      <LockedContent id="emergency_instruction" layout="inline" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} />
      <label className="field__label" htmlFor={id}>{label}{/optional/i.test(label) ? null : <span className="muted"> (optional)</span>}</label>
      <T id="checkin.free_text.note" className="small muted" />
      <p className="small">
        Who reads this: a nurse at {config.practice.name}, by {target ? fmt(target) : 'the same business day'}. No program reads or answers it. <Placeholder label="placeholder target" />
      </p>
      <textarea id={id} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
