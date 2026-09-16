/**
 * FR-46 twelve-week timeline for one episode: check-ins with states, screens through
 * visibleScreenFor, assessments, referrals, contacts, visits, callbacks, queue items, sensitive
 * statuses and summaries, grouped by week from the delivery date. Free text and item responses
 * appear only after a recorded reveal (FR-03a).
 */
import { useMemo, useState } from 'react';
import { dayLabel, toMs } from '../../domain/clock';
import type { Episode, ISO } from '../../domain/types';
import { Chip, Timeline, type TimelineEntry } from '../components';
import { useApp } from '../shell/useApp';
import { usePractice } from '../shell/usePractice';
import { episodeDay, instrumentShortName, responseLabel } from './episodeHelpers';
import { CHECKIN_STATE_VARIANT, QUEUE_STATE, REFERRAL_STATE_LABELS, SUBTYPE_LABELS, TRIGGER_LABELS, VISIT_STATE_LABELS, humanize } from './labels';
import { visibleScreenFor } from '../../domain/services';
import { splitRoutedNote } from '../../domain/services/freetext';
import { FreeTextReveal, ScreenResultView } from './ScreenResultView';
import { StaffName } from './StaffName';

type Kind = 'checkin' | 'screen' | 'assessment' | 'referral' | 'contact' | 'visit' | 'queue' | 'status' | 'summary' | 'callback';

const KIND_LABELS: Record<Kind, string> = {
  checkin: 'Check-ins', screen: 'Screens', assessment: 'Assessments', referral: 'Referrals', contact: 'Contacts', visit: 'Visits',
  queue: 'Queue items', status: 'Sensitive status', summary: 'Summaries', callback: 'Callbacks',
};

interface Entry extends TimelineEntry { at: ISO; kind: Kind }

export function PatientTimeline({ episode }: { episode: Episode }) {
  const { state, config, role } = useApp();
  const { fmt } = usePractice();
  const [hidden, setHidden] = useState<Set<Kind>>(new Set());
  const canReadFreeText = role === 'coordinator' || role === 'clinician';

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const ep = episode.id;
    for (const c of Object.values(state.checkins).filter((x) => x.episode_id === ep)) {
      const template = config.checkins[c.template_key];
      const title = config.checkins[c.template_key] ? config.checkins[c.template_key].key : c.template_key;
      out.push({
        id: `ci-${c.id}`, kind: 'checkin', at: c.scheduled_at, dateLabel: fmt(c.scheduled_at),
        tone: c.state === 'unopened' || c.state === 'skipped' ? 'warning' : c.state === 'completed' ? 'default' : 'muted',
        title: <span>{dayLabel(c.day_number)} check-in <span className="muted small">({title}, {c.set} set)</span> <Chip variant={CHECKIN_STATE_VARIANT[c.state]}>{humanize(c.state)}</Chip></span>,
        body: (
          <div className="small">
            <span className="muted">window closes {fmt(c.window_end_at)}</span>
            {c.opened_at && <span className="muted"> · opened {fmt(c.opened_at)}</span>}
            {c.submitted_at && <span className="muted"> · submitted {fmt(c.submitted_at)}</span>}
            {c.reminder_at && <span className="muted"> · reminder {c.reminder_suppressed_reason ? `suppressed (${humanize(c.reminder_suppressed_reason)})` : `at ${fmt(c.reminder_at)}`}</span>}
            {c.responses.length > 0 && (
              <ul className="responses">
                {c.responses.map((r) => (
                  <li key={r.question_key}>
                    <span>{template?.items.find((i) => i.key === r.question_key)?.key.replace(/_/g, ' ') ?? r.question_key}</span>
                    <span>
                      {r.value !== null ? responseLabel(config, c, r.question_key, r.value) : r.free_text ? '' : 'skipped'}
                      {r.free_text && (canReadFreeText ? <FreeTextReveal episode_id={ep} text={r.free_text} /> : <span className="muted">free text entered (not shown to this view)</span>)}
                      {r.lexicon_match && <Chip variant="danger" title="Term class and lexicon version only; matched text is never stored (FR-17)">lexicon match: {r.lexicon_match.term_class} (v{r.lexicon_match.version})</Chip>}
                      {r.queue_item_id && <span className="muted"> → item {r.queue_item_id}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      });
    }
    for (const s of Object.values(state.screens).filter((x) => x.episode_id === ep)) {
      // SR-14: the marker tone is a read of the result, so it goes through visibleScreenFor like every other read.
      const v = visibleScreenFor(state, s, role);
      out.push({ id: `sc-${s.id}`, kind: 'screen', at: s.administered_at, dateLabel: fmt(s.administered_at), tone: !v.visible ? 'muted' : v.critical_item_hit ? 'danger' : v.positive ? 'warning' : 'default', title: `Screen: ${instrumentShortName(config, s.instrument_key)}`, body: <ScreenResultView screen={s} /> });
    }
    for (const a of Object.values(state.assessments).filter((x) => x.episode_id === ep)) {
      out.push({ id: `as-${a.id}`, kind: 'assessment', at: a.recorded_at, dateLabel: fmt(a.recorded_at), title: <span>Assessment: {humanize(a.outcome)}</span>, body: <div className="small">by <StaffName id={a.clinician_id} />{a.screen_result_id ? ` · linked screen ${a.screen_result_id}` : ''}{a.note ? ` · ${a.note}` : ''}</div> });
    }
    for (const r of Object.values(state.referrals).filter((x) => x.episode_id === ep)) {
      const partner = config.practice.referral_partners.find((p) => p.id === r.partner_id);
      for (const h of r.history) {
        out.push({
          id: `rf-${r.id}-${h.at}-${h.state}`, kind: 'referral', at: h.at, dateLabel: fmt(h.at),
          tone: h.state === 'appointment_completed' ? 'default' : ['appointment_missed', 'no_capacity', 'not_covered', 'declined_by_patient'].includes(h.state) ? 'warning' : 'muted',
          title: <span>Referral to {partner?.name ?? r.partner_id}: {REFERRAL_STATE_LABELS[h.state]}</span>,
          body: <div className="small">{h.note ?? ''}{h.state === 'created' ? ` reason: ${r.reason}` : ''}{r.coverage_status === 'not_covered' ? ' · insurance not accepted' : ''}</div>,
        });
      }
    }
    for (const c of Object.values(state.contacts).filter((x) => x.episode_id === ep)) {
      out.push({ id: `ct-${c.id}`, kind: 'contact', at: c.occurred_at, dateLabel: fmt(c.occurred_at), title: <span>Contact: {humanize(c.type)} (day {c.day_number})</span>, body: <div className="small">by <StaffName id={c.staff_user_id} /> · {c.outcome}{c.note ? ` · ${c.note}` : ''}</div> });
    }
    for (const v of Object.values(state.visits).filter((x) => x.episode_id === ep || x.patient_id === episode.patient_id)) {
      out.push({ id: `vi-${v.id}`, kind: 'visit', at: v.scheduled_for, dateLabel: fmt(v.scheduled_for), tone: v.state === 'completed' ? 'default' : v.state === 'scheduled' ? 'muted' : 'warning', title: <span>{humanize(v.type)} visit: {VISIT_STATE_LABELS[v.state]}</span>, body: <div className="small">{v.purpose}{v.completed_at ? ` · completed ${fmt(v.completed_at)}` : ''}</div> });
    }
    for (const cb of Object.values(state.callbacks).filter((x) => x.episode_id === ep)) {
      out.push({ id: `cb-${cb.id}`, kind: 'callback', at: cb.requested_at, dateLabel: fmt(cb.requested_at), tone: cb.occurred === null ? 'warning' : 'default', title: 'Callback requested', body: <div className="small">{cb.preferred_window ? `window ${cb.preferred_window} · ` : ''}{cb.occurred === null ? 'pending' : cb.occurred ? `completed: ${cb.outcome}` : `not completed: ${cb.outcome}`}</div> });
    }
    for (const q of Object.values(state.queueItems).filter((x) => x.episode_id === ep)) {
      const st = QUEUE_STATE[q.state];
      // FR-17: free text carried on the item (usefulness comment, sensitive-preferences note) is shown only after a recorded read.
      const note = splitRoutedNote(q.note);
      out.push({ id: `qi-${q.id}`, kind: 'queue', at: q.created_at, dateLabel: fmt(q.created_at), tone: q.state === 'unowned' ? 'danger' : q.state === 'resolved' ? 'muted' : 'warning', title: <span>{config.queues.find((d) => d.key === q.queue_key)?.label ?? q.queue_key} item: {TRIGGER_LABELS[q.trigger_type] ?? humanize(q.trigger_type)} <Chip variant={st.variant}>{st.label}</Chip></span>, body: <div className="small">{note.summary ?? ''}{q.resolved_at ? ` · resolved ${fmt(q.resolved_at)}: ${q.outcome}` : ''}{note.text && (canReadFreeText ? <FreeTextReveal episode_id={ep} text={note.text} label="her note" /> : <span className="muted"> · free text entered (not shown to this view)</span>)}</div> });
    }
    for (const s of state.sensitiveStatuses.filter((x) => x.episode_id === ep)) {
      out.push({ id: `ss-${s.subtype}-${s.set_at}`, kind: 'status', at: s.set_at, dateLabel: fmt(s.set_at), tone: 'warning', title: `Sensitive status set: ${SUBTYPE_LABELS[s.subtype]}`, body: <div className="small">set by {s.set_by}{s.confirmed_by_staff ? ' · confirmed by staff' : ' · not yet confirmed'}</div> });
      if (s.lifted_at) out.push({ id: `sl-${s.subtype}-${s.lifted_at}`, kind: 'status', at: s.lifted_at, dateLabel: fmt(s.lifted_at), tone: 'muted', title: `Sensitive status lifted: ${SUBTYPE_LABELS[s.subtype]}`, body: <div className="small">by {s.lifted_by} · {s.lift_reason}</div> });
    }
    for (const sm of Object.values(state.summaries).filter((x) => x.episode_id === ep)) {
      out.push({ id: `sm-${sm.id}`, kind: 'summary', at: sm.created_at, dateLabel: fmt(sm.created_at), tone: 'muted', title: <span>Summary ({sm.period}): {sm.state}</span>, body: <div className="small"><a href={`#/practice/summaries/${sm.id}`}>open</a></div> });
    }
    return out.sort((a, b) => toMs(a.at) - toMs(b.at) || a.id.localeCompare(b.id));
  }, [state, config, episode, fmt, canReadFreeText]);

  const visible = entries.filter((e) => !hidden.has(e.kind));
  const groups = new Map<string, Entry[]>();
  for (const e of visible) {
    const day = episodeDay(episode, e.at);
    const key = day === null ? 'Undated' : day < 0 ? 'Before delivery' : `Week ${Math.floor(day / 7)}`;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const toggle = (k: Kind) => setHidden((h) => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  return (
    <div className="stack">
      <div className="filter-chips" role="group" aria-label="Timeline filters">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <button key={k} type="button" className="filter-chip" aria-pressed={!hidden.has(k)} onClick={() => toggle(k)}>{KIND_LABELS[k]} ({entries.filter((e) => e.kind === k).length})</button>
        ))}
      </div>
      {visible.length === 0 && <p className="muted">Nothing on the timeline at this clock.</p>}
      {[...groups.entries()].map(([label, list]) => (
        <div key={label}>
          <div className="week-heading">{label}</div>
          <Timeline entries={list} />
        </div>
      ))}
    </div>
  );
}
