/**
 * FR-39 / 5.5 transition page in plain words: primary care contact, whether a mental-health
 * connection is confirmed, what is open, whom to call, and, for indicated episodes with no
 * destination, the named practice owner and next contact date. The contact card and help stay here.
 */
import { Navigate } from 'react-router-dom';
import { Button, Card, Chip, DemoNote, KeyValue, LockedContent, Placeholder } from '../components';
import { PatientFrame, T } from './PatientFrame';
import { QUEUE_ROLE_PLAIN, usePatient } from './usePatient';

const MH_PLAIN: Record<string, string> = {
  confirmed: 'Confirmed: a mental health connection is in place.',
  none_identified: 'Not yet identified.',
  not_indicated: 'Not needed as part of this program.',
};

/** Plain words for the program state (never a staff workflow label). */
const EPISODE_PLAIN: Record<string, string> = { active: 'program in progress', paused: 'check-ins paused', completed: 'program completed', closed_early: 'program stopped' };

export function TransitionPage() {
  const { patient, episode, state, config, content, locale, contactVars, fmt } = usePatient();
  if (!patient || !episode) return <Navigate to="/p" replace />;
  const t = episode.transition;
  const openItems = Object.values(state.carePlanItems).filter((i) => i.episode_id === episode.id && i.state === 'open');
  const ownerName = (role: string | null) => {
    const def = config.queues.find((q) => q.owner_role === role);
    const user = def?.owner_user_id ? config.practice.staff_users.find((u) => u.id === def.owner_user_id) : undefined;
    return user?.display_name ?? `${QUEUE_ROLE_PLAIN[role ?? ''] ?? 'practice owner'} (NOT YET ASSIGNED)`;
  };

  return (
    <PatientFrame title="Your transition">
      <T id="transition.intro" />
      {t ? (
        <Card title="Where things stand">
          <KeyValue rows={[
            { label: 'Primary care', value: t.primary_care ?? <Placeholder label="NOT YET PROVIDED" /> },
            { label: 'Mental health connection', value: MH_PLAIN[t.mental_health] ?? t.mental_health },
            { label: 'Still open', value: t.open_items.length ? <ul>{t.open_items.map((o) => <li key={o}>{o}</li>)}</ul> : 'Nothing is open.' },
            { label: 'Owner at the practice', value: t.owner_role ? ownerName(t.owner_role) : 'No open item needs an owner.' },
            { label: 'Next contact', value: t.next_contact_date ? fmt(t.next_contact_date) : '—' },
          ]} />
          {t.mental_health === 'none_identified' && (
            <div style={{ marginTop: 'var(--space-3)' }}>
              <T id="transition.no_destination" vars={{ owner_name: ownerName(t.owner_role), next_contact_date: t.next_contact_date ? fmt(t.next_contact_date) : 'a date the practice will confirm', contact_phone: contactVars.contact_phone }} />
            </div>
          )}
        </Card>
      ) : (
        <Card title="Being prepared" tone="warning">
          <p>The practice is still preparing this page with you. Here is what is still open in your plan.</p>
          {openItems.length === 0 ? <p className="muted">Nothing is open.</p> : (
            <ul>{openItems.map((i) => <li key={i.id}>{content.title(i.title_content_id)}</li>)}</ul>
          )}
          {episode.indicated && <p className="small">Because your care team is following up on something, this program closes only with a confirmed mental health connection, or with a named owner and a next contact date.</p>}
        </Card>
      )}
      <div className="status-line">
        <Chip>{EPISODE_PLAIN[episode.status] ?? episode.status.replace(/_/g, ' ')}</Chip>
        {episode.closed_at && <span className="small muted">closed {fmt(episode.closed_at)}</span>}
      </div>
      <LockedContent id="contact_card" layout="inline" locale={locale} vars={contactVars} />
      <DemoNote label="FR-39">
        "No destination identified" is itself a finding: it surfaces the referral-capacity gap. An indicated episode cannot close without a confirmed destination or a named owner plus next contact date; the practice view shows the same list with an owner per open item.
      </DemoNote>
      <Button block to="/p">Back to home</Button>
    </PatientFrame>
  );
}
