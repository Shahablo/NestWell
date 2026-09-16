/**
 * FR-47 budget-owner view: read-only aggregates (minutes per episode, median and top decile,
 * practice setup minutes) and the interview calculator whose inputs start blank. Synthetic
 * assumptions sit in a collapsed row; "Illustrative, not market prices or a forecast" is on every
 * view; there is no revenue projection and no item-level data.
 */
import { useMemo, useState } from 'react';
import { computeMetrics } from '../../domain/metrics';
import { Banner, Card, DemoNote, Field, KeyValue } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { money, num } from './labels';
import { PilotScopeSheet } from './PilotScopeSheet';

export function Illustrative() {
  return <p className="illustrative">Illustrative, not market prices or a forecast.</p>;
}

const n = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));

export function BudgetPage() {
  const { state, events, config } = useApp();
  const { coverageLabel } = usePractice();
  const metrics = useMemo(() => computeMetrics(state, events, config), [state, events, config]);
  const mpe = metrics.delivery_cost.minutes_per_episode;

  const [minutes, setMinutes] = useState('');
  const [rate, setRate] = useState('');
  const [overhead, setOverhead] = useState('');
  const [episodes, setEpisodes] = useState('');
  const [afterHoursMode, setAfterHoursMode] = useState<'none' | 'hourly' | 'flat'>('hourly');
  const [afterHoursHours, setAfterHoursHours] = useState('');
  const [onCallRate, setOnCallRate] = useState('');
  const [flatMonthly, setFlatMonthly] = useState('');

  const vMinutes = n(minutes);
  const vRate = n(rate);
  const vOverhead = n(overhead) ?? 0;
  const vEpisodes = n(episodes);
  const perEpisodeStaff = vMinutes !== null && vRate !== null ? (vMinutes / 60) * vRate * (1 + vOverhead / 100) : null;
  const annualStaff = perEpisodeStaff !== null && vEpisodes !== null ? perEpisodeStaff * vEpisodes : null;
  const afterHoursWeekly = afterHoursMode === 'none'
    ? 0
    : afterHoursMode === 'hourly'
      ? (n(afterHoursHours) !== null && n(onCallRate) !== null ? (n(afterHoursHours) as number) * (n(onCallRate) as number) : null)
      : (n(flatMonthly) !== null ? ((n(flatMonthly) as number) * 12) / 52 : null);
  const afterHoursAnnual = afterHoursWeekly === null ? null : afterHoursWeekly * 52;
  const afterHoursPerEpisode = afterHoursAnnual !== null && vEpisodes !== null && vEpisodes > 0 ? afterHoursAnnual / vEpisodes : null;
  const noAfterHours = afterHoursMode === 'none' || (afterHoursMode === 'hourly' && n(afterHoursHours) === 0);

  const findings = [
    `Interview calculator inputs (illustrative, not market prices or a forecast)`,
    `minutes per episode: ${minutes || 'not entered'}`,
    `loaded hourly rate: ${rate || 'not entered'}`,
    `overhead %: ${overhead || 'not entered'}`,
    `episodes per year: ${episodes || 'not entered'}`,
    `after-hours coverage: ${afterHoursMode === 'none' ? 'none' : afterHoursMode === 'hourly' ? `${afterHoursHours || '?'} h/week at ${onCallRate || '?'}/h` : `flat ${flatMonthly || '?'}/month`}`,
    `staff cost per episode: ${money(perEpisodeStaff)}`,
    `after-hours cost per week: ${money(afterHoursWeekly)}; allocated per episode (secondary): ${money(afterHoursPerEpisode)}`,
    `synthetic minutes per episode from this branch: median ${num(mpe.median)}, top decile mean ${num(mpe.top_decile_mean)}, n=${mpe.n}`,
    `practice setup minutes recorded: ${metrics.delivery_cost.practice_setup_minutes ?? 'not recorded'}`,
  ].join('\n');

  return (
    <div className="stack">
      <h2>Budget owner</h2>
      <DemoNote label="FR-47">Read-only aggregates. This view never opens item-level screening data (SR-14). Nothing here is a revenue projection.</DemoNote>

      <Card title="Staff minutes per episode (synthetic branch, at the demo clock)">
        <Illustrative />
        <KeyValue rows={[
          { label: 'Episodes with minutes', value: String(mpe.n) },
          { label: 'Median', value: `${num(mpe.median)} min` },
          { label: 'Mean', value: `${num(mpe.mean)} min` },
          { label: 'p90', value: `${num(mpe.p90)} min` },
          { label: 'Top decile (mean of the top 10%)', value: `${num(mpe.top_decile_mean)} min` },
          { label: 'Practice setup minutes (recorded by the admin)', value: metrics.delivery_cost.practice_setup_minutes === null ? 'not yet recorded' : `${metrics.delivery_cost.practice_setup_minutes} min` },
        ]} />
      </Card>

      <Card title="Interview calculator">
        <Illustrative />
        <p className="muted small">Inputs start blank and are typed in during the session. The calculator multiplies what you enter; it does not estimate anything for you.</p>
        <div className="form-grid">
          <Field label="Minutes per episode" htmlFor="bc-min"><input id="bc-min" type="number" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></Field>
          <Field label="Loaded hourly rate" htmlFor="bc-rate"><input id="bc-rate" type="number" min={0} value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
          <Field label="Overhead (%)" htmlFor="bc-oh"><input id="bc-oh" type="number" min={0} value={overhead} onChange={(e) => setOverhead(e.target.value)} /></Field>
          <Field label="Episodes per year" htmlFor="bc-ep"><input id="bc-ep" type="number" min={0} value={episodes} onChange={(e) => setEpisodes(e.target.value)} /></Field>
        </div>
        <h3>After-hours coverage</h3>
        <div className="form-grid">
          <Field label="Urgent coverage outside practice hours" htmlFor="bc-ah-mode">
            <select id="bc-ah-mode" value={afterHoursMode} onChange={(e) => setAfterHoursMode(e.target.value as 'none' | 'hourly' | 'flat')}>
              <option value="hourly">On-call hours per week × on-call rate</option>
              <option value="flat">Flat monthly cost</option>
              <option value="none">None</option>
            </select>
          </Field>
          {afterHoursMode === 'hourly' && (
            <>
              <Field label="After-hours coverage hours per week" htmlFor="bc-ah-h"><input id="bc-ah-h" type="number" min={0} value={afterHoursHours} onChange={(e) => setAfterHoursHours(e.target.value)} /></Field>
              <Field label="On-call hourly rate" htmlFor="bc-ah-r"><input id="bc-ah-r" type="number" min={0} value={onCallRate} onChange={(e) => setOnCallRate(e.target.value)} /></Field>
            </>
          )}
          {afterHoursMode === 'flat' && (
            <Field label="Flat monthly cost" htmlFor="bc-ah-f"><input id="bc-ah-f" type="number" min={0} value={flatMonthly} onChange={(e) => setFlatMonthly(e.target.value)} /></Field>
          )}
        </div>
        {noAfterHours && (
          <Banner variant="warning" title="No after-hours Urgent coverage">
            After-hours cost is zero. Outside the practice's coverage hours nobody is on duty for the Urgent queue, and the patient sees the locked "we have not been able to reach a nurse yet" instruction with the after-hours number, never a waiting message (FR-24, FR-25).
          </Banner>
        )}
        <KeyValue rows={[
          { label: 'Staff cost per episode', value: <span className="calc-result">{money(perEpisodeStaff)}</span> },
          { label: 'Staff cost per year', value: money(annualStaff) },
          { label: 'After-hours coverage per week', value: money(afterHoursWeekly) },
          { label: 'After-hours coverage per year', value: money(afterHoursAnnual) },
          { label: 'After-hours allocated per episode (secondary figure, reported separately)', value: money(afterHoursPerEpisode) },
        ]} />
        <Illustrative />
        <details className="assumptions" style={{ marginTop: 12 }}>
          <summary>Synthetic assumptions from this branch (collapsed by design)</summary>
          <KeyValue rows={[
            { label: 'Median minutes per episode (synthetic)', value: `${num(mpe.median)} min` },
            { label: 'Top decile minutes per episode (synthetic)', value: `${num(mpe.top_decile_mean)} min` },
            { label: 'Urgent queue coverage (config)', value: coverageLabel('urgent') },
            { label: 'Practice coverage label (config)', value: config.practice.named_contact.coverage_hours_label },
            { label: 'Queue targets', value: config.queues.map((q) => `${q.label}: ack ${q.ack_target_minutes} min, backup ${q.backup_ack_target_minutes} min (${q.timer_basis.replace(/_/g, ' ')})`).join(' · ') },
          ]} />
          <p className="muted small">These come from synthetic personas and placeholder config. They are not observed practice data.</p>
        </details>
      </Card>

      <Card title="Findings template (entered values)">
        <Illustrative />
        <Field label="Copy into the findings capture (FR-70)" htmlFor="bc-findings">
          <textarea id="bc-findings" className="mono" readOnly rows={12} value={findings} />
        </Field>
      </Card>

      <PilotScopeSheet />
    </div>
  );
}
