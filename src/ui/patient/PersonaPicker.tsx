/**
 * The persona picker: which synthetic patient the patient app is showing. The choice is kept in
 * this browser under nestwell.currentPatient. Every patient here is synthetic (SR-01).
 */
import { activeEpisodeFor } from '../../domain/projection';
import { Card, DemoNote, EmptyState, List, ListRow, Chip } from '../components';
import { setCurrentPatientId, usePatient } from './usePatient';

const ELIGIBILITY_PLAIN: Record<string, string> = {
  enrolled: 'enrolled',
  declined: 'declined',
  not_offered: 'not offered',
};

export function PersonaPicker({ onPicked }: { onPicked?: () => void }) {
  const { patients, state, patient } = usePatient();
  return (
    <Card title="Choose a synthetic persona">
      <p className="small muted">The patient app shows one persona at a time. Pick who you are playing. Nothing here is a real person.</p>
      {patients.length === 0 ? (
        <EmptyState title="No synthetic patients are loaded">
          Load a scenario branch from the admin panel (Scenarios) to seed the personas.
        </EmptyState>
      ) : (
        <List>
          {patients.map((p) => {
            const ep = activeEpisodeFor(state, p.id);
            const elig = state.eligibility[p.id];
            const sub = [
              p.persona_key ? `persona ${p.persona_key}` : null,
              p.preferences.locale === 'es' ? 'Spanish' : 'English',
              ep ? `episode ${ep.status}` : elig ? `${ELIGIBILITY_PLAIN[elig.status] ?? elig.status}${elig.reason ? `: ${elig.reason.replace(/_/g, ' ')}` : ''}` : 'no episode',
            ].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={p.id}
                title={p.display_name}
                subtitle={sub}
                trailing={patient?.id === p.id ? <Chip variant="accent">current</Chip> : undefined}
                onClick={() => {
                  setCurrentPatientId(p.id);
                  onPicked?.();
                }}
              />
            );
          })}
        </List>
      )}
      <DemoNote label="Persona picker">
        This picker is a demo control, not a login. The role switcher in the banner changes the surface; this changes whose phone you are holding.
      </DemoNote>
    </Card>
  );
}
