/**
 * Practice dashboard (requirements 4.2, 7.8). Left nav with the coverage banner at the top; the
 * sections a role may open follow the active view (route gating), while FR-06 sharing and the
 * budget-owner exclusion are enforced in the data layer through visibleScreenFor (SR-14).
 */
import type { ReactNode } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import type { Role } from '../../domain/types';
import { EmptyState } from '../components';
import { PRACTICE_ROLES, ROLE_LABELS } from '../shell/routes';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { BudgetPage } from './BudgetPage';
import { CoverageBanner } from './CoverageBanner';
import { MetricsPage } from './MetricsPage';
import { OwnershipSheet } from './OwnershipSheet';
import { PartnerPanel } from './PartnerPanel';
import { PatientDetailPage } from './PatientDetailPage';
import { PatientsPage } from './PatientsPage';
import { QueuesPage } from './QueuesPage';
import { ReferralsPage } from './ReferralsPage';
import { ScreeningPage } from './ScreeningPage';
import { SummariesPage } from './SummariesPage';
import { SummaryDetailPage } from './SummaryDetailPage';
import { SummaryExportPage } from './SummaryExportPage';
import './practice.css';

type PracticeRole = 'coordinator' | 'clinician' | 'budget_owner' | 'referral_partner';

interface Section { path: string; label: string; roles: PracticeRole[] }

const STAFF: PracticeRole[] = ['coordinator', 'clinician'];

export const SECTIONS: Section[] = [
  { path: 'queues', label: 'Queues', roles: STAFF },
  { path: 'patients', label: 'Patients', roles: STAFF },
  { path: 'screening', label: 'Screening', roles: ['clinician'] },
  { path: 'referrals', label: 'Referrals', roles: STAFF },
  { path: 'summaries', label: 'Summaries', roles: STAFF },
  { path: 'metrics', label: 'Metrics', roles: ['coordinator', 'clinician', 'budget_owner'] },
  { path: 'budget', label: 'Budget owner', roles: ['budget_owner'] },
  { path: 'ownership', label: 'Queue ownership', roles: ['coordinator', 'clinician', 'budget_owner'] },
  { path: 'partner', label: 'Partner panel', roles: ['referral_partner'] },
];

function isPracticeRole(role: Role): role is PracticeRole {
  return PRACTICE_ROLES.includes(role);
}

function homeFor(role: PracticeRole): string {
  const first = SECTIONS.find((s) => s.roles.includes(role));
  return `/practice/${first?.path ?? 'queues'}`;
}

function Gate({ role, allow, children }: { role: PracticeRole; allow: PracticeRole[]; children: ReactNode }) {
  if (!allow.includes(role)) return <Navigate to={homeFor(role)} replace />;
  return <>{children}</>;
}

export function PracticeRoutes() {
  const { role, staffUserId } = useApp();
  const { practice, staffName } = usePractice();
  if (!isPracticeRole(role)) {
    return (
      <div className="dashboard-layout">
        <div className="dashboard-content">
          <EmptyState title="Switching to the practice view">The practice dashboard opens in a practice role.</EmptyState>
        </div>
      </div>
    );
  }
  const nav = SECTIONS.filter((s) => s.roles.includes(role));
  const allow = (path: string): PracticeRole[] => SECTIONS.find((s) => s.path === path)?.roles ?? [];
  return (
    <div className="dashboard-layout">
      <nav className="dashboard-nav" aria-label="Practice sections">
        <span className="dashboard-nav__title">Practice</span>
        {nav.map((s) => (
          <NavLink key={s.path} to={`/practice/${s.path}`} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            {s.label}
          </NavLink>
        ))}
      </nav>
      <div className="dashboard-content">
        <div className="practice-header">
          <h1>{practice.name}</h1>
          <span className="muted small">
            {ROLE_LABELS[role]} view · acting as {staffName(staffUserId)}
          </span>
        </div>
        {role !== 'referral_partner' && <CoverageBanner />}
        <Routes>
          <Route index element={<Navigate to={homeFor(role)} replace />} />
          <Route path="queues" element={<Gate role={role} allow={allow('queues')}><QueuesPage /></Gate>} />
          <Route path="patients" element={<Gate role={role} allow={allow('patients')}><PatientsPage /></Gate>} />
          <Route path="patients/:patientId" element={<Gate role={role} allow={allow('patients')}><PatientDetailPage /></Gate>} />
          <Route path="screening" element={<Gate role={role} allow={allow('screening')}><ScreeningPage /></Gate>} />
          <Route path="referrals" element={<Gate role={role} allow={allow('referrals')}><ReferralsPage /></Gate>} />
          <Route path="summaries" element={<Gate role={role} allow={allow('summaries')}><SummariesPage /></Gate>} />
          <Route path="summaries/:summaryId" element={<Gate role={role} allow={allow('summaries')}><SummaryDetailPage /></Gate>} />
          <Route path="summaries/:summaryId/export" element={<Gate role={role} allow={allow('summaries')}><SummaryExportPage /></Gate>} />
          <Route path="metrics" element={<Gate role={role} allow={allow('metrics')}><MetricsPage /></Gate>} />
          <Route path="budget" element={<Gate role={role} allow={allow('budget')}><BudgetPage /></Gate>} />
          <Route path="ownership" element={<Gate role={role} allow={allow('ownership')}><OwnershipSheet /></Gate>} />
          <Route path="partner" element={<Gate role={role} allow={allow('partner')}><PartnerPanel /></Gate>} />
          <Route path="*" element={<Navigate to={homeFor(role)} replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default PracticeRoutes;
