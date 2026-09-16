/** Owner or staff display name; a null id renders the NOT YET ASSIGNED placeholder, never blank (A9). */
import { NOT_YET_ASSIGNED, Placeholder } from '../components';
import { usePractice } from '../shell/usePractice';
import type { Id } from '../../domain/types';

export function StaffName({ id, withRole = false }: { id: Id | null | undefined; withRole?: boolean }) {
  const { staff, roleLabelFor } = useStaffLookup();
  if (!id) return <Placeholder label={NOT_YET_ASSIGNED} title="No named owner is configured for this yet (A9, SR-26)." />;
  const user = staff(id);
  if (!user) return <span>{id}</span>;
  return (
    <span>
      {user.display_name}
      {withRole && <span className="muted small"> ({roleLabelFor(user.role)})</span>}
    </span>
  );
}

function useStaffLookup() {
  const p = usePractice();
  return { staff: p.staff, roleLabelFor: (r: string) => r.replace(/_/g, ' ') };
}
