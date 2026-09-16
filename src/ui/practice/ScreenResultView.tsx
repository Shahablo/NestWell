/**
 * SR-14 / FR-06: every screen result the practice renders goes through visibleScreenFor for the
 * current role. A role outside the sharing category sees "screen completed, sharing withheld" and
 * nothing else; the budget owner never sees item-level data. Item responses appear only after an
 * explicit reveal, and every reveal dispatches readScreen so the read is recorded (FR-03a, SR-13).
 */
import { useState } from 'react';
import { readScreen, visibleScreenFor } from '../../domain/services';
import type { Id, ScreenResult } from '../../domain/types';
import { Banner, Button, Chip, DemoNote, Placeholder } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { instrumentShortName } from './episodeHelpers';
import { humanize } from './labels';
import { useStaffAction } from './useStaffAction';

export function ScreenResultView({ screen, compact = false }: { screen: ScreenResult; compact?: boolean }) {
  const { state, config, role } = useApp();
  const { fmt } = usePractice();
  const { run, error } = useStaffAction();
  const [revealed, setRevealed] = useState(false);
  const instrument = config.instruments[screen.instrument_key];
  const name = instrumentShortName(config, screen.instrument_key);
  const view = visibleScreenFor(state, screen, role);

  if (screen.declined) {
    return (
      <div className="row">
        <Chip variant="warning">screen declined</Chip>
        <span>{name} · {fmt(screen.administered_at)}</span>
      </div>
    );
  }
  if (!view.visible) {
    return (
      <div className="stack-sm">
        <div className="row">
          <Chip variant="warning">{view.withheld_notice}</Chip>
          <span>{name} · {fmt(screen.administered_at)}</span>
        </div>
        {!compact && <p className="muted small" style={{ margin: 0 }}>No score and no item responses are available to the {humanize(role)} view. Enforced in the data layer (SR-14).</p>}
      </div>
    );
  }
  const reveal = () => {
    if (run(readScreen({ screen_result_id: screen.id, field: 'screen_items' }))) setRevealed(true);
  };
  return (
    <div className="stack-sm">
      <div className="row">
        <strong>{name}</strong>
        <span className="muted small">v{screen.instrument_version} · {fmt(screen.administered_at)} · {screen.framing === 'loss_pathway' ? 'loss-pathway framing' : 'standard framing'}</span>
        <Chip variant={view.positive ? 'warning' : 'neutral'}>{view.positive ? 'at or above threshold' : 'below threshold'}</Chip>
        {screen.critical_item_hit && <Chip variant="danger">critical item positive</Chip>}
        {instrument?.placeholder && <Placeholder />}
      </div>
      <div className="small">
        Score {view.score}{instrument ? ` of ${instrument.items.reduce((a, i) => a + Math.max(...i.options.map((o) => o.score)), 0)} (threshold ${instrument.threshold_positive}${instrument.thresholds_confirmed_by ? `, confirmed by ${instrument.thresholds_confirmed_by}` : ', not yet confirmed'})` : ''} ·
        shared with: {screen.shared_with.length ? screen.shared_with.map(humanize).join(', ') : 'nobody'}
        {view.admin_override && <> · <Chip variant="warning">admin audit override</Chip></>}
      </div>
      {error && <Banner variant="warning">{error}</Banner>}
      {!compact && !revealed && (
        <div>
          <Button size="sm" variant="quiet" onClick={reveal}>Show item responses (recorded as a read)</Button>
        </div>
      )}
      {!compact && revealed && view.items && instrument && (
        <div>
          <ul className="responses">
            {instrument.items.map((it, i) => (
              <li key={it.key}>
                <span>{it.prompt}</span>
                <span>{it.options[view.items?.[i] ?? -1]?.label ?? '—'} ({it.options[view.items?.[i] ?? -1]?.score ?? '—'}){it.critical ? ' · critical item' : ''}</span>
              </li>
            ))}
          </ul>
          <DemoNote label="FR-03a">This view was written to the read record; the patient can see that a {humanize(role)} viewed her responses on this date.</DemoNote>
        </div>
      )}
    </div>
  );
}

/** Free text is shown only after an explicit reveal that is recorded as a read (FR-03a). Never for the budget owner. */
export function FreeTextReveal({ episode_id, text, label = 'free text' }: { episode_id: Id; text: string; label?: string }) {
  const { run, error } = useStaffAction();
  const [revealed, setRevealed] = useState(false);
  if (revealed) return <div className="small"><span className="muted">{label}: </span>{text}</div>;
  const reveal = () => {
    if (run(readScreen({ screen_result_id: null, episode_id, field: 'free_text' }))) setRevealed(true);
  };
  return (
    <div>
      <Button size="sm" variant="quiet" onClick={reveal}>Show {label} (recorded as a read)</Button>
      {error && <div className="field__error">{error}</div>}
    </div>
  );
}
