/**
 * FR-21 "I need help now": one tap shows the locked emergency instruction (FR-22, full screen, by
 * non-AI code) with the crisis line, after-hours number, named contact and "request a callback". The
 * tap itself creates one Urgent item and help_requested(patient) through the queues service; opening
 * this page by URL only renders the content. For Urgent items the preferred window is ignored and the
 * screen states "If this cannot wait, call now". Callback creation needs connectivity (simulated with
 * navigator.onLine) and the screen says so offline.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { openQueueItemsFor } from '../../domain/projection';
import { helpNow, requestCallback } from '../../domain/services/queues';
import { Button, Card, DemoNote, LockedContent, PhoneNumber } from '../components';
import { CoverageNotice, latestOpenUrgent } from './CoverageNotice';
import { ErrorNotice, PatientFrame, T } from './PatientFrame';
import { usePatient } from './usePatient';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function HelpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { patient, episode, state, config, locale, contactVars, run, fmt } = usePatient();
  const online = useOnline();
  const [error, setError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(true);
  const [urgentId, setUrgentId] = useState<string | null>(null);
  const [callbackAt, setCallbackAt] = useState<string | null>(null);
  const tapped = useRef(false);

  const openEpisode = episode && episode.closed_at === null ? episode : null;

  useEffect(() => {
    const tap = Boolean((location.state as { tap?: boolean } | null)?.tap);
    if (!tap || tapped.current) return;
    tapped.current = true;
    // Clear the tap marker so a reload or back-navigation does not create a second item.
    navigate(location.pathname, { replace: true, state: null });
    if (!openEpisode) return;
    const r = run(helpNow({ episode_id: openEpisode.id }));
    setError(r.error);
    const created = r.events.find((e) => e.type === 'queue_item_created' && e.payload.queue_key === 'urgent');
    if (created?.type === 'queue_item_created') setUrgentId(created.payload.queue_item_id);
    // Runs once for the tap that opened this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const urgentItem = openEpisode ? (urgentId ? state.queueItems[urgentId] ?? null : latestOpenUrgent(openQueueItemsFor(state, openEpisode.id, ['urgent']))) : null;
  const existingCallback = urgentItem ? Object.values(state.callbacks).find((c) => c.queue_item_id === urgentItem.id && c.occurred === null) : undefined;

  const callback = () => {
    if (!openEpisode) return;
    const r = run(requestCallback({ episode_id: openEpisode.id, queue_item_id: urgentItem?.id ?? null }));
    setError(r.error);
    const cb = r.events.find((e) => e.type === 'callback_requested');
    if (cb) setCallbackAt(cb.occurred_at);
  };

  const vars = { ...contactVars, after_hours_phone: contactVars.after_hours_phone };

  return (
    <PatientFrame title={config.practice.name}>
      {showFull && (
        <LockedContent id="emergency_instruction" layout="full_screen" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} onClose={() => setShowFull(false)} />
      )}
      <ErrorNotice error={error} />
      <LockedContent id="emergency_instruction" layout="inline" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} />
      <Card title="If this cannot wait, call now">
        <div className="stack-sm">
          <PhoneNumber label="Emergency" number="911" />
          <PhoneNumber label="Crisis line, call or text, any time" number="988" />
          <PhoneNumber label="National Domestic Violence Hotline" number="1-800-799-7233" />
          <PhoneNumber label={contactVars.contact_name} number={contactVars.contact_phone} placeholder={config.practice.named_contact.phone_is_placeholder} />
          <PhoneNumber label="After hours" number={contactVars.after_hours_phone} placeholder={config.practice.after_hours_phone_is_placeholder} />
        </div>
      </Card>
      <Card title={patient ? 'Request a call from the practice' : 'Help'}>
        <T id="help.screen" vars={vars} />
        {!openEpisode ? (
          <p className="small muted">A callback request needs an enrolled persona. The numbers above work regardless.</p>
        ) : !online ? (
          <LockedContent id="help.callback.offline" layout="inline" locale={locale} vars={vars} />
        ) : callbackAt || existingCallback ? (
          <p>
            Callback requested at {fmt(callbackAt ?? existingCallback?.requested_at ?? '')}. It stays open at the practice until someone logs the outcome. If this cannot wait, call now.
          </p>
        ) : (
          <Button variant="primary" size="lg" block onClick={callback}>Request a callback</Button>
        )}
        <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>For an urgent request the practice ignores any preferred contact window and calls as soon as someone is available.</p>
      </Card>
      {openEpisode && <CoverageNotice />}
      <Button size="lg" block to="/p">Back to home</Button>
      <DemoNote label="FR-21 / FR-24 / FR-25">
        The tap created one Urgent item and help_requested(source patient); the AI layer is never called. The notice above switches to the locked "we have not reached a nurse yet" item outside coverage, at the acknowledgment target (escalated) and at the backup target (UNOWNED); an acknowledged item shows the role, time and computed call-by time.
      </DemoNote>
    </PatientFrame>
  );
}
