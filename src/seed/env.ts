/**
 * Seed environment: the shipped config and content plus the time helpers every persona script
 * uses. Times are wall-clock times in the practice timezone (config), so a script reads like a
 * calendar ("day 7, 10:20") and stays aligned with the cadence the enrollment service schedules.
 */
import { addDays, addMinutes, atLocalHour } from '../domain/clock';
import { loadConfig } from '../domain/config';
import type { AppConfig, Instrument } from '../domain/config.schema';
import type { ContentIndex } from '../domain/content';
import type { ISO } from '../domain/types';

export interface SeedEnv {
  config: AppConfig;
  content: ContentIndex;
  tz: string;
  /** Local hour at which a check-in is released (cadence.send_hour_local). */
  sendHour: number;
}

let cached: SeedEnv | null = null;

/** The validated config and content. Never called at module load: main.tsx shows the validation report first. */
export function seedEnv(): SeedEnv {
  if (cached) return cached;
  const loaded = loadConfig();
  if (loaded.problems.length > 0 || !loaded.config) {
    throw new Error(`seed: config has ${loaded.problems.length} validation problem(s); fix them before seeding`);
  }
  cached = { config: loaded.config, content: loaded.content, tz: loaded.config.practice.timezone, sendHour: loaded.config.cadence.send_hour_local };
  return cached;
}

/** Wall-clock time on a calendar date in the practice timezone: local(env, '2026-03-03', 14, 30). */
export function local(env: SeedEnv, date: string, hour: number, minute = 0): ISO {
  return addMinutes(atLocalHour(`${date}T12:00:00.000Z`, hour, env.tz), minute);
}

/** Wall-clock time on delivery day + `day` (FR-37 day numbering) in the practice timezone. */
export function dayAt(env: SeedEnv, delivery: ISO, day: number, hour: number, minute = 0): ISO {
  return addMinutes(atLocalHour(addDays(delivery, day), hour, env.tz), minute);
}

/** The instant the cadence releases the check-in for `day` (FR-08), as the enrollment service schedules it. */
export function sendTime(env: SeedEnv, delivery: ISO, day: number): ISO {
  return dayAt(env, delivery, day, env.sendHour);
}

/** Option indexes that give the per-item scores wanted on an instrument (reverse-scored items are resolved from config). */
export function itemIndexes(env: SeedEnv, instrumentKey: string, scores: readonly number[]): number[] {
  const inst: Instrument | undefined = env.config.instruments[instrumentKey];
  if (!inst) throw new Error(`seed: unknown instrument ${instrumentKey}`);
  if (scores.length !== inst.items.length) throw new Error(`seed: ${instrumentKey} has ${inst.items.length} items, got ${scores.length} scores`);
  return inst.items.map((item, i) => {
    const idx = item.options.findIndex((o) => o.score === scores[i]);
    if (idx < 0) throw new Error(`seed: ${instrumentKey} item ${item.key} has no option scoring ${scores[i]}`);
    return idx;
  });
}
