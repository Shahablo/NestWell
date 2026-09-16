import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useApp } from './useApp';
import { SyntheticBanner } from './SyntheticBanner';
import { defaultRoleForSurface, surfaceForPath, surfaceForRole } from './routes';

/**
 * Wraps every route with the synthetic banner (SR-03) and keeps the active role in step
 * with the surface in the URL, so a direct link to /practice or /admin opens with a role
 * that surface can use (route gating follows the active view, requirements 4.2).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const store = useApp();
  const location = useLocation();
  const surface = surfaceForPath(location.pathname);
  const role = store.role;

  useEffect(() => {
    if (surface && surfaceForRole(role) !== surface) store.setRole(defaultRoleForSurface(surface));
    // The store instance is stable; only the surface and role matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface, role]);

  return (
    <div className="app-shell">
      <SyntheticBanner />
      <main className="app-shell__main" id="main">
        {children}
      </main>
    </div>
  );
}
