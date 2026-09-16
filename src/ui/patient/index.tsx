/**
 * Patient surface (#/p/...). Phone-first; the persistent "I need help now" button and the contact
 * card are reachable from every screen before any acknowledgment (FR-04, FR-05, FR-21).
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import './patient.css';
import { AcknowledgmentPage } from './AcknowledgmentPage';
import { CarePlanPage } from './CarePlanPage';
import { CheckinPage } from './CheckinPage';
import { HelpPage } from './HelpPage';
import { HomePage } from './HomePage';
import { InboxPage } from './InboxPage';
import { InstrumentPage } from './InstrumentPage';
import { PreferencesPage } from './PreferencesPage';
import { SensitiveDialogPage } from './SensitiveDialogPage';
import { TransitionPage } from './TransitionPage';
import { WhoHasSeenPage } from './WhoHasSeenPage';

export function PatientRoutes() {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="acknowledge" element={<AcknowledgmentPage />} />
      <Route path="preferences" element={<PreferencesPage />} />
      <Route path="checkin/:id" element={<CheckinPage />} />
      <Route path="screen/:instrumentKey" element={<InstrumentPage />} />
      <Route path="help" element={<HelpPage />} />
      <Route path="careplan" element={<CarePlanPage />} />
      <Route path="transition" element={<TransitionPage />} />
      <Route path="inbox" element={<InboxPage />} />
      <Route path="sensitive-preferences" element={<SensitiveDialogPage />} />
      <Route path="seen" element={<WhoHasSeenPage />} />
      <Route path="*" element={<Navigate to="/p" replace />} />
    </Routes>
  );
}

export { usePatient, setCurrentPatientId, useCurrentPatientId, CURRENT_PATIENT_KEY } from './usePatient';
export default PatientRoutes;
