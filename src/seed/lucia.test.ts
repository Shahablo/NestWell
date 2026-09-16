/** 6.6 Lucía: the blocked-enrollment branch and the second branch (FR-01, FR-50, FR-63, FR-63a). */
import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../domain/metrics';
import { safetyClassStatus } from '../domain/services/enrollment';
import { SCENARIO_BRANCHES } from './index';
import { LOADED, checkinsFor, episodeFor, itemsFor, opening, seedStore, stateAt, t } from './seedTest';

const P = 'pt-lucia';
const spanish = safetyClassStatus(LOADED.content, 'es');

describe('6.6 Lucía — blocked branch', () => {
  const store = seedStore('lucia_blocked');

  it('enrollment captures Spanish; eligibility is not_offered with reason language_content_unavailable; she counts in the denominator', () => {
    const state = stateAt(store, opening(store));
    expect(state.patients[P]).toMatchObject({ is_adult: true, insurance_type: 'medicaid', access_barriers: ['interpreter'] });
    expect(state.patients[P].preferences).toMatchObject({ locale: 'es', formality: 'usted' });
    expect(state.eligibility[P]).toMatchObject({ status: 'not_offered', reason: 'language_content_unavailable' });
    expect(Object.values(state.episodes).filter((e) => e.patient_id === P)).toHaveLength(0);
    const m = computeMetrics(state, store.getEvents(), LOADED.config);
    expect(m.eligible).toBe(1);
    expect(m.enrollment).toEqual({ numerator: 0, denominator: 1, rate: 0 });
    expect(Object.keys(m.breakdowns.locale)).toContain('es');
    expect(m.breakdowns.locale.es.enrollment.denominator).toBe(1);
  });

  it('a human-only outreach item flagged "interpreter or Spanish-speaking staff needed" exists and closes only with an outcome', () => {
    const state = stateAt(store, opening(store));
    const items = Object.values(state.queueItems).filter((q) => q.patient_id === P);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ queue_key: 'follow_through', state: 'open', episode_id: `no-episode:${P}` });
    expect(items[0].note).toContain('interpreter or Spanish-speaking staff needed');
    const later = stateAt(store, t('2026-04-17', 11, 0));
    const item = Object.values(later.queueItems).find((q) => q.patient_id === P)!;
    expect(item.state).toBe('resolved');
    expect(item.outcome).toContain('interpreter');
    expect(later.staffTime.filter((s) => s.episode_id === item.episode_id).map((s) => s.minutes)).toEqual([20]);
  });

  it('the branch description states how the block was produced against the content index in force', () => {
    const description = SCENARIO_BRANCHES.lucia_blocked.description;
    if (spanish.ok) expect(description).toContain('placeholder translation');
    else expect(description).toContain('registerPatient blocks');
    // The safety-critical class the content report lists is the one the enrollment service checks (FR-63a).
    expect(spanish.missing.every((id) => !LOADED.content.byId.has(`${id}::es`) || LOADED.content.get(id, 'es')?.status !== 'approved')).toBe(true);
  });
});

describe('6.6 Lucía — second branch (enrolled once the Spanish class is approved)', () => {
  const store = seedStore('lucia_enrolled');

  it('enrolls when the class is approved in the content index, otherwise stays blocked with the reason in the branch description', () => {
    const state = stateAt(store, opening(store));
    if (!spanish.ok) {
      expect(SCENARIO_BRANCHES.lucia_enrolled.description).toContain('BLOCKED');
      expect(state.eligibility[P]).toMatchObject({ status: 'not_offered', reason: 'language_content_unavailable' });
      return;
    }
    expect(SCENARIO_BRANCHES.lucia_enrolled.description).toContain('approved');
    expect(state.eligibility[P].status).toBe('enrolled');
    const ep = episodeFor(state, P);
    expect(ep.enrolled_by).toBe('staff');
    expect(checkinsFor(state, ep.id)).toHaveLength(7);
    expect(checkinsFor(state, ep.id)[0].state).toBe('completed');
    expect(itemsFor(state, ep.id).map((q) => [q.trigger_type, q.state])).toEqual([['barrier', 'open']]);
    expect(itemsFor(state, ep.id)[0].note).toContain('interpreter');
    // Safety-critical items exist in Spanish; ordinary check-in items fall back to English with the FR-63 marker.
    expect(LOADED.content.fellBack('emergency_instruction', 'es')).toBe(false);
    expect(LOADED.content.fellBack('checkin.day03.title', 'es')).toBe(true);
    expect(LOADED.content.get('emergency_instruction', 'es')?.locale).toBe('es');
    const end = stateAt(store, t('2026-07-09', 12, 0));
    expect(episodeFor(end, P).status).toBe('completed');
    expect(Object.values(end.summaries).filter((s) => s.episode_id === ep.id).every((s) => s.narrative === LOADED.config.ai_exemplars.summary_narrative[`lucia:${s.period}`])).toBe(true);
  });
});
