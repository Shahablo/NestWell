/** Follow-through sheets: schedule a visit, change a visit state (FR-35), create a referral with the coverage warning (FR-33, FR-36). */
import { useState } from 'react';
import { coverageStatusFor, screensForEpisode } from '../../domain/projection';
import { createReferral, scheduleVisit, setVisitState, visibleScreenFor } from '../../domain/services';
import type { Episode, Visit, VisitState, VisitType } from '../../domain/types';
import { Banner, Button, Chip, Field, NOT_YET_SECURED, Placeholder, Sheet } from '../components';
import { useApp } from '../shell/useApp';
import { isoToLocalInput, localInputToIso } from '../shell/timeInput';
import { usePractice } from '../shell/usePractice';
import { instrumentShortName } from './episodeHelpers';
import { VISIT_STATES, VISIT_STATE_LABELS, VISIT_TYPES, humanize } from './labels';
import { useStaffAction } from './useStaffAction';

export function VisitSheet({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  const { clock, config } = useApp();
  const { timezone } = usePractice();
  const { run, error } = useStaffAction();
  const [type, setType] = useState<VisitType>('comprehensive');
  const [when, setWhen] = useState(() => isoToLocalInput(clock, timezone));
  const [purpose, setPurpose] = useState(() => config.careplan.visits.find((v) => v.type === 'comprehensive')?.purpose ?? '');
  const [bring, setBring] = useState('');
  const submit = () => {
    const iso = localInputToIso(when, timezone);
    if (!iso) return;
    if (run(scheduleVisit({ patient_id: episode.patient_id, episode_id: episode.id, type, scheduled_for: iso, purpose: purpose.trim(), bring: bring.split(',').map((s) => s.trim()).filter(Boolean) }))) onClose();
  };
  return (
    <Sheet open title="Schedule a visit" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Schedule</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Type" htmlFor="vs-type">
        <select id="vs-type" value={type} onChange={(e) => { const t = e.target.value as VisitType; setType(t); const cfg = config.careplan.visits.find((v) => v.type === t); if (cfg) setPurpose(cfg.purpose); }}>
          {VISIT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field label={`Date and time (${timezone})`} htmlFor="vs-when">
        <input id="vs-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      </Field>
      <Field label="Purpose" htmlFor="vs-purpose">
        <input id="vs-purpose" type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
      </Field>
      <Field label="What to bring (comma separated)" htmlFor="vs-bring">
        <input id="vs-bring" type="text" value={bring} onChange={(e) => setBring(e.target.value)} />
      </Field>
    </Sheet>
  );
}

export function VisitStateSheet({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const { clock } = useApp();
  const { timezone } = usePractice();
  const { run, error } = useStaffAction();
  const [state, setState] = useState<VisitState>('completed');
  const [when, setWhen] = useState(() => isoToLocalInput(clock, timezone));
  const submit = () => {
    const iso = localInputToIso(when, timezone);
    const ok = run(setVisitState({ visit_id: visit.id, state, completed_at: state === 'completed' ? iso : null, rescheduled_to: state === 'rescheduled' ? iso : null }));
    if (ok) onClose();
  };
  return (
    <Sheet open title="Update visit" onClose={onClose} footer={<><Button variant="primary" onClick={submit}>Save</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">{humanize(visit.type)} visit · {visit.purpose}</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="State" htmlFor="vst-state">
        <select id="vst-state" value={state} onChange={(e) => setState(e.target.value as VisitState)}>
          {VISIT_STATES.filter((s) => s !== 'scheduled').map((s) => <option key={s} value={s}>{VISIT_STATE_LABELS[s]}</option>)}
        </select>
      </Field>
      {(state === 'completed' || state === 'rescheduled') && (
        <Field label={state === 'completed' ? `Completed on (${timezone})` : `New date (${timezone})`} htmlFor="vst-when">
          <input id="vst-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        </Field>
      )}
    </Sheet>
  );
}

export function ReferralSheet({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  const { state, config, role } = useApp();
  const { partner } = usePractice();
  const { run, error } = useStaffAction();
  const partners = config.practice.referral_partners;
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? '');
  const [screenId, setScreenId] = useState('');
  const [reason, setReason] = useState('');
  const patient = state.patients[episode.patient_id];
  const p = partner(partnerId);
  const coverage = coverageStatusFor(config, partnerId, patient);
  const screens = screensForEpisode(state, episode.id).filter((s) => !s.declined && visibleScreenFor(state, s, role).visible);
  const submit = () => {
    if (run(createReferral({ episode_id: episode.id, partner_id: partnerId, screen_result_id: screenId || null, reason: reason.trim() }))) onClose();
  };
  return (
    <Sheet open title="Create a referral" onClose={onClose} footer={<><Button variant="primary" onClick={submit} disabled={!partnerId || !reason.trim()}>Create referral</Button><Button variant="quiet" onClick={onClose}>Cancel</Button></>}>
      <p className="muted small">FR-33: a referral is never done because a link was sent; only a kept appointment counts. A dead end on a referral tied to a positive screen reopens a Needs-review item.</p>
      {error && <Banner variant="warning">{error}</Banner>}
      <Field label="Partner" htmlFor="ref-partner">
        <select id="ref-partner" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          {partners.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      {p && (
        <div className="row small" style={{ marginBottom: 12 }}>
          {!p.secured && <Placeholder label={NOT_YET_SECURED} title="No real partner has agreed yet (A9)." />}
          <span>capacity: {humanize(p.capacity_state)}</span>
          <span>accepts: {p.accepted_insurance_types.map(humanize).join(', ')}</span>
          {p.typical_wait_days !== null && <span>typical wait {p.typical_wait_days} days</span>}
        </div>
      )}
      {coverage === 'not_covered' && (
        <Banner variant="warning" title="Insurance not accepted">
          This patient's insurance ({humanize(patient?.insurance_type)}) is not in the partner's accepted list. The referral will record not covered as its own category (FR-36).
        </Banner>
      )}
      {coverage === 'covered' && <p className="small"><Chip variant="accent">insurance accepted</Chip></p>}
      <Field label="Linked screen result" htmlFor="ref-screen" hint="Only results shared with your role can be linked; withheld results stay withheld (FR-06).">
        <select id="ref-screen" value={screenId} onChange={(e) => setScreenId(e.target.value)}>
          <option value="">None</option>
          {screens.map((s) => <option key={s.id} value={s.id}>{instrumentShortName(config, s.instrument_key)} · {s.administered_at.slice(0, 10)} · {s.positive ? 'at or above threshold' : 'below threshold'}</option>)}
        </select>
      </Field>
      <Field label="Reason" htmlFor="ref-reason" hint="Required. Goes to the partner as referral_reason (a consented field).">
        <input id="ref-reason" type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Sheet>
  );
}
