/** SR-10 queue ownership sheet generated from config, with employer per role (A16) and every NOT YET ASSIGNED owner visible (SR-26). */
import { useMemo, useState } from 'react';
import { Button, Card, DemoNote, Field, Placeholder } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { humanize } from './labels';
import { toCsvGeneric } from './metricsExport';
import { StaffName } from './StaffName';

export function OwnershipSheet() {
  const { config } = useApp();
  const { coverageLabel, staffName } = usePractice();
  const [csv, setCsv] = useState('');
  const unassigned = config.queues.filter((q) => q.owner_user_id === null || q.backup_user_id === null).length;
  const rows = useMemo(
    () => config.queues.map((q) => ({
      queue: q.key,
      label: q.label,
      owner_role: q.owner_role,
      owner_user: staffName(q.owner_user_id),
      owner_permission: q.owner_permission ?? '',
      backup_role: q.backup_role,
      backup_user: staffName(q.backup_user_id),
      employer: q.employer,
      ack_target_minutes: q.ack_target_minutes,
      backup_ack_target_minutes: q.backup_ack_target_minutes,
      resolution_target_minutes: q.resolution_target_minutes ?? '',
      open_clinical_ack_target_minutes: q.open_clinical_ack_target_minutes ?? '',
      timer_basis: q.timer_basis,
      coverage: coverageLabel(q.key),
      no_answer_content_id: q.no_answer_content_id,
      placeholder: q.placeholder,
    })),
    [config, coverageLabel, staffName],
  );
  return (
    <div className="stack">
      <h2>Queue ownership sheet</h2>
      <DemoNote label="SR-10">Generated from config/queues.json, config/coverage.json and config/practice.json. Every owner field shows NOT YET ASSIGNED until a practice sets it (A9); every queue lists its employer (A16). SR-26 blocks a pilot while any owner is unassigned.</DemoNote>
      {unassigned > 0 && <p className="small"><Placeholder label={`${unassigned} of ${config.queues.length} queues have an owner or backup NOT YET ASSIGNED`} /></p>}
      <Card flat>
        <div className="table-scroll">
          <table>
            <thead>
              <tr><th>Queue</th><th>Owner</th><th>Backup</th><th>Employer</th><th>Targets</th><th>Basis</th><th>Coverage</th><th>If nobody answers</th></tr>
            </thead>
            <tbody>
              {config.queues.map((q) => (
                <tr key={q.key}>
                  <td><strong>{q.label}</strong><div className="muted small">{q.description}</div>{q.placeholder && <Placeholder />}</td>
                  <td>{humanize(q.owner_role)}{q.owner_permission ? ` (${humanize(q.owner_permission)})` : ''}<div><StaffName id={q.owner_user_id} /></div></td>
                  <td>{humanize(q.backup_role)}<div><StaffName id={q.backup_user_id} /></div></td>
                  <td>{q.employer}</td>
                  <td>ack {q.ack_target_minutes} min · backup {q.backup_ack_target_minutes} min{q.resolution_target_minutes ? ` · resolve ${q.resolution_target_minutes} min` : ''}{q.open_clinical_ack_target_minutes ? ` · ${q.open_clinical_ack_target_minutes} min when flagged` : ''}</td>
                  <td>{humanize(q.timer_basis)}</td>
                  <td>{coverageLabel(q.key)}</td>
                  <td><code className="small">{q.no_answer_content_id}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-actions">
          <Button size="sm" onClick={() => setCsv(toCsvGeneric(Object.keys(rows[0] ?? {}), rows))}>Export CSV</Button>
          <Button size="sm" variant="quiet" className="no-print" onClick={() => window.print()}>Print</Button>
        </div>
        {csv && (
          <Field label="CSV" htmlFor="own-csv">
            <textarea id="own-csv" className="mono" readOnly rows={8} value={csv} />
          </Field>
        )}
      </Card>
      <Card title="Staff users (config)">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Id</th><th>Name</th><th>Role</th><th>Permissions</th><th>Employer</th></tr></thead>
            <tbody>
              {config.practice.staff_users.map((u) => (
                <tr key={u.id}><td><code>{u.id}</code></td><td>{u.display_name}</td><td>{humanize(u.role)}</td><td>{u.permissions.map(humanize).join(', ') || '—'}</td><td>{u.employer}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
