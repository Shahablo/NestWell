/**
 * FR-18–FR-20 care plan: items from config with clinician-approved explanations (content id and
 * version shown), a labelled canned rewording on request (AI-01, AI-13 label), visit preparation
 * with date, purpose, what to bring and the bring-baby / interpreter line, barrier resources
 * (FR-36a, NOT YET PROVIDED until supplied) and saved questions. Suppressed items never render (FR-54).
 */
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { rewordResult, type RewordResult } from '../../domain/services/ai';
import type { CarePlanItem, Command } from '../../domain/types';
import { Button, Card, Chip, DemoNote, Placeholder } from '../components';
import { ErrorNotice, PatientFrame, T } from './PatientFrame';
import { SavedQuestions } from './SavedQuestions';
import { BARRIER_LABELS, QUEUE_ROLE_PLAIN, usePatient } from './usePatient';

function CarePlanItemCard({ item }: { item: CarePlanItem }) {
  const { config, content, contactVars, run, fmt, demoParticipantMode } = usePatient();
  const [reword, setReword] = useState<RewordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cfg = config.careplan.items.find((i) => i.key === item.key);
  const bodyId = cfg?.body_content_id ?? null;
  const titleItem = content.get(item.title_content_id);
  const bodyItem = bodyId ? content.get(bodyId) : undefined;

  const plain = () => {
    if (!bodyId) return;
    let captured: RewordResult | null = null;
    const cmd: Command = (ctx) => {
      captured = rewordResult(ctx, { content_id: bodyId, episode_id: item.episode_id });
      return captured.events;
    };
    const r = run(cmd);
    setError(r.error);
    if (!r.error) setReword(captured);
  };

  return (
    <Card
      title={content.title(item.title_content_id)}
      aside={<Chip variant={item.state === 'completed' ? 'accent' : 'neutral'}>{item.state === 'completed' ? 'done' : 'open'}</Chip>}
    >
      {bodyId && <T id={bodyId} />}
      <p className="small muted">
        {item.due_at ? `Around ${fmt(item.due_at, { withTime: false })}. ` : ''}Owner at the practice: {QUEUE_ROLE_PLAIN[item.owner_role] ?? item.owner_role}.
        {' '}Content {bodyId ?? item.title_content_id} v{bodyItem?.version ?? titleItem?.version ?? item.version}
        {(titleItem?.placeholder || bodyItem?.placeholder) && <> <Placeholder /></>}
      </p>
      <ErrorNotice error={error} />
      {reword && !reword.blocked && (
        <div className="ai-label">
          <Chip variant="ai">plain-language version</Chip>
          <p className="content-text">{reword.text}</p>
          <p className="small content-text">{content.text('ai.patient_label', { after_hours_phone: contactVars.after_hours_phone })}</p>
          {reword.fallback && <T id="ai.fallback" className="small muted" />}
        </div>
      )}
      {bodyId && !reword && !demoParticipantMode && (
        <div className="card-actions">
          <Button size="md" onClick={plain}>Show a plain-language version</Button>
        </div>
      )}
    </Card>
  );
}

export function CarePlanPage() {
  const { patient, episode, acknowledged, state, config, content, suppressed, fmt } = usePatient();
  if (!patient || !episode) return <Navigate to="/p" replace />;
  if (episode.closed_at === null && !acknowledged) return <Navigate to="/p/acknowledge" replace />;

  const items = Object.values(state.carePlanItems)
    .filter((i) => i.episode_id === episode.id && i.state !== 'suppressed' && !i.tags.some((t) => suppressed.has(t)))
    .sort((a, b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'));
  const visits = Object.values(state.visits).filter((v) => v.episode_id === episode.id).sort((a, b) => a.scheduled_for.localeCompare(b.scheduled_for));
  const barriers = Object.values(state.queueItems).filter((q) => q.episode_id === episode.id && q.trigger_type === 'barrier' && q.state !== 'resolved');
  const interpreter = config.practice.barrier_resources.interpreter ? 'yes' : 'not yet confirmed';
  const babyLine = suppressed.has('infant') ? 'visit.prep.interpreter' : 'visit.prep.bring_baby_interpreter';
  const referrals = Object.values(state.referrals).filter((r) => r.episode_id === episode.id);

  return (
    <PatientFrame title="Your plan">
      <p className="small muted">In plain words: what is next, what each item is for, and what to bring. Every explanation comes from your care team's approved materials.</p>

      <h2>Visits</h2>
      {visits.length === 0 && <p className="muted">No visits scheduled yet.</p>}
      {visits.map((v) => (
        <Card key={v.id} title={v.type === 'early_postpartum' ? 'Early postpartum visit' : v.type === 'comprehensive' ? 'Comprehensive visit' : 'Visit'} aside={<Chip variant={v.state === 'completed' ? 'accent' : v.state === 'scheduled' ? 'neutral' : 'warning'}>{v.state}</Chip>}>
          <p><strong>{fmt(v.scheduled_for)}</strong></p>
          <p>{v.purpose}</p>
          <p className="small"><strong>Bring:</strong> {v.bring.join('; ')}</p>
          <T id={babyLine} vars={{ interpreter_available: interpreter }} className="small" />
        </Card>
      ))}

      <SavedQuestions episode={episode} />

      {barriers.length > 0 && (
        <Card title="Getting to care">
          {barriers.map((b) => {
            const key = /barrier: (\w+)/.exec(b.note ?? '')?.[1] ?? 'this';
            const resource = config.practice.barrier_resources[key] ?? null;
            return resource ? (
              <p key={b.id}>{resource}</p>
            ) : (
              <T key={b.id} id="barrier.resource.not_provided" vars={{ barrier: BARRIER_LABELS[key] ?? key }} />
            );
          })}
          <DemoNote label="FR-36a">A barrier answer created one typed Follow-through item that closes only with an outcome; the resource item reads NOT YET PROVIDED until the practice supplies one.</DemoNote>
        </Card>
      )}

      {referrals.length > 0 && (
        <Card title="Referrals">
          {referrals.map((r) => (
            <p key={r.id} className="small">
              {config.practice.referral_partners.find((p) => p.id === r.partner_id)?.name ?? r.partner_id}: {r.state.replace(/_/g, ' ')}
              {r.state === 'appointment_completed' ? ' (appointment happened)' : r.state === 'sent_to_partner' ? ' (sent; not yet an appointment)' : ''}
            </p>
          ))}
        </Card>
      )}

      <h2>Plan items</h2>
      {items.length === 0 && <p className="muted">No plan items to show.</p>}
      {items.map((i) => <CarePlanItemCard key={i.id} item={i} />)}
      <DemoNote label="FR-19 / AI-01 / AI-13">
        Every explanation shows its content id and version. "Show a plain-language version" serves a canned rewording (ai_enabled is {String(config.freetext.ai_enabled)}) with the patient label; the label is for clarity, not a safeguard. {suppressed.size > 0 ? `Suppressed tags in force: ${[...suppressed].join(', ')}.` : ''}
        {content.manifestHash ? ` Content manifest ${content.manifestHash}.` : ''}
      </DemoNote>
      <Button block to="/p">Back to home</Button>
    </PatientFrame>
  );
}
