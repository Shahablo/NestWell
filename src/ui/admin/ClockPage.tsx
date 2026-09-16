/** FR-48 demo clock. Setting the clock re-projects; nothing is scheduled (section 3). */
import { useEffect, useMemo, useState } from 'react';
import { addDays, addHours, atLocalHour, dayLabel } from '../../domain/clock';
import { useApp } from '../shell/useApp';
import type { Episode, ISO } from '../../domain/types';
import { Button, Card, Chip, DemoNote, Field, KeyValue } from '../components';
import { isoToLocalInput, localInputToIso } from '../shell/timeInput';
import { usePractice } from '../shell/usePractice';

const JUMP_DAYS: Array<{ label: string; day: number }> = [
  { label: 'Day 3', day: 3 },
  { label: 'Day 7', day: 7 },
  { label: 'Day 14', day: 14 },
  { label: 'Day 21', day: 21 },
  { label: 'Week 6', day: 42 },
  { label: 'Week 9', day: 63 },
  { label: 'Week 12', day: 84 },
];

export function ClockPage() {
  const store = useApp();
  const { clock, state, config, branch } = store;
  const { timezone, formatDateTime } = usePractice();
  const [input, setInput] = useState(() => isoToLocalInput(clock, timezone));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInput(isoToLocalInput(clock, timezone));
  }, [clock, timezone]);

  const episodes = useMemo(
    () => Object.values(state.episodes).filter((e): e is Episode & { delivery_date: ISO } => !!e.delivery_date)
      .sort((a, b) => (state.patients[a.patient_id]?.display_name ?? '').localeCompare(state.patients[b.patient_id]?.display_name ?? '')),
    [state],
  );
  const currentBranch = store.getBranches().find((b) => b.key === branch);

  const jumpTo = (iso: ISO) => {
    setError(null);
    store.setClock(iso);
  };

  const apply = () => {
    const iso = localInputToIso(input, timezone);
    if (!iso) {
      setError('Enter a date and time.');
      return;
    }
    jumpTo(iso);
  };

  return (
    <div className="stack">
      <h1>Demo clock</h1>
      <DemoNote>Moving the clock re-derives every timer-driven fact (escalations, UNOWNED, unopened check-ins, reminders, Unreached, the day-21 sweep). Moving it backwards makes those facts disappear; nothing is scheduled in the background.</DemoNote>

      <Card title="Current clock">
        <KeyValue rows={[
          { label: 'Clock', value: <strong>{formatDateTime(clock)}</strong> },
          { label: 'Timezone', value: timezone },
          { label: 'UTC', value: <code>{clock}</code> },
          { label: 'Branch', value: currentBranch ? `${currentBranch.label} (${currentBranch.key})` : branch },
        ]} />
      </Card>

      <Card title="Set the clock">
        <Field label={`Date and time (${timezone})`} htmlFor="clock-input" error={error}>
          <input id="clock-input" type="datetime-local" value={input} onChange={(e) => setInput(e.target.value)} />
        </Field>
        <div className="row">
          <Button variant="primary" onClick={apply}>Set clock</Button>
          <Button onClick={() => jumpTo(addHours(clock, 1))}>Now + 1 hour</Button>
          <Button onClick={() => jumpTo(addDays(clock, 1))}>+1 day</Button>
          <Button variant="quiet" onClick={() => jumpTo(addHours(clock, -1))}>−1 hour</Button>
          <Button variant="quiet" onClick={() => jumpTo(addDays(clock, -1))}>−1 day</Button>
          {currentBranch && <Button variant="quiet" onClick={() => jumpTo(currentBranch.clock)}>Back to branch start</Button>}
        </div>
      </Card>

      <Card title="Quick jumps by persona episode">
        <p className="muted small">Computed from each episode's delivery date at the configured send hour ({config.cadence.send_hour_local}:00 {timezone}). Day 0 is the delivery date.</p>
        {episodes.length === 0 && <p className="muted">No episodes with a delivery date in the current branch.</p>}
        {episodes.map((ep) => {
          const patient = state.patients[ep.patient_id];
          return (
            <div key={ep.id} className="stack-sm" style={{ marginBottom: 16 }}>
              <div className="row">
                <strong>{patient?.display_name ?? ep.patient_id}</strong>
                <Chip variant="neutral">{ep.id}</Chip>
                <span className="muted small">delivered {formatDateTime(ep.delivery_date, { withTime: false })} · {dayLabel(Math.floor((Date.parse(clock) - Date.parse(ep.delivery_date)) / 86_400_000))} now</span>
              </div>
              <div className="quick-jumps">
                {JUMP_DAYS.map((j) => (
                  <Button key={j.label} size="sm" onClick={() => jumpTo(atLocalHour(addDays(ep.delivery_date, j.day), config.cadence.send_hour_local, timezone))}>
                    {j.label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
