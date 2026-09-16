/** FR-33 / FR-36 referral panel for the coordinator and clinician: states, consent basis, coverage warning, and the partner record. */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toMs } from '../../domain/clock';
import type { ReferralPartner } from '../../domain/config.schema';
import type { Episode, Referral } from '../../domain/types';
import { Button, Card, Chip, DemoNote, EmptyState, Field, KeyValue, NOT_YET_PROVIDED, NOT_YET_SECURED, Placeholder } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { patientName } from './episodeHelpers';
import { ReferralSheet } from './FollowThroughActions';
import { REFERRAL_STATES, REFERRAL_STATE_LABELS, humanize } from './labels';
import { ReferralStateForm } from './ReferralStateForm';
import { ScreenResultView } from './ScreenResultView';

export function PartnerInfo({ partner }: { partner: ReferralPartner }) {
  const { config } = useApp();
  return (
    <div className="stack-sm">
      <div className="row">
        <strong>{partner.name}</strong>
        {!partner.secured && <Placeholder label={NOT_YET_SECURED} title="No real partner has agreed yet (A9)." />}
        <Chip variant={partner.capacity_state === 'accepting' ? 'accent' : partner.capacity_state === 'unknown' ? 'neutral' : 'warning'}>capacity: {humanize(partner.capacity_state)}</Chip>
      </div>
      <KeyValue rows={[
        { label: 'Specialty', value: partner.specialty },
        { label: 'Typical wait', value: partner.typical_wait_days === null ? <Placeholder label={NOT_YET_PROVIDED} /> : `${partner.typical_wait_days} days` },
        { label: 'Accepted insurance', value: partner.accepted_insurance_types.map(humanize).join(', ') },
        { label: 'Consented fields', value: partner.consented_fields_allowed.map(humanize).join(', ') },
        { label: 'Capacity and coverage source', value: 'config/practice.json (a config edit by the practice; no runtime write path in the prototype)' },
        { label: 'Barrier resources', value: Object.entries(config.practice.barrier_resources).map(([k, v]) => `${humanize(k)}: ${v ?? NOT_YET_PROVIDED}`).join(' · ') },
      ]} />
    </div>
  );
}

export function ReferralCard({ referral, allowed, showPatient = true, consentedOnly = false }: { referral: Referral; allowed: Referral['state'][]; showPatient?: boolean; consentedOnly?: boolean }) {
  const { state } = useApp();
  const { fmt, partner } = usePractice();
  const [editing, setEditing] = useState(false);
  const p = partner(referral.partner_id);
  const screen = referral.screen_result_id ? state.screens[referral.screen_result_id] : undefined;
  const patient = state.patients[referral.patient_id];
  const fields = new Set(p?.consented_fields_allowed ?? []);
  const done = referral.state === 'appointment_completed';
  return (
    <div className="queue-item">
      <div className="queue-item__head">
        <Chip variant={done ? 'accent' : ['appointment_missed', 'no_capacity', 'not_covered', 'declined_by_patient'].includes(referral.state) ? 'warning' : 'neutral'}>{REFERRAL_STATE_LABELS[referral.state]}</Chip>
        {referral.coverage_status === 'not_covered' && <Chip variant="warning">insurance not accepted</Chip>}
        {referral.coverage_status === 'covered' && <Chip variant="neutral">insurance accepted</Chip>}
        {showPatient && (consentedOnly ? <strong>{fields.has('display_name') ? patient?.display_name : 'patient (name not consented)'}</strong> : <Link to={`/practice/patients/${referral.patient_id}`} aria-label={patientName(state, referral.patient_id)}><strong>{patientName(state, referral.patient_id)}</strong></Link>)}
        <span className="muted small">to {p?.name ?? referral.partner_id}</span>
        {p && !p.secured && <Placeholder label={NOT_YET_SECURED} />}
        <code className="small muted">{referral.id}</code>
      </div>
      <dl className="queue-item__meta">
        <div><dt>Reason</dt><dd>{referral.reason}</dd></div>
        <div><dt>Created</dt><dd>{fmt(referral.created_at)}</dd></div>
        <div><dt>Consent</dt><dd>{referral.consent_basis ? `${referral.consent_basis} (v${referral.consent_version ?? '?'})` : 'not yet recorded (set when sent to partner)'}</dd></div>
        {referral.sent_at && <div><dt>Sent to partner</dt><dd>{fmt(referral.sent_at)} <span className="muted small">(not a completion)</span></dd></div>}
        {referral.scheduled_for && <div><dt>Appointment</dt><dd>{fmt(referral.scheduled_for)}</dd></div>}
        {referral.completed_at && <div><dt>Kept on</dt><dd>{fmt(referral.completed_at)}</dd></div>}
        {consentedOnly && patient && (
          <>
            {fields.has('preferred_name') && <div><dt>Preferred name</dt><dd>{patient.preferences.preferred_name ?? '—'}</dd></div>}
            {fields.has('locale') && <div><dt>Language</dt><dd>{patient.preferences.locale}</dd></div>}
            {fields.has('insurance_type') && <div><dt>Insurance</dt><dd>{humanize(patient.insurance_type)}</dd></div>}
          </>
        )}
        <div>
          <dt>History</dt>
          <dd>{[...referral.history].sort((a, b) => toMs(a.at) - toMs(b.at)).map((h) => `${fmt(h.at)}: ${REFERRAL_STATE_LABELS[h.state]}${h.note ? ` (${h.note})` : ''}`).join(' → ')}</dd>
        </div>
      </dl>
      {screen && (!consentedOnly || fields.has('screen_result_if_shared')) && (
        <div style={{ marginTop: 8 }}>
          <div className="muted small">Linked screen</div>
          <ScreenResultView screen={screen} compact />
        </div>
      )}
      {referral.state !== 'closed' && allowed.length > 0 && (
        <div className="card-actions">
          <Button size="sm" onClick={() => setEditing(true)}>Change state</Button>
        </div>
      )}
      {editing && <ReferralStateForm referral={referral} allowed={allowed} onClose={() => setEditing(false)} />}
    </div>
  );
}

export function ReferralsPage() {
  const { state, config } = useApp();
  const [newFor, setNewFor] = useState<Episode | null>(null);
  const [pick, setPick] = useState('');
  const referrals = useMemo(() => Object.values(state.referrals).sort((a, b) => toMs(b.created_at) - toMs(a.created_at)), [state.referrals]);
  const openEpisodes = Object.values(state.episodes).filter((e) => e.closed_at === null).sort((a, b) => patientName(state, a.patient_id).localeCompare(patientName(state, b.patient_id)));
  const counts = REFERRAL_STATES.map((s) => [s, referrals.filter((r) => r.state === s).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="stack">
      <h2>Referrals</h2>
      <DemoNote label="FR-33">Only appointment kept counts as a completed referral. A dead end (not kept, no capacity, not covered, declined) on a referral tied to a positive screen reopens a Needs-review item that closes only with a documented plan.</DemoNote>
      <Card title="New referral" flat>
        <div className="row">
          <Field label="Patient (open episode)" htmlFor="ref-pick" className="grow">
            <select id="ref-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {openEpisodes.map((e) => <option key={e.id} value={e.id}>{patientName(state, e.patient_id)} ({e.id})</option>)}
            </select>
          </Field>
          <Button variant="primary" disabled={!pick} onClick={() => { const ep = state.episodes[pick]; if (ep) setNewFor(ep); }}>Create referral</Button>
        </div>
      </Card>
      {counts.length > 0 && <div className="row small">{counts.map(([s, n]) => <Chip key={s}>{REFERRAL_STATE_LABELS[s]}: {n}</Chip>)}</div>}
      {referrals.length === 0 ? <EmptyState title="No referrals in this branch" /> : <div className="stack">{referrals.map((r) => <ReferralCard key={r.id} referral={r} allowed={REFERRAL_STATES} />)}</div>}
      <Card title="Referral partners">
        <div className="stack">{config.practice.referral_partners.map((p) => <PartnerInfo key={p.id} partner={p} />)}</div>
      </Card>
      {newFor && <ReferralSheet episode={newFor} onClose={() => setNewFor(null)} />}
    </div>
  );
}
