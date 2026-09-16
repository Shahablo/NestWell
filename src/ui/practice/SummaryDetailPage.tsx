/** One summary: structured sentences, the labelled narrative, withheld notices, and the review actions (FR-41). */
import { useParams } from 'react-router-dom';
import { setSummaryState } from '../../domain/services';
import { Banner, Button, Card, Chip, EmptyState } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { patientName } from './episodeHelpers';
import { FreeTextReveal } from './ScreenResultView';
import { StaffName } from './StaffName';
import { SummaryStructuredView } from './SummaryStructuredView';
import { useStaffAction } from './useStaffAction';

export function SummaryDetailPage() {
  const { summaryId = '' } = useParams();
  const { state, role, content } = useApp();
  const { fmt } = usePractice();
  const { run, error } = useStaffAction();
  const summary = state.summaries[summaryId];
  if (!summary) return <EmptyState title="Unknown summary" action={<Button to="/practice/summaries">Back to summaries</Button>} />;
  const episode = state.episodes[summary.episode_id];
  const aiLabel = content.text('ai.staff_label');
  return (
    <div className="stack">
      <div className="row row--between">
        <h2 style={{ margin: 0 }}>Summary · {patientName(state, episode?.patient_id)} · {summary.period.replace(/_/g, ' ')}</h2>
        <div className="row">
          <Button size="sm" variant="quiet" to="/practice/summaries">All summaries</Button>
          <Button size="sm" to={`/practice/summaries/${summary.id}/export`}>Export view</Button>
        </div>
      </div>
      <div className="row">
        <Chip variant={summary.state === 'draft' ? 'warning' : summary.state === 'reviewed' ? 'accent' : 'neutral'}>{summary.state}</Chip>
        <span className="small">drafted {fmt(summary.created_at)}</span>
        {summary.reviewer_id && <span className="small">· reviewed by <StaffName id={summary.reviewer_id} />{summary.reviewed_at ? ` on ${fmt(summary.reviewed_at)}` : ''}</span>}
      </div>
      {error && <Banner variant="warning">{error}</Banner>}
      {summary.withheld_notices.length > 0 && (
        <Banner variant="warning" title="Withheld">
          <ul style={{ margin: 0 }}>{summary.withheld_notices.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </Banner>
      )}
      <Card title="Structured (deterministic)">
        <SummaryStructuredView summary={summary} />
        {summary.structured.saved_questions.length > 0 && (role === 'coordinator' || role === 'clinician') && (
          <div className="stack-sm" style={{ marginTop: 8 }}>
            <h3>Saved questions</h3>
            <FreeTextReveal episode_id={summary.episode_id} text={summary.structured.saved_questions.join(' · ')} label="saved questions" />
          </div>
        )}
      </Card>
      <Card title="Narrative" aside={summary.ai_draft ? <Chip variant="ai">{aiLabel}</Chip> : undefined}>
        <p className="summary-export__narrative">{summary.narrative}</p>
        <p className="muted small" style={{ margin: 0 }}>Covers only the AI-02 allowlist: what happened, which items resolved, and what is still open. No instrument names, scores, or descriptions of her mood.</p>
      </Card>
      <Card title="Review">
        {role === 'clinician' ? (
          <div className="row">
            {summary.state === 'draft' && <Button variant="primary" onClick={() => run(setSummaryState({ summary_id: summary.id, state: 'reviewed' }))}>Mark reviewed</Button>}
            {summary.state === 'reviewed' && <Button variant="primary" onClick={() => run(setSummaryState({ summary_id: summary.id, state: 'delivered' }))}>Mark delivered</Button>}
            {summary.state === 'delivered' && <span className="muted">Delivered.</span>}
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Only a clinician marks a summary reviewed (FR-41).</p>
        )}
      </Card>
    </div>
  );
}
