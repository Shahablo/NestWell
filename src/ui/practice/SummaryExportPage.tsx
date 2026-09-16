/**
 * FR-42 export: a print-styled page with reviewer, versions, withheld notices, the counsel marker
 * and "Synthetic data — demonstration only". A draft never exports as delivered (FR-41).
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { readScreen } from '../../domain/services';
import { Button, Chip, EmptyState } from '../components';
import { SYNTHETIC_BANNER_TEXT } from '../shell/SyntheticBanner';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { patientName } from './episodeHelpers';
import { SummaryStructuredView } from './SummaryStructuredView';
import { useStaffAction } from './useStaffAction';

export function SummaryExportPage() {
  const { summaryId = '' } = useParams();
  const { state, config, content, role, clock } = useApp();
  const { fmt, staffName, practice } = usePractice();
  const { run, error } = useStaffAction();
  const [includeQuestions, setIncludeQuestions] = useState(false);
  const summary = state.summaries[summaryId];
  if (!summary) return <EmptyState title="Unknown summary" action={<Button to="/practice/summaries">Back to summaries</Button>} />;
  const episode = state.episodes[summary.episode_id];
  const instruments = [...new Set(summary.structured.screens.map((s) => s.instrument))].map((k) => `${config.instruments[k]?.short_name ?? k} v${config.instruments[k]?.version ?? '?'}`);
  const stateLabel = summary.state === 'delivered' ? 'Delivered' : summary.state === 'reviewed' ? 'Reviewed, not delivered' : 'DRAFT, not reviewed';
  const canReveal = role === 'coordinator' || role === 'clinician';
  return (
    <div className="stack">
      <div className="row no-print">
        <Button size="sm" variant="quiet" to={`/practice/summaries/${summary.id}`}>Back to summary</Button>
        <Button size="sm" variant="primary" onClick={() => window.print()}>Print</Button>
        <span className="muted small">Print-styled view; the browser's print dialog produces the file.</span>
      </div>
      <article className="summary-export">
        <div className="summary-export__banner">{SYNTHETIC_BANNER_TEXT}</div>
        <h1>Clinician summary: {summary.period.replace(/_/g, ' ')}</h1>
        <p>
          {practice.name} · patient {patientName(state, episode?.patient_id)} (synthetic) · episode {summary.episode_id} · drafted {fmt(summary.created_at)} · exported at demo clock {fmt(clock)}
        </p>
        <p><Chip variant={summary.state === 'delivered' ? 'accent' : 'warning'}>{stateLabel}</Chip></p>
        {summary.withheld_notices.length > 0 && (
          <>
            <h2>Withheld</h2>
            <ul>{summary.withheld_notices.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </>
        )}
        <h2>Structured</h2>
        <SummaryStructuredView summary={summary} />
        {summary.structured.saved_questions.length > 0 && (
          <>
            <h2>Saved questions</h2>
            {includeQuestions ? (
              <ul>{summary.structured.saved_questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
            ) : canReveal ? (
              <div className="no-print">
                <p className="muted small">{summary.structured.saved_questions.length} saved questions in her own words. Including them is recorded as a read (FR-03a).</p>
                <Button size="sm" variant="quiet" onClick={() => { if (run(readScreen({ screen_result_id: null, episode_id: summary.episode_id, field: 'free_text' }))) setIncludeQuestions(true); }}>Include saved questions (recorded as a read)</Button>
                {error && <div className="field__error">{error}</div>}
              </div>
            ) : (
              <p className="muted small">{summary.structured.saved_questions.length} saved questions, not shown to this view.</p>
            )}
          </>
        )}
        <h2>Narrative {summary.ai_draft && <span className="small">({content.text('ai.staff_label')})</span>}</h2>
        <p className="summary-export__narrative">{summary.narrative}</p>
        <footer className="summary-export__footer">
          <div><strong>Reviewer:</strong> {summary.reviewer_id ? `${staffName(summary.reviewer_id)}${summary.reviewed_at ? `, ${fmt(summary.reviewed_at)}` : ''}` : 'not yet reviewed'}</div>
          <div><strong>Versions:</strong> cadence {config.cadence.version} · care plan {config.careplan.version} · free-text policy {config.freetext.version} · rules {config.rules.map((r) => `${r.key} ${r.version}`).join(', ')} · exemplars {config.ai_exemplars.version} · instruments {instruments.length ? instruments.join(', ') : 'none'} · content manifest {content.manifestHash}</div>
          <div><strong>Withheld notices:</strong> {summary.withheld_notices.length ? summary.withheld_notices.join(' ') : 'none'}</div>
          <div><strong>Counsel marker:</strong> pending counsel review. State-law review required ({practice.jurisdiction}){practice.state_review_memo_ref ? `: memo ${practice.state_review_memo_ref} (${practice.state_review_memo_date ?? 'date not recorded'})` : ': no counsel memo recorded for this state (SR-17)'}.</div>
          <div><strong>Policy flags:</strong> free-text urgency scan {config.freetext.free_text_urgency_scan ? 'on' : 'off'} · critical item overrides sharing {config.freetext.critical_item_overrides_sharing ? 'true' : 'false'} (placeholder) · live AI {config.freetext.ai_enabled ? 'enabled' : 'off'}</div>
          <div><strong>{SYNTHETIC_BANNER_TEXT}</strong></div>
        </footer>
      </article>
    </div>
  );
}
