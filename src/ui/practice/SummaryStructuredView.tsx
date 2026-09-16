/**
 * FR-40: the structured part of a summary rendered as deterministic templated sentences. Screens
 * are re-checked against visibleScreenFor for the viewing role, so a result withheld at patient
 * request, or one outside the viewer's sharing category, shows no score.
 */
import { visibleScreenFor } from '../../domain/services';
import type { Summary } from '../../domain/types';
import { Chip } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { instrumentShortName } from './episodeHelpers';
import { QUEUE_STATE, REFERRAL_STATE_LABELS, VISIT_STATE_LABELS, hoursLabel, humanize } from './labels';

export function SummaryStructuredView({ summary }: { summary: Summary }) {
  const { state, config, role } = useApp();
  const { fmt, queueLabel } = usePractice();
  const s = summary.structured;
  const screenLine = (row: Summary['structured']['screens'][number]) => {
    const name = instrumentShortName(config, row.instrument);
    const when = fmt(row.administered_at);
    if (row.withheld) return `Screening result withheld at patient request (${name}, ${when}).`;
    const live = Object.values(state.screens).find((x) => x.episode_id === summary.episode_id && x.instrument_key === row.instrument && x.administered_at === row.administered_at);
    if (live && !visibleScreenFor(state, live, role).visible) return `${name} completed on ${when}; sharing withheld for the ${humanize(role)} view.`;
    return `${name} administered on ${when}: score ${row.score ?? '—'}, ${row.positive ? 'at or above' : 'below'} the configured threshold.`;
  };
  return (
    <div className="stack-sm">
      <h3>Screening</h3>
      {s.screens.length === 0 ? <p>No screening instrument was administered in this episode.</p> : <ul>{s.screens.map((row, i) => <li key={i}>{screenLine(row)}</li>)}</ul>}
      <h3>Intervals</h3>
      <p>
        Time from positive screen to assessment: {hoursLabel(s.intervals.screen_to_assessment_hours)}. Time from positive screen to connection (kept appointment): {hoursLabel(s.intervals.screen_to_connection_hours)}.
      </p>
      <h3>Escalations</h3>
      {s.escalations.length === 0 ? <p>No queue items were created for this episode.</p> : (
        <ul>
          {s.escalations.map((e, i) => (
            <li key={i}>{queueLabel(e.queue_key)} item created {fmt(e.created_at)}: <Chip variant={QUEUE_STATE[e.state].variant}>{QUEUE_STATE[e.state].label}</Chip>{e.outcome ? ` · outcome: ${e.outcome}` : ''}</li>
          ))}
        </ul>
      )}
      <h3>Referrals</h3>
      {s.referrals.length === 0 ? <p>No referral was created.</p> : <ul>{s.referrals.map((r, i) => <li key={i}>{r.partner}: {REFERRAL_STATE_LABELS[r.state]} (created {fmt(r.created_at)}).</li>)}</ul>}
      <h3>Visits</h3>
      {s.visits.length === 0 ? <p>No visits on record.</p> : <ul>{s.visits.map((v, i) => <li key={i}>{humanize(v.type)} visit {fmt(v.scheduled_for)}: {VISIT_STATE_LABELS[v.state]}.</li>)}</ul>}
      <h3>Unresolved at drafting</h3>
      {s.unresolved.length === 0 ? <p>Nothing unresolved at the time of drafting.</p> : <ul>{s.unresolved.map((u, i) => <li key={i}>{u}</li>)}</ul>}
      <h3>Care plan</h3>
      {s.care_plan.length === 0 ? <p>No care plan items.</p> : <ul>{s.care_plan.map((c, i) => <li key={i}>{c.title}: {c.state}</li>)}</ul>}
      <p className="muted small">Episode week at drafting: {s.episode_week}. Saved questions: {s.saved_questions.length}.</p>
    </div>
  );
}
