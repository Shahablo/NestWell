import type { Role } from '../../domain/types';

export const PATIENT_PREFIX = '/p';
export const PRACTICE_PREFIX = '/practice';
export const ADMIN_PREFIX = '/admin';

export const PRACTICE_ROLES: Role[] = ['coordinator', 'clinician', 'budget_owner', 'referral_partner'];

export const ROLE_LABELS: Record<Role, string> = {
  patient: 'Patient',
  coordinator: 'Coordinator',
  clinician: 'Clinician',
  budget_owner: 'Budget owner',
  referral_partner: 'Referral partner',
  admin: 'Admin',
};

export const ROLE_ORDER: Role[] = ['patient', 'coordinator', 'clinician', 'budget_owner', 'referral_partner', 'admin'];

/** The surface a role lands on ('/' redirects here). */
export function pathForRole(role: Role): string {
  if (role === 'patient') return PATIENT_PREFIX;
  if (role === 'admin') return ADMIN_PREFIX;
  return PRACTICE_PREFIX;
}

export type Surface = 'patient' | 'practice' | 'admin' | null;

/** Which surface a hash path belongs to. */
export function surfaceForPath(pathname: string): Surface {
  if (pathname === PATIENT_PREFIX || pathname.startsWith(`${PATIENT_PREFIX}/`)) return 'patient';
  if (pathname === PRACTICE_PREFIX || pathname.startsWith(`${PRACTICE_PREFIX}/`)) return 'practice';
  if (pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`)) return 'admin';
  return null;
}

export function surfaceForRole(role: Role): Surface {
  if (role === 'patient') return 'patient';
  if (role === 'admin') return 'admin';
  return 'practice';
}

/** Default role when a surface is opened by URL with a role from another surface active. */
export function defaultRoleForSurface(surface: Exclude<Surface, null>): Role {
  if (surface === 'patient') return 'patient';
  if (surface === 'admin') return 'admin';
  return 'coordinator';
}
