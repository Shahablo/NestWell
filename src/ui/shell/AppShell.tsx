import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from './useApp';
import { SyntheticBanner } from './SyntheticBanner';
import { pathForRole, surfaceForPath, surfaceForRole } from './routes';

/**
 * Wraps every route with the synthetic banner (SR-03) and gates routes by the active view
 * (requirements section 5, SR-14): a URL for another surface never switches the role. A patient
 * view that opens #/practice or #/admin is sent to its own home, and a practice view that opens
 * #/admin is sent to #/practice. The role changes only through the role switcher, the clock
 * readout's explicit admin link, or a deep link's `role` query (main.tsx).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const store = useApp();
  const location = useLocation();
  const surface = surfaceForPath(location.pathname);
  const allowed = surface === null || surfaceForRole(store.role) === surface;

  return (
    <div className="app-shell">
      <SyntheticBanner />
      <main className="app-shell__main" id="main">
        {allowed ? children : <Navigate to={pathForRole(store.role)} replace />}
      </main>
    </div>
  );
}
