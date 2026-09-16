/** Admin settings: SR-27 demo participant mode, demo notes, event log export (with SR-03 notice). */
import { useId, useState } from 'react';
import { useApp } from '../shell/useApp';
import { Button, Card, Chip, DemoNote, Field, KeyValue } from '../components';
import { setDemoNotes, useDemoNotes } from '../shell/demoNotes';
import { SYNTHETIC_BANNER_TEXT } from '../shell/SyntheticBanner';

export function SettingsPage() {
  const store = useApp();
  const demoNotes = useDemoNotes();
  const [exported, setExported] = useState<string>('');
  const dpmId = useId();
  const notesId = useId();

  const exportLog = () => {
    const doc = {
      notice: SYNTHETIC_BANNER_TEXT,
      exported_wall_at: new Date().toISOString(),
      demo_session_id: store.demoSessionId,
      branch: store.branch,
      clock: store.clock,
      content_manifest_hash: store.content.manifestHash,
      demo_participant_mode: store.demoParticipantMode,
      flags: {
        free_text_urgency_scan: store.config.freetext.free_text_urgency_scan,
        ai_enabled: store.config.freetext.ai_enabled,
        critical_item_overrides_sharing: store.config.freetext.critical_item_overrides_sharing,
      },
      event_count: store.events.length,
      events: store.events,
    };
    setExported(JSON.stringify(doc, null, 2));
  };

  return (
    <div className="stack">
      <h1>Settings</h1>

      <Card title="Demo participant mode (SR-27)" aside={<Chip variant={store.demoParticipantMode ? 'warning' : 'neutral'}>{store.demoParticipantMode ? 'ON' : 'off'}</Chip>}>
        <p className="small">Turn this on for every session with a real person driving a persona. It disables every model call, replaces free-text and comment fields with "typing in your own words is not available in this demo", tags every record with the demo session id, and adds the SR-28 statement to the acknowledgment. Reset the data after the session.</p>
        <Field label="Demo participant mode" htmlFor={dpmId} inline>
          <input id={dpmId} type="checkbox" checked={store.demoParticipantMode} onChange={(e) => store.setDemoParticipantMode(e.target.checked)} />
        </Field>
      </Card>

      <Card title="Demo notes">
        <p className="small">Founder-facing asides that explain what a screen demonstrates. Stored in this browser only.</p>
        <Field label="Show demo notes" htmlFor={notesId} inline>
          <input id={notesId} type="checkbox" checked={demoNotes} onChange={(e) => setDemoNotes(e.target.checked)} />
        </Field>
        <DemoNote>This is what a demo note looks like.</DemoNote>
      </Card>

      <Card title="Session">
        <KeyValue rows={[
          { label: 'Demo session id', value: <code>{store.demoSessionId}</code> },
          { label: 'Branch', value: <code>{store.branch}</code> },
          { label: 'Role in force', value: store.role },
          { label: 'Staff user', value: store.staffUserId ? <code>{store.staffUserId}</code> : '—' },
          { label: 'Events', value: store.events.length },
        ]} />
      </Card>

      <Card title="Export the event log" actions={<Button variant="primary" onClick={exportLog}>Export as JSON</Button>}>
        <p className="small">The export carries the synthetic-data notice (SR-03), the demo session id, the clock, the content manifest hash and the flag states (FR-65). Copy it from the box below.</p>
        {exported && (
          <Field label={`Event log JSON (${store.events.length} events)`} htmlFor="export-json">
            <textarea id="export-json" readOnly value={exported} rows={16} className="mono" onFocus={(e) => e.currentTarget.select()} />
          </Field>
        )}
      </Card>
    </div>
  );
}
