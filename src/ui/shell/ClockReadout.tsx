import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../../domain/clock';
import { useApp } from './useApp';

/**
 * The demo clock, shown in the practice timezone. Clicking it is an explicit switch to the admin
 * view (the founder's demo control) and opens the clock panel; route gating never switches roles.
 */
export function ClockReadout() {
  const store = useApp();
  const navigate = useNavigate();
  const tz = store.config.practice.timezone;
  return (
    <span className="clock-readout">
      <span className="muted" aria-hidden="true">
        Demo clock
      </span>
      <a
        href="#/admin/clock"
        title={`Demo clock (${tz}). Switches to the admin view and opens the clock panel.`}
        onClick={(e) => {
          e.preventDefault();
          if (store.role !== 'admin') store.setRole('admin');
          navigate('/admin/clock');
        }}
      >
        <time dateTime={store.clock}>{formatDateTime(store.clock, tz)}</time>
      </a>
    </span>
  );
}
