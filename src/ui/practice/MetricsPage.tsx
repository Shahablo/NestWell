/**
 * FR-49–FR-53 metrics: every measure from computeMetrics (events plus derived events, nothing else),
 * breakdowns by language, insurance and barrier, escalation ratings and flagged escalations,
 * usefulness, and a CSV/JSONL export with versions on every row. The budget owner sees aggregates only.
 */
import { useMemo, useState } from 'react';
import type { CoreMeasures, PrimarySecondary, Rate, Stats } from '../../domain/metrics';
import { computeMetrics } from '../../domain/metrics';
import { Button, Card, DemoNote, Field } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { patientName } from './episodeHelpers';
import { RATING_OPTIONS, humanize, num, pct } from './labels';
import { metricsRows, toCsv, toJsonl } from './metricsExport';

type Breakdown = 'locale' | 'insurance_type' | 'access_barrier';

const rateCell = (r: Rate) => `${pct(r.rate)} (${r.numerator}/${r.denominator})`;
const statCell = (s: Stats, unit: string) => (s.n === 0 ? 'no data' : `median ${num(s.median)} ${unit} · mean ${num(s.mean)} · p90 ${num(s.p90)} · top decile ${num(s.top_decile_mean)} · n=${s.n}`);

function PsRow({ label, ps }: { label: string; ps: PrimarySecondary }) {
  return (
    <tr>
      <td>{label}</td>
      <td className="num">{rateCell(ps.all_eligible)}</td>
      <td className="num">{rateCell(ps.enrolled)}</td>
    </tr>
  );
}

function CoreTable({ m }: { m: CoreMeasures }) {
  return (
    <div className="table-scroll">
      <table className="metric-table">
        <thead><tr><th>Measure</th><th className="num">All eligible (primary)</th><th className="num">Enrolled (secondary)</th></tr></thead>
        <tbody>
          <tr><td>Eligible / enrolled</td><td className="num">{m.eligible}</td><td className="num">{m.enrolled}</td></tr>
          <tr><td>Enrollment</td><td className="num">{rateCell(m.enrollment)}</td><td className="num">—</td></tr>
          <PsRow label="Program completion (week-12 transition)" ps={m.program_completion} />
          <PsRow label="Care completion" ps={m.care_completion} />
          <PsRow label="Completion of planned visits (comprehensive)" ps={m.planned_visits} />
          <PsRow label="Initial contact by day 21" ps={m.initial_contact_by_day_21} />
          <tr><td>Dropout</td><td className="num">{rateCell(m.dropout.all_eligible)} (secondary)</td><td className="num">{rateCell(m.dropout.enrolled)} (primary)</td></tr>
          <tr><td>No contact by day 21 (count)</td><td className="num">{m.dropout.no_contact_by_day_21}</td><td className="num">—</td></tr>
          <tr><td>Unreached items by trigger</td><td colSpan={2}>{Object.keys(m.dropout.unreached_by_trigger).length ? Object.entries(m.dropout.unreached_by_trigger).map(([k, v]) => `${humanize(k)}: ${v}`).join(' · ') : 'none'}</td></tr>
          <tr><td>Referral completion</td><td colSpan={2}>{pct(m.referral_completion.rate)} ({m.referral_completion.completed}/{m.referral_completion.created}) · no capacity {m.referral_completion.no_capacity} · not covered {m.referral_completion.not_covered} · declined {m.referral_completion.declined}</td></tr>
          <tr><td>Staff minutes per episode</td><td colSpan={2}>{statCell(m.staff_minutes, 'min')}</td></tr>
          <tr><td>Transition destination gap</td><td colSpan={2}>{rateCell(m.transition_destination_gap)} of transitions with no destination identified</td></tr>
        </tbody>
      </table>
    </div>
  );
}

export function MetricsPage() {
  const { state, events, config, role } = useApp();
  const { fmt, queueLabel } = usePractice();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [breakdown, setBreakdown] = useState<Breakdown>('locale');
  const [format, setFormat] = useState<'csv' | 'jsonl'>('csv');
  const [exported, setExported] = useState('');
  const range = from && to ? { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` } : undefined;
  const metrics = useMemo(() => computeMetrics(state, events, config, { range }), [state, events, config, range?.from, range?.to]);
  const groups = metrics.breakdowns[breakdown];
  const budget = role === 'budget_owner';

  return (
    <div className="stack">
      <h2>Metrics</h2>
      <DemoNote label="FR-49">Computed from the event log plus derived events at the demo clock; nothing is stored. Every completion-type measure reports all-eligible as primary and enrolled as secondary (11.3).</DemoNote>
      <Card title="Cohort" flat>
        <div className="row">
          <Field label="Delivery date from" htmlFor="m-from"><input id="m-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="to" htmlFor="m-to"><input id="m-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Button variant="quiet" onClick={() => { setFrom(''); setTo(''); }}>Clear range</Button>
          <span className="muted small">Clock {fmt(metrics.clock)} · {metrics.range ? 'delivery-date range applied' : 'all patients'} · versions: cadence {metrics.versions.cadence}, care plan {metrics.versions.careplan}, free text {metrics.versions.freetext}</span>
        </div>
      </Card>
      <Card title="Core measures (all patients)"><CoreTable m={metrics} /></Card>
      <Card title="Screening intervals and referrals">
        <div className="table-scroll">
          <table className="metric-table">
            <tbody>
              <tr><td>Positive screen to assessment</td><td>{statCell(metrics.screen_to_assessment_hours, 'h')}</td></tr>
              <tr><td>Positive screen to connection (kept appointment)</td><td>{statCell(metrics.screen_to_connection_hours, 'h')}</td></tr>
              <tr><td>Referrals without a linked screen</td><td>{metrics.referrals_without_screen}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Escalation appropriateness (FR-51)">
        <div className="table-scroll">
          <table className="metric-table">
            <tbody>
              {RATING_OPTIONS.map((o) => <tr key={o.value}><td>Rated {o.label.toLowerCase()}</td><td className="num">{metrics.escalation.ratings[o.value]}</td></tr>)}
              <tr><td>Escalations flagged by a clinician as not caught</td><td className="num">{metrics.escalation.missed_escalations}</td></tr>
              <tr><td>Unacknowledged timeouts (UNOWNED)</td><td className="num">{metrics.escalation.timeouts}</td></tr>
              {Object.entries(metrics.escalation.timeouts_by_queue).map(([q, n]) => <tr key={q}><td className="muted">· {queueLabel(q as never)}</td><td className="num">{n}</td></tr>)}
              <tr><td>Unreached with open clinical item, timed out</td><td className="num">{metrics.escalation.unreached_open_clinical_timeouts}</td></tr>
              <tr><td>False reassurance reports (SR-16, FR-51)</td><td className="num">{metrics.false_reassurance_reports}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Usefulness (FR-52)">
        <div className="table-scroll">
          <table className="metric-table">
            <thead><tr><th>Week</th><th className="num">n</th><th className="num">Mean</th><th>Distribution</th></tr></thead>
            <tbody>
              {(['6', '12'] as const).map((w) => (
                <tr key={w}><td>Week {w}</td><td className="num">{metrics.usefulness[w].n}</td><td className="num">{num(metrics.usefulness[w].mean, 2)}</td><td>{Object.entries(metrics.usefulness[w].distribution).map(([r, n]) => `${r}: ${n}`).join(' · ') || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Free-text routing (FR-17)">
        <div className="table-scroll">
          <table className="metric-table">
            <tbody>
              <tr><td>Routed by field and queue</td><td>{Object.entries(metrics.free_text_routing.by_field_and_queue).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'none'}</td></tr>
              <tr><td>Help requested by source</td><td>{Object.entries(metrics.free_text_routing.help_requested_by_source).map(([k, n]) => `${k}: ${n}`).join(' · ') || 'none'}</td></tr>
              <tr><td>Time to acknowledgment, free-text items</td><td>{statCell(metrics.free_text_routing.free_text_ack_minutes, 'min')}</td></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Delivery cost inputs (FR-47)">
        <p className="illustrative">Illustrative, not market prices or a forecast.</p>
        <div className="table-scroll">
          <table className="metric-table">
            <tbody>
              <tr><td>Practice setup minutes (recorded by the admin)</td><td>{metrics.delivery_cost.practice_setup_minutes ?? 'not yet recorded'}</td></tr>
              <tr><td>Minutes per episode</td><td>{statCell(metrics.delivery_cost.minutes_per_episode, 'min')}</td></tr>
            </tbody>
          </table>
        </div>
        {!budget && Object.keys(metrics.staff_minutes.per_episode).length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary className="small">Minutes by episode</summary>
            <ul className="responses">
              {Object.entries(metrics.staff_minutes.per_episode).map(([ep, m]) => <li key={ep}><span>{patientName(state, state.episodes[ep]?.patient_id)} ({ep})</span><span>{m} min</span></li>)}
            </ul>
          </details>
        )}
      </Card>
      <Card title="Breakdowns (FR-50)">
        <div className="admin-tabs" role="tablist" aria-label="Breakdown">
          {(['locale', 'insurance_type', 'access_barrier'] as Breakdown[]).map((b) => (
            <button key={b} type="button" role="tab" className="admin-tab" aria-selected={breakdown === b} onClick={() => setBreakdown(b)}>{b === 'locale' ? 'Language' : b === 'insurance_type' ? 'Insurance' : 'Access barrier'}</button>
          ))}
        </div>
        {Object.keys(groups).length === 0 ? <p className="muted">No patients in the cohort.</p> : Object.entries(groups).map(([g, m]) => (
          <div key={g} style={{ marginBottom: 16 }}>
            <h3>{humanize(g)}</h3>
            <CoreTable m={m} />
          </div>
        ))}
      </Card>
      <Card title="Export (FR-53)">
        <div className="row">
          <Field label="Format" htmlFor="m-format">
            <select id="m-format" value={format} onChange={(e) => setFormat(e.target.value as 'csv' | 'jsonl')}>
              <option value="csv">CSV</option>
              <option value="jsonl">JSONL</option>
            </select>
          </Field>
          <Button variant="primary" onClick={() => { const rows = metricsRows(metrics); setExported(format === 'csv' ? toCsv(rows) : toJsonl(rows)); }}>Generate</Button>
          <span className="muted small">Every row carries the clock and the cadence, care plan and free-text versions. Copy from the box into a spreadsheet.</span>
        </div>
        <Field label="Export" htmlFor="m-export">
          <textarea id="m-export" className="mono" readOnly value={exported} rows={12} />
        </Field>
      </Card>
    </div>
  );
}
