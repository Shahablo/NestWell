/** Admin logs: stored events, derived events, incidents and AI interactions (SR-13, SR-16, NFR-07). */
import { useMemo, useState } from 'react';
import { useApp } from '../shell/useApp';
import type { Actor, AnyEvent } from '../../domain/types';
import { Button, Card, Chip, DemoNote, EmptyState, Field } from '../components';
import { usePractice } from '../shell/usePractice';

type Tab = 'events' | 'derived' | 'incidents' | 'ai';
const PAGE = 200;

function actorLabel(a: Actor): string {
  return [a.type, a.role && a.role !== a.type ? a.role : null, a.id ? `(${a.id})` : null].filter(Boolean).join(' ');
}

function EventRow({ e, fmt }: { e: AnyEvent; fmt: (iso: string) => string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr>
        <td><code>{e.type}</code>{e.client_reported && <> <Chip variant="neutral">client</Chip></>}</td>
        <td style={{ whiteSpace: 'nowrap' }}>{fmt(e.occurred_at)}</td>
        <td>{actorLabel(e.actor)}</td>
        <td>
          {e.patient_id && <div><code>{e.patient_id}</code></div>}
          {e.episode_id && <div><code>{e.episode_id}</code></div>}
          {!e.patient_id && !e.episode_id && <span className="muted">—</span>}
        </td>
        <td><Button size="sm" variant="quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? 'Hide JSON' : 'JSON'}</Button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}><pre className="admin-json">{JSON.stringify(e, null, 2)}</pre></td>
        </tr>
      )}
    </>
  );
}

export function LogsPage() {
  const { events, state, config } = useApp();
  const { formatDateTime, staffName } = usePractice();
  const [tab, setTab] = useState<Tab>('events');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);

  const eventTypes = useMemo(() => [...new Set(events.map((e) => e.type))].sort(), [events]);
  const derivedTypes = useMemo(() => [...new Set(state.derivedEvents.map((e) => e.type))].sort(), [state.derivedEvents]);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events
      .filter((e) => (!type || e.type === type) && (!q || `${e.patient_id ?? ''} ${e.episode_id ?? ''} ${e.id} ${actorLabel(e.actor)}`.toLowerCase().includes(q)))
      .slice()
      .reverse();
  }, [events, type, search]);

  const filteredDerived = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.derivedEvents
      .filter((e) => (!type || e.type === type) && (!q || `${e.patient_id ?? ''} ${e.episode_id ?? ''} ${e.related_id ?? ''}`.toLowerCase().includes(q)))
      .slice()
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }, [state.derivedEvents, type, search]);

  const incidents = useMemo(() => Object.values(state.incidents).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [state.incidents]);
  const ai = useMemo(() => Object.values(state.aiInteractions).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)), [state.aiInteractions]);

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'events', label: 'Event log', count: events.length },
    { key: 'derived', label: 'Derived events', count: state.derivedEvents.length },
    { key: 'incidents', label: 'Incidents', count: incidents.length },
    { key: 'ai', label: 'AI interactions', count: ai.length },
  ];

  const switchTab = (t: Tab) => {
    setTab(t);
    setType('');
    setShowAll(false);
  };

  const typeOptions = tab === 'events' ? eventTypes : tab === 'derived' ? derivedTypes : [];

  return (
    <div className="stack">
      <h1>Logs</h1>
      <DemoNote>The event log is append-only and is the only source of truth (SR-13). Derived events are computed from the clock and never stored; move the clock backwards and they disappear.</DemoNote>

      <div className="admin-tabs" role="tablist" aria-label="Log views">
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" className="admin-tab" aria-selected={tab === t.key} onClick={() => switchTab(t.key)}>
            {t.label} <span className="muted">({t.count})</span>
          </button>
        ))}
      </div>

      {(tab === 'events' || tab === 'derived') && (
        <div className="admin-toolbar">
          <Field label="Type" htmlFor="log-type" className="grow" >
            <select id="log-type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Search id / patient / episode" htmlFor="log-search" className="grow">
            <input id="log-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. ep-00001" />
          </Field>
        </div>
      )}

      {tab === 'events' && (
        <Card title={`Stored events (${filteredEvents.length}${type || search ? ' matching' : ''})`}>
          {filteredEvents.length === 0 ? <EmptyState title="No events" body="Nothing in the log matches this filter." /> : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Type</th><th>Occurred at</th><th>Actor</th><th>Patient / episode</th><th /></tr>
                </thead>
                <tbody>
                  {(showAll ? filteredEvents : filteredEvents.slice(0, PAGE)).map((e) => <EventRow key={e.id} e={e} fmt={(iso) => formatDateTime(iso)} />)}
                </tbody>
              </table>
            </div>
          )}
          {!showAll && filteredEvents.length > PAGE && (
            <div className="card-actions"><Button onClick={() => setShowAll(true)}>Show all {filteredEvents.length}</Button></div>
          )}
        </Card>
      )}

      {tab === 'derived' && (
        <Card title={`Derived events at the current clock (${filteredDerived.length})`}>
          {filteredDerived.length === 0 ? <EmptyState title="No derived events" body="Nothing is derived at this clock with this filter." /> : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Type</th><th>Occurred at</th><th>Patient / episode</th><th>Related</th><th>Attributes</th></tr>
                </thead>
                <tbody>
                  {(showAll ? filteredDerived : filteredDerived.slice(0, PAGE)).map((e, i) => (
                    <tr key={`${e.type}-${e.occurred_at}-${e.related_id ?? i}`}>
                      <td><code>{e.type}</code></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(e.occurred_at)}</td>
                      <td>{e.patient_id && <div><code>{e.patient_id}</code></div>}{e.episode_id && <div><code>{e.episode_id}</code></div>}</td>
                      <td>{e.related_id ? <code>{e.related_id}</code> : '—'}</td>
                      <td><code className="small">{JSON.stringify(e.attributes)}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!showAll && filteredDerived.length > PAGE && (
            <div className="card-actions"><Button onClick={() => setShowAll(true)}>Show all {filteredDerived.length}</Button></div>
          )}
        </Card>
      )}

      {tab === 'incidents' && (
        <Card title="Incident record (SR-16)">
          {incidents.length === 0 ? <EmptyState title="No incidents recorded" /> : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Id</th><th>Type</th><th>Occurred at</th><th>Reported by</th><th>Related</th><th>Description</th><th>Resolution</th></tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => (
                    <tr key={inc.id}>
                      <td><code>{inc.id}</code></td>
                      <td><Chip variant={inc.resolved_at ? 'neutral' : 'danger'}>{inc.type}</Chip></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(inc.occurred_at)}</td>
                      <td>{inc.reported_by}</td>
                      <td>{inc.related_entity ? <code>{inc.related_entity}{inc.related_id ? ` ${inc.related_id}` : ''}</code> : '—'}</td>
                      <td>{inc.description}</td>
                      <td>{inc.resolved_at ? <>{inc.resolution} <span className="muted small">({formatDateTime(inc.resolved_at)})</span></> : <Chip variant="warning">open</Chip>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'ai' && (
        <Card title="AI interaction log (AI-20, AI-21)">
          <p className="muted small">Live AI is {config.freetext.ai_enabled ? 'enabled' : 'off — every interaction below came from the canned exemplar store'}. Prompts never contain free text, answers or scores (AI-01).</p>
          {ai.length === 0 ? <EmptyState title="No AI interactions" body="The log is empty for this branch at this clock." /> : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr><th>Id</th><th>Feature</th><th>Occurred at</th><th>Episode</th><th>Content ids</th><th>Prefilter</th><th>Postfilter</th><th>Fallback</th><th>Blocked reason</th><th>Model</th></tr>
                </thead>
                <tbody>
                  {ai.map((x) => (
                    <tr key={x.id}>
                      <td><code>{x.id}</code></td>
                      <td><Chip variant="ai">{x.feature}</Chip></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(x.occurred_at)}</td>
                      <td>{x.episode_id ? <code>{x.episode_id}</code> : '—'}</td>
                      <td>{x.content_ids.length ? x.content_ids.map((c) => <div key={c}><code>{c}</code></div>) : '—'}</td>
                      <td>{x.prefilter_result}</td>
                      <td>{x.postfilter_result}</td>
                      <td>{x.fallback_used ? 'yes' : 'no'}</td>
                      <td>{x.blocked_reason ?? '—'}</td>
                      <td>{x.model_id ?? <span className="muted">none</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'incidents' && state.missedEscalations.length > 0 && (
        <Card title="Escalations flagged by a clinician as not caught (FR-45)">
          <div className="table-scroll">
            <table>
              <thead><tr><th>Id</th><th>Episode</th><th>Related</th><th>Flagged by</th><th>Reason</th><th>Occurred at</th></tr></thead>
              <tbody>
                {state.missedEscalations.map((m) => (
                  <tr key={m.id}>
                    <td><code>{m.id}</code></td>
                    <td><code>{m.episode_id}</code></td>
                    <td><code>{m.related_entity} {m.related_id}</code></td>
                    <td>{staffName(m.flagged_by)}</td>
                    <td>{m.reason}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.occurred_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
