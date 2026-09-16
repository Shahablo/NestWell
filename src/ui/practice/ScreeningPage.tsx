/**
 * FR-29–FR-32 screening review for the clinician: positive screens awaiting assessment, the
 * assessment form, and time from screen to assessment and to connection. Every result is rendered
 * through visibleScreenFor; withheld results appear only as "screen completed, sharing withheld".
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hoursBetween, toMs } from '../../domain/clock';
import { computeMetrics } from '../../domain/metrics';
import { recordAssessment, visibleScreenFor } from '../../domain/services';
import type { AssessmentOutcome, ScreenResult } from '../../domain/types';
import { Banner, Button, Card, Chip, DemoNote, EmptyState, Field, KeyValue, Sheet } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { itemsForScreen, patientName } from './episodeHelpers';
import { ASSESSMENT_OUTCOMES, QUEUE_STATE, REFERRAL_STATE_LABELS, hoursLabel, humanize, num } from './labels';
import { ScreenResultView } from './ScreenResultView';
import { StaffName } from './StaffName';
import { parseMinutes, useStaffAction } from './useStaffAction';

function AssessmentSheet({ screen, onClose }: { screen: ScreenResult; onClose: () => void }) {
  const { state } = useApp();
  const { run, error } = useStaffAction();
  const [outcome, setOutcome] = useState<AssessmentOutcome>('assessed_no_action');
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState('');
  const linked = itemsForScreen(state, screen.id).find((q) => q.queue_key === 'needs_review') ?? itemsForScreen(state, screen.id)[0];
  const submit = () => {
    if (run(recordAssessment({ episode_id: screen.episode_id, screen_result_id: screen.id, trigger_ref: linked?.id ?? null, outcome, note: note.trim() || null, minutes: parseMinutes(minutes) }))) onClose();
  };
  return (
    <Sheet open title="Record assessment" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Record</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-32: the assessment links to this screen result{linked ? ` and to queue item ${linked.id}` : ''}; the interval from screen to assessment is computed from it. Minutes create one staff_time row (source assessment).</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Outcome" htmlFor="as-outcome">
        <select id="as-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as AssessmentOutcome)}>
          {ASSESSMENT_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label="Note" htmlFor="as-note">
        <textarea id="as-note" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field label="Minutes spent" htmlFor="as-minutes">
        <input id="as-minutes" type="number" min={0} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function ScreeningPage() {
  const { state, events, config, role } = useApp();
  const { fmt } = usePractice();
  const [assessing, setAssessing] = useState<ScreenResult | null>(null);
  const metrics = useMemo(() => computeMetrics(state, events, config), [state, events, config]);

  const rows = useMemo(() => {
    return Object.values(state.screens)
      .map((s) => {
        const view = visibleScreenFor(state, s, role);
        const assessments = Object.values(state.assessments).filter((a) => a.screen_result_id === s.id).sort((a, b) => toMs(a.recorded_at) - toMs(b.recorded_at));
        const referrals = Object.values(state.referrals).filter((r) => r.screen_result_id === s.id);
        const connected = referrals.find((r) => r.completed_at !== null);
        return { s, view, assessments, referrals, connected, items: itemsForScreen(state, s.id) };
      })
      .sort((a, b) => toMs(b.s.administered_at) - toMs(a.s.administered_at));
  }, [state, role]);

  const awaiting = rows.filter((r) => !r.s.declined && r.view.visible && r.view.positive && r.assessments.length === 0);
  const assessed = rows.filter((r) => !r.s.declined && r.view.visible && r.assessments.length > 0);
  const negatives = rows.filter((r) => !r.s.declined && r.view.visible && !r.view.positive && r.assessments.length === 0);
  const withheld = rows.filter((r) => !r.s.declined && !r.view.visible);
  const declined = rows.filter((r) => r.s.declined);

  const section = (title: string, list: typeof rows, empty: string) => (
    <Card title={`${title} (${list.length})`}>
      {list.length === 0 ? <p className="muted small" style={{ margin: 0 }}>{empty}</p> : (
        <div className="stack">
          {list.map(({ s, assessments, referrals, connected, items }) => (
            <div key={s.id} className="queue-item">
              <div className="queue-item__head">
                <Link to={`/practice/patients/${s.patient_id}`} aria-label={patientName(state, s.patient_id)}><strong>{patientName(state, s.patient_id)}</strong></Link>
                {items.map((q) => <Chip key={q.id} variant={QUEUE_STATE[q.state].variant}>{config.queues.find((d) => d.key === q.queue_key)?.label ?? q.queue_key}: {QUEUE_STATE[q.state].label}</Chip>)}
              </div>
              <ScreenResultView screen={s} />
              {(assessments.length > 0 || referrals.length > 0) && (
                <dl className="queue-item__meta" style={{ marginTop: 8 }}>
                  {assessments.map((a) => (
                    <div key={a.id}>
                      <dt>Assessment</dt>
                      <dd>{humanize(a.outcome)} · {fmt(a.recorded_at)} · <StaffName id={a.clinician_id} /> · {hoursLabel(hoursBetween(s.administered_at, a.recorded_at))} after the screen{a.note ? ` · ${a.note}` : ''}</dd>
                    </div>
                  ))}
                  {referrals.map((r) => (
                    <div key={r.id}>
                      <dt>Referral</dt>
                      <dd>{REFERRAL_STATE_LABELS[r.state]}{r.completed_at ? ` · connected ${fmt(r.completed_at)} (${hoursLabel(hoursBetween(s.administered_at, r.completed_at))} after the screen)` : ' · not yet connected'}</dd>
                    </div>
                  ))}
                  {!connected && referrals.length === 0 && <div><dt>Connection</dt><dd>no referral linked to this screen</dd></div>}
                </dl>
              )}
              {role === 'clinician' && !s.declined && (
                <div className="card-actions">
                  <Button size="sm" variant={assessments.length ? 'quiet' : 'primary'} onClick={() => setAssessing(s)}>{assessments.length ? 'Record another assessment' : 'Record assessment'}</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="stack">
      <h2>Screening review</h2>
      <DemoNote label="FR-29–FR-32">Thresholds and critical items come from config; intervals are computed only for referrals and assessments linked to a positive screen. Results a patient withheld show no score to any practice role (FR-06, SR-14).</DemoNote>
      <Card title="Intervals at the current clock">
        <KeyValue rows={[
          { label: 'Screen to assessment', value: `median ${num(metrics.screen_to_assessment_hours.median)} h · p90 ${num(metrics.screen_to_assessment_hours.p90)} h · n=${metrics.screen_to_assessment_hours.n}` },
          { label: 'Screen to connection', value: `median ${num(metrics.screen_to_connection_hours.median)} h · p90 ${num(metrics.screen_to_connection_hours.p90)} h · n=${metrics.screen_to_connection_hours.n}` },
          { label: 'Referrals without a linked screen', value: String(metrics.referrals_without_screen) },
          { label: 'Instruments', value: Object.values(config.instruments).map((i) => `${i.short_name} v${i.version} (threshold ${i.threshold_positive}${i.thresholds_confirmed_by ? `, confirmed by ${i.thresholds_confirmed_by}` : ', placeholder, not clinically set'})`).join(' · ') },
        ]} />
      </Card>
      {rows.length === 0 && <EmptyState title="No screens administered in this branch" />}
      {section('Positive screens awaiting assessment', awaiting, 'Nothing is waiting for assessment.')}
      {section('Assessed', assessed, 'No assessments recorded yet.')}
      {section('Below threshold', negatives, 'None.')}
      {section('Completed, sharing withheld', withheld, 'None.')}
      {section('Declined', declined, 'None.')}
      {assessing && <AssessmentSheet screen={assessing} onClose={() => setAssessing(null)} />}
    </div>
  );
}
