import { describe, expect, it } from 'vitest';
import {
  CHECKIN_SET_FOR_SUBTYPE, SUPPRESSION_MATRIX, checkinSetFor, checkinStateAt, coverageDeadline, isInsideCoverage, nextCoverageStart, queueTimersFor,
  suppressionFor, unreachedItemsFor, type PauseInterval,
} from './derive';
import { makeTestConfig, TZ } from './testutil';
import type { SensitiveStatus } from './types';

const config = makeTestConfig();
const urgent = config.queues.find((q) => q.key === 'urgent')!;

describe('coverage schedule', () => {
  it('knows the 9–17 weekday window in the practice timezone', () => {
    expect(isInsideCoverage('2026-04-14T13:00:00.000Z', config.coverage, TZ)).toBe(true); // Tue 9:00 EDT
    expect(isInsideCoverage('2026-04-14T21:00:00.000Z', config.coverage, TZ)).toBe(false); // Tue 17:00 EDT (end is exclusive)
    expect(isInsideCoverage('2026-04-18T15:00:00.000Z', config.coverage, TZ)).toBe(false); // Saturday
    expect(nextCoverageStart('2026-04-17T23:30:00.000Z', config.coverage, TZ)).toBe('2026-04-20T13:00:00.000Z'); // Fri 7:30 pm → Mon 9:00
  });
});

describe('queue timers (FR-25)', () => {
  const created = '2026-04-14T23:00:00.000Z'; // Tuesday 7 p.m. EDT
  const item = { created_at: created, acknowledged_at: null, resolved_at: null, open_clinical_flag: false };

  it('wall basis, 30/30: escalated and UNOWNED at 7:30 p.m., so UNOWNED by 8 p.m.', () => {
    const at730 = queueTimersFor(item, urgent, config.coverage, TZ, '2026-04-14T23:30:00.000Z');
    expect(at730.ack_target_at).toBe('2026-04-14T23:30:00.000Z');
    expect(at730.backup_target_at).toBe('2026-04-14T23:30:00.000Z');
    expect(at730.state).toBe('unowned');
    expect(at730.escalated_at).toBe('2026-04-14T23:30:00.000Z');
    expect(at730.unowned_at).toBe('2026-04-14T23:30:00.000Z');
    expect(queueTimersFor(item, urgent, config.coverage, TZ, '2026-04-15T00:00:00.000Z').state).toBe('unowned');
    expect(queueTimersFor(item, urgent, config.coverage, TZ, '2026-04-14T23:29:00.000Z').state).toBe('open');
  });

  it('coverage_hours basis: UNOWNED at 9:00 a.m. on the next business day', () => {
    const def = { ...urgent, timer_basis: 'coverage_hours' as const };
    const before = queueTimersFor(item, def, config.coverage, TZ, '2026-04-15T12:59:00.000Z');
    expect(before.ack_target_at).toBe('2026-04-15T13:00:00.000Z');
    expect(before.backup_target_at).toBe('2026-04-15T13:00:00.000Z');
    expect(before.state).toBe('open');
    const at9 = queueTimersFor(item, def, config.coverage, TZ, '2026-04-15T13:00:00.000Z');
    expect(at9.state).toBe('unowned');
    expect(at9.unowned_at).toBe('2026-04-15T13:00:00.000Z');
    // Friday evening rolls to Monday.
    expect(coverageDeadline('2026-04-17T23:00:00.000Z', 30, config.coverage.filter((c) => c.queue_key === 'urgent'), TZ)).toBe('2026-04-20T13:00:00.000Z');
  });

  it('acknowledgment before the target never escalates; after it records the escalation', () => {
    const acked = queueTimersFor({ ...item, acknowledged_at: '2026-04-14T23:10:00.000Z' }, urgent, config.coverage, TZ, '2026-04-15T10:00:00.000Z');
    expect(acked.state).toBe('acknowledged');
    expect(acked.escalated_at).toBeNull();
    expect(acked.minutes_to_ack).toBe(10);
    const late = queueTimersFor({ ...item, acknowledged_at: '2026-04-14T23:45:00.000Z' }, urgent, config.coverage, TZ, '2026-04-15T10:00:00.000Z');
    expect(late.state).toBe('acknowledged');
    expect(late.escalated_at).toBe('2026-04-14T23:30:00.000Z');
    expect(late.unowned_at).toBe('2026-04-14T23:30:00.000Z');
    expect(late.minutes_to_ack).toBe(45);
  });

  it('uses the shorter open-clinical target for flagged Unreached items', () => {
    const def = config.queues.find((q) => q.key === 'unreached')!;
    const flagged = queueTimersFor({ ...item, open_clinical_flag: true }, def, config.coverage, TZ, created);
    expect(flagged.ack_target_at).toBe('2026-04-15T03:00:00.000Z'); // 240 minutes
    const plain = queueTimersFor(item, def, config.coverage, TZ, created);
    expect(plain.ack_target_at).toBe('2026-04-15T23:00:00.000Z'); // 1440 minutes
  });

  it('an explicit acknowledgment deadline (FR-56) replaces the target; the backup follows by the queue delta', () => {
    const def = config.queues.find((q) => q.key === 'sensitive_review')!; // 1440 / 2880, wall
    const r = queueTimersFor({ ...item, ack_deadline_at: '2026-04-21T23:00:00.000Z' }, def, config.coverage, TZ, '2026-04-22T00:00:00.000Z');
    expect(r.ack_target_at).toBe('2026-04-21T23:00:00.000Z');
    expect(r.backup_target_at).toBe('2026-04-22T23:00:00.000Z');
    expect(r.state).toBe('escalated');
    expect(queueTimersFor({ ...item, ack_deadline_at: '2026-04-21T23:00:00.000Z' }, def, config.coverage, TZ, '2026-04-21T22:00:00.000Z').state).toBe('open');
  });
});

describe('check-in state (FR-08)', () => {
  const c = { scheduled_at: '2026-04-04T13:00:00.000Z', window_end_at: '2026-04-06T13:00:00.000Z', not_applicable: false, opened_at: null, submitted_at: null, complete: false, skipped_at: null };
  const ep = { pauses: [] as PauseInterval[], closed_at: null };
  it('walks scheduled → sent → unopened when nothing happens', () => {
    expect(checkinStateAt(c, ep, '2026-04-04T12:59:00.000Z')).toBe('scheduled');
    expect(checkinStateAt(c, ep, '2026-04-04T13:00:00.000Z')).toBe('sent');
    expect(checkinStateAt(c, ep, '2026-04-06T13:00:00.000Z')).toBe('unopened');
  });
  it('opened, partial, completed, skipped, paused, not_applicable', () => {
    expect(checkinStateAt({ ...c, opened_at: '2026-04-04T14:00:00.000Z' }, ep, '2026-04-05T00:00:00.000Z')).toBe('opened');
    expect(checkinStateAt({ ...c, opened_at: '2026-04-04T14:00:00.000Z' }, ep, '2026-04-07T00:00:00.000Z')).toBe('partial');
    expect(checkinStateAt({ ...c, submitted_at: '2026-04-04T14:00:00.000Z', complete: true }, ep, '2026-04-07T00:00:00.000Z')).toBe('completed');
    expect(checkinStateAt({ ...c, submitted_at: '2026-04-04T14:00:00.000Z', complete: false }, ep, '2026-04-07T00:00:00.000Z')).toBe('partial');
    expect(checkinStateAt({ ...c, skipped_at: '2026-04-04T14:00:00.000Z' }, ep, '2026-04-07T00:00:00.000Z')).toBe('skipped');
    expect(checkinStateAt(c, { ...ep, pauses: [{ from: '2026-04-03T00:00:00.000Z', until: null, resumed_at: null, actor: 'patient' }] }, '2026-04-07T00:00:00.000Z')).toBe('paused');
    expect(checkinStateAt({ ...c, not_applicable: true }, ep, '2026-04-07T00:00:00.000Z')).toBe('not_applicable');
    expect(checkinStateAt(c, { ...ep, closed_at: '2026-04-02T00:00:00.000Z' }, '2026-04-07T00:00:00.000Z')).toBe('not_applicable');
  });
  it('a check-in cut short by closure is not applicable; one that went unopened before closure stays unopened', () => {
    expect(checkinStateAt(c, { ...ep, closed_at: '2026-04-05T00:00:00.000Z' }, '2026-04-07T00:00:00.000Z')).toBe('not_applicable');
    expect(checkinStateAt(c, { ...ep, closed_at: '2026-04-05T00:00:00.000Z' }, '2026-04-05T12:00:00.000Z')).toBe('not_applicable');
    expect(checkinStateAt(c, { ...ep, closed_at: '2026-04-06T14:00:00.000Z' }, '2026-04-07T00:00:00.000Z')).toBe('unopened');
    expect(checkinStateAt({ ...c, opened_at: '2026-04-04T14:00:00.000Z' }, { ...ep, closed_at: '2026-04-05T00:00:00.000Z' }, '2026-04-07T00:00:00.000Z')).toBe('partial');
  });
});

describe('unreached walk (FR-13)', () => {
  const ci = (id: string, day: number, state: 'completed' | 'partial' | 'unopened' | 'skipped' | 'sent' | 'paused' | 'not_applicable') => ({
    id, scheduled_at: `2026-04-${String(day).padStart(2, '0')}T13:00:00.000Z`, window_end_at: `2026-04-${String(day + 2).padStart(2, '0')}T13:00:00.000Z`, state,
  });
  it('two consecutive unopened create exactly one item; a completed check-in resets the count', () => {
    const items = unreachedItemsFor('ep', [ci('a', 4, 'completed'), ci('b', 8, 'unopened'), ci('c', 15, 'completed'), ci('d', 22, 'unopened'), ci('e', 26, 'unopened')], [], [], 2, () => null);
    expect(items).toEqual([{ id: 'unreached:ep:e', checkin_id: 'e', created_at: '2026-04-28T13:00:00.000Z' }]);
  });
  it('a human contact between the two resets the count', () => {
    const items = unreachedItemsFor('ep', [ci('a', 4, 'unopened'), ci('b', 8, 'unopened')], [], ['2026-04-07T15:00:00.000Z'], 2, () => null);
    expect(items).toEqual([]);
  });
  it('a paused check-in is never a signal', () => {
    const pauses: PauseInterval[] = [{ from: '2026-04-05T00:00:00.000Z', until: '2026-04-20T00:00:00.000Z', resumed_at: null, actor: 'patient' }];
    expect(unreachedItemsFor('ep', [ci('a', 4, 'unopened'), ci('b', 8, 'paused'), ci('c', 15, 'paused')], pauses, [], 2, () => null)).toEqual([]);
  });
  it('a further skip while the item is open creates no second item; a new run after resolution does', () => {
    const list = [ci('a', 4, 'unopened'), ci('b', 8, 'unopened'), ci('c', 15, 'skipped'), ci('d', 22, 'skipped')];
    expect(unreachedItemsFor('ep', list, [], [], 2, () => null).map((i) => i.id)).toEqual(['unreached:ep:b']);
    const resolved = (id: string) => (id === 'unreached:ep:b' ? '2026-04-12T00:00:00.000Z' : null);
    expect(unreachedItemsFor('ep', list, [], [], 2, resolved).map((i) => i.id)).toEqual(['unreached:ep:b', 'unreached:ep:d']);
  });
});

describe('suppression matrix (FR-55)', () => {
  const st = (subtype: SensitiveStatus['subtype'], active = true): SensitiveStatus => ({ patient_id: 'p', episode_id: 'e', subtype, active, set_by: 'patient', set_at: '2026-04-02T00:00:00.000Z', lifted_by: null, lifted_at: null, lift_reason: null, confirmed_by_staff: false });
  it('enumerates the tags per subtype', () => {
    expect([...SUPPRESSION_MATRIX.stillbirth]).toEqual(['infant', 'feeding', 'milestone', 'celebration', 'newborn_visit', 'birth_story']);
    expect([...SUPPRESSION_MATRIX.nicu]).toEqual(['milestone', 'celebration']);
    expect([...SUPPRESSION_MATRIX.trauma]).toEqual(['celebration', 'birth_story', 'pregnancy_progress']);
    expect(CHECKIN_SET_FOR_SUBTYPE.neonatal_loss).toBe('loss');
  });
  it('unions active subtypes and picks loss > nicu > trauma; lifted statuses do not count', () => {
    expect([...suppressionFor([st('nicu'), st('trauma')])].sort()).toEqual(['birth_story', 'celebration', 'milestone', 'pregnancy_progress']);
    expect(checkinSetFor([st('trauma'), st('nicu')])).toBe('nicu');
    expect(checkinSetFor([st('trauma'), st('pregnancy_loss')])).toBe('loss');
    expect(checkinSetFor([st('pregnancy_loss', false)])).toBe('standard');
    expect(suppressionFor([st('pregnancy_loss', false)]).size).toBe(0);
  });
});
