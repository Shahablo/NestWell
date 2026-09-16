/**
 * FR-69 simulated inbox: every message body is the neutral approved item, tagged SIMULATED. Nothing
 * here contains screen results, mood content, referral details or sensitive wording (FR-66).
 */
import { Navigate } from 'react-router-dom';
import { toMs } from '../../domain/clock';
import { Button, Chip, DemoNote, EmptyState, List, ListRow } from '../components';
import { PatientFrame } from './PatientFrame';
import { usePatient } from './usePatient';

const KIND_PLAIN: Record<string, string> = {
  checkin: 'check-in',
  reminder: 'reminder',
  care_plan: 'plan item',
  callback: 'callback',
  transition: 'transition',
};

export function InboxPage() {
  const { patient, episode, state, content, clock, fmt } = usePatient();
  if (!patient || !episode) return <Navigate to="/p" replace />;
  const rows = state.notifications
    .filter((n) => n.episode_id === episode.id && n.simulated_state === 'sent' && toMs(n.scheduled_at) <= toMs(clock))
    .sort((a, b) => toMs(b.scheduled_at) - toMs(a.scheduled_at));
  const body = content.text('notification.neutral');

  return (
    <PatientFrame title="Messages">
      <p className="small muted">These are the texts and emails this app would have sent. Every one has the same neutral wording; the app itself holds the detail.</p>
      {rows.length === 0 ? (
        <EmptyState title="No messages yet" />
      ) : (
        <List>
          {rows.map((n) => (
            <ListRow
              key={n.id}
              leading={<Chip variant="warning" className="sim-tag">simulated</Chip>}
              title={body}
              subtitle={`${n.channel.toUpperCase()} · ${KIND_PLAIN[n.kind] ?? n.kind} · ${fmt(n.scheduled_at)}`}
            />
          ))}
        </List>
      )}
      <DemoNote label="FR-66 / FR-68">
        Bodies are always notification.neutral. Suppressed rows (pause, sensitive status, safe-to-message no, FR-14) are not delivered and are listed with their reason in the admin outbox, not here.
      </DemoNote>
      <Button block to="/p">Back to home</Button>
    </PatientFrame>
  );
}
