/** Store-driven test flows shared by the domain unit tests (synthetic data only). */
import { addDays, addMinutes, atLocalHour } from './clock';
import type { NestWellStore } from './store';
import { enroll, registerPatient } from './services/enrollment';
import { submitCheckin, type SubmitResponse } from './services/checkins';
import { makePatient, TZ, type PatientOverrides } from './testutil';
import type { Actor, Checkin, DeliveryOutcome, EnrollmentPoint, Id, ISO, QueueItem, QueueKey } from './types';

export const DELIVERY: ISO = '2026-04-01T12:00:00.000Z';
export const ENROLL_AT: ISO = '2026-04-01T18:00:00.000Z';
export const COORD: Actor = { type: 'staff', role: 'coordinator', id: 'coord-1' };
export const CLINICIAN: Actor = { type: 'staff', role: 'clinician', id: 'ob-1' };
export const PATIENT: Actor = { type: 'patient', role: 'patient' };
export const ADMIN: Actor = { type: 'admin', role: 'admin' };

/** Local time on delivery day + `day` (practice timezone), hour:minute given as 24h numbers. */
export function dayAt(day: number, hour = 9, minute = 0): ISO {
  return addMinutes(atLocalHour(addDays(DELIVERY, day), hour, TZ), minute);
}

export interface EnrollOptions {
  patient?: PatientOverrides;
  patient_id?: string;
  at?: ISO;
  delivery_date?: ISO | null;
  expected_date?: ISO | null;
  delivery_outcome?: DeliveryOutcome | null;
  performed_by?: 'patient' | 'staff';
  enrollment_point?: EnrollmentPoint;
}

export function enrolled(store: NestWellStore, opts: EnrollOptions = {}): { patient_id: Id; episode_id: Id } {
  const patient_id = opts.patient_id ?? 'pt-1';
  const at = opts.at ?? ENROLL_AT;
  store.setClock(at);
  store.dispatch(registerPatient({ patient: makePatient(patient_id, opts.patient) }), ADMIN);
  const delivery_date = opts.delivery_date === undefined ? DELIVERY : opts.delivery_date;
  const performed_by = opts.performed_by ?? 'patient';
  store.dispatch(enroll({
    patient_id, enrollment_point: opts.enrollment_point ?? 'after_delivery', expected_date: opts.expected_date ?? null, delivery_date,
    delivery_outcome: opts.delivery_outcome ?? (delivery_date ? 'live_birth' : null), performed_by, staff_user_id: performed_by === 'staff' ? 'coord-1' : null,
  }), performed_by === 'staff' ? COORD : PATIENT);
  const episode = Object.values(store.getState().episodes).find((e) => e.patient_id === patient_id);
  if (!episode) throw new Error('enrollment produced no episode');
  return { patient_id, episode_id: episode.id };
}

export function checkinByDay(store: NestWellStore, episode_id: Id, day: number): Checkin {
  const c = Object.values(store.getState().checkins).find((x) => x.episode_id === episode_id && x.day_number === day);
  if (!c) throw new Error(`no check-in for day ${day}`);
  return c;
}

/** Submit a check-in at its release time (+ `offsetMinutes`). */
export function submitAt(store: NestWellStore, checkin: Checkin, responses: SubmitResponse[], offsetMinutes = 30, complete?: boolean) {
  store.setClock(addMinutes(checkin.scheduled_at, offsetMinutes));
  return store.dispatch(submitCheckin({ checkin_id: checkin.id, responses, complete }), PATIENT);
}

export function itemsIn(store: NestWellStore, queue_key?: QueueKey, episode_id?: Id): QueueItem[] {
  return Object.values(store.getState().queueItems).filter((q) => (!queue_key || q.queue_key === queue_key) && (!episode_id || q.episode_id === episode_id));
}

export const OK_DAY03: SubmitResponse[] = [
  { question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'ride', value: 'have_ride' }, { question_key: 'callback', value: 'no' },
];
export const OK_DAY07: SubmitResponse[] = [
  { question_key: 'recovery', value: 'ok' }, { question_key: 'coping', value: 'managing' }, { question_key: 'feeding', value: 'going_ok' }, { question_key: 'callback', value: 'no' },
];
