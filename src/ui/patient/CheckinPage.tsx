/**
 * Check-in (FR-08–FR-17): the first screen shows the locked emergency instruction and I need help
 * now above the questions; then one item per screen; Skip item, Skip check-in, Not now and I need
 * help now stay in a bar that is visible without scrolling at 360px. Submitting with unanswered
 * items stores a partial check-in and never re-prompts. After submission the page shows any
 * full-screen locked instruction first, then the instrument offer, then the FR-15 closing statement.
 */
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { CheckinItem, CheckinTemplate } from '../../domain/config.schema';
import { dayLabel } from '../../domain/clock';
import { notNow, openCheckin, rateUsefulness, skipCheckin, skipItem, submitCheckin, type SubmitResponse } from '../../domain/services/checkins';
import { declineScreen, skipScreen } from '../../domain/services/screening';
import type { Checkin } from '../../domain/types';
import { Button, Card, DemoNote, LockedContent, Placeholder } from '../components';
import { ClosingStatement } from './ClosingStatement';
import { CoverageNotice } from './CoverageNotice';
import { FreeTextField } from './FreeTextField';
import { ErrorNotice, HelpButton, PatientFrame, T } from './PatientFrame';
import { pendingScreenOfferFor, usePatient } from './usePatient';

type Answer = string | string[] | null;

function CheckinBar({ onSkipItem, onSkipCheckin, onNotNow, notNowDisabled }: { onSkipItem?: () => void; onSkipCheckin: () => void; onNotNow: () => void; notNowDisabled: boolean }) {
  return (
    <div className="checkin-bar" role="toolbar" aria-label="Check-in controls">
      {onSkipItem ? <Button onClick={onSkipItem}>Skip item</Button> : <Button onClick={onSkipCheckin}>Skip check-in</Button>}
      {onSkipItem && <Button variant="quiet" onClick={onSkipCheckin}>Skip check-in</Button>}
      <Button variant="quiet" onClick={onNotNow} disabled={notNowDisabled} title={notNowDisabled ? 'This check-in has already been moved once.' : undefined}>Not now</Button>
      <HelpButton block />
    </div>
  );
}

function ItemOptions({ item, value, onChange, onAdvance, onSelect }: { item: CheckinItem; value: Answer; onChange: (v: Answer) => void; onAdvance: () => void; onSelect: (v: string) => void }) {
  if (item.response_type === 'multi_tap') {
    const chosen = Array.isArray(value) ? value : [];
    const toggle = (v: string) => {
      const exclusive = item.options.find((o) => o.value === v)?.rule_tags.includes('none');
      if (chosen.includes(v)) return onChange(chosen.filter((x) => x !== v));
      if (exclusive) return onChange([v]);
      onChange([...chosen.filter((x) => !item.options.find((o) => o.value === x)?.rule_tags.includes('none')), v]);
    };
    return (
      <div className="stack">
        <div className="option-list" role="group">
          {item.options.map((o) => (
            <button key={o.value} type="button" className="option-btn" role="checkbox" aria-checked={chosen.includes(o.value)} onClick={() => toggle(o.value)}>
              <span>{o.label}</span>
              <span className="option-btn__mark" aria-hidden="true">{chosen.includes(o.value) ? '✓' : ''}</span>
            </button>
          ))}
        </div>
        <Button variant="primary" size="lg" block onClick={onAdvance} disabled={chosen.length === 0}>Next</Button>
      </div>
    );
  }
  return (
    <div className="option-list" role="radiogroup">
      {item.options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="option-btn"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onSelect(o.value)}
        >
          <span>{o.label}</span>
          <span className="option-btn__mark" aria-hidden="true">{value === o.value ? '✓' : ''}</span>
        </button>
      ))}
    </div>
  );
}

function CheckinFlow({ checkin, template }: { checkin: Checkin; template: CheckinTemplate }) {
  const { run, content, locale, contactVars, patient } = usePatient();
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | number>('intro');
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [freeText, setFreeText] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (checkin.state === 'sent' && !opened.current) {
      opened.current = true;
      run(openCheckin({ checkin_id: checkin.id }));
    }
    // Only on mount: the open event is client-reported and drives no state transition (FR-21).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const items = template.items;
  const submit = (finalAnswers: Record<string, Answer>) => {
    const responses: SubmitResponse[] = items.map((i) => ({ question_key: i.key, value: finalAnswers[i.key] ?? null, free_text: freeText[i.key]?.trim() || null }));
    const r = run(submitCheckin({ checkin_id: checkin.id, responses }));
    setError(r.error);
    if (r.error) return;
    const urgent = r.events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen');
    navigate(`/p/checkin/${checkin.id}?phase=done`, { replace: true, state: { urgent } });
  };

  const advanceFrom = (index: number, finalAnswers: Record<string, Answer>) => {
    if (index + 1 >= items.length) submit(finalAnswers);
    else setStep(index + 1);
  };

  const onSkipItem = (index: number) => {
    const item = items[index];
    run(skipItem({ checkin_id: checkin.id, question_key: item.key }));
    const next = { ...answers, [item.key]: null };
    setAnswers(next);
    advanceFrom(index, next);
  };

  const onSkipCheckin = () => {
    const r = run(skipCheckin({ checkin_id: checkin.id }));
    setError(r.error);
    if (!r.error) navigate('/p');
  };

  const onNotNow = () => {
    const r = run(notNow({ checkin_id: checkin.id }));
    setError(r.error);
    if (!r.error) navigate('/p', { state: { notNow: true } });
  };

  const bar = (index?: number) => (
    <CheckinBar onSkipItem={index === undefined ? undefined : () => onSkipItem(index)} onSkipCheckin={onSkipCheckin} onNotNow={onNotNow} notNowDisabled={checkin.rescheduled_once} />
  );

  if (step === 'intro') {
    return (
      <PatientFrame title={content.title(template.title_content_id)}>
        <ErrorNotice error={error} />
        <LockedContent id="emergency_instruction" layout="inline" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} />
        <Card>
          <T id={template.title_content_id} />
          <p className="small muted">{items.length} short questions. {template.instrument_key ? 'Then a separate set of mood questions, which you can also skip.' : ''}</p>
          {template.placeholder && <Placeholder />}
          <div className="card-actions">
            <Button variant="primary" size="lg" block onClick={() => setStep(0)}>Start</Button>
          </div>
        </Card>
        <DemoNote label="FR-10 / 5.3">
          The emergency instruction and I need help now sit above the questions. Skip, Not now and help stay in the bottom bar on every question, without scrolling at 360px. Opening is recorded as a client-reported event.
        </DemoNote>
        {bar()}
      </PatientFrame>
    );
  }

  const index = step;
  const item = items[index];
  if (!item) return <Navigate to="/p" replace />;
  const isFree = item.response_type === 'free_text_optional';
  const answered = isFree ? true : answers[item.key] !== undefined && answers[item.key] !== null;

  return (
    <PatientFrame>
      <div className="checkin-progress">
        {dayLabel(checkin.day_number)} check-in · question {index + 1} of {items.length}
      </div>
      <ErrorNotice error={error} />
      <div className="patient-prompt">{content.text(item.prompt_content_id)}</div>
      {content.get(item.prompt_content_id)?.placeholder && <Placeholder />}
      {isFree ? (
        <div className="stack">
          <FreeTextField label={content.title(item.prompt_content_id)} value={freeText[item.key] ?? ''} onChange={(v) => setFreeText({ ...freeText, [item.key]: v })} />
          <Button variant="primary" size="lg" block onClick={() => advanceFrom(index, answers)}>
            {index + 1 >= items.length ? 'Finish' : 'Next'}
          </Button>
        </div>
      ) : (
        <ItemOptions
          item={item}
          value={answers[item.key] ?? null}
          onChange={(v) => setAnswers((a) => ({ ...a, [item.key]: v }))}
          onAdvance={() => advanceFrom(index, answers)}
          onSelect={(v) => {
            // Single-tap answers advance immediately with the value just chosen.
            const next = { ...answers, [item.key]: v };
            setAnswers(next);
            advanceFrom(index, next);
          }}
        />
      )}
      {!answered && !isFree && <p className="small muted">Tap an answer, or skip this item below.</p>}
      {patient?.preferences.locale === 'es' && content.fellBack(item.prompt_content_id) && <p className="small muted">{content.fallbackMarker()}</p>}
      {bar(index)}
    </PatientFrame>
  );
}

function UsefulnessCard({ checkin }: { checkin: Checkin }) {
  const { state, episode, run } = usePatient();
  const week: 6 | 12 = checkin.day_number <= 42 ? 6 : 12;
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const already = episode && state.usefulness.some((u) => u.episode_id === episode.id && u.week === week);
  const [sent, setSent] = useState(false);
  if (!episode || already || sent) return null;
  const send = () => {
    if (rating === null) return;
    const r = run(rateUsefulness({ episode_id: episode.id, week, rating, comment: comment.trim() || null }));
    setError(r.error);
    if (!r.error) setSent(true);
  };
  return (
    <Card title="Was this useful?">
      <T id="checkin.usefulness" />
      <ErrorNotice error={error} />
      <div className="rating-row">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button key={n} size="lg" variant={rating === n ? 'primary' : 'secondary'} onClick={() => setRating(n)} aria-pressed={rating === n}>{n}</Button>
        ))}
      </div>
      <div style={{ marginTop: 'var(--space-3)' }}>
        <FreeTextField label="A note about the check-ins" value={comment} onChange={setComment} rows={3} />
      </div>
      <div className="card-actions">
        <Button variant="primary" size="lg" onClick={send} disabled={rating === null}>Send</Button>
      </div>
    </Card>
  );
}

function CheckinDone({ checkin, template }: { checkin: Checkin; template: CheckinTemplate }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state, events, clock, episode, locale, contactVars, run } = usePatient();
  const [showEmergency, setShowEmergency] = useState<boolean>(Boolean((location.state as { urgent?: boolean } | null)?.urgent));
  const [error, setError] = useState<string | null>(null);
  const offer = episode ? pendingScreenOfferFor(events, state, episode.id, clock) : null;
  const thisOffer = offer && offer.checkin_id === checkin.id ? offer : null;
  const copingItem = Object.values(state.queueItems).find((q) => q.trigger_ref === checkin.id && q.queue_key === 'needs_review' && (q.trigger_type === 'coping_difficulty' || q.trigger_type === 'rule'));

  const setAside = () => {
    if (!episode || !thisOffer) return;
    setError(run(skipScreen({ episode_id: episode.id, instrument_key: thisOffer.instrument_key, checkin_id: checkin.id })).error);
  };
  const decline = () => {
    if (!episode || !thisOffer) return;
    setError(run(declineScreen({ episode_id: episode.id, instrument_key: thisOffer.instrument_key, queue_item_id: copingItem?.id ?? null })).error);
  };

  return (
    <PatientFrame title="Your answers are saved">
      {showEmergency && (
        <LockedContent id="emergency_instruction" layout="full_screen" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} onClose={() => setShowEmergency(false)} />
      )}
      <ErrorNotice error={error} />
      {thisOffer && (
        <Card title={thisOffer.reason === 'coping_trigger' ? 'A short set of mood questions' : 'Next: a separate set of mood questions'} tone="accent">
          {thisOffer.reason === 'coping_trigger' ? (
            <T id="screen.offer.now_or_next" />
          ) : (
            <p>This check-in includes a separate, attributed set of mood questions. It states who sees the answers before you begin. You can set it aside.</p>
          )}
          <div className="card-actions">
            <Button variant="primary" size="lg" block onClick={() => navigate(`/p/screen/${thisOffer.instrument_key}?checkin=${checkin.id}&return=${encodeURIComponent(`/p/checkin/${checkin.id}?phase=done`)}`)}>Answer now</Button>
            <Button size="lg" block onClick={setAside}>{thisOffer.reason === 'coping_trigger' ? 'At my next check-in' : 'Not now'}</Button>
            <Button variant="quiet" size="lg" block onClick={decline}>I'd rather not</Button>
          </div>
          <DemoNote label="FR-29">
            The coping answer itself already created a Needs-review item; the instrument is offered now or at the next check-in. A decline is recorded on that item ("reported difficulty coping; screen declined").
          </DemoNote>
        </Card>
      )}
      <ClosingStatement checkin={checkin} />
      <CoverageNotice compact />
      {template.usefulness_item && <UsefulnessCard checkin={checkin} />}
      {template.visit_preparation && (
        <Card title="Your visit is coming up">
          <p>Your plan shows the date, what the visit is for, what to bring, and your saved questions.</p>
          <Button size="lg" block to="/p/careplan">Prepare for your visit</Button>
        </Card>
      )}
      {checkin.day_number >= 84 && <Button size="lg" block to="/p/transition">Your transition page</Button>}
      <Button variant="primary" size="lg" block to="/p">Back to home</Button>
    </PatientFrame>
  );
}

export function CheckinPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { patient, episode, acknowledged, state, config, fmt } = usePatient();
  const checkin = id ? state.checkins[id] : undefined;

  if (!patient || !episode || !checkin || checkin.episode_id !== episode.id) return <Navigate to="/p" replace />;
  if (!acknowledged) return <Navigate to="/p/acknowledge" replace />;
  const template = config.checkins[checkin.template_key];
  if (!template) return <Navigate to="/p" replace />;

  if (params.get('phase') === 'done' && checkin.submitted_at !== null) return <CheckinDone checkin={checkin} template={template} />;

  if (checkin.state !== 'sent' && checkin.state !== 'opened') {
    return (
      <PatientFrame title="This check-in is not open">
        <Card>
          {checkin.submitted_at ? (
            <p>You already answered this check-in on {fmt(checkin.submitted_at)}.</p>
          ) : checkin.state === 'scheduled' || checkin.state === 'paused' ? (
            <p>This check-in opens around {fmt(checkin.scheduled_at)}.</p>
          ) : (
            <p>This check-in is no longer open. Nothing is needed from you; your next check-in will come as scheduled.</p>
          )}
          <Button size="lg" block to="/p">Back to home</Button>
        </Card>
      </PatientFrame>
    );
  }

  return <CheckinFlow key={checkin.id} checkin={checkin} template={template} />;
}
