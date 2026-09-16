import { Link } from 'react-router-dom';
import { formatDateTime } from '../../domain/clock';
import { useApp } from './useApp';

/** The demo clock, shown in the practice timezone, linking to the admin clock panel. */
export function ClockReadout() {
  const { clock, config } = useApp();
  const tz = config.practice.timezone;
  return (
    <span className="clock-readout">
      <span className="muted" aria-hidden="true">
        Demo clock
      </span>
      <Link to="/admin/clock" title={`Demo clock (${tz}). Open the admin clock panel.`}>
        <time dateTime={clock}>{formatDateTime(clock, tz)}</time>
      </Link>
    </span>
  );
}
