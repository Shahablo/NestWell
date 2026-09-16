/**
 * Home-screen controls: pause and stop (FR-13a, two taps), and the four patient-set sensitive
 * controls (FR-07: two taps, no reason field, suppression applied in the same command, a pause
 * offered, nothing further asked in that session).
 */
import { useState } from 'react';
import { addDays } from '../../domain/clock';
import { pauseCheckins, resumeCheckins, stopProgram } from '../../domain/services/enrollment';
import { patientControlSubtype, setSensitiveStatus, type PatientControl } from '../../domain/services/sensitive';
import type { Episode, ISO, Patient } from '../../domain/types';
import { Button, Card, DemoNote, LockedContent, Sheet } from '../components';
import { ErrorNotice, T } from './PatientFrame';
import { usePatient } from './usePatient';

interface PauseChoice { key: string; label: string; days: number | null }
const PAUSE_CHOICES: PauseChoice[] = [
  { key: '1_week', label: 'One week', days: 7 },
  { key: '2_weeks', label: 'Two weeks', days: 14 },
  { key: 'until_resumed', label: 'Until I turn them back on', days: null },
];

const CONTROLS: Array<{ key: PatientControl; content_id: string }> = [
  { key: 'loss', content_id: 'sensitive.control.loss' },
  { key: 'nicu', content_id: 'sensitive.control.nicu' },
  { key: 'stop_baby', content_id: 'sensitive.control.stop_baby' },
  { key: 'hard_birth', content_id: 'sensitive.control.hard_birth' },
];

export function PauseStopControls({ episode }: { episode: Episode }) {
  const { run, clock, locale, contactVars, fmt } = usePatient();
  const [sheet, setSheet] = useState<'pause' | 'stop' | null>(null);
  const [done, setDone] = useState<{ kind: 'paused'; label: string } | { kind: 'stopped' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pause = (choice: PauseChoice) => {
    const until: ISO | null = choice.days === null ? null : addDays(clock, choice.days);
    const r = run(pauseCheckins({ episode_id: episode.id, actor: 'patient', duration_label: choice.key, until }));
    setError(r.error);
    if (!r.error) setDone({ kind: 'paused', label: choice.label.toLowerCase() });
    setSheet(null);
  };

  const stop = () => {
    const r = run(stopProgram({ episode_id: episode.id }));
    setError(r.error);
    if (!r.error) setDone({ kind: 'stopped' });
    setSheet(null);
  };

  const resume = () => {
    const r = run(resumeCheckins({ episode_id: episode.id, actor: 'patient' }));
    setError(r.error);
    setDone(null);
  };

  return (
    <Card title="Pause or stop">
      <ErrorNotice error={error} />
      {done?.kind === 'paused' && <LockedContent id="pause.confirm" layout="inline" locale={locale} vars={{ duration_label: done.label }} />}
      {episode.paused ? (
        <div className="stack-sm">
          <p className="small muted">Check-ins are paused{episode.paused_until ? ` until ${fmt(episode.paused_until, { withTime: false })}` : ''}. Your contact card and I need help now are unchanged.</p>
          <Button size="lg" block onClick={resume}>Turn check-ins back on</Button>
        </div>
      ) : (
        <div className="home-grid">
          <Button size="lg" block onClick={() => setSheet('pause')}>Pause check-ins</Button>
          <Button size="lg" block variant="quiet" onClick={() => setSheet('stop')}>Stop the program</Button>
        </div>
      )}
      <DemoNote label="FR-13a">
        Two taps from home. A patient pause is never an Unreached signal, and a stop closes the episode as patient_withdrew with one Follow-through item to confirm her care-plan destinations. Help and contact stay.
      </DemoNote>

      <Sheet open={sheet === 'pause'} title="Pause check-ins" onClose={() => setSheet(null)}>
        <T id="pause.options" />
        <div className="option-list">
          {PAUSE_CHOICES.map((c) => (
            <button key={c.key} type="button" className="option-btn" onClick={() => pause(c)}>{c.label}</button>
          ))}
        </div>
      </Sheet>

      <Sheet open={sheet === 'stop'} title="Stop the program?" onClose={() => setSheet(null)}>
        <LockedContent id="stop.confirm" layout="inline" locale={locale} vars={{ contact_name: contactVars.contact_name }} />
        <div className="card-actions">
          <Button variant="danger" size="lg" onClick={stop}>Stop the program</Button>
          <Button size="lg" onClick={() => setSheet(null)}>Keep going</Button>
        </div>
      </Sheet>
    </Card>
  );
}

export function SensitiveControls({ patient, episode }: { patient: Patient; episode: Episode }) {
  const { run, content, statuses, clock } = usePatient();
  const [confirm, setConfirm] = useState<PatientControl | null>(null);
  const [pauseOffer, setPauseOffer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const apply = (control: PatientControl) => {
    const subtype = patientControlSubtype(control, episode);
    const r = run(setSensitiveStatus({ patient_id: patient.id, episode_id: episode.id, subtype, set_by: 'patient', control }));
    setError(r.error);
    setConfirm(null);
    if (!r.error) {
      setApplied(content.title(CONTROLS.find((c) => c.key === control)?.content_id ?? ''));
      if (!episode.paused) setPauseOffer(true);
    }
  };

  const pause = (choice: PauseChoice) => {
    const until = choice.days === null ? null : addDays(clock, choice.days);
    const r = run(pauseCheckins({ episode_id: episode.id, actor: 'patient', duration_label: choice.key, until }));
    setError(r.error);
    setPauseOffer(false);
  };

  const activeSubtypes = new Set(statuses.map((s) => s.subtype));
  const controlActive = (c: PatientControl) => activeSubtypes.has(patientControlSubtype(c, episode));

  return (
    <Card title="If something has changed">
      <p className="small muted">Tap one of these and it applies right away. You do not need to say why. A clinician at the practice is told.</p>
      <ErrorNotice error={error} />
      {applied && (
        <div className="patient-notice small">
          Applied: {applied}. Nothing else is asked today. Your contact card and I need help now stay available.
        </div>
      )}
      <div className="home-grid">
        {CONTROLS.map((c) => (
          <Button key={c.key} size="lg" block disabled={controlActive(c.key)} onClick={() => setConfirm(c.key)}>
            {content.title(c.content_id)}{controlActive(c.key) ? ' (applied)' : ''}
          </Button>
        ))}
      </div>
      <DemoNote label="FR-07">
        Each control is two taps and has no reason field. The same command applies the suppression matrix, switches the check-in set, and creates a Sensitive-review item for the coordinator to confirm the subtype. Nothing resumes automatically (FR-59).
      </DemoNote>

      <Sheet open={confirm !== null} title={confirm ? content.title(CONTROLS.find((c) => c.key === confirm)?.content_id ?? '') : undefined} onClose={() => setConfirm(null)}>
        {confirm && <T id={CONTROLS.find((c) => c.key === confirm)?.content_id ?? ''} />}
        <div className="card-actions">
          <Button variant="primary" size="lg" onClick={() => confirm && apply(confirm)}>Yes, apply this</Button>
          <Button size="lg" onClick={() => setConfirm(null)}>Go back</Button>
        </div>
      </Sheet>

      <Sheet open={pauseOffer} title="Would you like a pause?" onClose={() => setPauseOffer(false)}>
        <T id="sensitive.pause_offer" />
        <div className="option-list">
          {PAUSE_CHOICES.map((c) => (
            <button key={c.key} type="button" className="option-btn" onClick={() => pause(c)}>{c.label}</button>
          ))}
          <button type="button" className="option-btn" onClick={() => setPauseOffer(false)}>No pause for now</button>
        </div>
      </Sheet>
    </Card>
  );
}
