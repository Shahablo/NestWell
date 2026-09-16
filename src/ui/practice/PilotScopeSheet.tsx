/**
 * FR-47a pilot scope sheet: two placeholder structures, support limits, the clinical-services
 * sentence and the no-billing-code sentence. No revenue is computed anywhere on this page.
 */
import { useState } from 'react';
import { Button, Card, Field, KeyValue } from '../components';
import { SYNTHETIC_BANNER_TEXT } from '../shell/SyntheticBanner';
import { useApp } from '../shell/useApp';
import { Illustrative } from './BudgetPage';

export function PilotScopeSheet() {
  const { config } = useApp();
  const [fixedFee, setFixedFee] = useState('');
  const [perEpisode, setPerEpisode] = useState('200');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [coverageHours, setCoverageHours] = useState(config.practice.named_contact.coverage_hours_label);
  const [episodeCount, setEpisodeCount] = useState('');
  return (
    <Card title="Pilot scope sheet (FR-47a)" aside={<Button size="sm" variant="quiet" className="no-print" onClick={() => window.print()}>Print</Button>}>
      <Illustrative />
      <p className="muted small">Two placeholder structures; neither is a price and nothing here projects revenue.</p>
      <div className="form-grid">
        <Field label="Structure A: fixed pilot fee (illustrative)" htmlFor="ps-fixed" hint="Starts blank; typed in during the session.">
          <input id="ps-fixed" type="number" min={0} value={fixedFee} onChange={(e) => setFixedFee(e.target.value)} />
        </Field>
        <Field label="Structure B: per enrolled episode (illustrative)" htmlFor="ps-per" hint="Default 200, labelled illustrative.">
          <input id="ps-per" type="number" min={0} value={perEpisode} onChange={(e) => setPerEpisode(e.target.value)} />
        </Field>
      </div>
      <h3>Support limits</h3>
      <div className="form-grid">
        <Field label="Max staff minutes per episode" htmlFor="ps-min">
          <input id="ps-min" type="number" min={0} value={maxMinutes} onChange={(e) => setMaxMinutes(e.target.value)} />
        </Field>
        <Field label="Coverage hours" htmlFor="ps-cov">
          <input id="ps-cov" type="text" value={coverageHours} onChange={(e) => setCoverageHours(e.target.value)} />
        </Field>
        <Field label="Episode count" htmlFor="ps-count">
          <input id="ps-count" type="number" min={0} value={episodeCount} onChange={(e) => setEpisodeCount(e.target.value)} />
        </Field>
      </div>
      <KeyValue rows={[
        { label: 'Structure A', value: fixedFee ? `fixed pilot fee ${fixedFee} (illustrative)` : 'fixed pilot fee: not entered (illustrative)' },
        { label: 'Structure B', value: `${perEpisode || '—'} per enrolled episode (illustrative)` },
        { label: 'Support limits', value: `${maxMinutes || '—'} minutes per episode · coverage ${coverageHours || '—'} · ${episodeCount || '—'} episodes` },
        { label: 'Clinical services', value: 'Clinical services arranged separately by the practice.' },
        { label: 'Billing', value: 'No reimbursement, monitoring, behavioral-health, or care-management billing code is assumed; coverage requires payer-specific confirmation.' },
        { label: 'Queue ownership', value: 'Every queue owner is a practice employee (A16); see the queue ownership sheet.' },
      ]} />
      <p className="muted small" style={{ marginTop: 12 }}>{SYNTHETIC_BANNER_TEXT}</p>
    </Card>
  );
}
