/**
 * The referral_partner view (4.2, A9): only the partner panel. It lists referrals sent to the
 * partner with the consented fields, and its writes are the referral state (booked, kept, not
 * kept, no capacity, not covered). Screen results pass through visibleScreenFor for this role.
 */
import { useMemo } from 'react';
import { toMs } from '../../domain/clock';
import { Card, DemoNote, EmptyState } from '../components';
import { useApp } from '../shell/useApp';
import { PARTNER_REFERRAL_STATES } from './labels';
import { PartnerInfo, ReferralCard } from './ReferralsPage';

export function PartnerPanel() {
  const { state, config } = useApp();
  const partners = config.practice.referral_partners;
  const referrals = useMemo(
    () => Object.values(state.referrals).filter((r) => r.state !== 'created').sort((a, b) => toMs(b.created_at) - toMs(a.created_at)),
    [state.referrals],
  );
  return (
    <div className="stack">
      <h2>Partner panel</h2>
      <DemoNote label="A9">Played by staff in the demo: no real partner has agreed. Only referrals the practice has sent appear here, with the consented fields; a withheld screen result stays withheld.</DemoNote>
      {partners.map((p) => (
        <Card key={p.id} title="Partner record">
          <PartnerInfo partner={p} />
          <p className="muted small" style={{ marginTop: 12 }}>
            Writes available to this view: appointment scheduled, appointment kept (with the kept-on date), appointment not kept, no capacity, not covered. Capacity is a config value (no runtime write path in the prototype).
          </p>
        </Card>
      ))}
      <Card title={`Referrals received (${referrals.length})`}>
        {referrals.length === 0 ? (
          <EmptyState title="No referrals sent to the partner yet" body="A referral appears here once the practice records it as sent to partner with a consent basis." />
        ) : (
          <div className="stack">{referrals.map((r) => <ReferralCard key={r.id} referral={r} allowed={PARTNER_REFERRAL_STATES} consentedOnly />)}</div>
        )}
      </Card>
    </div>
  );
}
