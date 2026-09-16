/** FR-48 scenario branch load. Loading a branch wipes this browser's log and reseeds (SR-12, logged). */
import { useState } from 'react';
import { useApp } from '../shell/useApp';
import { Button, Card, Chip, DemoNote, KeyValue } from '../components';
import { usePractice } from '../shell/usePractice';

export function ScenariosPage() {
  const store = useApp();
  const { formatDateTime } = usePractice();
  const [busy, setBusy] = useState<string | null>(null);
  const branches = store.getBranches();
  const current = branches.find((b) => b.key === store.branch);

  const load = (key: string) => {
    setBusy(key);
    // Let the button re-render before the synchronous reseed runs.
    window.setTimeout(() => {
      try {
        store.reset(key);
      } finally {
        setBusy(null);
      }
    }, 0);
  };

  return (
    <div className="stack">
      <h1>Scenario branches</h1>
      <DemoNote>Each branch replays a persona's history through the same domain services at virtual times, so seeded history and live actions are the same kind of thing (NFR-11). Two loads of the same branch produce identical logs apart from wall time and ids (FR-48).</DemoNote>

      <Card title="Current branch">
        {current ? (
          <KeyValue rows={[
            { label: 'Branch', value: <><strong>{current.label}</strong> <Chip variant="accent">{current.key}</Chip></> },
            { label: 'Scenario', value: current.scenario },
            { label: 'Description', value: current.description },
            { label: 'Opens at', value: formatDateTime(current.clock) },
            { label: 'Events in log', value: store.events.length },
            { label: 'Demo session', value: <code>{store.demoSessionId}</code> },
          ]} />
        ) : (
          <p className="muted">Branch <code>{store.branch}</code> is not registered.</p>
        )}
      </Card>

      <Card title="Available branches">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Branch</th>
                <th>Scenario</th>
                <th>Description</th>
                <th>Opens at</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.key}>
                  <td>
                    <strong>{b.label}</strong>
                    <div className="muted small"><code>{b.key}</code></div>
                    {b.key === store.branch && <Chip variant="accent">current</Chip>}
                  </td>
                  <td>{b.scenario}</td>
                  <td>{b.description}</td>
                  <td>{formatDateTime(b.clock)}</td>
                  <td>
                    <Button size="sm" variant={b.key === store.branch ? 'secondary' : 'primary'} disabled={busy !== null} onClick={() => load(b.key)}>
                      {busy === b.key ? 'Loading…' : b.key === store.branch ? 'Reload' : 'Load'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
