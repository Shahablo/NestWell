/**
 * FR-03a "Who has seen my answers": each staff view of her screening responses or free text, as role
 * and date, no names, derived from the SR-13 read records.
 */
import { Navigate } from 'react-router-dom';
import { toMs } from '../../domain/clock';
import { Button, DemoNote, EmptyState, List, ListRow } from '../components';
import { PatientFrame } from './PatientFrame';
import { QUEUE_ROLE_PLAIN, usePatient } from './usePatient';

export function WhoHasSeenPage() {
  const { patient, state, fmt } = usePatient();
  if (!patient) return <Navigate to="/p" replace />;
  const rows = state.readRecords.filter((r) => r.patient_id === patient.id).sort((a, b) => toMs(b.at) - toMs(a.at));
  return (
    <PatientFrame title="Who has seen my answers">
      <p className="small muted">Every time a staff member opens your mood answers or something you wrote, it is recorded here by role and date.</p>
      {rows.length === 0 ? (
        <EmptyState title="Nobody has opened your answers yet" />
      ) : (
        <List>
          {rows.map((r, i) => (
            <ListRow
              key={`${r.at}-${i}`}
              title={`${(QUEUE_ROLE_PLAIN[r.role] ?? r.role).replace(/^\w/, (c) => c.toUpperCase())} viewed ${r.field === 'screen_items' ? 'your mood answers' : 'something you wrote'}`}
              subtitle={fmt(r.at)}
            />
          ))}
        </List>
      )}
      <DemoNote label="FR-03a / SR-13">A clinician opening item responses in the practice view adds one row here. Names are never shown, only the role.</DemoNote>
      <Button block to="/p">Back to home</Button>
    </PatientFrame>
  );
}
