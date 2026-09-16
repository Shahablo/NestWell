/**
 * FR-03 preferences: contact windows, language, form of address, baby reference permission, the
 * safety question, and the mental-health sharing category with plain explanations. Defaults are the
 * least-intrusive option and are shown before she confirms; every change emits preferences_changed
 * with the field. Enumerated choices are one tap; typed values save on a button.
 */
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { setPreference } from '../../domain/services/enrollment';
import type { Preferences } from '../../domain/types';
import { Button, Card, Chip, DemoNote } from '../components';
import { ErrorNotice, PatientFrame, T } from './PatientFrame';
import { SHARING_EXPLANATIONS, SHARING_LABELS, SHARING_ORDER, usePatient } from './usePatient';

interface Option<V extends string> { value: V; label: string; hint?: string }

export function Choice<V extends string>({ options, value, onPick, multi = false }: { options: Option<V>[]; value: V | V[] | null; onPick: (v: V) => void; multi?: boolean }) {
  const selected = (v: V) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <div className="option-list" role={multi ? 'group' : 'radiogroup'}>
      {options.map((o) => (
        <button key={o.value} type="button" className="option-btn" role={multi ? 'checkbox' : 'radio'} aria-checked={selected(o.value)} onClick={() => onPick(o.value)}>
          <span>
            {o.label}
            {o.hint && <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>{o.hint}</span>}
          </span>
          <span className="option-btn__mark" aria-hidden="true">{selected(o.value) ? '✓' : ''}</span>
        </button>
      ))}
    </div>
  );
}

function TextPref({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  return (
    <div className="stack-sm">
      <label className="field__label">
        {label}
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <Button size="md" onClick={() => onSave(draft.trim() === '' ? null : draft.trim())} disabled={(draft.trim() || null) === value}>Save</Button>
    </div>
  );
}

export function PreferencesPage() {
  const { patient, episode, acknowledged, suppressed, run, statuses } = usePatient();
  const [error, setError] = useState<string | null>(null);
  if (!patient) return <Navigate to="/p" replace />;
  if (episode && episode.closed_at === null && !acknowledged) return <Navigate to="/p/acknowledge" replace />;

  const prefs = patient.preferences;
  const set = <K extends keyof Preferences>(field: K, value: Preferences[K]) => {
    if (prefs[field] === value) return;
    setError(run(setPreference({ patient_id: patient.id, field, value })).error);
  };
  const toggleWindow = (w: Preferences['contact_windows'][number]) => {
    const next = prefs.contact_windows.includes(w) ? prefs.contact_windows.filter((x) => x !== w) : [...prefs.contact_windows, w];
    set('contact_windows', next);
  };

  return (
    <PatientFrame title="Preferences">
      <ErrorNotice error={error} />
      <p className="small muted">Each choice saves as soon as you tap it. Where nothing is chosen, the starting value is the least intrusive one.</p>

      <Card title="Who sees my mood answers">
        <T id="preferences.sharing.intro" />
        <p className="small">Now: <Chip variant="accent">{SHARING_LABELS[prefs.sharing_category]}</Chip></p>
        <Choice
          value={prefs.sharing_category}
          options={SHARING_ORDER.map((c) => ({ value: c, label: SHARING_LABELS[c], hint: SHARING_EXPLANATIONS[c] }))}
          onPick={(v) => set('sharing_category', v)}
        />
        <DemoNote label="FR-03 / FR-06">Enforced in code: a screen result records shared_with at administration time, and a role outside it sees "screen completed, sharing withheld". Changing this also emits sharing_changed.</DemoNote>
      </Card>

      <Card title="Is it safe to message you?">
        <T id="preferences.safe_to_message" />
        <p className="small">Now: <Chip>{prefs.safe_to_message === null ? 'not answered yet' : prefs.safe_to_message ? 'yes' : 'no, phone calls only'}</Chip></p>
        <Choice
          value={prefs.safe_to_message === null ? null : prefs.safe_to_message ? 'yes' : 'no'}
          options={[
            { value: 'yes', label: 'Yes, texts and emails are fine' },
            { value: 'no', label: 'No', hint: 'We send no message content. Staff items are marked "contact by phone call only".' },
          ]}
          onPick={(v) => set('safe_to_message', v === 'yes')}
        />
      </Card>

      <Card title="When to reach you">
        <p className="small muted">Pick any that suit you. None chosen means any time inside coverage hours.</p>
        <Choice
          multi
          value={prefs.contact_windows}
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'evening', label: 'Evening' },
          ]}
          onPick={toggleWindow}
        />
      </Card>

      <Card title="Language">
        <Choice
          value={prefs.locale}
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español', hint: 'Items not yet available in Spanish are shown in English with a marker.' },
          ]}
          onPick={(v) => set('locale', v)}
        />
        {prefs.locale === 'es' && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div className="field__label">Tratamiento</div>
            <Choice
              value={prefs.formality}
              options={[{ value: 'usted', label: 'Usted' }, { value: 'tu', label: 'Tú' }]}
              onPick={(v) => set('formality', v)}
            />
          </div>
        )}
      </Card>

      <Card title="How to address you">
        <TextPref label="The name you want us to use" value={prefs.preferred_name} onSave={(v) => set('preferred_name', v)} />
        <TextPref label="Form of address (for example Ms., Mrs., or none)" value={prefs.form_of_address} onSave={(v) => set('form_of_address', v)} />
      </Card>

      {!suppressed.has('infant') && (
        <Card title="Your baby">
          <p className="small muted">We do not mention your baby unless you tell us that is welcome.</p>
          <p className="small">Now: <Chip>{prefs.baby_reference_permission === 'unset' ? 'not set (we do not mention your baby)' : prefs.baby_reference_permission === 'welcome' ? 'welcome' : 'please do not'}</Chip></p>
          <Choice
            value={prefs.baby_reference_permission === 'unset' ? null : prefs.baby_reference_permission}
            options={[
              { value: 'welcome', label: 'Yes, mentioning my baby is welcome' },
              { value: 'no', label: 'No, please do not mention my baby' },
            ]}
            onPick={(v) => set('baby_reference_permission', v)}
          />
          {prefs.baby_reference_permission === 'welcome' && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <TextPref label="Your baby's name (optional)" value={prefs.baby_name} onSave={(v) => set('baby_name', v)} />
            </div>
          )}
        </Card>
      )}

      {statuses.length > 0 && (
        <Card title="How often we are in touch">
          <p className="small">
            Now: <Chip>{prefs.contact_frequency === null ? 'not chosen yet' : prefs.contact_frequency.replace(/_/g, ' ')}</Chip>
          </p>
          {prefs.contact_frequency === null ? (
            <Button block to="/p/sensitive-preferences">Choose how we stay in touch</Button>
          ) : (
            <p className="small muted">This was set in the one-time dialog. To change it, call your named contact.</p>
          )}
        </Card>
      )}

      <Button block to="/p">Back to home</Button>
    </PatientFrame>
  );
}
