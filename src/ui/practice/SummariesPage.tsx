/** FR-40–FR-42 clinician summaries: the list, drafting, and the review states. */
import { useMemo, useState } from 'react';
import { toMs } from '../../domain/clock';
import { draftSummary } from '../../domain/services';
import type { SummaryPeriod } from '../../domain/types';
import { Banner, Button, Card, Chip, DemoNote, EmptyState, Field } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { patientName } from './episodeHelpers';
import { StaffName } from './StaffName';
import { useStaffAction } from './useStaffAction';

const PERIODS: SummaryPeriod[] = ['week9', 'week12', 'on_demand'];

export function SummariesPage() {
  const { state, content } = useApp();
  const { fmt } = usePractice();
  const { run, error } = useStaffAction();
  const [episodeId, setEpisodeId] = useState('');
  const [period, setPeriod] = useState<SummaryPeriod>('on_demand');
  const summaries = useMemo(() => Object.values(state.summaries).sort((a, b) => toMs(b.created_at) - toMs(a.created_at)), [state.summaries]);
  const episodes = Object.values(state.episodes).sort((a, b) => patientName(state, a.patient_id).localeCompare(patientName(state, b.patient_id)));
  const aiLabel = content.text('ai.staff_label');
  return (
    <div className="stack">
      <h2>Summaries</h2>
      <DemoNote label="FR-41">A summary stays a draft until a clinician marks it reviewed; a draft never exports as delivered. The narrative is a canned exemplar labelled as an AI draft (AI-02, AI-21) and passes a postfilter that refuses instrument names, scores and mood or risk descriptors.</DemoNote>
      <Card title="Draft a summary" flat>
        {error && <Banner variant="warning">{error}</Banner>}
        <div className="row">
          <Field label="Episode" htmlFor="sum-ep" className="grow">
            <select id="sum-ep" value={episodeId} onChange={(e) => setEpisodeId(e.target.value)}>
              <option value="">Choose…</option>
              {episodes.map((e) => <option key={e.id} value={e.id}>{patientName(state, e.patient_id)} ({e.id})</option>)}
            </select>
          </Field>
          <Field label="Period" htmlFor="sum-period">
            <select id="sum-period" value={period} onChange={(e) => setPeriod(e.target.value as SummaryPeriod)}>
              {PERIODS.map((p) => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Button variant="primary" disabled={!episodeId} onClick={() => run(draftSummary({ episode_id: episodeId, period }))}>Draft summary</Button>
        </div>
      </Card>
      {summaries.length === 0 ? <EmptyState title="No summaries drafted" /> : (
        <Card flat>
          <div className="table-scroll">
            <table>
              <thead><tr><th>Patient</th><th>Period</th><th>State</th><th>Drafted</th><th>Reviewer</th><th>Withheld notices</th><th /></tr></thead>
              <tbody>
                {summaries.map((sm) => (
                  <tr key={sm.id}>
                    <td>{patientName(state, state.episodes[sm.episode_id]?.patient_id)}<div className="muted small"><code>{sm.id}</code></div></td>
                    <td>{sm.period.replace(/_/g, ' ')}</td>
                    <td><Chip variant={sm.state === 'draft' ? 'warning' : sm.state === 'reviewed' ? 'accent' : 'neutral'}>{sm.state}</Chip>{sm.ai_draft && <div><Chip variant="ai">{aiLabel}</Chip></div>}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmt(sm.created_at)}</td>
                    <td>{sm.reviewer_id ? <><StaffName id={sm.reviewer_id} />{sm.reviewed_at ? <div className="muted small">{fmt(sm.reviewed_at)}</div> : null}</> : <span className="muted">not yet reviewed</span>}</td>
                    <td>{sm.withheld_notices.length}</td>
                    <td><div className="row"><Button size="sm" to={`/practice/summaries/${sm.id}`}>Open</Button><Button size="sm" variant="quiet" to={`/practice/summaries/${sm.id}/export`}>Export</Button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
