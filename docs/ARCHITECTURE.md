# NestWell prototype — architecture and build brief

This file is the contract between the people (and agents) building the prototype. Read it
with `docs/requirements.md` (the requirements, numbered FR/AI/SR/NFR) and `src/domain/types.ts`
(the type contract). When this file and the requirements disagree, the requirements win and
this file should be fixed.

## 1. What we are building

A demonstration of a twelve-week postpartum follow-through service, for **synthetic patients
only**, that founders walk stakeholders through screen by screen. Three surfaces in one static
web app, switched with a role switcher, all state in the browser:

| Surface | Route prefix | Who uses it in a demo |
|---|---|---|
| Patient app (PWA, phone-first) | `#/p/...` | a founder playing a synthetic patient; a woman in an interview driving a persona |
| Practice dashboard | `#/practice/...` (views: coordinator, clinician, budget_owner, referral_partner) | nurses, OB clinicians, the budget owner |
| Admin panel | `#/admin/...` | the founder running the demo: clock, scenario branch, reset, logs, inventory |

Hard rules that override everything else:

- **Synthetic only.** No sign-up, no import, no real phone numbers except 911, the 988 Suicide & Crisis Lifeline, and the National Domestic Violence Hotline (1-800-799-7233). Practice numbers are 555 numbers labelled as placeholders. A "Synthetic data — demonstration only" banner is on every screen and export (SR-01–03).
- **No network calls.** The app never fetches anything. No analytics, no fonts from a CDN, no model calls (`ai_enabled` is false and the code path is a canned-exemplar store, AI-21). SMS/email are simulated in an outbox (FR-66–69).
- **The AI never triages, diagnoses, reassures, or does therapy** (AI-05–AI-09). Locked emergency content is rendered by non-AI code, byte for byte (FR-22).
- **No prohibited claims** anywhere in UI, content, docs or scripts: the `claims` lexicon is linted in tests (SR-07). Never "HIPAA compliant", "FDA cleared", "non-device", "first-of-its-kind", "better than", "proven", "guaranteed", "the app decides nothing", "just shows information".
- **A referral is never "done" because a link was sent.** Only `appointment_completed` counts (FR-33). A queue item never closes without an outcome (FR-34, FR-45).
- **Coverage honesty.** When nobody is on duty or an item has timed out, the patient sees the locked "we have not been able to reach a nurse yet — do not wait for us" item, never a waiting message (FR-24, FR-25).

## 2. Repository layout and ownership

```
config/                 JSON config (see src/domain/config.ts for the file map)    — owner: CONTENT
content/en/*.json       approved content items; content/es/*.json safety-critical  — owner: CONTENT
docs/                   requirements, scripts, generated sheets                       — owner: DOCS (+ each package adds its script)
src/domain/types.ts     THE CONTRACT — do not change shapes without updating every consumer
src/domain/config.schema.ts, config.ts, content.ts, clock.ts, store.ts   — written; treat as stable
src/domain/projection.ts       fold events → State at the clock, incl. derived transitions — owner: CORE
src/domain/derive.ts           pure helpers used by projection (timers, windows, suppression) — owner: CORE
src/domain/services/*.ts       commands (pure): enrollment, checkins, freetext, rules, queues,
                               screening, followthrough, sensitive, careplan, summaries,
                               notifications, ai, admin                                    — owner: CORE
src/domain/metrics.ts          metrics from events + derived events (section 11.3)         — owner: CORE
src/domain/*.test.ts           unit tests incl. config validation and lexicon lint          — owner: CORE (config/lexicon tests: CONTENT)
src/seed/index.ts              SCENARIO_BRANCHES registry                                  — owner: SEED
src/seed/personas/*.ts         one file per persona; scripts run commands at virtual times  — owner: SEED
src/seed/*.test.ts             scenario end-to-end tests (fallback mode)                   — owner: SEED
src/styles/*.css               tokens, base, components                                   — owner: SHELL
src/ui/components/*            shared components                                          — owner: SHELL
src/ui/shell/*                 AppShell, RoleSwitcher, SyntheticBanner, routes            — owner: SHELL
src/ui/admin/*                 clock, scenarios, reset, logs, inventory, validation report — owner: SHELL
src/ui/patient/*               patient screens                                            — owner: PATIENT
src/ui/practice/*              practice screens                                           — owner: PRACTICE
src/main.tsx, src/App.tsx      bootstrap                                                  — owner: SHELL
public/icons/*                 PWA icons                                                  — owner: SHELL
```

Each owner writes only inside its area. If you need something from another area that does
not exist yet, write the smallest stub in **your** area and leave a `// TODO(owner):` note;
do not edit their files.

## 3. The event-sourced model (read this twice)

- `store.dispatch(command)` calls `command(ctx)`; the command returns `AnyEvent[]`; the store
  appends them and re-projects. A command that must be atomic returns all its events at once
  (FR-17: free-text save + queue item + lexicon match are one command).
- `project(events, clock, config, content): State` folds every stored event with
  `occurred_at <= clock`, then derives timer-driven facts from the clock. **Nothing is
  scheduled.** Moving the clock backwards makes derived facts disappear.
- Seeds run the same commands at virtual times through `SeedRunner`, so seeded history and
  live actions are indistinguishable (NFR-11). Live actions are stamped at the current clock.
- `wall_at` is real time and is excluded from determinism checks (NFR-04). Two reseeds of
  the same branch must produce identical event logs apart from `wall_at` and ids.

### 3.1 Derivations the projection must implement (all pure, all from the clock)

Let `T` be the clock and `c` the cadence config.

**Check-in state (FR-08, FR-10, FR-11, FR-13a).** For each `checkin_scheduled`:
`not_applicable` if a `checkin_not_applicable` event exists; `paused` if the episode was paused
at `scheduled_at`; `scheduled` if `T < scheduled_at`; if `checkin_submitted` → `completed` when
`complete`, else `partial`; if `checkin_skipped` → `skipped`; else `opened` if `checkin_opened`
and `T < window_end_at`; `sent` if `scheduled_at <= T < window_end_at`; `unopened` if
`T >= window_end_at` and never opened; `partial` if opened but never submitted after the window.
A `checkin_not_now` moves `scheduled_at` (once).

**Reminder (FR-14).** One reminder per check-in at `scheduled_at + reminder_offset_hours` unless
the check-in was opened/submitted/skipped before then, or the episode is paused/stopped, or an
Unreached item is open, or `safe_to_message` is false, or a sensitive status suppresses it.
Emit `reminder_sent` or `notification_suppressed` (with reason) as derived events; also emit the
`notification_scheduled` derived event for the check-in itself. Materialize `state.notifications`.

**Queue item timers (FR-25).** For each queue item with a `queue_def`: `ack_target_at =
created_at + ack_target_minutes` (or `open_clinical_ack_target_minutes` when flagged) and
`backup_target_at = created_at + backup_ack_target_minutes`, computed on the queue's `timer_basis`
(`wall`: plain minutes; `coverage_hours`: only minutes inside coverage windows count — implement
a helper that walks the coverage schedule). State: `resolved` if resolved; `acknowledged` if
acknowledged; else `unowned` if `T >= backup_target_at`; `escalated` if `T >= ack_target_at`;
else `open`. Emit derived `escalation_escalated` / `escalation_unacknowledged_timeout`
(with `patient_notified: true`) at those instants. `minutes_to_ack` in demo-clock minutes.

**Unreached (FR-13).** Walk an episode's check-ins in order. Count consecutive check-ins whose
state is `unopened` or `skipped` (whole) while not paused; a completed/partial check-in or any
`contact_logged`/outreach `reached` resets the count. When the count reaches
`unreached_after_consecutive_unopened`, derive exactly one Unreached queue item with id
`unreached:<episode_id>:<second_checkin_id>`, `created_at = window_end_at` of that check-in,
`derived: true`, until an `outreach_logged` event for that id exists (then it is resolved with that
outcome). After "not_reached", reminders stay suppressed for later check-ins; after "reached",
they resume. Flag `open_clinical_flag` if the episode has an open Needs-review/Urgent item, a
positive screen in the last 30 days, an open referral, or an active sensitive status.

**Day-21 sweep (FR-37).** At `delivery_date + initial_contact_target_day` (noon local) with no
`contact_logged` before it, derive `no_contact_by_day_21` and an Unreached item
`day21:<episode_id>` (trigger `day21_sweep`) if no Unreached item is already open. Staff-performed
enrollment counts as a contact (the enrollment service must log it).

**Initial contact (FR-37).** The first `contact_logged` sets `initial_contact_day` and
`initial_contact_met_target = day_number <= target`.

**Episode status.** `closed_early`/`completed` from `episode_closed`; `paused` if the latest
`checkins_paused` is not followed by `checkins_resumed` and (`until` is null or `T < until`);
`indicated` per FR-39.

**Sensitive suppression (FR-54, FR-55).** Active subtypes = set minus lifted. Suppressed tags =
union over the matrix in `derive.ts` (loss → infant, feeding, milestone, celebration,
newborn_visit, birth_story; nicu → milestone, celebration; trauma → celebration, birth_story,
pregnancy_progress). Care-plan items carrying a suppressed tag get `state: 'suppressed'`;
check-ins scheduled after the status use the subtype's check-in set (loss > nicu > trauma).
Emit `content_suppressed` derived events. Nothing resumes automatically (FR-59).

**Sharing enforcement (FR-06, SR-14).** `ScreenResult.shared_with` is recorded at
administration time from the patient's category. The projection also exposes
`visibleScreenFor(state, screen, role)` — see `src/domain/services/screening.ts` — and the
practice UI must call it; a role outside `shared_with` sees "screen completed, sharing withheld".
The budget owner never sees item-level data.

### 3.2 Services (commands). Signatures are `(input) => Command`.

Implement these in `src/domain/services/` and re-export from `src/domain/services/index.ts`.
Each returns a `Command`, i.e. `(ctx) => AnyEvent[]`. Use `ctx.makeEvent` and `ctx.nextId`.
Throw `DomainError` (define in `services/errors.ts`) on an invalid command.

```
enrollment.ts
  registerPatient({ patient })                                     → patient_registered (+ eligibility_changed)
  recordEligibility({ patient_id, status, reason })
  enroll({ patient_id, enrollment_point, expected_date, delivery_date, delivery_outcome, performed_by, staff_user_id })
       → enrolled, checkin_scheduled × cadence (not_applicable for windows already closed, FR-02),
         care_plan_instantiated, visit_scheduled × careplan.visits, contact_logged when staff-performed in person
  recordDelivery({ episode_id, delivery_date, outcome })            → delivery_recorded + reschedules unsent check-ins
  acknowledge({ episode_id, mode })                                 → acknowledged (flags from config)
  setPreference({ patient_id, field, value })                       → preferences_changed (sharing → also sharing_changed)
  pauseCheckins({ episode_id, actor, duration_label, until })
  resumeCheckins({ episode_id, actor })
  stopProgram({ episode_id })                                       → episode_closed(closed_early, patient_withdrew), dropout_recorded,
                                                                       queue_item_created(follow_through, withdrawal)
  closeEpisode({ episode_id, transition })                          → transition_completed + episode_closed(completed); FR-39 rule
checkins.ts
  openCheckin({ checkin_id })                                       → checkin_opened (client_reported)
  submitCheckin({ checkin_id, responses, complete })                → checkin_submitted + rule evaluation (rules.ts) + free-text routing
                                                                       (freetext.ts) + barrier items + coping trigger + screen_offered
  skipItem / skipCheckin / notNow
freetext.ts
  routeFreeText({ episode_id, field, text })                        → the FR-17 bundle. Returns { events, queue_item_id, lexicon_match, urgent }.
                                                                       Scan only when config.freetext.free_text_urgency_scan; a match → Urgent item
                                                                       + help_requested(lexicon_match); else Needs-review item. NEVER store the text
                                                                       in lexicon_match. Emits free_text_routed and emergency_instruction_shown(inline).
rules.ts
  evaluateRules(trigger, facts, ctx)                                → rule_fired + actions (queue_item_created / screen_offered / pause)
  Condition fields available for checkin_submitted: response.<question_key> (value), response_tags (all rule tags in the
  submission), episode.day_number, patient.sharing_category, screen.score, screen.positive, screen.critical_item_hit,
  status.subtype, help.source. Implement ops eq/gte/lte/in/any_of.
queues.ts
  createQueueItem({ queue_key, episode_id, trigger_type, trigger_ref, note, open_clinical_flag })
  acknowledge({ queue_item_id })   resolve({ queue_item_id, outcome, note, minutes, contact_id })   reopen   rate
  logOutreach({ queue_item_id, outcome, note, barrier, minutes })   → outreach_logged (+ contact_logged + staff_time_logged)
  requestCallback / completeCallback
  helpNow({ episode_id })                                           → help_requested(patient) + Urgent item + emergency_instruction_shown(full_screen)
screening.ts
  administerScreen({ episode_id, instrument_key, checkin_id, item_responses, framing }) → screen_administered (+ critical_item_hit,
        queue items per FR-30/FR-30a, rule evaluation on screen_scored, sharing_reasked bookkeeping)
  skipScreen / declineScreen({ episode_id, instrument_key, queue_item_id })
  readScreen({ screen_result_id, field })                          → screen_responses_read (FR-03a)
  recordAssessment({ episode_id, screen_result_id, trigger_ref, outcome, note, minutes })
  score(instrument, responses) → { score, positive, critical_item_hit }   (pure, exported)
  visibleScreenFor(state, screen, role) → { visible: boolean, score, items } (pure, exported)
followthrough.ts
  createReferral / setReferralState (FR-33 reopen rule, coverage warning via partner insurance)
  logContact({ episode_id, type, outcome, note, minutes })          → contact_logged (+ initial_contact_confirmed on first) + staff_time_logged
  scheduleVisit / setVisitState
  completeCarePlanItem
sensitive.ts
  setSensitiveStatus({ patient_id, episode_id, subtype, set_by })  → sensitive_status_set + Sensitive-review item + immediate suppression
                                                                       (+ pause offer is UI). Patient-set: no reason field.
  confirmSensitiveStatus / liftSensitiveStatus
  setSensitivePreferences({ ... })                                  → sensitive_preferences_set (+ pause when not_for_now, FR-56 deadline item)
summaries.ts
  draftSummary({ episode_id, period })                              → summary_drafted (structured from state; narrative from ai.ts canned)
  setSummaryState({ summary_id, state })
careplan.ts   (helpers used by enrollment; explanation lookup uses ai.ts reword exemplars with AI-01 label)
ai.ts
  reword({ content_id, episode_id })                                → { text, label, ai_interaction_id } from exemplars; ai_fallback_used when missing
  narrative({ episode_id, period })                                 → canned by persona+period; generic fallback
  organizeQuestions({ episode_id })                                 → saved_questions_grouped; never includes flagged questions
  All three: when ai_enabled is false, prefilter/postfilter are not_run; never call a network.
notifications.ts   (pure helpers used by projection to materialize the outbox)
admin.ts
  recordIncident / resolveIncident / recordPracticeSetupMinutes / reportFalseReassurance / recordMissedEscalation
metrics.ts
  computeMetrics(state, events, config) → Metrics (every measure in requirements 11.3, with breakdowns by locale,
  insurance_type and access_barriers; all-eligible primary, enrolled secondary)
```

## 4. Content and config IDs the code depends on

The CONTENT owner must provide these ids in `content/en/*.json` (approved unless noted) and
the CORE/UI owners must use exactly these ids:

| id | purpose | notes |
|---|---|---|
| `emergency_instruction` | FR-22 locked, safety_critical, layouts full_screen+inline | 911 for listed symptoms; 988 call or text; DV hotline; `{{after_hours_phone}}` |
| `urgent_symptom_list` | FR-04 placeholder list of warning signs | placeholder:true, based on CDC "Hear Her" warning signs, clinical owner to confirm |
| `after_hours_instruction` | FR-04 | `{{after_hours_phone}}` labelled placeholder |
| `contact_card` | FR-04 named contact | `{{contact_name}}`, `{{contact_phone}}`, `{{coverage_hours}}` |
| `help_resources` | FR-06 locked item when sharing withheld | crisis line + practice number |
| `nobody_reached_yet` | FR-24 locked "we have not been able to reach a nurse yet; do not wait for us" | `{{phone}}` |
| `acknowledgment.standard`, `acknowledgment.demo_participant` | FR-05 | demo variant states nothing entered is seen by a clinician |
| `acknowledgment.critical_shared`, `acknowledgment.critical_not_shared` | FR-05/FR-30a disclosure sentence | one is rendered by flag |
| `acknowledgment.free_text_scan_on`, `acknowledgment.free_text_scan_off` | FR-05/FR-17 mode sentence | |
| `screen.framing.epds`, `screen.framing.phq9`, `screen.framing.loss` | FR-27 | not a diagnosis; who sees it |
| `screen.disclosure.critical_shared`, `screen.disclosure.critical_not_shared` | FR-27 locked sentence | |
| `closing.no_follow_up` | FR-15 | approved wording from requirements 5.3 with `{{next_visit_date}}`, `{{contact_name}}`, `{{contact_phone}}` |
| `closing.pending` | FR-15 | `{{pending_what}}`, `{{target_time}}`, `{{phone}}`; includes the call-by and 911 sentences |
| `checkin.<template_key>.title` and `checkin.<template_key>.<item_key>` | FR-09a prompts | placeholder:true |
| `careplan.<key>.title` (+ optional `.body`) | FR-18/FR-19 | |
| `visit.prep.bring_baby_interpreter` | FR-20 | "you may bring your baby / interpreter available: yes, no, not yet confirmed" |
| `transition.intro` | FR-39 / 5.5 | |
| `sensitive.dialog.intro`, `sensitive.control.loss`, `sensitive.control.nicu`, `sensitive.control.stop_baby`, `sensitive.control.hard_birth`, `sensitive.not_for_now` | FR-07, FR-56 | tone_review_by required |
| `pause.confirm`, `stop.confirm`, `stop.done` | FR-13a | |
| `notification.neutral` | FR-66 | "You have a new item from your care team" |
| `ai.patient_label`, `ai.staff_label`, `ai.block_response` | AI-13, AI-14, AI-15 | |
| `queue.no_answer.urgent`, `queue.no_answer.needs_review`, `queue.no_answer.follow_through`, `queue.no_answer.unreached`, `queue.no_answer.sensitive_review`, `queue.no_answer.summaries` | queue no_answer_content_id | |
| `demo.handout` | "what this is and is not" | |

Spanish (`content/es/*.json`): only the safety-critical class (FR-63a): `emergency_instruction`,
`after_hours_instruction`, `contact_card`, `help_resources`, `nobody_reached_yet`,
`acknowledgment.*`, `closing.*`, `pause.confirm`, `stop.confirm`. Mark `approved` with
`approver: "placeholder-translator"` and `placeholder: true` so the Lucía second branch can run
while making clear the translation is unreviewed. Everything else in Spanish falls back with
the FR-63 marker.

Config keys the code depends on: cadence points `day03, day07, day14, day21, week06, week09,
week12` with templates of the same keys; check-in sets `loss`, `nicu`, `trauma` provided as
templates `loss_checkin`, `nicu_checkin`, `trauma_checkin`; instruments `epds` (primary
placeholder) and `phq9`; lexicons `burden, monitoring, claims, reassurance, emergency,
therapy_intent, medications`; queues all six keys; staff users `coord-1` (coordinator),
`ob-1` (clinician, config_approver, content_approver), `budget-1`, `partner-1`
(referral_partner); referral partner `bh-partner-1` (secured:false); rules at least:
`urgent_symptom` (checkin_submitted, response_tags any_of urgent_candidate → show_emergency_instruction
+ Urgent item), `coping_worst` (coping_difficulty → Needs-review + administer_screen epds),
`callback_requested` (→ follow_through), `critical_item` (screen_scored critical → urgent),
`positive_screen` (screen_scored positive → needs_review), `help_now`.

EPDS is reproduced with its required attribution (Cox, Holden & Sagovsky, 1987, British Journal
of Psychiatry 150:782–786). PHQ-9 is public domain (Pfizer/Spitzer, Kroenke, Williams). Both are
`placeholder: true` with `thresholds_confirmed_by: null` until the clinical owner confirms.

## 5. UI conventions

- React 18, function components, hooks. Router: `HashRouter`. Global state through
  `useStore()` from `src/domain/store.ts`. Commands are dispatched with `store.dispatch(cmd)`.
- Design tokens live in `src/styles/tokens.css` (SHELL). Palette: ground `#f7f6f2`, surface
  `#ffffff`, ink `#1d2321`, muted `#5c6664`, line `#d9d6cf`, accent (teal) `#1f5f5b` /
  soft `#e3efed`, warning (placeholder amber) `#8a5a12` / soft `#f6e9cf`, emergency
  `#9b2c2c` / soft `#f8e1e1`, ai (slate blue) `#3c5a99`. Type: system stack
  (`-apple-system, "Segoe UI", Roboto, sans-serif`) — no CDN fonts. Base 17px on the patient
  app, 15px on the dashboard. Tap targets ≥ 48px on the patient app.
- Shared components (SHELL, in `src/ui/components/`): `Button` (primary/secondary/quiet/danger,
  `size="lg"`), `Card`, `Chip` (variants: neutral, accent, warning, danger, ai), `Banner`
  (synthetic, warning, emergency), `Sheet` (bottom sheet / modal), `ListRow`, `Field`
  (label + control), `EmptyState`, `Placeholder` (the "placeholder — not clinically set"
  label), `LockedContent` (renders a locked content id; full_screen or inline), `DemoNote`
  (a founder-facing aside shown only when the admin has "show demo notes" on).
- Patient app layout: top bar with the synthetic banner and a persistent **I need help now**
  button; content column max 560px; bottom action bar for the primary action. Every check-in
  screen shows Skip / Not now / I need help now without scrolling at 360px.
- Practice dashboard layout: left nav (Queues, Patients, Screening, Referrals, Summaries,
  Metrics, Budget owner) with the coverage banner at the top; role-specific views hide what the
  role may not see (SR-14 is enforced in `visibleScreenFor`, not only by hiding).
- Every timestamp is shown in the practice timezone with `formatDateTime` from `clock.ts`.
- Placeholder values (thresholds, urgent list, practice number, owners NOT YET ASSIGNED,
  partner NOT YET SECURED, resources NOT YET PROVIDED) render with the `Placeholder` label —
  never blank.

## 6. Testing and definition of done

- `npm run typecheck` clean; `npm test` green; `npm run build` produces `dist/`.
- CORE: unit tests for scoring, rule evaluation, timers on both bases, unreached, day-21,
  sharing enforcement, FR-17 in both flag states, the AI-enabled-without-scan startup failure.
- CONTENT: `config.test.ts` loads config and asserts zero problems; `lexicon.test.ts` runs the
  claims/reassurance/monitoring/burden lexicons over every content body, every string literal in
  `src/ui` and every markdown file in `docs/` (excluding `requirements.md` and `analyst-review.md`,
  which quote the terms to prohibit them) and fails on a match.
- SEED: one end-to-end test per scenario (6.1–6.8, both branches where the requirements name
  two) asserting the acceptance criteria named in the requirements, run through the store in
  fallback mode. A determinism test reseeds twice and compares logs minus `wall_at` and ids.
- Every screen renders with no console errors; the app works at 360px wide.
