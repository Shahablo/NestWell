/**
 * FR-44 coverage banner: the current coverage state and on-duty owner per queue, computed from the
 * coverage schedule at the demo clock. Outside coverage a queue reads "nobody on duty"; nothing here
 * implies someone is present when the schedule says otherwise (FR-24).
 */
import { nextCoverageStart } from '../../domain/derive';
import { Banner } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { StaffName } from './StaffName';

export function CoverageBanner() {
  const { clock, config } = useApp();
  const p = usePractice();
  const rows = config.queues.map((q) => {
    const duty = p.onDuty(q.key, clock);
    const entries = p.coverageFor(q.key);
    const next = duty.covered ? null : nextCoverageStart(clock, entries, p.timezone);
    return { def: q, duty, next, label: p.coverageLabel(q.key) };
  });
  const uncovered = rows.filter((r) => !r.duty.covered).length;
  const title = uncovered === 0
    ? `Coverage at ${p.fmt(clock)}: someone is on duty for every queue`
    : `Coverage at ${p.fmt(clock)}: nobody on duty for ${uncovered} of ${rows.length} queues`;
  return (
    <Banner variant={uncovered === 0 ? 'info' : 'warning'} title={title} className="coverage-banner">
      <div className="coverage-grid">
        {rows.map((r) => (
          <div key={r.def.key} className={`coverage-cell${r.duty.covered ? '' : ' coverage-cell--uncovered'}`}>
            <strong>{r.def.label}</strong>
            <div>
              {r.duty.covered ? (
                <>On duty: <StaffName id={r.duty.onDutyUserId} /></>
              ) : (
                <strong>Nobody on duty</strong>
              )}
            </div>
            <div className="muted small">{r.label} · timer basis {r.def.timer_basis.replace(/_/g, ' ')}</div>
            {!r.duty.covered && (
              <div className="small">{r.next ? `Next coverage starts ${p.fmt(r.next)}` : 'No coverage scheduled in the next 14 days'}</div>
            )}
          </div>
        ))}
      </div>
    </Banner>
  );
}
