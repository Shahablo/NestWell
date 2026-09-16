/**
 * SR-09 FDA function inventory (static rows with live flag states) and the SR-10 queue
 * ownership sheet generated from config.queues + coverage with employer per role.
 * Every inventory row reads "not yet assessed"; only the G5 reviewer fills the last two columns.
 */
import { useApp } from '../shell/useApp';
import type { QueueDef } from '../../domain/config.schema';
import { Card, Chip, DemoNote, Placeholder } from '../components';
import { NOT_YET_ASSIGNED, roleLabel, usePractice } from '../shell/usePractice';

interface InventoryRow {
  id: string;
  fn: string;
  inputs: string;
  outputs: string;
  viewer: string;
  basis: string;
  rulesOrModel: string;
  flag: string;
}

const NOT_ASSESSED = 'not yet assessed';

function flagText(on: boolean, setBy: string | null, name: string): string {
  return `${name} = ${on ? 'on' : 'off'} (${setBy ? `set by ${setBy}` : 'unconfirmed; no owner has set it'})`;
}

export function InventoryPage() {
  const { config } = useApp();
  const { staffUser, staffName, coverageLabel, coverageFor } = usePractice();
  const ft = config.freetext;
  const instruments = Object.values(config.instruments);
  const ruleCount = config.rules.length;

  const rows: InventoryRow[] = [
    {
      id: 'FR-17',
      fn: 'Free text routed to a human on entry',
      inputs: 'Patient free text (check-in note, saved question, usefulness comment, sensitive preferences)',
      outputs: 'One Needs-review item in the same transaction as the save; with the scan on and an emergency-lexicon match: one Urgent item instead, help_requested (source lexicon_match, lexicon version), full-screen FR-22',
      viewer: 'Clinician (Needs review); coordinator (Urgent)',
      basis: 'Locked emergency instruction beside the field; pending closing statement with call-by time',
      rulesOrModel: `Rules only — config/lexicons/emergency (version ${config.lexicons.emergency?.version ?? '?'}); no model`,
      flag: flagText(ft.free_text_urgency_scan, ft.free_text_urgency_scan_set_by, 'free_text_urgency_scan'),
    },
    {
      id: 'FR-23',
      fn: 'Rules-based urgent pathway',
      inputs: 'Check-in response rule tags, screen score and critical item, status subtype, help source',
      outputs: 'rule_fired; full-screen FR-22; Urgent / Needs-review item; screen offer; pause',
      viewer: 'Coordinator, clinician',
      basis: 'Rule key, version and effective date on every rule_fired',
      rulesOrModel: `Rules only — ${ruleCount} configured rule${ruleCount === 1 ? '' : 's'} in config/rules; no model`,
      flag: 'n/a (rules are config with author, version, approver)',
    },
    {
      id: 'FR-30',
      fn: 'Routing on threshold and critical items',
      inputs: 'Instrument item responses (EPDS placeholder, PHQ-9)',
      outputs: 'Threshold positive: one Needs-review item (subject to FR-06 sharing); critical item: FR-23 pathway',
      viewer: 'Clinician; coordinator only within the sharing category',
      basis: 'Instrument attribution, threshold shown as placeholder until confirmed',
      rulesOrModel: `Rules only — sum scoring; thresholds ${instruments.map((i) => `${i.short_name} ≥ ${i.threshold_positive}${i.thresholds_confirmed_by ? ` (confirmed by ${i.thresholds_confirmed_by})` : ' (placeholder, unconfirmed)'}`).join('; ') || 'none configured'}`,
      flag: instruments.map((i) => `${i.key}: thresholds_confirmed_by = ${i.thresholds_confirmed_by ?? 'null'}`).join('; ') || 'no instruments configured',
    },
    {
      id: 'FR-30a',
      fn: 'Critical item with sharing withheld (placeholder policy)',
      inputs: 'critical_item_hit, patient sharing category',
      outputs: 'Flag true: Urgent item carrying only "critical safety item positive; other results withheld at patient request; policy unconfirmed". Flag false: no queue item; patient sees FR-22 and help resources',
      viewer: 'Coordinator (Urgent item, no score or item text); patient',
      basis: 'Disclosure sentence in the acknowledgment and screen framing matches the flag',
      rulesOrModel: 'Rules only; no model',
      flag: flagText(ft.critical_item_overrides_sharing, ft.critical_item_policy_set_by, 'critical_item_overrides_sharing'),
    },
    {
      id: 'AI-01',
      fn: 'Reword a named approved content item for reading level',
      inputs: 'Content id, locale, active sensitive subtypes — never free text, answers or scores',
      outputs: 'Reworded text with the AI-13 label; ai_interaction; ai_fallback_used when no exemplar',
      viewer: 'Patient',
      basis: 'AI-13 label on every reworded item',
      rulesOrModel: ft.ai_enabled ? 'Model (live AI enabled)' : 'Canned exemplar store (config/ai-exemplars); no model call',
      flag: `ai_enabled = ${ft.ai_enabled ? 'true' : 'false'}`,
    },
    {
      id: 'AI-13',
      fn: 'Patient-facing label on AI-assisted text',
      inputs: 'None (static approved label plus the after-hours instruction)',
      outputs: 'Label text rendered with any reworded item',
      viewer: 'Patient',
      basis: 'The label itself',
      rulesOrModel: 'Static content; no model',
      flag: `ai_enabled = ${ft.ai_enabled ? 'true' : 'false'}`,
    },
    {
      id: 'AI-15 (a)',
      fn: 'Prefilter — emergency-lexicon evaluation',
      inputs: 'Patient text submitted to an AI feature',
      outputs: 'Same as an FR-17 match: full-screen FR-22, one Urgent item, help_requested (lexicon_match), ai_call_blocked (emergency_lexicon)',
      viewer: 'Coordinator; patient',
      basis: 'Locked content plus the pending sentence',
      rulesOrModel: 'Rules only — the same emergency lexicon file as FR-17; runs only when live AI is enabled',
      flag: `ai_enabled = ${ft.ai_enabled ? 'true' : 'false'}; ${flagText(ft.free_text_urgency_scan, ft.free_text_urgency_scan_set_by, 'free_text_urgency_scan')}`,
    },
    {
      id: 'AI-15 (b)',
      fn: 'Prefilter — therapy-intent block',
      inputs: 'Patient text submitted to an AI feature',
      outputs: 'Locked instruction with crisis line and named contact plus the pending sentence; one Needs-review item; help_requested (ai_prefilter); ai_call_blocked (therapy_intent)',
      viewer: 'Clinician; patient',
      basis: 'Locked content plus the pending sentence',
      rulesOrModel: `Rules only — config/lexicons/therapy_intent (version ${config.lexicons.therapy_intent?.version ?? '?'}); runs only when live AI is enabled`,
      flag: `ai_enabled = ${ft.ai_enabled ? 'true' : 'false'}`,
    },
  ];

  const ownerCell = (userId: string | null, role: QueueDef['owner_role'], queueEmployer: QueueDef['employer']) => {
    const user = staffUser(userId);
    return (
      <>
        <div>{roleLabel(role)}</div>
        <div className="small">{user ? user.display_name : <Placeholder label={NOT_YET_ASSIGNED} />}</div>
        <div className="muted small">employer: {user ? user.employer : queueEmployer}</div>
      </>
    );
  };

  return (
    <div className="stack">
      <h1>Function inventory and queue ownership</h1>
      <DemoNote>SR-09: every function that reads or writes a symptom answer, screen response, critical item, urgency flag, lexicon match, queue routing or patient-facing recommendation is its own row. The last two columns are filled only by the G5 regulatory reviewer. The label in AI-13 is for patient clarity and is not a safeguard.</DemoNote>

      <Card title="FDA function inventory (SR-09)" aside={<Chip variant="warning">every row: {NOT_ASSESSED}</Chip>}>
        <p className="muted small">Flag states are read live from <code>config/freetext.json</code> and <code>config/instruments/*.json</code>. The generated document lives at <code>docs/fda-function-inventory.md</code> and is regenerated at the end of each phase.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Id</th><th>Function</th><th>Inputs</th><th>Outputs</th><th>Viewer</th><th>Basis shown</th><th>Rules or model</th><th>Flag state</th><th>Regulatory reviewer determination</th><th>Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.id}</strong></td>
                  <td>{r.fn}</td>
                  <td>{r.inputs}</td>
                  <td>{r.outputs}</td>
                  <td>{r.viewer}</td>
                  <td>{r.basis}</td>
                  <td>{r.rulesOrModel}</td>
                  <td><code className="small">{r.flag}</code></td>
                  <td><Chip variant="warning">{NOT_ASSESSED}</Chip></td>
                  <td className="muted">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small" style={{ marginTop: 12 }}>
          <strong>Appendix.</strong> All other requirement ids: not applicable — they do not read or write a symptom answer, screen response, critical item, urgency flag, lexicon match, queue routing or patient-facing recommendation. Live AI is <strong>{ft.ai_enabled ? 'enabled' : 'off'}</strong> in this build.
        </p>
      </Card>

      <Card title="Queue ownership sheet (SR-10)">
        <p className="muted small">Generated from <code>config/queues.json</code> and <code>config/coverage.json</code>. Every owner is a practice role (A16); a null owner shows {NOT_YET_ASSIGNED} and is a placeholder until the practice sets it.</p>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Queue</th><th>Owner</th><th>Backup</th><th>Queue employer</th><th>Ack target</th><th>Backup target</th><th>Resolution target</th><th>Timer basis</th><th>Coverage</th><th>On duty (from coverage)</th><th>If nobody answers</th>
              </tr>
            </thead>
            <tbody>
              {config.queues.map((q) => {
                const onDuty = [...new Set(coverageFor(q.key).map((c) => c.on_duty_user_id).filter((x): x is string => !!x))];
                return (
                  <tr key={q.key}>
                    <td>
                      <strong>{q.label}</strong>
                      <div className="muted small"><code>{q.key}</code></div>
                      {q.placeholder && <Placeholder />}
                    </td>
                    <td>{ownerCell(q.owner_user_id, q.owner_role, q.employer)}{q.owner_permission && <div className="muted small">requires {q.owner_permission}</div>}</td>
                    <td>{ownerCell(q.backup_user_id, q.backup_role, q.employer)}</td>
                    <td>{q.employer}</td>
                    <td>{q.ack_target_minutes} min{q.open_clinical_ack_target_minutes ? <div className="muted small">{q.open_clinical_ack_target_minutes} min with open clinical item</div> : null}</td>
                    <td>{q.backup_ack_target_minutes} min</td>
                    <td>{q.resolution_target_minutes ? `${q.resolution_target_minutes} min` : <Placeholder label="none set" />}</td>
                    <td>{q.timer_basis}</td>
                    <td>{coverageLabel(q.key)}</td>
                    <td>{onDuty.length ? onDuty.map((id) => <div key={id}>{staffName(id)}</div>) : <Placeholder label={NOT_YET_ASSIGNED} />}</td>
                    <td className="small">Escalated at the ack target, UNOWNED at the backup target; patient copy switches to <code>{q.no_answer_content_id}</code></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Staff roles and employers (A16)">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Id</th><th>Name</th><th>Role</th><th>Permissions</th><th>Employer</th></tr></thead>
            <tbody>
              {config.practice.staff_users.map((s) => (
                <tr key={s.id}>
                  <td><code>{s.id}</code></td>
                  <td>{s.display_name}</td>
                  <td>{roleLabel(s.role)}</td>
                  <td>{s.permissions.length ? s.permissions.join(', ') : '—'}</td>
                  <td>{s.employer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
