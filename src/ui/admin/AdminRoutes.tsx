/** Admin panel (section 4.2, FR-48, SR-09, SR-12, SR-27). Left nav; collapses to a tab row under 900px. */
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { ClockPage } from './ClockPage';
import { InventoryPage } from './InventoryPage';
import { LogsPage } from './LogsPage';
import { ResetPage } from './ResetPage';
import { ScenariosPage } from './ScenariosPage';
import { SettingsPage } from './SettingsPage';
import { ValidationPage } from './ValidationPage';

const NAV: Array<{ to: string; label: string }> = [
  { to: 'clock', label: 'Clock' },
  { to: 'scenarios', label: 'Scenarios' },
  { to: 'reset', label: 'Reset' },
  { to: 'logs', label: 'Logs' },
  { to: 'inventory', label: 'Inventory' },
  { to: 'validation', label: 'Validation' },
  { to: 'settings', label: 'Settings' },
];

export function AdminRoutes() {
  return (
    <div className="dashboard-layout admin-layout">
      <nav className="dashboard-nav" aria-label="Admin sections">
        <span className="dashboard-nav__title">Admin</span>
        {NAV.map((n) => (
          <NavLink key={n.to} to={`/admin/${n.to}`} className={({ isActive }) => (isActive ? 'is-active' : undefined)}>
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="dashboard-content">
        <Routes>
          <Route index element={<Navigate to="clock" replace />} />
          <Route path="clock" element={<ClockPage />} />
          <Route path="scenarios" element={<ScenariosPage />} />
          <Route path="reset" element={<ResetPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="validation" element={<ValidationPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="clock" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default AdminRoutes;
