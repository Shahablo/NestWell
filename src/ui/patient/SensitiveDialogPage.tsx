/**
 * FR-56 sensitive preferences dialog, asked once: form of address, whether the baby's name is used,
 * and contact frequency including "not for now" (which pauses every scheduled check-in, creates the
 * Sensitive-review item with the 7-day contact deadline and tells her what will happen).
 */
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { setSensitivePreferences } from '../../domain/services/sensitive';
import { Button, Card, DemoNote } from '../components';
import { FreeTextField } from './FreeTextField';
import { ErrorNotice, PatientFrame, T } from './PatientFrame';
import { Choice } from './PreferencesPage';
import { usePatient } from './usePatient';

export function SensitiveDialogPage() {
  const { patient, episode, statuses, run, contactVars, config } = usePatient();
  const [address, setAddress] = useState(patient?.preferences.preferred_name ?? '');
  const [babyName, setBabyName] = useState<'yes' | 'no' | null>(null);
  const [frequency, setFrequency] = useState<'continue' | 'reduced' | 'not_for_now' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'continue' | 'reduced' | 'not_for_now' | null>(null);

  if (!patient || !episode || episode.closed_at !== null) return <Navigate to="/p" replace />;

  if (done) {
    return (
      <PatientFrame title="Thank you">
        {done === 'not_for_now' ? <T id="sensitive.not_for_now" vars={{ contact_name: contactVars.contact_name }} /> : (
          <Card><p>Saved. {done === 'reduced' ? 'We will be in touch less often.' : 'We continue as planned.'} You can change any of this later from home.</p></Card>
        )}
        <Button variant="primary" size="lg" block to="/p">Back to home</Button>
      </PatientFrame>
    );
  }

  if (statuses.length === 0 || patient.preferences.contact_frequency !== null) {
    return (
      <PatientFrame title="How we stay in touch">
        <Card><p>{patient.preferences.contact_frequency !== null ? 'These choices were already made. To change them, call your named contact.' : 'This dialog appears after a sensitive status is set.'}</p></Card>
        <Button block to="/p">Back to home</Button>
      </PatientFrame>
    );
  }

  const save = () => {
    if (frequency === null) return;
    const r = run(setSensitivePreferences({
      patient_id: patient.id, episode_id: episode.id, form_of_address: address.trim() || null, use_baby_name: babyName === 'yes', contact_frequency: frequency, free_text: note.trim() || null,
    }));
    setError(r.error);
    if (!r.error) setDone(frequency);
  };

  return (
    <PatientFrame title="How we stay in touch">
      <T id="sensitive.dialog.intro" />
      <ErrorNotice error={error} />
      <Card title="How should we address you?">
        <T id="sensitive.prefs.form_of_address" className="small muted" />
        <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="The name you want us to use" />
      </Card>
      <Card title="Your baby's name">
        <T id="sensitive.prefs.use_baby_name" className="small muted" />
        <Choice value={babyName} options={[{ value: 'yes', label: 'Yes, use the name' }, { value: 'no', label: 'No, please do not' }]} onPick={setBabyName} />
      </Card>
      <Card title="How often should we be in touch?">
        <T id="sensitive.prefs.contact_frequency" className="small muted" />
        <Choice
          value={frequency}
          options={[
            { value: 'continue', label: 'Continue as planned' },
            { value: 'reduced', label: 'Less often' },
            { value: 'not_for_now', label: 'Not for now', hint: `Pauses all check-ins. ${contactVars.contact_name} calls once within ${config.cadence.loss_not_for_now_contact_days} days to agree how to stay in touch. You can say no.` },
          ]}
          onPick={setFrequency}
        />
      </Card>
      <Card title="Anything you want the practice to know">
        <FreeTextField label="A note for the practice" value={note} onChange={setNote} rows={3} />
      </Card>
      <Button variant="primary" size="lg" block onClick={save} disabled={frequency === null || babyName === null}>Save these choices</Button>
      <DemoNote label="FR-56">
        Asked once. "Not for now" pauses every scheduled check-in including week 12, creates a Sensitive-review item whose acknowledgment target is the {config.cadence.loss_not_for_now_contact_days}-day human-contact deadline, and tells her what happens next. The note is free text under FR-17.
      </DemoNote>
    </PatientFrame>
  );
}
