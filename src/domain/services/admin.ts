/** Admin and incident commands (SR-16, FR-47, FR-51). */
import type { AnyEvent, Command, Id, IncidentType } from '../types';
import { DomainError } from './errors';
import { requireEpisode } from './shared';

function reporter(ctx: Parameters<Command>[0]): string {
  return ctx.actor.id ?? ctx.actor.role ?? ctx.actor.type;
}

export function recordIncident(input: { type: IncidentType; description: string; related_entity?: string | null; related_id?: Id | null }): Command {
  return (ctx) => [
    ctx.makeEvent('incident_recorded', { incident_id: ctx.nextId('inc'), type: input.type, related_entity: input.related_entity ?? null, related_id: input.related_id ?? null, reported_by: reporter(ctx), description: input.description }),
  ];
}

export function resolveIncident(input: { incident_id: Id; resolution: string }): Command {
  return (ctx) => {
    const inc = ctx.state.incidents[input.incident_id];
    if (!inc) throw new DomainError('unknown_incident', `Unknown incident ${input.incident_id}`);
    if (inc.resolved_at !== null) throw new DomainError('incident_resolved', 'Incident already resolved');
    return [ctx.makeEvent('incident_resolved', { incident_id: inc.id, resolution: input.resolution })];
  };
}

export function recordPracticeSetupMinutes(input: { minutes: number }): Command {
  return (ctx) => {
    if (!Number.isFinite(input.minutes) || input.minutes < 0) throw new DomainError('bad_minutes', 'Minutes must be a non-negative number');
    return [ctx.makeEvent('practice_setup_minutes_recorded', { minutes: input.minutes, recorded_by: reporter(ctx) })];
  };
}

/** SR-16 / FR-51: a false-reassurance report is both a metric event and an incident. */
export function reportFalseReassurance(input: { episode_id?: Id | null; source: 'content' | 'ai'; content_id?: string | null; ai_interaction_id?: Id | null; note?: string | null }): Command {
  return (ctx) => {
    const ep = input.episode_id ? requireEpisode(ctx, input.episode_id) : null;
    const opts = { patient_id: ep?.patient_id ?? null, episode_id: ep?.id ?? null };
    const events: AnyEvent[] = [
      ctx.makeEvent('false_reassurance_reported', { episode_id: ep?.id ?? null, source: input.source, content_id: input.content_id ?? null, ai_interaction_id: input.ai_interaction_id ?? null, reported_by: reporter(ctx), note: input.note ?? null }, opts),
      ctx.makeEvent('incident_recorded', { incident_id: ctx.nextId('inc'), type: 'false_reassurance', related_entity: input.source === 'ai' ? 'ai_interaction' : 'content_item', related_id: input.ai_interaction_id ?? input.content_id ?? null, reported_by: reporter(ctx), description: input.note ?? `false reassurance reported (${input.source})` }, opts),
    ];
    return events;
  };
}

export function recordMissedEscalation(input: { episode_id: Id; related_entity: string; related_id: Id; reason: string }): Command {
  return (ctx) => {
    const ep = requireEpisode(ctx, input.episode_id);
    const opts = { patient_id: ep.patient_id, episode_id: ep.id };
    const flagged_by = reporter(ctx);
    return [
      ctx.makeEvent('missed_escalation_recorded', { missed_escalation_id: ctx.nextId('me'), episode_id: ep.id, related_entity: input.related_entity, related_id: input.related_id, flagged_by, reason: input.reason }, opts),
      ctx.makeEvent('incident_recorded', { incident_id: ctx.nextId('inc'), type: 'missed_escalation', related_entity: input.related_entity, related_id: input.related_id, reported_by: flagged_by, description: input.reason }, opts),
    ];
  };
}
