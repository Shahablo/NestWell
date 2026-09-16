/** FR-46 patient panel, list view: episodes, open items, referral states, first contact, sensitive status. */
import { useMemo } from 'react';
import { dayLabel } from '../../domain/clock';
import { activeStatusesFor } from '../../domain/projection';
import { Card, Chip, EmptyState, List, ListRow } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { episodeDay, latestEpisodeFor, openItemsForEpisode } from './episodeHelpers';
import { REFERRAL_STATE_LABELS, SUBTYPE_LABELS, humanize } from './labels';

export function PatientsPage() {
  const { state, clock } = useApp();
  const { fmt } = usePractice();
  const rows = useMemo(
    () => Object.values(state.patients)
      .map((p) => {
        const ep = latestEpisodeFor(state, p.id);
        const statuses = ep ? activeStatusesFor(state, ep.id, clock) : [];
        const open = ep ? openItemsForEpisode(state, ep.id) : [];
        const referrals = ep ? Object.values(state.referrals).filter((r) => r.episode_id === ep.id) : [];
        return { p, ep, statuses, open, referrals, day: episodeDay(ep, clock), eligibility: state.eligibility[p.id] };
      })
      .sort((a, b) => a.p.display_name.localeCompare(b.p.display_name)),
    [state, clock],
  );
  return (
    <div className="stack">
      <h2>Patients</h2>
      <p className="muted small">Synthetic personas only. Item-level responses respect each patient's sharing category (FR-06) and are shown on the detail page after a recorded reveal.</p>
      {rows.length === 0 ? (
        <EmptyState title="No patients in this branch" body="Load a scenario branch from the admin panel." />
      ) : (
        <Card flat>
          <List>
            {rows.map(({ p, ep, statuses, open, referrals, day, eligibility }) => (
              <ListRow
                key={p.id}
                to={`/practice/patients/${p.id}`}
                title={<span>{p.display_name} {p.persona_key && <span className="muted small">({p.persona_key})</span>}</span>}
                subtitle={
                  <span>
                    {ep ? (
                      <>
                        {humanize(ep.status)}{ep.paused ? ' (paused)' : ''} · {day !== null ? dayLabel(day) : 'no delivery date'} ·{' '}
                        {ep.delivery_date ? `delivered ${fmt(ep.delivery_date, { withTime: false })}` : ep.expected_date ? `expected ${fmt(ep.expected_date, { withTime: false })}` : ''} ·{' '}
                        first contact {ep.initial_contact_day === null ? 'not yet logged' : `day ${ep.initial_contact_day}${ep.initial_contact_met_target ? '' : ' (after target)'}`}
                      </>
                    ) : (
                      <>not enrolled{eligibility ? ` (${humanize(eligibility.status)})` : ''}</>
                    )}
                    {' · '}{p.preferences.locale.toUpperCase()} · {humanize(p.insurance_type)}
                    {referrals.length > 0 && <> · referral: {referrals.map((r) => REFERRAL_STATE_LABELS[r.state]).join('; ')}</>}
                  </span>
                }
                trailing={
                  <span className="row">
                    {statuses.map((s) => <Chip key={s.subtype} variant="warning">{SUBTYPE_LABELS[s.subtype]}</Chip>)}
                    {open.some((q) => q.state === 'unowned') && <Chip variant="danger">UNOWNED</Chip>}
                    {open.length > 0 && <Chip variant="accent">{open.length} open</Chip>}
                    {ep?.indicated && <Chip variant="neutral" title="FR-39: a positive screen, critical item, referral, or sensitive status">indicated</Chip>}
                  </span>
                }
              />
            ))}
          </List>
        </Card>
      )}
    </div>
  );
}
