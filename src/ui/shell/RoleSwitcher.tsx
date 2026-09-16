import { useNavigate } from 'react-router-dom';
import { useApp } from './useApp';
import type { Role } from '../../domain/types';
import { pathForRole, ROLE_LABELS, ROLE_ORDER } from './routes';

/** The on-screen "login": pick a role, land on its surface (requirements 4.2, NFR-07). */
export function RoleSwitcher() {
  const store = useApp();
  const navigate = useNavigate();
  const role = store.role;

  const onChange = (next: Role) => {
    if (next === role) return;
    store.setRole(next);
    navigate(pathForRole(next));
  };

  return (
    <label className="role-switcher">
      <span className="visually-hidden">Role</span>
      <span aria-hidden="true">View</span>
      <select value={role} onChange={(e) => onChange(e.target.value as Role)} aria-label="Switch role">
        {ROLE_ORDER.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
