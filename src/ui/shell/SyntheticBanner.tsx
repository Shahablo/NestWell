import { useApp } from './useApp';
import { ClockReadout } from './ClockReadout';
import { RoleSwitcher } from './RoleSwitcher';

export const SYNTHETIC_BANNER_TEXT = 'Synthetic data — demonstration only. Not for real patients.';

/** SR-03: on every screen. Also hosts the role switcher and the demo clock. */
export function SyntheticBanner() {
  const { demoParticipantMode } = useApp();
  return (
    <header className="synthetic-banner" role="banner">
      <div className="synthetic-banner__text">
        {SYNTHETIC_BANNER_TEXT}
        {demoParticipantMode && <span className="synthetic-banner__mode">Demo participant mode</span>}
      </div>
      <div className="synthetic-banner__controls">
        <RoleSwitcher />
        <ClockReadout />
      </div>
    </header>
  );
}
