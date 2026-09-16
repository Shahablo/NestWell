/**
 * FR-20 saved questions: entered under FR-17 (locked instruction beside the field, one Needs-review
 * item on entry in the same command, an Urgent item instead on a lexicon match when the scan is on),
 * listed in her order, and optionally grouped by the canned AI-03 organizer with the AI-13 label.
 * A question that matched the lexicon is never sent to the organizer and keeps its original text.
 */
import { useState } from 'react';
import { organizeQuestionsResult, type OrganizeResult } from '../../domain/services/ai';
import { addSavedQuestion } from '../../domain/services/freetext';
import type { Command, Episode } from '../../domain/types';
import { Button, Card, Chip, DemoNote, LockedContent } from '../components';
import { FreeTextField } from './FreeTextField';
import { ErrorNotice, T } from './PatientFrame';
import { ackTargetFor, usePatient } from './usePatient';

export function SavedQuestions({ episode }: { episode: Episode }) {
  const { state, config, clock, run, locale, contactVars, demoParticipantMode, fmt } = usePatient();
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showEmergency, setShowEmergency] = useState(false);
  const [lastRouted, setLastRouted] = useState<'urgent' | 'needs_review' | null>(null);
  const [organized, setOrganized] = useState<OrganizeResult | null>(null);

  const questions = Object.values(state.savedQuestions).filter((q) => q.episode_id === episode.id).sort((a, b) => a.order - b.order);
  const target = ackTargetFor(config, 'needs_review', clock);

  const add = () => {
    if (draft.trim() === '') return;
    const r = run(addSavedQuestion({ episode_id: episode.id, text: draft.trim() }));
    setError(r.error);
    if (r.error) return;
    const urgent = r.events.some((e) => e.type === 'emergency_instruction_shown' && e.payload.layout === 'full_screen');
    setShowEmergency(urgent);
    setLastRouted(urgent ? 'urgent' : 'needs_review');
    setDraft('');
  };

  const organize = () => {
    let captured: OrganizeResult | null = null;
    const cmd: Command = (ctx) => {
      captured = organizeQuestionsResult(ctx, { episode_id: episode.id });
      return captured.events;
    };
    const r = run(cmd);
    setError(r.error);
    if (!r.error) setOrganized(captured);
  };

  const groups = new Map<string, typeof questions>();
  for (const q of questions) {
    const key = q.lexicon_match ? '' : q.group_title ?? '';
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  const grouped = questions.some((q) => q.group_title !== null);

  return (
    <Card title="Questions for your visit">
      {showEmergency && (
        <LockedContent id="emergency_instruction" layout="full_screen" locale={locale} vars={{ after_hours_phone: contactVars.after_hours_phone }} onClose={() => setShowEmergency(false)} />
      )}
      <ErrorNotice error={error} />
      {questions.length === 0 ? (
        <p className="muted">No saved questions yet. Write down anything you want to ask at your visit.</p>
      ) : (
        <div className="stack-sm">
          {[...groups.entries()].map(([title, qs]) => (
            <div key={title || '(ungrouped)'}>
              {title && grouped && (
                <div className="row">
                  <strong>{title}</strong>
                  <Chip variant="ai">grouped from your care team's materials</Chip>
                </div>
              )}
              <ol>
                {qs.map((q) => (
                  <li key={q.id}>
                    {q.text}
                    {q.lexicon_match && <span className="small muted"> (kept as written; a nurse was alerted)</span>}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {grouped && <T id="ai.patient_label" vars={{ after_hours_phone: contactVars.after_hours_phone }} className="small ai-label" />}
        </div>
      )}
      {lastRouted && (
        <LockedContent
          id="closing.pending"
          layout="inline"
          locale={locale}
          vars={{ pending_what: 'Your question', target_time: target ? fmt(target) : 'the next coverage window', phone: contactVars.contact_phone }}
        />
      )}
      <div style={{ marginTop: 'var(--space-3)' }}>
        <FreeTextField label="Add a question" value={draft} onChange={setDraft} rows={3} />
      </div>
      <div className="card-actions">
        {!demoParticipantMode && <Button variant="primary" size="lg" onClick={add} disabled={draft.trim() === ''}>Save question</Button>}
        {questions.length > 1 && !demoParticipantMode && <Button size="lg" onClick={organize}>Group my questions</Button>}
      </div>
      {organized && (
        <p className="small muted">
          Grouped into {organized.groups.length} group{organized.groups.length === 1 ? '' : 's'}{organized.fallback ? ' using the generic fallback' : ''}. Nothing was answered or reordered by importance.
          {organized.excluded_question_ids.length > 0 && ` ${organized.excluded_question_ids.length} flagged question(s) were never sent to the organizer.`}
        </p>
      )}
      <DemoNote label="FR-17 / FR-20 / AI-03">
        Each saved question creates a queue item on entry in the same command. Scan flag in force: {String(config.freetext.free_text_urgency_scan)}. Off: a lexicon term still reaches a clinician on the same-business-day target and the crisis line is beside the field. On: the same input renders the full-screen instruction and creates one Urgent item. The organizer is canned (AI-21) and never sees a flagged question.
      </DemoNote>
    </Card>
  );
}
