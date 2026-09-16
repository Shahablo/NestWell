/** FR-46 patient panel detail: sensitive status at the top, episode facts, open items, actions and the timeline. */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { dayLabel } from '../../domain/clock';
import { activeStatusesFor } from '../../domain/projection';
import { confirmSensitiveStatus } from '../../domain/services';
import type { Episode, SensitiveSubtype } from '../../domain/types';
import { Banner, Button, Card, Chip, DemoNote, EmptyState, KeyValue } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { episodeDay, episodesFor, latestEpisodeFor, openItemsForEpisode } from './episodeHelpers';
import { ReferralSheet, VisitSheet, VisitStateSheet } from './FollowThroughActions';
import { SHARING_LABELS, SUBTYPE_LABELS, VISIT_STATE_LABELS, humanize } from './labels';
import { CloseEarlySheet, CloseEpisodeSheet, ContactSheet, LiftStatusSheet, PauseSheet, ResumeButton, SensitiveStatusSheet } from './PatientActions';
import { PatientTimeline } from './PatientTimeline';
import { QueueItemRow } from './QueueItemRow';
import { useStaffAction } from './useStaffAction';

type SheetKind = 'status' | 'contact' | 'visit' | 'referral' | 'pause' | 'close' | 'closeEarly' | null;

export function PatientDetailPage() {
  const { patientId = '' } = useParams();
  const { state, clock, role, content } = useApp();
  const { fmt } = usePractice();
  const { run, error } = useStaffAction();
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [lift, setLift] = useState<SensitiveSubtype | null>(null);
  const [visitId, setVisitId] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const patient = state.patients[patientId];
  if (!patient) return <EmptyState title="Unknown patient" action={<Button to="/practice/patients">Back to patients</Button>} />;
  const episodes = episodesFor(state, patient.id);
  const episode: Episode | undefined = (episodeId && state.episodes[episodeId]) || latestEpisodeFor(state, patient.id);
  const statuses = episode ? activeStatusesFor(state, episode.id, clock) : [];
  const open = episode ? openItemsForEpisode(state, episode.id) : [];
  const day = episodeDay(episode, clock);
  const canAct = role === 'coordinator' || role === 'clinician';
  const carePlan = episode ? Object.values(state.carePlanItems).filter((c) => c.episode_id === episode.id) : [];
  const visits = episode ? Object.values(state.visits).filter((v) => v.episode_id === episode.id || v.patient_id === patient.id) : [];
  const reads = state.readRecords.filter((r) => r.patient_id === patient.id);

  return (
    <div className="stack">
      <div className="row row--between">
        <h2 style={{ margin: 0 }}>{patient.display_name} {patient.persona_key && <span className="muted small">({patient.persona_key})</span>}</h2>
        <Button size="sm" variant="quiet" to="/practice/patients">All patients</Button>
      </div>

      <Card title="Sensitive status" tone={statuses.length ? 'warning' : 'default'} aside={canAct && episode && episode.closed_at === null ? <Button size="sm" onClick={() => setSheet('status')}>Set status</Button> : undefined}>
        {statuses.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>No active sensitive status.</p>
        ) : (
          <div className="stack-sm">
            {statuses.map((s) => (
              <div key={s.subtype} className="row">
                <Chip variant="warning">{SUBTYPE_LABELS[s.subtype]}</Chip>
                <span className="small">set by {s.set_by} on {fmt(s.set_at)} · {s.confirmed_by_staff ? 'confirmed by staff' : 'not yet confirmed'}</span>
                {canAct && !s.confirmed_by_staff && <Button size="sm" onClick={() => run(confirmSensitiveStatus({ patient_id: patient.id, subtype: s.subtype }))}>Confirm subtype</Button>}
                {canAct && <Button size="sm" variant="quiet" onClick={() => setLift(s.subtype)}>Lift with reason</Button>}
              </div>
            ))}
            <p className="muted small" style={{ margin: 0 }}>Suppression is in force for the union of active subtypes (FR-55); nothing resumes automatically (FR-59).</p>
          </div>
        )}
        {error && <Banner variant="warning">{error}</Banner>}
      </Card>

      {episodes.length > 1 && (
        <div className="filter-chips" role="group" aria-label="Episodes">
          {episodes.map((e) => <button key={e.id} type="button" className="filter-chip" aria-pressed={episode?.id === e.id} onClick={() => setEpisodeId(e.id)}>{e.id} · {humanize(e.status)}</button>)}
        </div>
      )}

      {!episode ? (
        <EmptyState title="Not enrolled" body={state.eligibility[patient.id] ? `Eligibility: ${humanize(state.eligibility[patient.id].status)}${state.eligibility[patient.id].reason ? ` (${state.eligibility[patient.id].reason})` : ''}` : 'No eligibility record.'} />
      ) : (
        <>
          <Card title="Episode" aside={<span className="row"><Chip variant={episode.status === 'active' ? 'accent' : 'neutral'}>{humanize(episode.status)}</Chip>{episode.indicated && <Chip variant="warning">indicated</Chip>}</span>}>
            <KeyValue rows={[
              { label: 'Episode', value: <code>{episode.id}</code> },
              { label: 'Today', value: day !== null ? `${dayLabel(day)} (day ${day})` : '—' },
              { label: 'Delivery', value: episode.delivery_date ? `${fmt(episode.delivery_date, { withTime: false })} · ${humanize(episode.delivery_outcome)}` : `not yet recorded (expected ${episode.expected_date ? fmt(episode.expected_date, { withTime: false }) : '—'})` },
              { label: 'Enrolled', value: `${fmt(episode.enrolled_at)} · ${humanize(episode.enrollment_point)} · by ${episode.enrolled_by}` },
              { label: 'Acknowledged', value: episode.acknowledged_at ? `${fmt(episode.acknowledged_at)} (${humanize(episode.acknowledgment_mode)})` : 'not yet' },
              { label: 'First human contact', value: episode.initial_contact_day === null ? 'not yet logged' : `day ${episode.initial_contact_day} ${episode.initial_contact_met_target ? '(within target)' : '(after target)'}` },
              { label: 'Pause', value: episode.paused ? `paused ${episode.paused_until ? `until ${fmt(episode.paused_until)}` : 'until resumed'}` : 'not paused' },
              { label: 'Closed', value: episode.closed_at ? `${fmt(episode.closed_at)} · ${humanize(episode.close_reason) || 'completed'}` : 'open' },
              { label: 'Language', value: patient.preferences.locale === 'es' ? 'Spanish (safety-critical items translated; the rest falls back with a marker)' : 'English' },
              { label: 'Sharing category', value: SHARING_LABELS[patient.preferences.sharing_category] },
              { label: 'Safe to message', value: patient.preferences.safe_to_message === null ? 'not yet answered' : patient.preferences.safe_to_message ? 'yes' : 'no: contact by phone call only' },
              { label: 'Insurance / barriers', value: `${humanize(patient.insurance_type)} · ${patient.access_barriers.length ? patient.access_barriers.map(humanize).join(', ') : 'none reported'}` },
              { label: 'Staff reads of her answers', value: reads.length ? `${reads.length} (visible to her under "who has seen my answers")` : 'none' },
            ]} />
            {episode.transition && (
              <div style={{ marginTop: 12 }}>
                <h3>Transition</h3>
                <KeyValue rows={[
                  { label: 'Primary care', value: episode.transition.primary_care ?? 'not identified' },
                  { label: 'Mental-health connection', value: humanize(episode.transition.mental_health) },
                  { label: 'Open items', value: episode.transition.open_items.length ? episode.transition.open_items.join('; ') : 'none' },
                  { label: 'Owner', value: episode.transition.owner_role ? humanize(episode.transition.owner_role) : 'none named' },
                  { label: 'Next contact', value: episode.transition.next_contact_date ? fmt(episode.transition.next_contact_date) : '—' },
                ]} />
              </div>
            )}
            {canAct && episode.closed_at === null && (
              <div className="card-actions">
                <Button size="sm" variant="primary" onClick={() => setSheet('contact')}>Log contact</Button>
                <Button size="sm" onClick={() => setSheet('visit')}>Schedule visit</Button>
                <Button size="sm" onClick={() => setSheet('referral')}>Create referral</Button>
                {episode.paused ? <ResumeButton episode={episode} /> : <Button size="sm" variant="quiet" onClick={() => setSheet('pause')}>Pause check-ins</Button>}
                <Button size="sm" variant="quiet" onClick={() => setSheet('close')}>Week-12 transition</Button>
                <Button size="sm" variant="quiet" onClick={() => setSheet('closeEarly')}>Close early</Button>
              </div>
            )}
          </Card>

          <Card title={`Open items (${open.length})`}>
            {open.length === 0 ? <p className="muted" style={{ margin: 0 }}>No open queue items.</p> : <div className="stack">{open.map((q) => <QueueItemRow key={q.id} item={q} showPatient={false} />)}</div>}
          </Card>

          <Card title="Visits and care plan">
            {visits.length === 0 ? <p className="muted small">No visits scheduled.</p> : (
              <div className="table-scroll" style={{ marginBottom: 12 }}>
                <table>
                  <thead><tr><th>Visit</th><th>Scheduled</th><th>State</th><th>Purpose</th><th /></tr></thead>
                  <tbody>
                    {visits.map((v) => (
                      <tr key={v.id}>
                        <td>{humanize(v.type)}</td>
                        <td>{fmt(v.scheduled_for)}</td>
                        <td>{VISIT_STATE_LABELS[v.state]}{v.completed_at ? ` (${fmt(v.completed_at)})` : ''}</td>
                        <td>{v.purpose}</td>
                        <td>{canAct && v.state === 'scheduled' && <Button size="sm" onClick={() => setVisitId(v.id)}>Update</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {carePlan.length > 0 && (
              <ul className="responses">
                {carePlan.map((c) => (
                  <li key={c.id}>
                    <span>{content.get(c.title_content_id)?.title ?? c.key}</span>
                    <span><Chip variant={c.state === 'suppressed' ? 'warning' : c.state === 'completed' ? 'accent' : 'neutral'}>{c.state}</Chip> {c.due_at ? `due ${fmt(c.due_at, { withTime: false })}` : ''} · owner {humanize(c.owner_role)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Twelve-week timeline">
            <DemoNote label="FR-46">Screens render through visibleScreenFor for the {humanize(role)} view; withheld results show "screen completed, sharing withheld" with no score. Every reveal of item responses or free text is written to the read record.</DemoNote>
            <PatientTimeline episode={episode} />
          </Card>

          {sheet === 'status' && <SensitiveStatusSheet episode={episode} onClose={() => setSheet(null)} />}
          {sheet === 'contact' && <ContactSheet episode={episode} onClose={() => setSheet(null)} />}
          {sheet === 'visit' && <VisitSheet episode={episode} onClose={() => setSheet(null)} />}
          {sheet === 'referral' && <ReferralSheet episode={episode} onClose={() => setSheet(null)} />}
          {sheet === 'pause' && <PauseSheet episode={episode} onClose={() => setSheet(null)} />}
          {sheet === 'close' && <CloseEpisodeSheet episode={episode} onClose={() => setSheet(null)} />}
          {sheet === 'closeEarly' && <CloseEarlySheet episode={episode} onClose={() => setSheet(null)} />}
          {lift && <LiftStatusSheet episode={episode} subtype={lift} onClose={() => setLift(null)} />}
          {visitId && state.visits[visitId] && <VisitStateSheet visit={state.visits[visitId]} onClose={() => setVisitId(null)} />}
        </>
      )}
    </div>
  );
}
