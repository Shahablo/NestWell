/**
 * FR-27 instrument step: its own attributed step with plain framing (what it is, not a diagnosis, who
 * sees the result per her category) and the locked disclosure sentence chosen by the FR-30a flag.
 * One item per screen; "Not now" sets it aside (screen_skipped), "I'd rather not" declines
 * (screen_declined on the coping item). The patient never sees a score. In demo participant mode the
 * persona, never the participant, answers (SR-27). In a loss status the config decides between the
 * loss-framed instrument and a single approved mood item (FR-57).
 */
import { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { setPreference } from '../../domain/services/enrollment';
import { createQueueItem } from '../../domain/services/queues';
import { administerScreen, declineScreen, skipScreen } from '../../domain/services/screening';
import type { Command, SharingCategory } from '../../domain/types';
import { Button, Card, Chip, DemoNote, LockedContent, Placeholder } from '../components';
import { CoverageNotice } from './CoverageNotice';
import { ErrorNotice, HelpButton, PatientFrame, T } from './PatientFrame';
import { Choice } from './PreferencesPage';
import { SHARING_LABELS, SHARING_ORDER, sharedWithText, usePatient } from './usePatient';

type Step = 'framing' | 'reask' | number | 'done';

const MOOD_OPTIONS = [
  { value: 'coping', label: 'I am coping' },
  { value: 'some_days_hard', label: 'Some days are hard' },
  { value: 'not_coping', label: 'I am not coping' },
];

function ScreenBar({ onNotNow, onDecline }: { onNotNow: () => void; onDecline: () => void }) {
  return (
    <div className="checkin-bar" role="toolbar" aria-label="Mood questions controls">
      <Button onClick={onNotNow}>Not now</Button>
      <Button variant="quiet" onClick={onDecline}>I'd rather not</Button>
      <div style={{ gridColumn: '1 / -1' }}><HelpButton block /></div>
    </div>
  );
}

export function InstrumentPage() {
  const { instrumentKey } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { patient, episode, acknowledged, state, config, content, locale, contactVars, lossActive, demoParticipantMode, run } = usePatient();
  const [step, setStep] = useState<Step>('framing');
  const [responses, setResponses] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ critical: boolean; withheld: boolean; moodItem?: boolean } | null>(null);

  const instrument = instrumentKey ? config.instruments[instrumentKey] : undefined;
  if (!patient || !episode || episode.closed_at !== null || !instrument) return <Navigate to="/p" replace />;
  if (!acknowledged) return <Navigate to="/p/acknowledge" replace />;

  const checkinId = params.get('checkin') || null;
  const returnTo = params.get('return') || '/p';
  const category: SharingCategory = patient.preferences.sharing_category;
  const moodItemMode = lossActive && config.freetext.screening_in_loss_status === 'single_mood_item';
  const lossFramingApproved = Boolean(instrument.loss_pathway_framing_content_id && content.get(instrument.loss_pathway_framing_content_id)?.status === 'approved');
  const framingId = lossActive && lossFramingApproved && instrument.loss_pathway_framing_content_id ? instrument.loss_pathway_framing_content_id : instrument.framing_content_id;
  const disclosureId = config.freetext.critical_item_overrides_sharing ? 'screen.disclosure.critical_shared' : 'screen.disclosure.critical_not_shared';
  const withheldBefore = Object.values(state.screens).filter((s) => s.patient_id === patient.id && !s.declined && s.shared_with.length === 0).length;
  const reask = category === 'nobody_yet' && withheldBefore < 1;
  const copingItem = checkinId ? Object.values(state.queueItems).find((q) => q.trigger_ref === checkinId && q.queue_key === 'needs_review') : undefined;

  const finish = (answers: number[]) => {
    const r = run(administerScreen({ episode_id: episode.id, instrument_key: instrument.key, checkin_id: checkinId, item_responses: answers }));
    setError(r.error);
    if (r.error) return;
    const critical = r.events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen');
    const administered = r.events.find((e) => e.type === 'screen_administered');
    const withheld = administered?.type === 'screen_administered' ? administered.payload.shared_with.length === 0 : false;
    setOutcome({ critical, withheld });
    setStep('done');
  };

  const notNow = () => {
    const r = run(skipScreen({ episode_id: episode.id, instrument_key: instrument.key, checkin_id: checkinId }));
    setError(r.error);
    if (!r.error) navigate(returnTo);
  };
  const decline = () => {
    const r = run(declineScreen({ episode_id: episode.id, instrument_key: instrument.key, queue_item_id: copingItem?.id ?? null }));
    setError(r.error);
    if (!r.error) navigate(returnTo);
  };

  const personaAnswers = () => {
    // The persona's canned answers: the lowest-scoring option on every item (synthetic, deterministic).
    const answers = instrument.items.map((item) => item.options.reduce((best, o, i, arr) => (o.score < arr[best].score ? i : best), 0));
    finish(answers);
  };

  const moodItemAnswer = (value: string) => {
    const cmd: Command = (ctx) => [
      ...skipScreen({ episode_id: episode.id, instrument_key: instrument.key, checkin_id: checkinId })(ctx),
      ...(value === 'not_coping'
        ? createQueueItem({ queue_key: 'needs_review', episode_id: episode.id, trigger_type: 'coping_difficulty', trigger_ref: checkinId, note: 'loss pathway mood item: reported not coping', open_clinical_flag: true })(ctx)
        : []),
    ];
    const r = run(cmd);
    setError(r.error);
    if (!r.error) {
      setOutcome({ critical: false, withheld: false, moodItem: true });
      setStep('done');
    }
  };

  const begin = () => setStep(reask ? 'reask' : 0);

  if (step === 'done') {
    return (
      <PatientFrame title="Your answers are saved">
        {outcome?.critical && (
          <LockedContent id="emergency_instruction" layout="full_screen" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} />
        )}
        <ErrorNotice error={error} />
        {outcome?.withheld ? (
          <LockedContent id="help_resources" layout="inline" locale={locale} vars={{ contact_phone: contactVars.contact_phone, after_hours_phone: contactVars.after_hours_phone }} />
        ) : (
          <Card>
            <p>Your answers are saved and go to: {outcome?.moodItem ? 'your care team' : sharedWithText(category)}. A clinician reviews them and may call you. This screen does not show a score.</p>
          </Card>
        )}
        <CoverageNotice compact />
        <Button variant="primary" size="lg" block onClick={() => navigate(returnTo)}>Continue</Button>
        <DemoNote label="FR-06 / FR-30 / FR-30a">
          The patient never sees a score or a characterization. With "nobody yet" she sees the named contact and the locked help-resources item; a critical item shows the emergency instruction full screen and, with the flag on, creates an Urgent item carrying only the withheld note.
        </DemoNote>
      </PatientFrame>
    );
  }

  if (step === 'framing') {
    return (
      <PatientFrame title={moodItemMode ? content.title('sensitive.mood_item.loss') : content.title(framingId)}>
        <ErrorNotice error={error} />
        <Card>
          {moodItemMode ? (
            <T id="sensitive.mood_item.loss" />
          ) : (
            <>
              <p className="small">
                <strong>{instrument.name}</strong> ({instrument.short_name}), version {instrument.version}.
              </p>
              <T id={framingId} vars={{ shared_with: sharedWithText(category) }} />
            </>
          )}
          <p className="small">Your answers go to: <Chip variant="accent">{sharedWithText(category)}</Chip></p>
          {instrument.placeholder && <Placeholder label="thresholds placeholder — not clinically set" />}
        </Card>
        <LockedContent id={disclosureId} layout="inline" locale={locale} />
        {!moodItemMode && <p className="small muted">{instrument.attribution}</p>}
        {demoParticipantMode ? (
          <Card tone="warning" title="In this demonstration the persona answers">
            <p>You are not asked these questions. {patient.display_name}, the synthetic persona, answers them with made-up answers. Nothing you would say is entered.</p>
            <Button variant="primary" size="lg" block onClick={personaAnswers}>Enter the persona's answers</Button>
          </Card>
        ) : moodItemMode ? (
          <Choice value={null} options={MOOD_OPTIONS} onPick={moodItemAnswer} />
        ) : (
          <Button variant="primary" size="lg" block onClick={begin}>Begin</Button>
        )}
        <DemoNote label="FR-27">
          Framing states what this is, that it is not a diagnosis, who sees the result per her category, and (locked, chosen by the FR-30a flag) exactly which item is shared regardless. Attribution renders with every copy (FR-26).
          {moodItemMode && ' Loss status with screening_in_loss_status = single_mood_item: a single approved mood item stands in for the instrument (FR-57).'}
        </DemoNote>
        <ScreenBar onNotNow={notNow} onDecline={decline} />
      </PatientFrame>
    );
  }

  if (step === 'reask') {
    return (
      <PatientFrame title={content.title('screen.sharing.reask')}>
        <T id="screen.sharing.reask" />
        <Choice
          value={category}
          options={SHARING_ORDER.map((c) => ({ value: c, label: c === 'nobody_yet' ? 'Keep nobody yet' : SHARING_LABELS[c] }))}
          onPick={(v) => {
            if (v !== category) setError(run(setPreference({ patient_id: patient.id, field: 'sharing_category', value: v })).error);
            setStep(0);
          }}
        />
        <DemoNote label="FR-06">The sharing question is re-asked once, as a single tap, at the next instrument step after a "nobody yet". The service records sharing_reasked with the count; it never exceeds one.</DemoNote>
        <ScreenBar onNotNow={notNow} onDecline={decline} />
      </PatientFrame>
    );
  }

  const index = step;
  const item = instrument.items[index];
  if (!item) return <Navigate to="/p" replace />;

  return (
    <PatientFrame>
      <div className="checkin-progress">{instrument.short_name} · question {index + 1} of {instrument.items.length}</div>
      <ErrorNotice error={error} />
      <div className="patient-prompt">{item.prompt}</div>
      <div className="option-list" role="radiogroup">
        {item.options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            className="option-btn"
            role="radio"
            aria-checked={responses[index] === i}
            onClick={() => {
              const next = [...responses.slice(0, index), i];
              setResponses(next);
              if (index + 1 >= instrument.items.length) finish(next);
              else setStep(index + 1);
            }}
          >
            <span>{o.label}</span>
            <span className="option-btn__mark" aria-hidden="true">{responses[index] === i ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      {index > 0 && <Button variant="quiet" onClick={() => setStep(index - 1)}>Previous question</Button>}
      <ScreenBar onNotNow={notNow} onDecline={decline} />
    </PatientFrame>
  );
}
