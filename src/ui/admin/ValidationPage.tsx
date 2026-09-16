/** FR-61 validation report plus content/config counts, manifest hash and the placeholder list. */
import { useMemo } from 'react';
import { loadConfig } from '../../domain/config';
import { useApp } from '../shell/useApp';
import { Card, Chip, DemoNote, KeyValue, Placeholder } from '../components';

export function ValidationPage() {
  const { config, content } = useApp();
  const { problems } = loadConfig();

  const counts = useMemo(() => {
    const byLocale: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const it of content.items) {
      byLocale[it.locale] = (byLocale[it.locale] ?? 0) + 1;
      byStatus[it.status] = (byStatus[it.status] ?? 0) + 1;
    }
    return { byLocale, byStatus };
  }, [content.items]);

  const placeholderContent = content.items.filter((i) => i.placeholder);
  const placeholderConfig: Array<{ kind: string; key: string; note?: string }> = [];
  if (config.cadence.placeholder) placeholderConfig.push({ kind: 'cadence', key: `v${config.cadence.version}` });
  for (const q of config.queues) if (q.placeholder) placeholderConfig.push({ kind: 'queue', key: q.key });
  for (const q of config.queues) if (!q.owner_user_id) placeholderConfig.push({ kind: 'queue owner', key: q.key, note: 'NOT YET ASSIGNED' });
  for (const t of Object.values(config.checkins)) if (t.placeholder) placeholderConfig.push({ kind: 'check-in template', key: t.key });
  for (const i of Object.values(config.instruments)) if (i.placeholder) placeholderConfig.push({ kind: 'instrument', key: i.key, note: i.thresholds_confirmed_by ? undefined : 'thresholds unconfirmed' });
  for (const r of config.rules) if (r.placeholder) placeholderConfig.push({ kind: 'rule', key: `${r.key} v${r.version}` });
  for (const p of config.practice.referral_partners) if (!p.secured) placeholderConfig.push({ kind: 'referral partner', key: p.id, note: 'NOT YET SECURED' });
  for (const [k, v] of Object.entries(config.practice.barrier_resources)) if (v === null) placeholderConfig.push({ kind: 'barrier resource', key: k, note: 'NOT YET PROVIDED' });
  if (config.practice.named_contact.phone_is_placeholder) placeholderConfig.push({ kind: 'practice phone', key: config.practice.named_contact.phone, note: 'non-dialable placeholder' });
  if (config.practice.after_hours_phone_is_placeholder) placeholderConfig.push({ kind: 'after-hours phone', key: config.practice.after_hours_phone, note: 'non-dialable placeholder' });
  if (!config.practice.state_review_memo_ref) placeholderConfig.push({ kind: 'jurisdiction', key: config.practice.jurisdiction, note: 'State-law review required (SR-17)' });
  if (!config.freetext.free_text_urgency_scan_set_by) placeholderConfig.push({ kind: 'freetext flag', key: 'free_text_urgency_scan', note: 'unconfirmed' });
  if (!config.freetext.critical_item_policy_set_by) placeholderConfig.push({ kind: 'freetext flag', key: 'critical_item_overrides_sharing', note: 'unconfirmed' });

  const counselPending = content.items.filter((i) => i.counsel_review_pending);

  return (
    <div className="stack">
      <h1>Validation</h1>
      <DemoNote>Config is data, not code (FR-61). Every file is validated with Zod at startup and the app refuses to run on a violation, so this page should always read "0 problems" when you can see it.</DemoNote>

      <Card title="Startup validation" aside={<Chip variant={problems.length === 0 ? 'accent' : 'danger'}>{problems.length} problem{problems.length === 1 ? '' : 's'}</Chip>}>
        {problems.length === 0 ? <p>0 problems. Every config and content file validated.</p> : (
          <ol>{problems.map((p, i) => <li key={i}><code>{p}</code></li>)}</ol>
        )}
      </Card>

      <Card title="Configuration">
        <KeyValue rows={[
          { label: 'Practice', value: `${config.practice.name} (${config.practice.jurisdiction}, ${config.practice.timezone})` },
          { label: 'Jurisdiction review', value: config.practice.state_review_memo_ref ? `memo ${config.practice.state_review_memo_ref} dated ${config.practice.state_review_memo_date ?? '?'}` : <><Placeholder label="State-law review required" /> <span className="muted small">(SR-17)</span></> },
          { label: 'Queues', value: config.queues.length },
          { label: 'Coverage entries', value: config.coverage.length },
          { label: 'Cadence', value: `v${config.cadence.version}, ${config.cadence.points.length} points` },
          { label: 'Check-in templates', value: Object.keys(config.checkins).length },
          { label: 'Instruments', value: Object.keys(config.instruments).length },
          { label: 'Rules', value: config.rules.length },
          { label: 'Lexicons', value: `${Object.keys(config.lexicons).length} (${Object.values(config.lexicons).reduce((n, l) => n + l.entries.length, 0)} entries)` },
          { label: 'Care plan items / visits', value: `${config.careplan.items.length} / ${config.careplan.visits.length}` },
          { label: 'Staff users', value: config.practice.staff_users.length },
          { label: 'Referral partners', value: config.practice.referral_partners.length },
          { label: 'Free-text flags', value: <code className="small">free_text_urgency_scan={String(config.freetext.free_text_urgency_scan)}; ai_enabled={String(config.freetext.ai_enabled)}; critical_item_overrides_sharing={String(config.freetext.critical_item_overrides_sharing)}</code> },
        ]} />
      </Card>

      <Card title="Content">
        <KeyValue rows={[
          { label: 'Items', value: content.items.length },
          { label: 'By locale', value: Object.entries(counts.byLocale).map(([k, v]) => `${k}: ${v}`).join(', ') || '—' },
          { label: 'By status', value: Object.entries(counts.byStatus).map(([k, v]) => `${k}: ${v}`).join(', ') || '—' },
          { label: 'Locked items', value: content.items.filter((i) => i.locked).length },
          { label: 'Safety-critical items', value: content.items.filter((i) => i.safety_critical).length },
          { label: 'Pending counsel review', value: counselPending.length },
          { label: 'Content manifest hash', value: <code>{content.manifestHash}</code> },
        ]} />
      </Card>

      <Card title={`Placeholder content items (${placeholderContent.length})`}>
        {placeholderContent.length === 0 ? <p className="muted">None.</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Id</th><th>Locale</th><th>Title</th><th>Status</th><th>Approver</th></tr></thead>
              <tbody>
                {placeholderContent.map((i) => (
                  <tr key={`${i.id}-${i.locale}`}>
                    <td><code>{i.id}</code></td>
                    <td>{i.locale}</td>
                    <td>{i.title}</td>
                    <td>{i.status}</td>
                    <td>{i.approver ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title={`Placeholder configuration (${placeholderConfig.length})`}>
        {placeholderConfig.length === 0 ? <p className="muted">None.</p> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Kind</th><th>Key</th><th>Note</th></tr></thead>
              <tbody>
                {placeholderConfig.map((p, i) => (
                  <tr key={i}><td>{p.kind}</td><td><code>{p.key}</code></td><td>{p.note ? <Placeholder label={p.note} /> : <Placeholder />}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
