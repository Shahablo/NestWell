/**
 * The patient layout: content column, persona bar, and the persistent "I need help now" button
 * that opens FR-21 in one tap from every patient screen regardless of acknowledgment (FR-04).
 */
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banner, Button, Chip, Placeholder } from '../components';
import { usePatient } from './usePatient';
import type { ContentVars } from '../shell/useContent';

export function HelpButton({ block = false }: { block?: boolean }) {
  const navigate = useNavigate();
  const { content } = usePatient();
  return (
    <Button variant="danger" size="lg" block={block} onClick={() => navigate('/p/help', { state: { tap: true } })}>
      {content.text('help.label')}
    </Button>
  );
}

/** Approved content body in the patient's locale, with the placeholder label and the FR-63 marker when they apply. */
export function T({ id, vars, as = 'p', className = '' }: { id: string; vars?: ContentVars; as?: 'p' | 'div' | 'span'; className?: string }) {
  const { content } = usePatient();
  const item = content.get(id);
  const fellBack = content.fellBack(id);
  const Tag = as;
  return (
    <Tag className={`content-text ${className}`.trim()}>
      {content.text(id, vars)}
      {(item?.placeholder || fellBack) && (
        <span className="content-text__meta">
          {item?.placeholder && <Placeholder />}
          {fellBack && <span>{content.fallbackMarker()}</span>}
        </span>
      )}
    </Tag>
  );
}

export function ErrorNotice({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Banner variant="warning" title="That did not go through">
      <span className="small">{error}</span>
    </Banner>
  );
}

export function PatientFrame({ title, children }: { title?: string; children: ReactNode }) {
  const { patient, demoParticipantMode } = usePatient();
  return (
    <div className="patient-layout">
      <div className="patient-column patient-frame">
        <div className="patient-topbar">
          <Link to="/p" className="patient-topbar__home">NestWell</Link>
          <span className="patient-topbar__persona">
            {patient ? (
              <>
                <Chip variant="accent">{patient.display_name}</Chip>
                <span className="small">synthetic persona</span>
              </>
            ) : (
              <span className="small">no persona chosen</span>
            )}
          </span>
          <div className="patient-topbar__help">
            <HelpButton block />
          </div>
        </div>
        {demoParticipantMode && (
          <Banner variant="info" title="Demo participant mode">
            <span className="small">Made-up data. Nothing entered here is seen by any clinician. Typing in your own words is switched off.</span>
          </Banner>
        )}
        {title && <h1 className="page-title">{title}</h1>}
        {children}
      </div>
    </div>
  );
}
