/** SR-12: wipe everything in this browser and reseed the current branch. Logged as demo_session_reset. */
import { useState } from 'react';
import { useApp } from '../shell/useApp';
import { Button, Card, DemoNote, KeyValue, Sheet } from '../components';

export function ResetPage() {
  const store = useApp();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const branch = store.getBranches().find((b) => b.key === store.branch);

  const doReset = () => {
    setConfirming(false);
    store.reset();
    setDone(store.getDemoSessionId());
  };

  return (
    <div className="stack">
      <h1>Reset</h1>
      <DemoNote>Reset after every session with a demo participant (SR-27). The reset is itself logged (SR-12): a <code>demo_session_reset</code> event opens the new log.</DemoNote>
      <Card title="Wipe this browser and reseed">
        <KeyValue rows={[
          { label: 'Branch to reseed', value: branch ? `${branch.label} (${branch.key})` : store.branch },
          { label: 'Events that will be discarded', value: store.events.length },
          { label: 'Current demo session', value: <code>{store.demoSessionId}</code> },
        ]} />
        <div className="card-actions">
          <Button variant="danger" onClick={() => setConfirming(true)}>Reset demo data…</Button>
        </div>
        {done && <p className="small" style={{ marginTop: 12 }}>Reset complete. New demo session <code>{done}</code>.</p>}
      </Card>
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button variant="danger" onClick={doReset}>Yes, reset</Button>
            <Button variant="quiet" onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        }
      >
        <p>This removes every event stored in this browser and reseeds the <strong>{branch?.label ?? store.branch}</strong> branch. Live actions taken during this session are lost. The reset is written to the new log.</p>
      </Sheet>
    </div>
  );
}
