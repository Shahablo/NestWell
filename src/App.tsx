import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './ui/shell/useApp';
import { AdminRoutes } from './ui/admin/AdminRoutes';
import { PatientRoutes } from './ui/patient';
import { PracticeRoutes } from './ui/practice';
import { AppShell } from './ui/shell/AppShell';
import { ErrorBoundary } from './ui/shell/ErrorBoundary';
import { pathForRole } from './ui/shell/routes';

function RoleRedirect() {
  const { role } = useApp();
  return <Navigate to={pathForRole(role)} replace />;
}

export function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppShell>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<RoleRedirect />} />
            <Route path="/p/*" element={<PatientRoutes />} />
            <Route path="/practice/*" element={<PracticeRoutes />} />
            <Route path="/admin/*" element={<AdminRoutes />} />
            <Route path="*" element={<RoleRedirect />} />
          </Routes>
        </ErrorBoundary>
      </AppShell>
    </HashRouter>
  );
}

export default App;
