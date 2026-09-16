# NestWell prototype — build status

Synthetic data only. This is a demonstration build for discovery interviews; it is not a medical
device, not a clinical service, and never holds a real person's information.

Status as of 2026-09-16, written by the final integration pass. The scope reference is
`docs/requirements.md` section 14 (work packages W1–W22); the technical contract is
`docs/ARCHITECTURE.md` and `src/domain/types.ts`.

## Checks (exact commands and results)

Run from the repository root (Windows PowerShell shown; the npm scripts are the same on any OS).

| Command | Result |
|---|---|
| `Set-Location D:/NestWell; npx tsc --noEmit -p tsconfig.json` | exit 0, no errors |
| `Set-Location D:/NestWell; npx vitest run` | 23 test files, 210 tests, all passed (about 7 s) |
| `Set-Location D:/NestWell; npx vite build` | built; `dist/` produced with the PWA service worker (12 precache entries); the only warning is the standard "chunk larger than 500 kB" notice |

Runtime walk (Vite dev server, Chrome pane, desktop width): storage cleared, the default branch
`all_personas` reseeded on load (665 events, opens Apr 20, 2026 11:00 AM practice time); every
route below rendered with no console error from the app:

- Patient: `#/p` (persona picker, home), `acknowledge`, `preferences`, `checkin/:id?phase=done`,
  `screen/epds`, `help`, `careplan`, `transition`, `inbox`, `sensitive-preferences`, `seen`.
- Practice, all four roles: `queues` (every tab), `patients`, `patients/:id`, `referrals`,
  `summaries`, `metrics`, `ownership`, `screening` (clinician), `budget` (budget owner),
  `partner` (referral partner); route gating redirects a role to its home.
- Admin: `clock`, `scenarios` (all 18 branches listed with their opening clocks), `reset`, `logs`,
  `inventory`, `validation` (0 problems), `settings`.

## How to run

```bash
npm install          # once; Node 20 or newer
npm run dev          # http://localhost:5173/NestWell/  (the base path matches the GitHub Pages repo name)
npm test             # vitest: domain unit tests, config/content validation, lexicon lint, scenario tests
npm run build        # typecheck, then vite build into dist/ (PWA)
npm run typecheck    # tsc --noEmit
npm run validate     # config and content validation only
npm run lint:claims  # the claims / reassurance / monitoring / burden lexicon lint
npm run preview      # serve dist/ locally
```

In the app: use the role switcher in the banner to move between the Patient app (`#/p`), the
Practice dashboard (`#/practice`, four views) and Admin (`#/admin`). Admin → Scenarios loads a
branch (wipes the log in this browser and reseeds), Admin → Clock moves the demo clock, Admin →
Reset wipes and reseeds. The demo scripts are in `docs/demo-scripts/`.

Continuous integration: `.github/workflows/deploy.yml` runs `npm ci`, `npm test` and
`npm run build` on every push to `main` and deploys `dist/` to GitHub Pages. This checkout has
no commit yet, so the workflow has not run from this tree.

## Flag states in this build

| Flag | Value | Set by |
|---|---|---|
| `free_text_urgency_scan` (FR-17) | off | nobody (unconfirmed) |
| `critical_item_overrides_sharing` (FR-30a) | on | nobody (unconfirmed; placeholder policy) |
| `ai_enabled` | false | fallback mode: canned exemplars, no model call, no network code path |
| `screening_in_loss_status` (FR-57) | `single_mood_item` | placeholder pending open question 12 |
| Instrument thresholds (EPDS 10, PHQ-9 10) | placeholder | `thresholds_confirmed_by: null` on both |
| Queue owners (all six queues) | NOT YET ASSIGNED | `owner_user_id: null`; the on-duty person comes from the coverage schedule |
| Referral partner | NOT YET SECURED | `secured: false`, capacity unknown |
| Barrier resources | NOT YET PROVIDED | all five null |
| State-law review (SR-17) | required | `state_review_memo_ref: null`; the counsel marker renders on the summary export |

## Status by work package

Legend: **Implemented** — every item in the package row of section 14 exists and is exercised by a
test or the runtime walk; **Partial** — the named items are missing; **Not implemented**.

| Package | Status | What exists / what is missing |
|---|---|---|
| W1 Foundation | Implemented | Repository, Zod schemas for every section 11 entity (`config.schema.ts`, `types.ts`), three surfaces behind the role switcher, demo clock, append-only event log with an actor on every write (the metric-event stream, SR-13), synthetic guard (the projection rejects any patient that is not synthetic) and the banner on every screen and export, demo participant mode (Admin → Settings), incident record (`services/admin.ts`, Admin → Logs), jurisdiction flag (`practice.jurisdiction`, `state_review_memo_ref`), CI workflow, hosted-demo configuration (GitHub Pages base path, PWA). |
| W2 Config and content pipeline | Implemented (JSON, not YAML) | Loaders discover every file under `config/` and `content/` by glob and validate with Zod at startup; the app refuses to run on a problem (`ValidationReport`); `npm run validate`; approved-only serving with the UNAPPROVED watermark; lexicon lints over content, every `src/ui` string literal and every `docs/*.md`; locale slots with the FR-63 fallback marker; safety-critical class check for Spanish (FR-63a); AI-flag consistency (startup invariant and command-time assertion). Deviation: config and content are JSON files rather than YAML and markdown. |
| W3 Seeder and scenario branches | Implemented | 18 branches in `src/seed/index.ts` (`all_personas`, `dana`, `dana_late_enrollment`, `priya` plus five variants, `marisol`, `marisol_after_hours`, `elena`, `keisha`, `keisha_paused`, `lucia_blocked`, `lucia_enrolled`, `tamsin_scan_off`, `tamsin_scan_on`), each replaying real domain commands at virtual times through `SeedRunner`; branch load and reset from Admin; determinism asserted per branch (logs equal apart from `wall_at`, ids and the session id). FR-48 "under five seconds": `all_personas` reseeds in about 0.5–1 s after this pass cached the `Intl.DateTimeFormat` instances in `clock.ts` (it took 6–7 s before). |
| W4 Enrollment and home | Implemented | Eligibility with reasons and the denominator, enrollment timing (windows already closed are `not_applicable`), preferences (sharing category with plain explanations, safety question, contact windows, language, names, baby reference), acknowledgment in standard and demo-participant modes with the FR-30a and FR-17 sentences chosen from config, contact card and locked emergency instruction before any acknowledgment, who-has-seen, patient-set sensitive controls with no reason field (suppression applies at once, one Sensitive-review item), pause (1 week, 2 weeks, until resumed) and stop in two taps. |
| W5 Check-ins | Implemented | Ten templates (seven cadence points plus loss, NICU and trauma sets), state derivation from the clock (scheduled → sent → opened/unopened → completed/partial/skipped, paused, not applicable), one item per screen with Skip, Not now and I need help now visible without scrolling at 360 px, partial submissions, one reminder with suppression reasons, Unreached routing, weekly burden cap (FR-16), closing statements (FR-15) with the computed call-by time, free-text routing on entry with the inline locked instruction in both flag states (FR-17), usefulness item. |
| W6 Help path and coverage copy | Partial | Help screen (one tap creates one Urgent item and renders the full-screen locked instruction, 911/988/DV hotline, named contact, callback request that reports offline), `LockedContent` in both layouts rendered by non-AI code, coverage-state copy (the locked "we have not been able to reach a nurse yet" item when an Urgent item is escalated or UNOWNED), service worker precaches the whole app (NFR-13). Missing: the FR-21 client-side queue and `/events/client` endpoint — there is no network layer; `emergency_instruction_shown` is written synchronously by the services and only `checkin_opened` carries `client_reported`. |
| W7 Rules engine and harness | Partial | Rule grammar (`eq`, `gte`, `lte`, `in`, `any_of`; `all`/`any`; six trigger types) with key, version, author, approver and effective date on every `rule_fired`; nine configured rules. The harness is the vitest suite (`rules.test.ts`, `realconfig.test.ts`, the scenario tests). Missing: the FR-31 CLI and the "changed, unconfirmed" report after a threshold or rule change; scenario 6.8 is a documented config edit and restart, not a branch. |
| W8 Queues and timers | Implemented | Six queue definitions with placeholder targets and null owners, acknowledgment, escalation and UNOWNED derived from the clock on both timer bases (wall and coverage hours), queue views with filters and sort order, coverage banner (FR-44), outcome form (FR-45: no item closes without an outcome; a contact reference avoids a second staff-time row), `staff_time` ledger, queue ownership sheet (Admin → Inventory and Practice → Queue ownership with CSV). |
| W9 Screening, routing and sharing | Partial | EPDS and PHQ-9 config with attribution, framing with the flag-dependent disclosure sentence, thresholds labelled placeholder / not yet confirmed on the screening page, result view and instrument step, scoring (reverse-scored items), coping trigger, routing (threshold positive → Needs review, critical item → Urgent), FR-30a in both modes, sharing categories enforced in the data layer (`visibleScreenFor`; the budget owner never sees item-level data), staff read records (FR-03a). Missing: an in-app confirmation flow for the `config_approver` — thresholds are confirmed only by editing `thresholds_confirmed_by` in config. |
| W10 Follow-through minimum | Implemented | Referral states with the reopen rule (a dead end on a screen-linked referral reopens a Needs-review item; only `appointment_completed` counts), callbacks, contact log with day number, initial-contact flag against the day-21 target, patient list. |
| W11 Phase 1 documents and scripts | Partial | Present: demo scripts 6.1–6.8 with discovery questions (`docs/demo-scripts/`), the function inventory (Admin → Inventory, and `docs/fda-function-inventory.md` generated from the same rows), the queue ownership sheet, the findings-template values on the budget page, the "what this is and is not" handout content (`demo.handout`), session rules (SR-27, SR-28) in the scripts README. Missing as documents: `docs/alternatives-worksheet.md` (FR-70), `docs/discovery-safety-protocol.md` (SR-28; needs the clinical safety owner's approval), the data-flow map skeleton, `docs/ac-record.md` (NFR-12), findings capture files. No dry run by a founder has been recorded. |
| W12 Phase 1 end-to-end tests | Implemented (tests); AC record missing | `src/seed/dana.test.ts` (both branches), `priya.test.ts` (baseline and variants a–e), `marisol.test.ts` (both), `keisha.test.ts` (both), `lucia.test.ts` (blocked branch), all through the store in fallback mode. `docs/ac-record.md` does not exist and there is no build hash yet (no commit). |
| W13 Sensitive paths | Partial | Status events with stacking and lift, the suppression matrix across care plan, check-ins and outbox (with `content_suppressed` derived events and outbox suppression reasons), the FR-56 dialog asked once with "not for now" pausing check-ins and a review item due at the contact deadline, loss/NICU/trauma check-in sets, continuing care (recovery visits and a mental-health referral continue), no automated resumption, tone-review attributes on content; Elena branch. Missing: FR-57 single mood item as a domain command — the instrument step composes `skipScreen` plus a Needs-review item on "not coping". |
| W14 Care plan and education | Implemented | Items instantiated from `config/careplan.json` with versions and owners, explanations from the canned AI-01 reword with the AI-13 label, visit preparation (date, purpose, bring list, bring-baby / interpreter line), saved questions with FR-17 on entry and the canned AI-03 grouping that never includes a flagged question, barrier items with NOT YET PROVIDED resources (FR-36a). |
| W15 Follow-through completion | Partial | Partner panel (consented fields only; writes limited to scheduled, kept, not kept, no capacity, not covered), insurance coverage warning on referral creation (FR-36), planned visits with state changes, assessment linkage and the screen-to-assessment / screen-to-connection intervals, week-12 transition and closure with the FR-39 destination rule, patient timeline. Missing: a runtime write path for partner capacity and accepted insurance (config values; no event type in the contract). Note: `recordDelivery` does not re-anchor care-plan due dates or visits set from the expected date; the Elena seed reschedules them by hand. |
| W16 Clinician summary | Implemented | Structured section built from state (role-gated screen lines, withheld notices), canned AI-02 narrative with the allowlist postfilter and the AI-14 label, states draft → reviewed (clinician only) → delivered (never shown as delivered before it is), print-styled export with the synthetic notice, reviewer, rules/instrument/content versions and manifest hash, and the SR-17 counsel marker. |
| W17 Metrics and budget-owner view | Implemented | Every 11.3 measure recomputed from stored plus derived events, all-eligible primary and enrolled secondary, breakdowns by language, insurance and barrier, escalation ratings (FR-51) and the clinician's not-caught record, usefulness by week (FR-52), CSV and JSONL export with versions on every row, the blank-input interview calculator with the after-hours line ("Illustrative, not market prices or a forecast" on every card, no revenue), the FR-47a scope sheet. |
| W18 Notifications (simulated) | Implemented | Outbox materialized by the projection from check-ins, reminders and care-plan items with the neutral body only, suppression rows with reasons (paused, unsafe to message, sensitive status, Unreached open), patient inbox tagged SIMULATED. Note: there is no `MessageProvider` interface; the seam for a real provider is `services/notifications.ts` plus the projection's outbox. |
| W19 AI gateway (canned) | Implemented | Fallback-mode gateway keyed by (feature, key) in `config/ai-exemplars.json`, AI-13/AI-14 labels, generic fallback with `ai_fallback_used`, deny-list postfilter for narratives, refusal on locked, draft or retired content (`ai_call_blocked`), canned AI-03 grouping, AI interaction log (Admin → Logs); Tamsin branches. The scan-on branch cannot change the flag at run time (FR-17 reads it from config by design), so it runs the shipped scan-off behaviour and the scan-on outcome is asserted in `tamsin.test.ts` against a config with the flag on. |
| W20 Content tooling | Partial | Present: the claims field (`claims_checked_by`, asserted for every id the code depends on), tone-review attributes, the deny-list lints, `npm run validate`, Admin → Validation (placeholder and status lists), and the event-log export that carries the FR-17 and FR-30a flags, `ai_enabled`, versions and the content manifest hash. Missing: the FR-60a tone validator (reading level, sentence length, exclamation marks, formality), the FR-62 preview CLI, a single content-and-rules export document (FR-65). |
| W21 Phase 2 end-to-end tests and NFR checks | Partial | Present: scenario tests for 6.4, 6.6 (both branches), 6.7 (both flag states), a determinism test per branch, the lexicon lint and the startup-failure test for `ai_enabled` without the scan, all in CI. Present since the review pass: `src/domain/network.test.ts` fails on any fetch, XHR, WebSocket, sendBeacon, EventSource or external URL under `src`, and the production build injects a Content-Security-Policy limited to the application origin (`vite.config.ts`, build only because the dev server needs its HMR websocket). Missing: a 6.8 branch test (script only), a repository secret scan, accessibility automation (NFR-01). |
| W22 Phase 2 documents, scripts and hardening | Partial | Present: admin log screens (event log, derived events, incidents, AI interactions), scripts 6.4, 6.6, 6.7, 6.8, an error boundary that keeps the banner and role switcher usable, the startup validation report, PWA install. Missing: vendor record, completed data-flow map, pilot-gate and pilot-debt files, the two dry runs. |

Pilot-deferred packages P1–P10 are not started, as planned.

## Screen inventory against section 14

- Patient (10 planned): home, acknowledgment, preferences, check-in, instrument step, help,
  care plan and visit preparation, saved questions (on the care plan page), transition, inbox —
  all present, plus who-has-seen and the sensitive dialog.
- Practice (9 planned plus the coverage banner): queues, patient list, outcome form, screening
  review and assessment, coverage banner, patient timeline, referrals and partner panel, summary
  review and export, metrics and breakdowns, budget-owner calculator and scope sheet, queue
  ownership — all present.
- Admin (5 planned): clock and scenario branch, reset, validation report, logs (events, derived,
  incidents, AI), inventory, settings (demo participant mode, demo notes, event-log export) —
  all present.

## Known gaps and open items

Domain and services (`src/domain`):

1. FR-21: no client-side queue of view events and no `/events/client` endpoint (no network layer).
2. FR-31: no rules-harness CLI and no "changed, unconfirmed" report; the test suite is the harness.
3. FR-57: no domain command for the single mood item in a loss status; the UI composes it.
4. Partner capacity and accepted insurance have no runtime write path (no event type).
5. `recordDelivery` does not re-anchor care-plan due dates or visit dates set from the expected date.
6. FR-13 as written ("until an outreach outcome is logged"; the queue's resolution is "Outreach
   logged"): a `not_reached` outreach resolves the derived Unreached item at once and later check-ins
   go out without reminders, so nothing prompts a second attempt until a new run of two; a second
   attempt before the next window closes can derive a second item. The Keisha seed logs its
   attempts after the day-21 window closes to keep exactly one item. Changing this needs a
   requirements decision, not a code fix.
7. After submission a check-in shows its scheduled template in the projection even when a
   sensitive status remapped later check-ins (cosmetic).
8. `demo_session_id` is derived from wall time and is stripped in determinism assertions.

Seed and scripts (`src/seed`, `docs/demo-scripts`):

9. `tamsin_scan_on` runs the shipped scan-off behaviour; turning the scan on is a config edit
   under the clinical safety owner's name plus a restart (FR-17 by design).
10. `lucia_blocked` is produced by coordinator commands (`recordEligibility` plus an outreach
    item with a placeholder episode id) because the Spanish safety class ships as an approved
    placeholder translation; if that class becomes unapproved the service blocks by itself and both
    Lucía tests handle either state.
11. Scenario 6.8 has no branch; the script documents the config edit and uses the test suite.
12. In demo-participant mode the instrument step enters the persona's answers as the
    lowest-scoring option on every item (deterministic, synthetic).

UI:

13. FR-05 "Not now" on the acknowledgment is not logged (no event type in the contract).
14. Check-in free text (not screen items) is revealable by coordinator and clinician after a
    recorded read; FR-06 names only mood free text as category-routed — confirm the intended policy.
15. The thresholds banner is rendered as placeholder labels; there is no `config_approver`
    confirmation flow in the app.

Documents and process:

16. Not written: `docs/ac-record.md`, `docs/alternatives-worksheet.md`,
    `docs/discovery-safety-protocol.md`, the data-flow map, vendor record, pilot-gate and
    pilot-debt files, findings capture files. `docs/fda-function-inventory.md` is generated from
    the admin inventory rows and must be regenerated whenever those rows or the flags change.
17. Config and content are JSON, not YAML and markdown (section 12 names YAML).
18. No secret scan and no accessibility automation (W21). The CSP (build only) and the no-network test exist.
19. No commit exists in this checkout, so there is no build hash and the Pages deploy has not run.
20. Every content item is approved by a placeholder approver (`clinical-owner-placeholder`,
    `placeholder-translator`); 16 items are pending counsel review; nothing is clinically set.

Housekeeping: `.claude/launch.json` carries two dev-server entries (ports 5173 and 5174) used
during parallel builds; harmless.

## Changes made in the review fix pass

- Route gating follows the active view: a URL for another surface redirects to the role's home
  instead of switching the role; the banner clock is an explicit switch to the admin clock panel.
- A recorded loss outcome counts as the loss pathway in the patient app too (no NICU control, loss
  framing), matching the domain's `lossPathwayActive`.
- Practice: clinician queues open on the queue the role owns; referral state changes are
  forward-only with no date defaulted from the clock; the ownership sheet prints the approved
  no-answer text; the dead-end outcome form asks for the documented plan; reviewed summaries label
  the narrative with the reviewer; patient links and preference options carry accessible names.
- SR-04 / SR-07: the build-time CSP, the no-network test, and the lexicon lint extended to string
  literals under `src/domain` and string values in `config` (lexicons, type unions and the verbatim
  attributed instruments excluded).

## Changes made in the integration pass

- `src/domain/clock.ts`: `Intl.DateTimeFormat` instances are now built once per (options,
  time zone) and the three local-time lookups are memoized by input. No result changes; the
  full suite runs in about 9 s instead of 52 s and `all_personas` reseeds well under FR-48's five
  seconds.
- `src/domain/services/ai.ts`: `patientLabel` fills `{{after_hours_phone}}` from the practice
  config, so `RewordResult.label` is renderable as returned.
- `docs/fda-function-inventory.md`: generated from the admin inventory rows and the shipped
  config (SR-09).
- This file.

## Where the tests are

| Area | Files |
|---|---|
| Config and content validation, lexicon lint | `src/domain/config.test.ts`, `src/domain/realconfig.test.ts`, `src/domain/lexicon.test.ts` |
| Derivations (check-in states, reminders, timers on both bases, Unreached, day-21, suppression) | `src/domain/derive.test.ts`, `src/domain/projection.test.ts` |
| Services | `src/domain/services/{checkins,enrollment,followthrough,rules,screening,sensitive,summaries}.test.ts` |
| Metrics | `src/domain/metrics.test.ts` |
| Scenarios 6.1–6.7 and the branch registry (determinism, monotonic logs) | `src/seed/{dana,priya,marisol,elena,keisha,lucia,tamsin,registry}.test.ts` |
