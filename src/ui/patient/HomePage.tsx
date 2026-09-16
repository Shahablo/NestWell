/**
 * Patient home (FR-04, FR-05 gating, FR-13a, FR-07, FR-03a). Contact card, after-hours instruction and
 * the locked emergency instruction are always here; check-ins, care plan and preferences appear only
 * after the acknowledgment. No streaks, scores or missed-check-in language (FR-12).
 */
import { useState } from 'react';
import { checkinsForEpisode, openQueueItemsFor } from '../../domain/projection';
import { dayLabel } from '../../domain/clock';
import type { Episode, Patient } from '../../domain/types';
import { Button, Card, Chip, DemoNote, LockedContent, PhoneNumber, Placeholder } from '../components';
import { CoverageNotice } from './CoverageNotice';
import { PauseStopControls, SensitiveControls } from './HomeControls';
import { PatientFrame, T } from './PatientFrame';
import { PersonaPicker } from './PersonaPicker';
import { pendingScreenOfferFor, setCurrentPatientId, usePatient } from './usePatient';

/** FR-07 / 7.10: her own words for what she chose, never a staff workflow state. */
const STATUS_PLAIN: Record<string, string> = {
  pregnancy_loss: 'messages about the baby are stopped',
  stillbirth: 'messages about the baby are stopped',
  neonatal_loss: 'messages about the baby are stopped',
  nicu: 'milestone and celebration messages are stopped',
  trauma: 'nothing here asks about the birth',
};

const NOT_OFFERED_PLAIN: Record<string, string> = {
  language_content_unavailable: 'The practice cannot yet offer this program in your language. Someone from the practice will call you, with an interpreter if you want one.',
  minor_policy_undefined: 'The practice has not yet decided how to offer this program to patients under 18. Someone from the practice will contact you.',
};

function ContactSection() {
  const { contactVars, locale, config } = usePatient();
  const [showEmergency, setShowEmergency] = useState(false);
  return (
    <Card title="Your contact">
      <LockedContent id="contact_card" layout="inline" locale={locale} vars={contactVars} />
      <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
        <PhoneNumber label="Named contact" number={contactVars.contact_phone} placeholder={config.practice.named_contact.phone_is_placeholder} />
        <PhoneNumber label="After hours" number={contactVars.after_hours_phone} placeholder={config.practice.after_hours_phone_is_placeholder} />
        <PhoneNumber label="Crisis line, call or text" number="988" />
        <PhoneNumber label="Emergency" number="911" />
      </div>
      <div className="card-actions">
        <Button size="lg" block onClick={() => setShowEmergency((v) => !v)} aria-expanded={showEmergency}>
          {showEmergency ? 'Hide the emergency instruction' : 'If this is an emergency'}
        </Button>
      </div>
      {showEmergency && (
        <div className="stack-sm" style={{ marginTop: 'var(--space-3)' }}>
          <LockedContent id="emergency_instruction" layout="inline" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} />
          <LockedContent id="after_hours_instruction" layout="inline" locale={locale} vars={contactVars} />
        </div>
      )}
      <DemoNote label="FR-04">
        The named contact, coverage hours, after-hours instruction and the locked emergency instruction are always here, before any acknowledgment. Practice numbers are labelled placeholders; 911, 988 and the DV hotline are real.
      </DemoNote>
    </Card>
  );
}

function NextCheckin({ episode }: { episode: Episode }) {
  const { state, fmt, events, clock } = usePatient();
  const checkins = checkinsForEpisode(state, episode.id);
  const open = checkins.find((c) => c.state === 'sent' || c.state === 'opened');
  const next = checkins.find((c) => c.state === 'scheduled' || c.state === 'paused');
  const offer = pendingScreenOfferFor(events, state, episode.id, clock);
  return (
    <Card title="Check-ins">
      {episode.paused ? (
        <p>Check-ins are paused. Nothing is sent and nothing is expected from you until you turn them back on.</p>
      ) : open ? (
        <div className="stack-sm">
          <p>{dayLabel(open.day_number)} check-in is ready. It takes about two minutes and you can skip anything.</p>
          <Button variant="primary" size="lg" block to={`/p/checkin/${open.id}`}>Start the check-in</Button>
          <p className="small muted">Open until {fmt(open.window_end_at)}.</p>
        </div>
      ) : next ? (
        <p>
          Your next check-in is {dayLabel(next.day_number)}, around {fmt(next.scheduled_at)}.{next.state === 'paused' ? ' Check-ins are paused, so it will not be sent.' : ''}
        </p>
      ) : (
        <p className="muted">No more scheduled check-ins in this program.</p>
      )}
      {offer && (
        <div className="patient-notice stack-sm" style={{ marginTop: 'var(--space-3)' }}>
          <T id="screen.offer.now_or_next" />
          <Button size="lg" block to={`/p/screen/${offer.instrument_key}?checkin=${offer.checkin_id ?? ''}&return=${encodeURIComponent('/p')}`}>Answer the mood questions</Button>
        </div>
      )}
      <DemoNote label="FR-08 / FR-12">
        Check-in state is derived from the demo clock. Nothing here counts or nags (FR-12); an unopened check-in simply shows nothing.
      </DemoNote>
    </Card>
  );
}

function CarePlanGlance({ episode }: { episode: Episode }) {
  const { state, fmt } = usePatient();
  const items = Object.values(state.carePlanItems).filter((i) => i.episode_id === episode.id && i.state === 'open');
  const nextVisit = Object.values(state.visits)
    .filter((v) => v.episode_id === episode.id && v.state === 'scheduled')
    .sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for))[0];
  return (
    <Card title="Your plan">
      <p>
        {items.length} open item{items.length === 1 ? '' : 's'}.{' '}
        {nextVisit ? `Next visit: ${fmt(nextVisit.scheduled_for)}.` : 'No visit scheduled yet.'}
      </p>
      <Button size="lg" block to="/p/careplan">See your plan and visits</Button>
    </Card>
  );
}

function SensitivePrompt({ patient }: { patient: Patient }) {
  const { statuses } = usePatient();
  if (statuses.length === 0 || patient.preferences.contact_frequency !== null) return null;
  return (
    <Card title="How we stay in touch" tone="accent">
      <T id="sensitive.dialog.intro" />
      <Button variant="primary" size="lg" block to="/p/sensitive-preferences">Three short choices</Button>
    </Card>
  );
}

function Links({ episode }: { episode: Episode }) {
  const { day } = usePatient();
  const showTransition = episode.transition !== null || episode.closed_at !== null || (day !== null && day >= 63);
  return (
    <Card title="More">
      <div className="home-grid">
        <Button block to="/p/preferences">Preferences and who sees my mood answers</Button>
        <Button block to="/p/seen">Who has seen my answers</Button>
        <Button block to="/p/inbox">Messages (simulated)</Button>
        {showTransition && <Button block to="/p/transition">Your transition page</Button>}
      </div>
    </Card>
  );
}

export function HomePage() {
  const { patient, episode, state, acknowledged, locale, contactVars, statuses } = usePatient();
  const [picking, setPicking] = useState(false);

  if (!patient || picking) {
    return (
      <PatientFrame title="Patient app">
        <PersonaPicker onPicked={() => setPicking(false)} />
        {patient && <Button variant="quiet" onClick={() => setPicking(false)}>Back</Button>}
      </PatientFrame>
    );
  }

  const switchLink = (
    <p className="small muted">
      Playing {patient.display_name}. <button type="button" className="btn btn--quiet btn--sm" onClick={() => setPicking(true)}>Switch persona</button>
    </p>
  );

  const eligibility = state.eligibility[patient.id];

  if (!episode) {
    return (
      <PatientFrame title={`Hello, ${patient.preferences.preferred_name ?? patient.display_name}`}>
        {switchLink}
        <Card title="Enrollment" tone="warning">
          {eligibility?.status === 'not_offered' ? (
            <p>{NOT_OFFERED_PLAIN[eligibility.reason ?? ''] ?? 'Enrollment is not available right now. Someone from the practice will contact you.'}</p>
          ) : eligibility?.status === 'declined' ? (
            <p>You declined this program. Your contact card stays here.</p>
          ) : (
            <p>You are not enrolled yet. The practice enrolls you; until then your contact card and the help path are here.</p>
          )}
          {eligibility?.reason === 'language_content_unavailable' && (
            <DemoNote label="FR-63a">The safety-critical Spanish class is not approved, so enrollment is blocked with eligibility not_offered and a human-only outreach item flagged for an interpreter (scenario 6.6).</DemoNote>
          )}
        </Card>
        <ContactSection />
      </PatientFrame>
    );
  }

  if (episode.closed_at !== null && episode.status === 'closed_early') {
    return (
      <PatientFrame title="Your program has stopped">
        {switchLink}
        <LockedContent id="stop.done" layout="inline" locale={locale} vars={contactVars} />
        <ContactSection />
        {episode.transition && <Button block to="/p/transition">Your transition page</Button>}
      </PatientFrame>
    );
  }

  if (!acknowledged) {
    return (
      <PatientFrame title="Before you start">
        {switchLink}
        <Card title="One page to read first" tone="accent">
          <p>Please read what this service does and does not do. It takes a minute. Your contact card and the help button work before you do.</p>
          <Button variant="primary" size="lg" block to="/p/acknowledge">Read it now</Button>
        </Card>
        <ContactSection />
        <DemoNote label="FR-05">Check-ins, the care plan and preferences are gated on the acknowledgment. The contact card and I need help now are not.</DemoNote>
      </PatientFrame>
    );
  }

  const openUrgent = openQueueItemsFor(state, episode.id, ['urgent']).length > 0;
  const preDelivery = episode.delivery_date === null;

  return (
    <PatientFrame title={`Hello, ${patient.preferences.preferred_name ?? patient.display_name}`}>
      {switchLink}
      <div className="status-line">
        {episode.status === 'completed' && <Chip variant="accent">program completed</Chip>}
        {episode.paused && <Chip variant="warning">check-ins paused</Chip>}
        {[...new Set(statuses.map((s) => STATUS_PLAIN[s.subtype] ?? 'your choices are applied'))].map((label) => <Chip key={label} variant="neutral">{label}</Chip>)}
        {preDelivery && <Chip>before delivery</Chip>}
      </div>
      {openUrgent && <CoverageNotice />}
      <SensitivePrompt patient={patient} />
      {episode.closed_at === null && !preDelivery && <NextCheckin episode={episode} />}
      {preDelivery && (
        <Card title="Before your delivery">
          <p>Until your delivery is recorded, this app shows only your contact card, the help path, and your preferences. Check-ins start after delivery.</p>
          <Placeholder label="FR-02: no pregnancy content before delivery" />
        </Card>
      )}
      <ContactSection />
      {!preDelivery && <CarePlanGlance episode={episode} />}
      {episode.closed_at === null && <PauseStopControls episode={episode} />}
      {episode.closed_at === null && <SensitiveControls patient={patient} episode={episode} />}
      <Links episode={episode} />
    </PatientFrame>
  );
}
