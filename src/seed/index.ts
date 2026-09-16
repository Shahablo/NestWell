/**
 * Scenario branch registry (requirements section 6, section 12). Every branch replays a persona's
 * history through the domain services at virtual times (SeedRunner); the scripted variants are
 * separate branches selected in the admin panel, never live recomputation. Each branch opens at
 * the moment its script starts.
 *
 * The default branch `all_personas` carries every persona's baseline history (no variants) with
 * staggered delivery dates so that at the default clock (Monday 2026-04-20, 11:00 practice time)
 * the dashboard shows a mix of days 5 to 84: Marisol day 13, Elena day 19, Keisha day 27 (reached
 * that morning), Priya day 32, Dana day 48, Tamsin day 84, and Lucía registered but not offered.
 */
import { addMinutes, atLocalHour } from '../domain/clock';
import { loadConfig } from '../domain/config';
import { safetyClassStatus } from '../domain/services/enrollment';
import { DEFAULT_CLOCK, type ScenarioBranch, type SeedRunner } from '../domain/store';
import type { ISO } from '../domain/types';
import { seedEnv } from './env';
import { danaSteps } from './personas/dana';
import { elenaSteps } from './personas/elena';
import { keishaSteps } from './personas/keisha';
import { luciaSteps } from './personas/lucia';
import { marisolSteps } from './personas/marisol';
import { priyaSteps } from './personas/priya';
import { tamsinSteps } from './personas/tamsin';
import { runSteps } from './script';

/** Config facts needed to describe branches at module load; guarded so the registry imports even when validation fails. */
function facts(): { tz: string; scanOn: boolean | null; spanish: { ok: boolean; missing: string[] } | null } {
  try {
    const loaded = loadConfig();
    const tz = loaded.config?.practice?.timezone ?? 'America/New_York';
    const scanOn = loaded.config?.freetext?.free_text_urgency_scan ?? null;
    const spanish = loaded.content ? safetyClassStatus(loaded.content, 'es') : null;
    return { tz, scanOn, spanish };
  } catch {
    return { tz: 'America/New_York', scanOn: null, spanish: null };
  }
}

const FACTS = facts();

/** A wall-clock instant in the practice timezone. */
const at = (date: string, hour: number, minute = 0): ISO => addMinutes(atLocalHour(`${date}T12:00:00.000Z`, hour, FACTS.tz), minute);

const run = (build: (r: SeedRunner) => void) => build;

const spanishNote = FACTS.spanish === null
  ? ''
  : FACTS.spanish.ok
    ? ' In this build the Spanish class is present as a placeholder translation (approver placeholder-translator), so the service allows enrollment; the coordinator records the not-offered status and the outreach item by hand.'
    : ` In this build the Spanish class is missing or unapproved (${FACTS.spanish.missing.join(', ')}); registerPatient blocks enrollment by itself.`;

const enrolledNote = FACTS.spanish === null
  ? ''
  : FACTS.spanish.ok
    ? ' The Spanish safety-critical class is approved in this build (placeholder translation), so she enrolls.'
    : ` BLOCKED in this build: the Spanish safety-critical class is not approved (${FACTS.spanish.missing.join(', ')}); the branch falls back to the blocked history until it is.`;

const scanOnNote = FACTS.scanOn === null
  ? ''
  : FACTS.scanOn
    ? ' free_text_urgency_scan is ON in config/freetext.json: the flagged question renders the full-screen locked instruction, creates one Urgent item and logs the lexicon version.'
    : ' REQUIRES free_text_urgency_scan: true in config/freetext.json, set by the clinical safety owner (FR-17). The flag is OFF in this build, so this branch runs the same commands and shows the scan-off behaviour (Needs-review item); the scan-on outcome is asserted in src/seed/tamsin.test.ts against a config with the flag on.';

export const SCENARIO_BRANCHES: Record<string, ScenarioBranch> = {
  all_personas: {
    key: 'all_personas',
    label: 'All personas',
    description: 'Every persona\'s baseline history (no variants), staggered so the dashboard shows days 5 to 84 at the default clock: Marisol (day 13), Elena (day 19), Keisha (day 27, reached this morning), Priya (day 32), Dana (day 48), Tamsin (day 84), Lucía (registered, not offered).',
    scenario: '6.1–6.7 baselines',
    clock: DEFAULT_CLOCK,
    run: run((r) => {
      const env = seedEnv();
      runSteps(r, [...danaSteps(env), ...priyaSteps(env), ...marisolSteps(env), ...elenaSteps(env), ...keishaSteps(env), ...luciaSteps(env, 'blocked'), ...tamsinSteps(env)]);
    }),
  },

  dana: {
    key: 'dana',
    label: 'Dana — uneventful recovery',
    description: 'Enrolled at 38 weeks, delivery 2026-03-03. Every check-in answered; day-14 and week-6 screens below threshold; both visits kept; summaries reviewed; transition at week 12. Opens at enrollment: move the clock to days 3, 7, 14, 21, week 6 and week 12.',
    scenario: '6.1 Dana',
    clock: at('2026-02-17', 9, 20),
    run: run((r) => runSteps(r, danaSteps(seedEnv(), 'baseline'))),
  },
  dana_late_enrollment: {
    key: 'dana_late_enrollment',
    label: 'Dana — late enrollment (day 20, in person)',
    description: 'Enrolled on day 20 by a nurse in person: days 3, 7 and 14 are not_applicable, the first live check-in is enrollment + 1 day, the in-person enrollment is the day-21 contact, no Unreached item and no reminder ever exists (FR-02, FR-37).',
    scenario: '6.1 Dana — late-enrollment variant',
    clock: at('2026-03-23', 14, 15),
    run: run((r) => runSteps(r, danaSteps(seedEnv(), 'late_enrollment'))),
  },

  priya: {
    key: 'priya',
    label: 'Priya — positive screen to kept appointment',
    description: 'Delivery 2026-03-19. Day-3 "no ride" creates the transport item; day-14 coping at the worst option creates a Needs-review item and offers the instrument; score at threshold; assessment, referral, partner confirms Medicaid, schedules, records the kept appointment on day 25; second positive at week 6. Opens after the day-3 check-in.',
    scenario: '6.2 Priya',
    clock: at('2026-03-22', 10, 25),
    run: run((r) => runSteps(r, priyaSteps(seedEnv(), 'baseline'))),
  },
  priya_declined_screen: {
    key: 'priya_declined_screen',
    label: 'Priya (a) — instrument declined',
    description: 'Day 14: coping at the worst option creates the Needs-review item; she declines the instrument; the item reads "reported difficulty coping; screen declined" (FR-29). Opens right after the decline.',
    scenario: '6.2 Priya — variant (a)',
    clock: at('2026-04-02', 10, 41),
    run: run((r) => runSteps(r, priyaSteps(seedEnv(), 'declined_screen'))),
  },
  priya_sharing_withheld: {
    key: 'priya_sharing_withheld',
    label: 'Priya (b) — sharing "nobody yet", threshold positive',
    description: 'Sharing category nobody_yet; the scheduled day-14 screen scores at threshold: the practice sees "screen completed, sharing withheld", no score, and no queue item is created (FR-06). Opens right after the screen.',
    scenario: '6.2 Priya — variant (b)',
    clock: at('2026-04-02', 10, 41),
    run: run((r) => runSteps(r, priyaSteps(seedEnv(), 'sharing_withheld'))),
  },
  priya_critical_withheld: {
    key: 'priya_critical_withheld',
    label: 'Priya (c) — sharing "nobody yet", critical item positive',
    description: 'Sharing category nobody_yet; a low score with the critical item positive: the disclosure, then the locked emergency instruction, then one Urgent item reading "critical safety item positive; other results withheld at patient request; policy unconfirmed (FR-30a)". The coordinator responds within the hour. Opens right after the screen.',
    scenario: '6.2 Priya — variant (c)',
    clock: at('2026-04-02', 10, 41),
    run: run((r) => runSteps(r, priyaSteps(seedEnv(), 'critical_withheld'))),
  },
  priya_referral_declined: {
    key: 'priya_referral_declined',
    label: 'Priya (d) — referral declined by the patient',
    description: 'The day-14 referral is sent, then the partner records declined_by_patient: the Needs-review item reopens for an alternative plan, which the clinician documents (FR-33). Opens right after the decline.',
    scenario: '6.2 Priya — variant (d)',
    clock: at('2026-04-03', 10, 1),
    run: run((r) => runSteps(r, priyaSteps(seedEnv(), 'referral_declined'))),
  },
  priya_escalated_then_acknowledged: {
    key: 'priya_escalated_then_acknowledged',
    label: 'Priya (e) — ownership rule: escalated, then acknowledged',
    description: 'She answers the day-14 check-in the next morning; the same-business-day target (coverage hours) passes at 16:40 before the clinician acknowledges at 16:55: the item escalates first, then is acknowledged with minutes_to_ack recorded (FR-25). Opens while escalated.',
    scenario: '6.2 Priya — variant (e)',
    clock: at('2026-04-03', 16, 45),
    run: run((r) => runSteps(r, priyaSteps(seedEnv(), 'escalated_then_acknowledged'))),
  },

  marisol: {
    key: 'marisol',
    label: 'Marisol — urgent answer, same-day call',
    description: 'Delivery 2026-04-07. At the day-7 check-in (Tuesday 10:24) she taps an item on the placeholder urgent list: the locked instruction renders first, the configured rule creates one Urgent item, the coordinator acknowledges in 12 minutes, logs a 12-minute call and closes the item against it (12 minutes, not 24). Opens right after the item is created.',
    scenario: '6.3 Marisol',
    clock: at('2026-04-14', 10, 25),
    run: run((r) => runSteps(r, marisolSteps(seedEnv(), 'baseline'))),
  },
  marisol_after_hours: {
    key: 'marisol_after_hours',
    label: 'Marisol — 7 p.m., timers lapse',
    description: 'The same urgent answer at 7 p.m. (Tuesday): nobody acknowledges; escalated at 7:30 p.m., UNOWNED at 8 p.m. on the wall basis (FR-25); the patient screen switches to the "we have not reached a nurse yet" item; the coordinator picks it up at 8:05 the next morning and an incident is recorded. Opens right after the item is created.',
    scenario: '6.3 Marisol — 7 p.m. variant',
    clock: at('2026-04-14', 19, 1),
    run: run((r) => runSteps(r, marisolSteps(seedEnv(), 'after_hours'))),
  },

  elena: {
    key: 'elena',
    label: 'Elena — pregnancy loss and sensitive mode',
    description: 'Enrolled at 34 weeks; stillbirth at 36 weeks (2026-04-01) recorded as day 0. She taps "Something has happened to my baby": suppression and the loss check-in set apply at once, a Sensitive-review item is created; "not for now" pauses check-ins with the 7-day contact deadline; the coordinator calls inside it; recovery visits and a mental-health referral continue; nothing resumes automatically. Opens right after her tap.',
    scenario: '6.4 Elena',
    clock: at('2026-04-02', 9, 1),
    run: run((r) => runSteps(r, elenaSteps(seedEnv()))),
  },

  keisha: {
    key: 'keisha',
    label: 'Keisha — stops responding',
    description: 'Delivery 2026-03-24. Answers days 3 and 7; day 14 unopened with one reminder; day 21 unopened; the day-21 sweep records no_contact_by_day_21 and derives exactly one Unreached item; the coordinator logs two attempts and reaches her on day 27 (transport barrier, visit rescheduled): first contact day 27, target unmet. Opens at the sweep.',
    scenario: '6.5 Keisha',
    clock: at('2026-04-14', 12, 5),
    run: run((r) => runSteps(r, keishaSteps(seedEnv(), 'baseline'))),
  },
  keisha_paused: {
    key: 'keisha_paused',
    label: 'Keisha — paused 2 weeks at day 7',
    description: 'She chose "Pause 2 weeks" at day 7: days 14 and 21 are paused, no reminder goes, the sweep finds the pause in force and no Unreached item is created (FR-13a). Opens at the sweep instant.',
    scenario: '6.5 Keisha — paused variant',
    clock: at('2026-04-14', 12, 5),
    run: run((r) => runSteps(r, keishaSteps(seedEnv(), 'paused'))),
  },

  lucia_blocked: {
    key: 'lucia_blocked',
    label: 'Lucía — enrollment blocked (Spanish safety class)',
    description: `Spanish-speaking, Medicaid, interpreter need. Registration captures the language; eligibility is not_offered with reason language_content_unavailable, she counts in the denominator, and a human-only outreach item "interpreter or Spanish-speaking staff needed" is created (FR-63a).${spanishNote} Opens right after registration.`,
    scenario: '6.6 Lucía — blocked branch',
    clock: at('2026-04-16', 9, 5),
    run: run((r) => runSteps(r, luciaSteps(seedEnv(), 'blocked'))),
  },
  lucia_enrolled: {
    key: 'lucia_enrolled',
    label: 'Lucía — enrolled once the Spanish class is approved',
    description: `Second branch: she enrolls (delivery 2026-04-15) with a phone interpreter; her day-3 check-in shows the FR-63 marker on ordinary items that exist only in English; the interpreter barrier answer creates a Follow-through item.${enrolledNote} Opens after the day-3 check-in.`,
    scenario: '6.6 Lucía — second branch',
    clock: at('2026-04-18', 14, 6),
    run: run((r) => runSteps(r, luciaSteps(seedEnv(), 'enrolled'))),
  },

  tamsin_scan_off: {
    key: 'tamsin_scan_off',
    label: 'Tamsin — high utilizer, scan off',
    description: 'Twins, NICU stay (delivery 2026-01-26). "I need help now" at most check-ins, callbacks, notes and many saved questions, each a queue item on entry. On Friday day 18 at 4:10 p.m. a saved question carries an emergency-lexicon term: with free_text_urgency_scan off (this build) no text is scanned; one Needs-review item is created in the same request, the locked instruction and named contact sit beside the field, and the closing statement is the pending form. Opens right after that question.',
    scenario: '6.7 Tamsin — scan off',
    clock: at('2026-02-13', 16, 11),
    run: run((r) => runSteps(r, tamsinSteps(seedEnv()))),
  },
  tamsin_scan_on: {
    key: 'tamsin_scan_on',
    label: 'Tamsin — high utilizer, scan on',
    description: `The same history as scan off.${scanOnNote} Opens right after the flagged question.`,
    scenario: '6.7 Tamsin — scan on',
    clock: at('2026-02-13', 16, 11),
    run: run((r) => runSteps(r, tamsinSteps(seedEnv()))),
  },
};

export const BRANCH_KEYS = Object.keys(SCENARIO_BRANCHES);
