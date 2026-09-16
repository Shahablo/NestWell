/**
 * FR-05 enrollment acknowledgment: the mode-appropriate locked item (standard, plus the demo
 * participant item under SR-27) and the two flag sentences (FR-30a critical-item rule, FR-17
 * free-text mode) rendered from the flags in force. Continue records `acknowledged`; Not now
 * returns home, where only contact, help and the prompt are shown.
 */
import { Navigate, useNavigate } from 'react-router-dom';
import { acknowledge } from '../../domain/services/enrollment';
import { Button, Chip, DemoNote, LockedContent } from '../components';
import { ErrorNotice, PatientFrame } from './PatientFrame';
import { SHARING_LABELS, readByPhrase, usePatient } from './usePatient';
import { useState } from 'react';

export function AcknowledgmentPage() {
  const { patient, episode, config, content, locale, contactVars, demoParticipantMode, run } = usePatient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  if (!patient || !episode || episode.closed_at !== null) return <Navigate to="/p" replace />;

  const criticalId = config.freetext.critical_item_overrides_sharing ? 'acknowledgment.critical_shared' : 'acknowledgment.critical_not_shared';
  const scanId = config.freetext.free_text_urgency_scan ? 'acknowledgment.free_text_scan_on' : 'acknowledgment.free_text_scan_off';
  const counselPending = ['acknowledgment.standard', criticalId, scanId].some((id) => content.get(id)?.counsel_review_pending);
  const mode = demoParticipantMode ? 'demo_participant' : 'standard';

  const cont = () => {
    const r = run(acknowledge({ episode_id: episode.id, mode }));
    setError(r.error);
    if (!r.error) navigate('/p');
  };

  return (
    <PatientFrame title="Before you start">
      {counselPending && <Chip variant="warning" title="This wording has not yet been reviewed by counsel.">pending counsel review</Chip>}
      <ErrorNotice error={error} />
      <LockedContent
        id="acknowledgment.standard"
        layout="inline"
        locale={locale}
        vars={{
          default_sharing: `"${SHARING_LABELS[patient.preferences.sharing_category]}"`,
          read_by: readByPhrase(config),
          contact_name: contactVars.contact_name,
          contact_phone: contactVars.contact_phone,
        }}
      />
      {demoParticipantMode && <LockedContent id="acknowledgment.demo_participant" layout="inline" locale={locale} />}
      <LockedContent id={criticalId} layout="inline" locale={locale} />
      <LockedContent id={scanId} layout="inline" locale={locale} />
      <p className="small muted">
        Roles that may see your answers: your OB clinician, your care coordinator, and a referral partner only if you choose. Every staff view of your answers is recorded and listed under "Who has seen my answers" on your home screen.
      </p>
      <div className="card-actions">
        <Button variant="primary" size="lg" block onClick={cont}>Continue</Button>
        <Button size="lg" block onClick={() => navigate('/p')}>Not now</Button>
      </div>
      <DemoNote label="FR-05 / FR-30a / FR-17">
        The two flag sentences are chosen from the flags in force: critical_item_overrides_sharing = {String(config.freetext.critical_item_overrides_sharing)}, free_text_urgency_scan = {String(config.freetext.free_text_urgency_scan)}. The acknowledged event records both, so the disclosure can be asserted later. Mode: {mode}.
      </DemoNote>
    </PatientFrame>
  );
}
