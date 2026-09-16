# NestWell prototype requirements

Working draft v0.1, September 16, 2026, revised after independent critique and verification. Prepared for Shahab (technical evaluator and likely builder) and the two NestWell founders (clinical content owners). Source of truth for scope: the independent analyst review (review.md, research checked September 16, 2026) and the authoring brief (brief.md, working assumptions A1–A9). Where this document says "the review," it means review.md. Where the review is silent, the document says so and names the working assumption it relies on. Nothing here is a legal determination; every uncertain regulatory point is written as a counsel-review or clinical-owner decision.

Reading guide. Requirements are numbered FR (functional), AI (AI boundaries), SR (safety, privacy, regulatory) and NFR (non-functional); each has acceptance criteria (AC) written so that Shahab can test it and a founder can sign it off. "Prototype" always means the synthetic-data demonstration build. "Pilot" means the later 12-week study with real patients, which this document does not authorize. "Config" means a versioned YAML file in the repository, validated at startup (FR-61); "approved content" means a markdown file with front matter in the repository (FR-60). The prototype has no configuration or content editors (7.11). "Placeholder" means a value the build ships so that the software runs, labeled as not clinically set, that a named clinician must replace or confirm. "Phase 1" and "Phase 2" are the two build phases in section 14; every requirement is built in one of them or deferred to the pilot, and section 14 says which.

Deviation from the review, stated once. The review recommends obtaining the FDA function-by-function assessment before building the central symptom and urgency features. The prototype builds demonstration versions of those features (FR-17, FR-23, FR-30, AI-01, AI-13) on synthetic data, never for use with patients, so that the function inventory (SR-09) is generated from real code rather than from a description. This ordering is a founder decision; it accepts the risk that the assessment (G5) requires these functions to be redesigned, and NFR-10 excludes them from anything carried forward.

## 1. Purpose, and the decisions the prototype supports

The review recommends funding a focused validation effort before a broad app build, and its "first 30 days" stage says to interview about 20 women and 8–10 practice stakeholders and to use synthetic examples for a prototype. This document specifies that prototype: a demonstration of one defined postpartum follow-through service, running only on synthetic patients, that the founders walk stakeholders through screen by screen.

The prototype is judged by whether it sharpens discovery conversations and de-risks the pilot build (A1). It is not judged by clinical outcomes, engagement, or revenue, and it produces none.

| Decision | What the prototype must make visible | Review basis |
|---|---|---|
| D1. Does the service promise resonate with postpartum women? | A check-in, care plan, and "real connection to help" usable one-handed in under two minutes, ending in a verified action rather than a sent message | "women complete the next appropriate step in their care, and the practice can verify that it happened"; Guidance 2 |
| D2. What remains unresolved for a practice after the tools it already has? | A dashboard focused on one handoff (postpartum visit and mental-health referral completion) with verified follow-through, owners, and staff minutes, shown beside the review's verified descriptions of incumbents (FR-70, alternatives worksheet) so a nurse can say "we already have this via ___" | Babyscripts row: "Ask practices what remains unresolved after existing tools" |
| D3. Who owns urgent contact, during what hours, and what happens when nobody answers? | Queue ownership, coverage hours, acknowledgment and resolution targets, and timeout behavior as visible configuration, with empty roles labeled NOT YET ASSIGNED and the employer of each role visible | Guidance 3 |
| D4. Who is the buyer, distinct from the referrer, and will they discuss a paid pilot? | Staff minutes per episode (median and top decile), an interview cost calculator the practice fills in itself, an after-hours coverage line, and a pilot scope sheet with two illustrative price structures (FR-47, FR-47a) | Guidance 4; "A referral channel and a payer are different"; next research step |
| D5. Which instrument, thresholds, and routing rules does the clinical owner want? | Instrument and thresholds as clinician-editable configuration files, changed between demo runs without a deploy, labeled unconfirmed until a named clinician confirms them | Guidance 2 example; A8 |
| D6. Which functions need FDA function-by-function review? | A function inventory generated from the prototype itself, every row marked "not yet assessed" | Guidance 5 |
| D7. Does the mental-health sharing model respect patient control while keeping mental health integrated? | Role-based sharing categories the patient and clinician can both see, a "nobody yet" path, the disclosed critical-item rule, and a patient-visible "who has seen my answers" list | Guidance 3 and 5 |
| D8. Build versus buy | A narrow, inspectable feature set compared against incumbents in the same interview using the alternatives worksheet, so a "partner with an existing service" outcome remains possible | "build-versus-buy question" |
| D9. Do the entity names, event names, and content and config file formats look right to the clinical owner? | Section 11 and the config and content layouts, reviewed on paper; the prototype application code is disposable (NFR-10) | A1 |

The review's most consequential unanswered question is whether the team can secure one practice with a named clinical owner and a budget owner willing to pay for a specific postpartum workflow. Everything below supports that conversation. The prototype cannot show that NestWell improves outcomes, prevents complications, or reduces workload; any conversation that drifts toward outcome claims is redirected to section 11, which describes what the pilot would measure.

Phase 1 (section 14) serves D1, D3, D5, D6, and D7 and a first cut of D2; Phase 2 completes D2, D4, D8, and D9. Interviews may begin at the end of Phase 1.

## 2. What the prototype is and is not

### What it is

- A mobile-responsive web application for a synthetic postpartum patient, installable as a PWA (A3).
- A web dashboard for a synthetic practice showing queues, a patient panel, follow-through status, clinician summaries, and metrics (A3).
- A rules engine that implements clinician-designed pathways as configuration files, not code (Guidance 3).
- An AI layer that ships canned, clinician-approved exemplars by default (`AI_ENABLED=false`); live Claude API calls on synthetic data are a founder opt-in (open question 8) behind a deterministic safety layer (A5).
- A synthetic cohort generator, a controllable demo clock, and seven scripted demo scenarios plus one optional.
- A metric-event pipeline that records the review's measurement list from day one.
- Documents produced alongside the code: FDA function inventory, queue ownership sheet, vendor record, data-flow map, alternatives worksheet, findings template, discovery-session safety protocol, and pilot-readiness gate checklist.

### What it is not (explicit non-goals)

| Non-goal | Reason |
|---|---|
| A product that holds real patient data, or retains any real person's entries beyond a demo session | A1; Guidance 7; SR-27 |
| The 12-week pilot product | A1; the pilot requires the gate in section 13 |
| AI symptom triage, urgency decisions, diagnosis, therapy, or therapeutic decision-making | Brief scope anchor; Guidance 3 and 5 |
| Rules-based triage presented as validated, "deciding nothing," or regulation-exempt | Review: rules-based logic also needs testing and is not automatically safe or exempt |
| Preconception or pregnancy management; any content served between enrollment and delivery beyond acknowledgment, preferences, and contact details | Guidance 1; 5.2 pre-delivery row |
| Blood-pressure monitoring | Documented alternative; out of scope unless a partner practice asks |
| EHR integration | A7 |
| Real SMS or email delivery | A3 |
| Spanish-language content beyond the safety-critical class needed to show a Spanish-speaking woman anything (FR-63a) | A6 |
| Real-time staffed response coverage | No patients, so no coverage; the coverage design must be visible |
| Configuration and content editing screens | Config and content are repository files with a CLI validator (7.11) |
| Consumer acquisition, billing, payments, reimbursement or billing-code logic | Guidance 4 |
| Any claim of clinical benefit, comparative performance, or regulatory status | "What to say, clarify, and prove" |

Positioning language. Screens, scripts, and exports describe "a defined postpartum follow-up program, its relationship to the woman's care team, and the practical help it provides." Improved access and reduced workload are goals until measured. "First-of-its-kind," "better than a clinician," "guaranteed," "proven outcomes," "HIPAA compliant," "FDA cleared," "non-device," "the app decides nothing," and "just shows information" never appear (SR-07). No competitor is characterized beyond the review's verified descriptions; "only static content" and "only baby-focused" are prohibited phrases.

## 3. Working assumptions

| ID | Assumption | Depends on | If wrong |
|---|---|---|---|
| A1 | Synthetic-only prototype supporting first-30-days discovery; never holds real patient data, and no real person's entries are retained beyond a demo session (SR-27); the data-model names, event names, and file formats (NFR-10) evolve into the pilot; application code may be rewritten | Founders accept the staged plan | This document is replaced by pilot requirements; section 13 becomes the entry condition |
| A2 | Company incorporated in Ohio (confirmed by Shahab); partner practice and patients assumed in Ohio. The Illinois Wellness and Oversight for Psychological Resources Act is assumed not to apply under this assumption; counsel to confirm. State law follows where the practice and patients are, and licensure rules can also attach to where a clinician performs services, so the founders must state where the clinical safety owner, any queue reviewer, and any NestWell staff will be located during pilot work (open question 1). The review assessed Illinois and noted Indiana; it did not assess Ohio, so no Ohio statute is asserted. An Ohio state-law review (SR-20) is a pilot gate item. Federal items (FDA CDS guidance, HIPAA/BAA, FTC rules) apply regardless | Location of practice, patients, and staff | Any other state, including a staff location outside Ohio, needs its own review; SR-17 keeps the question open |
| A3 | Patient PWA plus practice dashboard; SMS and email simulated; a messaging-provider interface exists with only a simulated implementation | Whether the practice wants text-first delivery in the pilot | Native apps would exceed A4 |
| A4 | 1–2 engineers (likely Shahab); founders supply and approve every patient-facing sentence. The brief's target of roughly 4–6 weeks of build effort is not supported by the bottom-up estimate in section 14: the prototype as specified is about 75 engineer days including contingency, built as Phase 1 (interview-ready walkthrough, eight weeks at five days per week) and Phase 2 (complete prototype, seven further weeks). A fixed six-week date buys the week-6 state named in section 14, not the interview-ready walkthrough | Founder content hours (section 14 content inventory); whether the founders accept the re-baselined dates or the week-6 cut | Section 14 cut list; if a second engineer joins, Phase 1 shortens to about five weeks and Phase 2 to about four, because the content path, not code, then bounds the date |
| A5 | Canned, clinician-approved AI exemplars are the default; live Claude API on synthetic data only, grounded in approved content behind deterministic layers, if the founders opt in | Open question 8; vendor terms (AI-20) | Fallback remains the only path; AI requirements still govern canned content |
| A6 | English only, except the safety-critical content class in Spanish (FR-63a) before any Spanish-speaking woman is shown the prototype; the content model supports Spanish | Practice's language mix | Spanish authoring enters section 14 |
| A7 | No EHR integration; summary shown in dashboard and exportable as print-styled HTML (PDF optional) | Practice's summary channel | Summary model is channel-independent |
| A8 | One primary instrument for the prototype (EPDS or PHQ-9; open question 6), GAD-7 optional and assigned to a distinct check-in; instruments, thresholds, and routing are clinician-owned config with attribution | Clinical owner's choice; licensing | Instrument change is a config change |
| A9 | Practice, clinical owner, budget owner, and referral partners not yet secured; the prototype demos without them and makes their roles visible | Whether the founders secure a practice | Names replace placeholders in config |
| A10 | Cadence: days 3, 7, 14, 21, weeks 6, 9, 12 (seven check-ins). Review is silent; this places three contacts before the ACOG three-week boundary and ends at twelve weeks | Clinical owner; practice's schedule | Config change |
| A11 | The founders name a clinical safety owner before the first external demo, who signs content, thresholds, the free-text decision (FR-17), the critical-item sharing flag (FR-30a), the demo scripts, the emergency content (FR-04), and the discovery-session safety protocol (SR-28) | Founder role assignment | Section 14 criteria cannot be met |
| A12a | The founders confirm their IP and outside-work obligations before any demo to practice stakeholders; no employer systems, patient information, or staff are used in building the prototype | Employer agreements | Demos to colleagues at their institutions wait |
| A12b | Recruitment of interview participants uses no employer patient list, EHR, scheduling system, or clinic staff; the founders obtain a written IRB or quality-improvement determination, or written institutional confirmation that none is required, before the first interview; where uncertain, counsel review rather than an assumption that discovery is exempt | Institutional policy | Interviews with women wait |
| A13 | Personas are generated, not adapted from real records | A1, A12 | Institutional review first |
| A14 | Demo clock; seeded accounts per role, no self-registration; staff time by manual minute entry | None for the prototype | Prototype-only |
| A15 | Illustrative economics (review's $60 per loaded hour, 90 minutes per episode, $200 per completed enrollment) are labeled placeholders; the practice types its own numbers in the interview calculator | Pilot pricing | Defaults change only |
| A16 | Every queue owner, backup, and on-call clinician in 5.4 is an employee or contractor of the partner practice, not of NestWell; NestWell supplies software and configuration only | Staffing model | SR-18, SR-20, SR-25 must be re-scoped by counsel to cover NestWell as a service provider (Ohio licensure of NestWell staff, supervision, corporate-practice rules, malpractice cover); the pilot agreement must define it |
| A17 | Prototype personas are adults; the pilot enrolls adults only unless counsel and the clinical owner define a minor-patient policy | Counsel (SR-20) | Eligibility rule and consent flows change |
| A18 | Author defaults where the review is silent: check-in size (5 items, 90 seconds), unreached trigger (2 consecutive unopened), acknowledgment placeholders (30 minutes urgent, same business day needs-review, 3 business days follow-through), weekly burden cap (12 items including instrument items), response window 48 hours, reminder offset 24 hours. All are config; the clinical owner confirms them | Clinical owner | Config change |

## 4. Users and personas

### 4.1 Postpartum patient

A woman between the last weeks of pregnancy and twelve weeks after delivery. She may be recovering from a vaginal or surgical birth, sleeping in fragments, feeding an infant every two to three hours, caring for other children. She may be grieving. She may lack transport, paid leave, childcare, or a data plan. English may not be her first language. Her phone may not be private. She does not want another job (Guidance 3).

Design consequences every patient-facing requirement must honor:

- Any interaction is completable one-handed, on a phone, in under two minutes, and abandonable without penalty.
- Every screen offers "Skip" and "I need help now"; the help path and named contact are reachable before she has acknowledged anything (FR-05).
- The product never celebrates or references the baby unless she has said that is welcome.
- She controls what mental-health information is shared with whom, including "nobody yet," and is told before answering exactly which item is shared regardless (FR-27, FR-30a).
- She can pause or stop the program herself in two taps (FR-13a) and can flag a loss, a NICU admission, or a hard birth herself without explaining (FR-07).
- The product never tells her she is fine, never characterizes her answers, and never implies someone is watching when nobody is (FR-15, FR-24, FR-25).
- Wherever she can type in her own words, the crisis line, the emergency instruction, and the named contact are on the same screen, and she is told who will read her note and by when (FR-17).

User stories:

- I want to answer a few questions about how I am doing so someone at my practice knows if something is off, without calling.
- I want to see my plan in plain words so I know what appointment is next and what to bring.
- I want a named person and a phone number, including at night.
- I want to say "not now" and not be nagged, and to stop entirely if I choose.
- If I have lost my baby, I want the app to stop talking about the baby and ask how I want to be contacted.
- I want to decide whether my mood answers go to my OB, my coordinator, a counselor, or nobody yet, and to see who has looked.

### 4.2 Other roles

| Role | Goals | What they see | Prototype login |
|---|---|---|---|
| Practice care coordinator or nurse | Work queues, confirm callbacks and appointments, log minutes and outcomes, acknowledge and resolve escalations, record contacts, set sensitive status | Queues, patient panel (positive/negative flags; item-level responses only if the patient's sharing category includes coordinator), outcome forms | Practice login, view `coordinator` |
| OB clinician (clinical safety owner when holding `config_approver`) | Review positive screens, record assessments, approve summaries, own rules, thresholds, and content | Screening queue, summaries, rules-harness report | Practice login, view `clinician` |
| Practice budget owner | Understand staff minutes, coverage requirements, cost, and pilot scope; decide whether to discuss a paid pilot (distinct from recommending) | Metrics, interview calculator, pilot scope sheet, queue ownership sheet; no item-level screening data | Practice login, view `budget_owner` (read-only aggregates) |
| Behavioral-health referral partner | Receive a referral with consented fields; confirm coverage, booking, kept, or no capacity | Partner panel, played by staff (A9) | Practice login, view `referral_partner` |
| NestWell operator or admin | Load scenarios, set the clock, reset data, review AI, incident, and audit logs, export | Admin: clock, scenario load/reset, logs, exports (no editors) | Admin login |

Three logins exist (patient, practice with an on-screen view switcher, admin). Route gating follows the active view; FR-06 sharing and the budget-owner exclusion are enforced at the data layer (SR-14). Every owner field shows NOT YET ASSIGNED until set (A9); every queue definition shows `employer` (A16). Advisory clinicians are not a persona: an advisory board does not provide a staffed response service, and a persona here must own a queue.

## 5. The service model the prototype demonstrates

### 5.1 The promise

Women complete the next appropriate step in their care, and the practice can verify that it happened. Every element below is a step toward that or a verification of it.

### 5.2 Twelve-week timeline

Day 0 is the delivery date, including a stillbirth. Enrollment may occur late in pregnancy, before discharge, or after delivery (FR-02 handles late enrollment). The twelve weeks are an evaluation window, not a claim that risk ends (Guidance 1).

| Window | Patient experience | Practice action | Verification recorded |
|---|---|---|---|
| Enrolled, pre-delivery | Acknowledgment, preferences, named contact, after-hours instruction only; no check-ins, reminders, or pregnancy content | Coordinator confirms named contact | Eligibility status for every eligible patient |
| Day 3 | First check-in: recovery, one mood item, one barrier item | Review anything flagged; barrier follow-through item | Check-in complete, partial, skipped, unopened, not_applicable |
| Day 7 | Check-in; early-visit reminder if on plan | Callback if requested | Callback occurred, minutes |
| Day 14 | Check-in; primary instrument step | Positive screen to clinician within target | Time from positive screen to assessment |
| Day 21 | Check-in; day-21 sweep | Coordinator confirms a human contact occurred | Initial contact by day 21, set only by a logged human contact (FR-37) |
| Week 6 | Check-in; visit preparation; instrument repeat (config); usefulness item | Scheduling support; referral follow-up | Visit completed; referral appointment kept |
| Week 9 | Check-in; unresolved-issue sweep | Summary drafted for review | Summary reviewed |
| Week 12 | Transition check-in and page; usefulness item | Transition summary reviewed; owners for open items | Comprehensive visit completed; destination or "no destination identified" |

### 5.3 Check-in design principles

- At most five items per scheduled check-in, excluding the instrument step; target under ninety seconds (FR-09, A18).
- The first screen shows the emergency instruction and "I need help now" above the questions.
- Single-tap items; free text optional and never required; the locked emergency instruction sits beside every free-text field (FR-17).
- "Skip" is always available; "Not now" reschedules once; a patient-set pause is never an Unreached signal (FR-13, FR-13a).
- No streaks, badges, scores, or "you missed a check-in" language (FR-12).
- A check-in ends with a process statement about what the practice will do and by when, computed from coverage config, never a characterization of her answers. Approved example: "Your answers are saved. Nobody is scheduled to call you about this check-in. Your next visit is on the 14th. If anything changes, tap I need help now or call [contact]." When anything is pending: "Your written note will be read by a nurse by [computed time]. If you have not heard from us by then, call [number]. If this is an emergency, call 911 now." (FR-15).
- Screening instruments are their own attributed step with plain framing that states which item is always shared (FR-27).

### 5.4 Who owns what

Every cell is config with a placeholder until a practice sets it; every owner is a practice role (A16). Roles are the five practice views plus a permission qualifier (NFR-07).

| Queue | Trigger | Owner (backup) | Coverage | Acknowledgment / resolution target | If nobody answers |
|---|---|---|---|---|---|
| Urgent | Urgent rule, critical item, "I need help now," emergency-lexicon match (FR-17, AI-15) | Coordinator (clinician with `on_call`, NOT YET ASSIGNED) | Placeholder | 30 min ack; resolution (contact attempted, outcome logged) 2 h, placeholders | Escalated at ack target, UNOWNED at backup target; patient screen switches to the "we have not reached a nurse yet, do not wait for us" locked item (FR-25) |
| Needs review | Positive screen, coping-difficulty answer, any free text, therapy-intent block, referral dead end | OB clinician (practice on-call clinician, NOT YET ASSIGNED; NestWell clinical safety owner notified only) | Placeholder | Same business day | Escalated, then UNOWNED; counted as missed escalation |
| Follow-through | Referral, visit, callback, barrier item | Coordinator | Placeholder | 3 business days | Ages visibly; weekly unresolved list |
| Unreached | Two consecutive unopened check-ins while not paused (FR-13) | Coordinator | Placeholder | Placeholder; shorter when flagged "open clinical item" | Outreach logged; no further reminders |
| Sensitive review | Sensitive status set (by staff or patient) | Clinician | Placeholder | Placeholder; loss "not for now" requires a logged human contact within 7 days (config) then escalates like Needs review | Suppression is automatic and does not wait |
| Summaries to review | Week 9, 12, on demand | OB clinician | Placeholder | Placeholder | Stays draft; listed by owner |

Timers run per `timer_basis` (wall or coverage_hours), default wall, so an item created outside coverage counts toward UNOWNED unless config says otherwise; the queue sheet states the basis in force.

### 5.5 Transition at week 12

The patient sees a plain-language transition page: primary care contact, whether a mental-health connection is confirmed, what is open, whom to call, and, for indicated episodes with no destination, the named practice owner and next contact date. The practice sees the same list with an owner per open item. "No destination identified" is itself a finding and surfaces the referral-capacity gap the review names as a pause condition (FR-39).

## 6. Demo scenarios

Each scenario is a generated persona (A13) plus a script at `demo/scripts/<scenario>.md`: purpose, persona, starting clock, ordered steps (actor, screen, action, expected result, clock setting), expected events, and discovery questions by stakeholder. A founder who did not write the software must be able to run it. Scenario variants are separate seed branches selected in the admin panel (section 12), not live recomputation.

Availability by build phase (section 14): scenarios 6.1, 6.2, 6.3, 6.5, and the blocked-enrollment branch of 6.6 run live at the end of Phase 1; 6.4, the second branch of 6.6, 6.7, and 6.8 run at the end of Phase 2. A script is never shown as live before its scenario's end-to-end test passes.

### Scenario-to-audience matrix

| Scenario | Women | Practice stakeholders |
|---|---|---|
| 6.1 Dana, 6.5 Keisha, 6.6 Lucía | Default | Default |
| 6.2 Priya | Default without the critical-item variant; the persona, never the participant, answers the instrument | Default, with variants |
| 6.3 Marisol, 6.4 Elena | Only after a stated content warning and opt-in; not shown to a participant with a known loss history without the tone reviewer's input | Default |
| 6.7 Tamsin, 6.8 threshold change | Not shown | Default; 6.8 optional |

Every session with a woman runs under SR-27 (demo participant mode) and SR-28 (discovery-session safety protocol). Every practice-facing script opens with the cross-scenario block: "Who owns the postpartum gap at your practice today? Which tools (Babyscripts, EHR portal, Maven or Pomelo via a plan, phone protocols) do you use or have evaluated, and what remains unresolved after them? Who would pay?" and closes with the paired questions: to the clinician, "Would you recommend this to patients?"; to the budget owner, "Would you pay for it, from which budget, at which structure?" The alternatives worksheet (FR-70) is shown after the dashboard. Answers are recorded in the findings template (FR-70).

### 6.1 Uneventful recovery — "Dana"

Vaginal birth, first child, English, commercial insurance, no barriers. (1) Admin loads Dana enrolled at 38 weeks; show acknowledgment, preferences, baby-reference permission "welcome," pause and stop controls. (2) Clock to days 3, 7, 14, 21: each check-in under two minutes; day-14 screen below threshold; closing statement is the process-only wording. (3) Week 6: care plan, what to bring, saved questions; coordinator marks visit completed. (4) Week 12: transition page; summary reviewed and exported. Late-enrollment variant: Dana enrolled on day 20 by a nurse in person; days 3, 7, 14 show `not_applicable`, no Unreached item, no reminders, the in-person enrollment counts as the day-21 contact. Steps 3 and 4 use Phase 2 screens; in Phase 1 the script stops at day 21. Ask women: "Would you have answered these? Which question was pointless? Too much contact or too little?" Ask nurses: "Is anything here work you do not already do? What did it cost in minutes?"

### 6.2 Positive mood screen to confirmed appointment — "Priya"

Surgical birth, second child, English, Medicaid, transport barrier. (1) Day-3 barrier answer "no ride" creates a transport Follow-through item and shows the practice's transport resource item (placeholder NOT YET PROVIDED). (2) Day-14 check-in: coping-difficulty at the worst option creates a Needs-review item immediately; the instrument is offered "now or at your next check-in." (3) Score at threshold; sharing "clinician and coordinator." (4) Needs-review item with clock running; clinician acknowledges the same business day and records an assessment. (5) Referral to the placeholder partner with consented fields and consent basis recorded; partner panel confirms Medicaid coverage, then "appointment scheduled," then "kept." (6) Panel shows hours from screen to assessment and to connection. Variants (practice only): (a) instrument declined, item shows "reported difficulty coping; screen declined"; (b) sharing "nobody yet," threshold positive: practice sees "screen completed, sharing withheld," no queue item; (c) sharing "nobody yet," critical item positive: the pre-instrument disclosure is shown, then the emergency instruction with crisis line, then an Urgent item reading "critical safety item positive; other results withheld at patient request; policy unconfirmed (FR-30a)"; (d) referral declined: the Needs-review item reopens for an alternative plan; (e) ownership rule: clock past the target first, item escalates, then acknowledge. In Phase 1, step 5 shows referral states set from the practice view and step 1 shows the Follow-through item without the resource item; the partner panel and resource items are Phase 2. Ask nurses: "Who makes that call today, and how do you know it happened?" Ask budget owners: "Who would you send this referral to, and do they have capacity and take Medicaid?"

### 6.3 Emergency instruction and same-day practice call — "Marisol"

English, cesarean. (1) Day-7 check-in; she taps an item on the clinical owner's placeholder urgent list. (2) The locked emergency instruction (911 or nearest emergency department for the listed symptoms, crisis line, practice after-hours number labeled placeholder) renders before any other content; no acknowledgment required to leave; AI log shows no call. (3) Urgent item with acknowledgment and resolution timers; coordinator acknowledges, logs a 12-minute call, closes the item; the panel shows 12 minutes, not 24. (4) Variant, 7 p.m.: timer lapses; escalated, then UNOWNED; the patient screen switches to the "we have not reached a nurse yet" item; both timer bases shown. (5) Audit log: rule ID and version, shown, acknowledged, outcome. (6) State the free-text mode in force (FR-17) and show, on the check-in's optional free-text field, the locked instruction and named contact that render beside it in every mode, and the closing statement's "read by [time]; if you have not heard from us, call" sentence. Notice, said aloud: "The app applies a rule the clinical owner wrote and creates accountability for a human response; whether that rule is a device function has not been assessed (SR-21)." Ask clinicians: "Is the instruction correct? Who owns this at 7 p.m., and what does your after-hours arrangement cost today?"

### 6.4 Pregnancy loss and sensitive mode — "Elena"

Enrolled at 34 weeks; stillbirth at 36 weeks, entered as day 0. (1) Elena taps "Something has happened to my baby" on her home screen: suppression and the sensitive check-in set activate immediately, a Sensitive-review item is created, nothing further is asked; the coordinator later confirms the subtype. (2) Every infant, feeding, milestone, celebration, birth-story item disappears from plan, check-ins, and outbox; suppressed notifications show the reason. (3) The preferences dialog appears once: how she is addressed, whether the baby's name is used, contact frequency including "not for now." (4) "Not for now": check-ins pause; the patient is told "[named contact] will call you once in the next week to agree how we stay in touch; you can say no"; the item carries a 7-day contact deadline and the week-12 due date. (5) Recovery follow-up, the loss-framed mood screen (FR-57), and a mental-health referral remain available; the transition page stays reachable from home. (6) Nothing resumes automatically. Ask women (opt-in only): "Is there anything here that would have hurt to see?" Ask nurses: "How do you flag this today so nothing automated goes out?"

### 6.5 Patient who stops responding — "Keisha"

English, uninsured, no reliable phone. (1) Responds day 3 and 7. (2) Day 14 unopened; one reminder. (3) Day 21 unopened; exactly one Unreached item, no further reminders; sweep emits `no_contact_by_day_21`. (4) Coordinator logs two attempts, then "reached: transport barrier, visit rescheduled" on day 27; first contact recorded day 27, day-21 flag stays unmet, visibly. (5) Metrics: dropout and the barrier breakdown (Phase 2; in Phase 1 the script ends at step 4). Variant: Keisha had chosen "Pause 2 weeks" at day 7; no Unreached item is created. Ask nurses: "What do you do today when a patient goes quiet? How many could you absorb per week?"

### 6.6 Spanish-speaking patient — "Lucía"

Preferred language Spanish, Medicaid, interpreter need. (1) Enrollment captures language; the safety-critical Spanish class (FR-63a) is not yet approved, so enrollment is blocked with an admin-visible reason and eligibility `not_offered`, reason `language_content_unavailable`; she counts in the denominator. (2) A human-only outreach item flagged "interpreter or Spanish-speaking staff needed." (3) Content report lists the safety-critical items needed before she can be enrolled. (4) Metrics segmented by language show her row (Phase 2). Second branch (Phase 2), once the class is approved: she enrolls; check-ins show the Spanish marker on unapproved ordinary items. Ask Spanish-speaking women, through an interpreter: "What would you want the first message to say? Who would you want to call you?" Ask practices: "What share need Spanish, who calls them today, who approves the Spanish text?"

### 6.7 High utilizer — "Tamsin"

English, commercial, twins, NICU stay. (1) NICU status suppresses milestone and celebration items. (2) Weeks 2–6: "I need help now" at most check-ins, many saved questions; each saved question creates a queue item on entry (FR-17). (3) One saved question contains an emergency-lexicon term. The script has two seed branches and shows both. Branch "scan on" (`free_text_urgency_scan: true`): the entry scan matches, the full-screen locked instruction with crisis line renders, an Urgent item is created in the same request, the lexicon version is logged, and no model is called. Branch "scan off" (the default until the clinical owner sets the flag): no text is scanned; a Needs-review item is created in the same request; the locked instruction with crisis line and named contact is visible beside the field, and the closing statement reads "Your written note will be read by a nurse by [time]. If you have not heard from us by then, call [number]. If this is an emergency, call 911 now." The founder says aloud: "In this mode a note that mentions self-harm reaches a clinician on the same-business-day target; the clinical owner chooses this by leaving scanning off, and the crisis line is on the screen either way." (4) Canned AI-03 exemplar groups her other questions without answering; original text alongside; the flagged question is never sent to the organizer. (5) Minutes accumulate; budget-owner view shows her in the top decile beside the practice's own calculator inputs. Ask budget owners: "What is the maximum staff time per episode you would fund, and what happens after it?" Ask clinicians: "Which branch do you want, and who reads a same-day note at 4 p.m. on Friday?"

### 6.8 Optional: threshold change

The clinical owner edits `config/instruments/<key>.yaml`, sets `thresholds_confirmed_by`, runs the validator and harness, restarts; the banner clears; the harness report lists changed cases as "changed, unconfirmed" until confirmed; 6.2 re-runs and routes differently (D5).

### Findings capture (FR-70)

**FR-70 Findings template and alternatives worksheet.** `demo/findings/<date>-<stakeholder-type>.md` has one heading per decision D1–D9, the scenarios shown, verbatim answers to each scripted question, the calculator values entered (FR-47), the recommend-versus-pay answers, and a "we already have this via ___" field. `docs/alternatives-worksheet.md` is a one-page table of the five comparators' verified positioning copied from the review, with columns "what the practice uses or considered" and "what remains unresolved locally."
AC: Both exist; both were used in the two dry runs; the SR-07 scan runs on the worksheet.

## 7. Functional requirements

### 7.1 Enrollment and preferences

**FR-01 Eligibility denominator.** Every eligible synthetic patient has status `enrolled`, `declined`, or `not_offered` with a reason; `is_adult` false records `not_offered`, reason `minor_policy_undefined` (A17).
AC: 30 eligible with 24 enrolled displays 80%; a status change emits `eligibility_changed` and the metric uses the latest status.

**FR-02 Enrollment timing and late enrollment.** Enrollment captures an expected delivery or discharge date and an enrollment point; the schedule is generated from the delivery date (a loss date counts). Check-ins whose window ended before enrollment are created as `not_applicable` (excluded from FR-13, FR-14, and denominators; visible on the timeline); the first live check-in is scheduled no sooner than enrollment plus one day and no later than the next cadence point. Between enrollment and delivery only acknowledgment, preferences, contact, and help are available.
AC: Changing the delivery date regenerates unsent check-ins only; the Dana late-enrollment variant creates no Unreached item and no reminders; no content renders pre-delivery beyond the four items.

**FR-03 Preferences.** Contact windows; language; form of address; baby reference permission; a safety question, "Is it safe for you to receive texts and emails from us on this phone?" (no disables all outbound bodies beyond a neutral prompt and marks coordinator items "contact by phone call only"); and the mental-health sharing category: `clinician_only`, `clinician_and_coordinator`, `clinician_coordinator_partner`, `nobody_yet`. Defaults are the least-intrusive option, shown before she confirms (open question 14).
AC: Each preference is editable from home in two taps; `preferences_changed` carries the field; the outbox test asserts no body content for a "no" patient.

**FR-03a Who has seen my answers.** A patient-visible list, reachable from home, of each staff view of her screening responses or free text (role and date, no names), derived from the read records in SR-13.
AC: A clinician opening Priya's item responses adds one row.

**FR-04 Named contact and emergency instruction.** Home always shows the named contact, phone, coverage hours, after-hours instruction, and the locked emergency instruction. The emergency instruction is real, generic, and approved by the clinical safety owner before any external demo: call 911 or go to the nearest emergency department for the listed symptoms; a national crisis line for thoughts of self-harm; a domestic-violence hotline; the practice after-hours number as a clearly labeled placeholder.
AC: Reachable in one tap from every patient screen regardless of acknowledgment state; the patient view never renders a placeholder for the emergency instruction; only the practice number may be a labeled placeholder; the practice view shows NOT YET ASSIGNED, never blank.

**FR-05 Enrollment acknowledgment.** States in plain words what the service does and does not do (not emergency care, not a substitute for her care team, not therapy); names each role that may see her data and the default category she starts with; states the critical-item rule in force (FR-30a wording); states that every staff view of her answers is recorded; states that anything she types is read by a person, not a program, and by when; names the pause and stop controls. It carries a "pending counsel review" marker until cleared. In demo participant mode (SR-27) it also states that nothing entered is seen by any clinician and that the numbers on screen are not real.
AC: Scheduled check-ins, care plan, and preferences are gated on acknowledgment; FR-04 and FR-21 are not; "Not now" returns to a home screen with only the contact, help path, and prompt; the rendered disclosure text is asserted against the flag values (FR-30a, FR-17) in every mode.

**FR-06 Sharing controls enforced in code.** Screen scores, item responses, and mood free text route only to the roles in the patient's category. With `nobody_yet`, the practice sees "screen completed, sharing withheld," no score, and no Needs-review item is created for a threshold positive; the patient sees the named contact and a locked help-resources item containing the crisis line and practice number. The sharing question is re-asked once, as a single tap at the next instrument step; after a second "nobody yet" it is available only from home and the framing step; `sharing_reasked` carries the count. Packets and summaries generated while withheld contain no withheld content and state "withheld at patient request." Enforcement is at the data-access layer (SR-14). Safety events (FR-30a, FR-23, FR-21, lexicon matches and prefilter blocks) are not mental-health sharing categories.
AC: A direct API request for a withheld field by the referral-partner or coordinator role returns nothing; tests cover each category; the packet text is asserted; the re-ask count never exceeds one.

**FR-07 Status changes.** A coordinator or clinician can record any sensitive subtype. The patient can, from home in two taps and without a reason, select "Something has happened to my baby," "My baby is in the NICU," "Please stop all messages about the baby," or "My birth was hard and I do not want to be asked about it"; each immediately applies the matching suppression, offers a pause, creates a Sensitive-review item, and asks nothing further in that session; the coordinator later confirms the subtype.
AC: Each patient control activates 7.10 in the same request; no reason field exists on the patient side.

### 7.2 Check-ins

**FR-08 Scheduled check-ins.** Generated from cadence config (A10) relative to delivery date; every check-in has `response_window_hours` (48) and `reminder_offset_hours` (24); state becomes `unopened` at window end if never opened and `partial` if opened and not submitted. All scheduling reads the demo clock; personas are seeded with their full history at seed time (section 12).
AC: Setting the clock to day 21 shows exactly the check-ins, queue items, and events with `occurred_at` on or before day 21; changing cadence affects future check-ins only.

**FR-09 Brevity.** At most five items excluding the instrument step (A18).
AC: The validator rejects a template with six non-screening items.

**FR-09a Check-in item schema and placeholder set.** Items: `key`, `domain` (recovery, mood, symptoms, barriers), `prompt_content_id`, `response_type` (single_tap, multi_tap, yes_no, free_text_optional), `options[]` with `value` and `rule_tags[]` (`urgent_candidate`, `coping_difficulty`, `barrier_transport`, `barrier_childcare`, `barrier_phone_data`, `barrier_interpreter`, `barrier_cost`), `skippable` (always true). `config/checkins/day03.yaml` through `week12.yaml` ship placeholder items marked "placeholder, not clinically set."
AC: All seven templates validate; the rules harness runs against them; the placeholder label renders in the patient app until replaced.

**FR-10 Skip, not-now, and help controls.** Every check-in screen shows "Skip" (item or whole check-in), "Not now" (reschedules once within the window; does not count toward FR-13), and "I need help now."
AC: All reachable without scrolling at 360 px; help opens FR-21 in one tap; item skip and whole-check-in skip emit distinct events.

**FR-11 Partial completion.** Submittable with unanswered items; stored `partial`; never re-prompted.
AC: As stated.

**FR-12 No burden mechanics.** No streaks, scores, badges, or missed-check-in language.
AC: Lint against `config/lexicons/burden.yaml` fails the build on a match.

**FR-13 Unreached routing.** Two consecutive unopened check-ins (or whole-check-in skips with no human contact by day 21) while not paused create exactly one Unreached item and suppress reminders until an outreach outcome is logged. A completed or partial check-in, or any human contact, resets the count. After "reached," check-ins and one reminder each resume from the next check-in; after "not reached," check-ins are sent without reminders; a new run of two after resolution creates a new item. An Unreached item for an episode with an open Needs-review or Urgent item, a positive screen in the last 30 days, an open referral, or a sensitive status is flagged "unreached with open clinical item," sorts above other Unreached items, carries a shorter target (config), and links to those items; the day-21 sweep applies the same flag.
AC: Keisha: exactly one item at day 21; a second skip creates none; the flagged variant sorts first; the paused variant creates none.

**FR-13a Patient pause and withdrawal.** From home in two taps: "Pause check-ins" (1 week, 2 weeks, until I turn them back on) and "Stop the program." Pause suppresses check-ins and reminders, emits `checkins_paused` with actor `patient`, creates no Unreached item, keeps contact and help unchanged. Stop closes the episode with `close_reason = patient_withdrew`, emits `dropout_recorded`, keeps help and contact visible, and creates one Follow-through item to confirm her care-plan destinations, with no further app contact.
AC: A paused Keisha produces no Unreached item; a stopped Dana receives no outbox rows after the stop.

**FR-14 Reminder restraint.** One reminder per check-in; none after FR-13, pause, or stop.
AC: Keisha outbox test.

**FR-15 Closing statement.** The "no follow-up" statement renders only when every item was answered, no free text was entered, no screen was deferred or declined, no rule fired, and no queue item is open for the episode; otherwise the statement names what is pending with a time computed from the next coverage window, and every statement promising review includes "If you have not heard from us by [target], call [number]. If this is an emergency, call 911 now." Statements describe only what the practice will do and when. After any free text the pending form is mandatory (FR-17).
AC: Every closing item passes the reassurance deny-list (seed includes "nothing needs follow-up," "you are doing fine," "all clear," "looks fine," "no concerns"); a scenario test asserts the pending wording after free text; the lint rejects a review promise without the call-by and emergency sentences.

**FR-16 Burden cap.** A weekly cap (A18) counts instrument items; at most one instrument per check-in; two configured instruments must be assigned to distinct check-ins or the validator rejects the config. The cap never defers a screen or item triggered by a rule or a coping response; a scheduled item is dropped instead.
AC: `burden_cap_deferred` for a triggered screen is a validation failure in tests.

**FR-17 Free text: human-routed on entry, never a dead end.** Every patient-entered free-text field (check-in free text, saved questions, usefulness comment, sensitive-preferences free text) is optional, is never interpreted by a model, and on entry creates one Needs-review item in the same transaction as the save. Three things hold in every mode and depend on no flag: (a) the locked emergency instruction (FR-22: 911 for the listed symptoms, the crisis line, the named contact and after-hours number) renders beside every free-text field before she types; (b) the closing statement after any free text is the FR-15 pending form, never the no-follow-up form; (c) the practice item shows the same-business-day target and its clock. The emergency lexicon (`config/lexicons/emergency.yaml`) is evaluated against patient text in exactly two places: at entry, when `free_text_urgency_scan` is true, and inside the AI prefilter (AI-15), whenever live AI is enabled. A match in either place always does the same three things in the same transaction: renders FR-22 as a full-screen item before any other content, creates one Urgent item in place of the Needs-review item, and emits `help_requested` with source `lexicon_match` and the lexicon version. There is no mode in which a lexicon match routes only to Needs-review. `free_text_urgency_scan` lives in `config/freetext.yaml` under the clinical safety owner's name, unconfirmed and off until they set it; because the prefilter is itself a lexicon scan, `AI_ENABLED=true` with the flag off fails validation at startup, so the owner cannot receive a scan they have not signed. With the flag off, no text is scanned anywhere: a note that mentions self-harm reaches a clinician on the same-business-day target; the patient has seen the crisis line, 911, and the named contact beside the field and in the closing statement; the script states this trade-off aloud (6.7), and the owner accepts it by leaving the flag off (open question 7). The same lexicon file serves both uses; the owner's sign-off covers both.
AC: Flag off: a lexicon term in Tamsin's saved question creates a Needs-review item in the same request, the field renders the locked instruction, and the closing statement is the pending form with the call-by and emergency sentences; flag on: the same input renders the full-screen instruction, creates one Urgent item and no Needs-review item, and logs the lexicon version; `AI_ENABLED=true` with the flag off fails startup; no closing statement after free text ever passes the no-follow-up assertion; the acknowledgment (FR-05) states the mode in force.

### 7.3 Care plan and education

**FR-18 Care plan items.** Instantiated from `care_plan_template` config (key, version, title content ID, owner role, due window, tags); medications only as entered by the practice.
AC: Template changes do not alter existing items; nothing is generated.

**FR-19 Explanations from approved content.** Verbatim approved content or a labeled AI rewording grounded in a named item (AI-01).
AC: Every explanation shows content ID and version; unapproved items render an UNAPPROVED watermark and never in demo mode.

**FR-20 Appointment preparation.** Each visit shows date, purpose, what to bring, an approved line "you may bring your baby / interpreter available: yes, no, not yet confirmed," and saved questions. Every saved question is governed by FR-17 on entry, including the instruction beside the field.
AC: Saved questions appear in her order; the summary includes them; a lexicon term in a saved question produces the FR-17 behavior for the mode in force, in the same request.

### 7.4 Help and escalation

**FR-21 "I need help now."** One tap shows the locked emergency instruction with crisis line, after-hours number, named contact, and "request a callback." For Urgent items the preferred window is ignored, the screen states "If this cannot wait, call now," and preferred windows apply only to Follow-through callbacks. `emergency_instruction_shown` is queued client-side with the render timestamp and posted to `/events/client` on reconnect, flagged `client_reported`. Callback creation requires connectivity and the screen says so offline.
AC: Renders with no synchronous network call and from cache offline; the queued event appears after reconnect with `client_reported = true`; the callback item cannot close without an outcome.

**FR-22 Locked emergency content.** Rendered byte for byte by non-AI code; the AI layer neither reads nor emits it. It exists in two layouts from one content item: full-screen (rule matches, critical items, lexicon matches, prefilter blocks, "I need help now") and inline (beside free-text fields, in help-resources items, in pending closing statements).
AC: Snapshot test for both layouts; injection test with softened emergency language is blocked.

**FR-23 Rules-based urgent pathway.** Rule grammar: `trigger` in {checkin_submitted, screen_scored, checkin_window_closed, status_set}; `conditions` as {field, op in {eq, gte, lte, in, any_of}, value} combined all/any; `action` in {show_emergency_instruction, create_queue_item(queue_key), administer_screen(instrument_key), pause_checkins}; validated by Zod at startup. An urgent match or critical item renders the instruction before any content and creates an Urgent item; the AI layer is not called.
AC: Marisol AI log empty; rule ID, version, effective date logged; every configured rule has a harness case and an inventory row.

**FR-24 Coverage honesty.** Every help request and closing statement shows the owning role and coverage hours; outside coverage, while escalated, or while UNOWNED, the patient sees the locked "we have not been able to reach a nurse yet; do not wait for us: call [number] now; if this is an emergency, call 911" item, never a waiting message.
AC: Clock outside coverage switches copy; monitoring-language scan passes; coverage-none test shows only the after-hours item.

**FR-25 Acknowledgment, resolution, and UNOWNED.** Urgent and Needs-review items carry an acknowledgment target and, for Urgent, a resolution target (contact attempted and outcome logged). Transitions: open → escalated (`escalation_escalated` at ack target) → UNOWNED (`escalation_unacknowledged_timeout` at `backup_ack_target_minutes`), each once per item; `minutes_to_ack` is demo-clock minutes from creation to acknowledgment. "Acknowledged by [role] at [time]" is always paired with "a call is expected by [computed time]"; timeout switches the patient copy per FR-24 and emits with `patient_notified: true`.
AC: Marisol at 7 p.m., wall basis, 30/30: UNOWNED by 8 p.m.; coverage_hours basis: UNOWNED at 9:00 a.m. next day; both asserted.

### 7.5 Screening and routing

**FR-26 Instruments as configuration.** Each instrument is `config/instruments/<key>.yaml` with items, scoring, thresholds, critical items, attribution, version, `thresholds_confirmed_by`.
AC: Switching instruments changes the patient screen after restart; attribution renders; version stamped on `screen_administered`.

**FR-27 Screen framing.** The instrument step states what it is, that it is not a diagnosis, who will see the result per her category, and, as a locked sentence that changes with the FR-30a flag, exactly which item is shared with the practice regardless ("If you answer yes to the question about harming yourself, your care team will be told even if you chose nobody yet" or the "will not" form).
AC: The rendered sentence is asserted against the flag value in both modes.

**FR-28 Thresholds unconfirmed until owned.** Placeholders labeled "placeholder, not clinically set" until a `staff_user` with role clinician and permission `config_approver` sets `thresholds_confirmed_by` in the file; the banner names that user.
AC: Banner until then; the config change log records the user.

**FR-29 Administration, coping trigger, and scoring.** Screens are administered at configured points and when `coping_difficulty` is at the worst option on one check-in or the middle option on two consecutive check-ins (placeholder). The coping answer itself creates one Needs-review item; the instrument is offered "now or next check-in"; a decline emits `screen_declined` on that item. Scoring is deterministic.
AC: Scoring vectors per instrument; Priya declined variant shows "reported difficulty coping; screen declined."

**FR-30 Routing on threshold and critical items.** A threshold positive creates one Needs-review item (subject to FR-06); a critical-item positive triggers FR-23 in every case.
AC: Threshold positive creates exactly one item; critical positive with a low score shows the instruction.

**FR-30a Critical item with sharing withheld (placeholder policy).** Config `critical_item_overrides_sharing` (default true; labeled "placeholder pending open question 5 and SR-25"; settable only by `config_approver`). True: the Urgent item carries only "critical safety item positive; other results withheld at patient request; policy unconfirmed," no score or item text; `critical_item_hit` carries `shared: true`. False: no queue item; the patient sees the emergency instruction with crisis line and the help-resources item; `critical_item_hit` carries `shared: false`. The flag's state appears in the admin view, SR-09, and FR-65.
AC: Both modes asserted in tests; the disclosure text (FR-05, FR-27) matches the flag.

**FR-31 Rules test harness.** A CLI command runs every fixture with a stored expected outcome; after any threshold or rule change it lists each changed case as "changed, unconfirmed" until the `config_approver` confirms it in the file.
AC: Report exportable for SR-22; 6.8 shows the list.

**FR-32 Assessment and connection times.** `assessment` links to `screen_result_id` or `trigger_ref`; intervals are computed only for referrals with a linked positive screen.
AC: Priya with a second positive at week 6 still reports the day-14 interval for the day-14 referral.

### 7.6 Follow-through tracking

**FR-33 Referral states.** `created`, `sent_to_partner`, `appointment_scheduled`, `appointment_completed`, `appointment_missed`, `no_capacity`, `not_covered`, `declined_by_patient`, `closed`. Only `appointment_completed` counts; `completed_at` stores the kept-on date entered by staff. `sent_to_partner` records the consent basis and version. `appointment_missed`, `no_capacity`, `not_covered`, or `declined_by_patient` on a referral tied to a positive screen or critical item reopens a Needs-review item for the OB clinician that closes only with a documented plan.
AC: "Sent" never renders as success; the reopen is asserted in the Priya declined variant.

**FR-34 Callbacks.** Outcome, timestamp; minutes create exactly one `staff_time` row by `source_id`.
AC: No close without an outcome.

**FR-35 Planned visits.** `visit.episode_id` is nullable so completion can be recorded for any eligible patient, enrolled or not (G13 baseline).
AC: Rate uses the cohort rule in 11.3.

**FR-36 Referral partner capacity and coverage.** Partner records `accepted_insurance_types[]` and capacity; the referral form warns when the patient's insurance is not accepted; `not_covered` is a distinct category.
AC: Metrics separate `no_capacity` and `not_covered`.

**FR-36a Barrier follow-through.** A barrier answer creates one typed Follow-through item and shows the practice's resource item (NOT YET PROVIDED until supplied); closes only with an outcome.
AC: Priya transport item exists at day 3.

**FR-37 Initial contact by day 21.** `initial_contact_confirmed` fires on the first logged human contact with `day_number = floor((occurred_at − delivery_date) in days)`; the flag is true only when ≤ 21; a later first contact still emits the event and the panel shows "first contact day 27 (after target)." Staff-performed enrollment is a contact.
AC: Keisha shows unmet at day 27; Dana late-enrollment shows met.

**FR-38 Contact log.** Type, time, staff user, outcome; minutes create exactly one `staff_time` row (`source_type = contact`); closing a queue item whose outcome references that contact creates no second row.
AC: Marisol: 12 minutes, not 24.

**FR-39 Transition and closure.** `episode.status` in {active, paused, completed, closed_early}; `closed_early` set by a coordinator (or FR-13a) with `close_reason` in {patient_withdrew, unreachable_after_N_attempts, moved_or_transferred, deceased, other}; only `closed_early` emits `dropout_recorded`; an episode open at week 12 with no completed check-in after week 6 and no contact is flagged `lost_to_follow_up` for confirmation. "Indicated" means any positive screen, critical item, referral, or sensitive status; indicated episodes close only with a confirmed mental-health destination or "no destination identified" plus a named practice owner and next contact date, shown to the patient in plain words.
AC: `transition_completed` carries destination and owner; an indicated episode cannot close without one.

### 7.7 Clinician summary

**FR-40 Summary content.** Screening results, intervals, and escalation details are rendered by deterministic templated sentences; the narrative (AI-02 or templated) covers only the AI-02 allowlist.
AC: With AI off, a complete summary is produced.

**FR-41 Review and delivery.** `draft`, `reviewed`, `delivered`; only a clinician marks reviewed.
AC: A draft cannot export as delivered.

**FR-42 Export.** Print-styled HTML with reviewer, versions, withheld notices, the counsel marker, and "Synthetic data — demonstration only."
AC: Priya export contains all footer elements.

### 7.8 Practice queue and dashboard

**FR-43 Queue views.** Age, owner or NOT YET ASSIGNED, state, target status; UNOWNED and "open clinical item" sort first.
AC: Coordinator finds today's calls on one screen.

**FR-44 Coverage banner.** Current coverage state and on-duty owner per queue from `coverage_schedule`; "nobody on duty" outside coverage.
AC: Clock test.

**FR-45 Outcome and time logging.** Every close goes through an outcome form; `staff_time` is the single minutes ledger with `source_type` and `source_id`.
AC: 10 + 15 = 25; the Marisol double-count test passes.

**FR-46 Patient panel and timeline.** Twelve-week timeline with sensitive status at top; item-level responses respect the patient's category. Phase 1 ships the panel as a list of episodes, items, and referral states; the timeline view is Phase 2.
AC: Priya shows screen, assessment, referral, appointment separately; the coordinator view hides item responses unless permitted.

**FR-47 Budget-owner view and interview calculator.** Minutes per episode (median, top decile) and a calculator whose inputs (minutes per episode, loaded rate, overhead, episodes per year, after-hours coverage hours per week × on-call rate or flat monthly cost) start blank and are typed in during the session; the synthetic assumptions appear only in a collapsed row; setting Urgent coverage to none shows zero and a warning; `practice_setup_minutes` recorded by the admin is shown; no revenue projection.
AC: "Illustrative, not market prices or a forecast" on every view; entered values flow to the findings template; the budget owner cannot open item-level data.

**FR-47a Pilot scope sheet.** An exportable page showing two placeholder structures (fixed pilot fee; per enrolled episode, default $200, labeled illustrative), support limits (max minutes per episode, coverage hours, episode count), "clinical services arranged separately by the practice," and "No reimbursement, monitoring, behavioral-health, or care-management billing code is assumed; coverage requires payer-specific confirmation."
AC: Shown beside FR-47; no revenue computed.

**FR-48 Demo controls.** Clock, scenario branch load, reset with fixed seed.
AC: Under five seconds; in fallback mode two resets produce identical logs after excluding `wall_at`, id columns, and `ai_interaction` rows.

### 7.9 Metrics and reporting

**FR-49 Metrics from events only.**
AC: Recompute from events matches; enrolling a persona today changes no rate until its boundary passes.

**FR-50 Breakdowns.** By language, insurance, barrier.
AC: Lucía and Keisha in the correct rows.

**FR-51 Escalation appropriateness.** Clinician ratings and `missed_escalation` records.
AC: Both in the metrics view.

**FR-52 Usefulness.** Optional at weeks 6 and 12; the comment field is governed by FR-17.
AC: Skipping emits nothing.

**FR-53 Export.** CSV or JSONL with versions on every row.
AC: Round-trips into a spreadsheet.

### 7.10 Sensitive paths

**FR-54 Sensitive status.** Subtypes: pregnancy loss, stillbirth, neonatal loss, NICU stay, trauma. Stored as `sensitive_status_event` rows so statuses stack; suppression is the union of active subtypes.
AC: After activation, every patient screen and the outbox contain zero suppressed-tag items.

**FR-55 Suppression matrix.** Tags: infant, feeding, milestone, celebration, newborn-visit, pregnancy-progress (exists only so pre-delivery content can be suppressed; no approved prototype item carries it), birth-story.

| Subtype | Suppressed tags | Check-in set | Set by | Lifted by |
|---|---|---|---|---|
| Loss (pregnancy, stillbirth, neonatal) | All infant-related and birth-story | `loss` | Patient, coordinator, clinician | Coordinator with reason |
| NICU | milestone, celebration | `nicu` | Patient, coordinator, clinician | Coordinator with reason |
| Trauma (default, clinical owner to confirm) | celebration, birth-story, pregnancy-progress | `trauma` (omits items about the birth itself; asks only how she wants to be contacted); routes to clinician review, not a screen | Patient, coordinator, clinician | Patient or coordinator |

AC: Untagged items fail validation; a test enumerates tags against each subtype.

**FR-56 Sensitive preferences dialog.** Once; "not for now" pauses all scheduled check-ins including the week-12 check-in, creates a Sensitive-review item with a 7-day contact deadline and the week-12 due date, and tells her what will happen.
AC: Never twice; the deadline escalates like Needs-review.

**FR-57 Continuing care.** In loss statuses the instrument is offered with loss-pathway framing if approved, otherwise a single approved mood item (config `screening_in_loss_status`, placeholder pending open question 12); a mental-health referral is offered in every loss and trauma status.
AC: 6.4 completes to transition.

**FR-58 Tone review attribute.** Sensitive-path content, every closing statement, and every day-3 item carry a tone-review attribute.
AC: Missing attribute renders a watermark and is blocked in demo mode.

**FR-59 No automated resumption.**
AC: Twelve weeks after a loss, no suppressed content; lifts are logged.

### 7.11 Content and configuration management

The prototype has no editors: config is YAML and content is markdown with front matter, validated by `nestwell validate`, which prints readable errors; "saved under their name" means a front-matter or config field naming the approver plus a git commit. Admin screens are limited to clock, scenario load and reset, logs, and exports.

**FR-60 Versioned approved content.** ID, locale, body, tags, status, approver, date, tone review, version, `locked`, `safety_critical`; only approved items are served.
AC: Lint fails on hard-coded patient-facing strings; drafts never render.

**FR-60a Tone specification.** Reading level at or below grade 6 (Flesch-Kincaid, placeholder), sentences at most 20 words, no exclamation marks or emojis, second person, preferred name or none, endearment deny-list, per-locale `formality` (`es`: usted default).
AC: The validator enforces each.

**FR-61 Validated configuration.** All config validated at startup; every change logged from git metadata; `AI_ENABLED=true` with `free_text_urgency_scan` false is a startup failure (FR-17).
AC: Unknown queue in a rule fails startup; the AI-flag combination fails startup with a readable message.

**FR-61a Seed lexicons.** `config/lexicons/` holds burden, monitoring, claims, reassurance, emergency, therapy_intent, medications, each with author, version, and seed entries (engineer drafts in M0; clinical safety owner approves in M1); empty lists fail startup.

| File | Seed entries (minimum) |
|---|---|
| burden | streak, missed, badge, keep it up, don't forget |
| monitoring | monitored, watching, 24/7, always here, we'll know |
| claims | first-of-its-kind, better than, guaranteed, proven, HIPAA compliant, FDA cleared, non-device, decides nothing, just shows information, only static content, only baby-focused |
| reassurance | nothing needs follow-up, you are doing fine, all clear, looks fine, no concerns, normal, nothing to worry about |
| emergency | (clinical owner supplies; includes self-harm, heavy bleeding, chest pain, and domestic-violence terms as placeholders) |
| therapy_intent | can you help me cope, talk me through, what should I do about my feelings |
| medications | (clinical owner supplies) |

**FR-62 Content preview.** `nestwell preview <id> --locale` renders the item with a DRAFT watermark.

**FR-63 Language slots.** English and Spanish slots; empty Spanish shows English with the marker.

**FR-63a Safety-critical content class.** Locked emergency instruction (both layouts), after-hours instruction, help label and screen, contact card, acknowledgment, closing statements, and the pending marker itself must exist approved in the patient's locale before enrollment in that locale; otherwise `not_offered`, reason `language_content_unavailable`.
AC: Lucía blocked-enrollment branch.

**FR-64 Claims checklist.** Front-matter field `claims_checked_by`; approval fails without it.

**FR-65 Content and rules export.** One document including the FR-17 and FR-30a flags and the `AI_ENABLED` state.

### Content inventory

| Family | Count (approx.) | Owner | Needed by |
|---|---|---|---|
| Check-in items and options (7 × 5, plus loss, NICU, trauma sets) | 60 | Clinical safety owner | M2 (day 3, 7, 14, 21), M5 (rest) |
| Closing statements per coverage state and pending type | 8 | Clinical safety owner | M2 |
| Acknowledgment, emergency (both layouts), after-hours, crisis, help resources, safety-question, pause and stop text | 10 | Clinical safety owner, counsel marker | M1 (before any external demo) |
| Instrument framing, disclosure sentences (two flag states), attribution | 5 | Clinical safety owner | M3 |
| Care plan templates, visit preparation, barrier resources | 12 | Founders | M5 |
| Transition page, sensitive dialog, loss and trauma variants | 15 | Clinical safety owner, tone reviewer | M5 |
| AI labels, canned exemplars, and the block response | 12 | Clinical safety owner | M7 |
| Spanish safety-critical class | 10 | Clinical safety owner, approved translator | Before any Spanish-speaking participant |
| Lexicon approvals, urgent list, placeholder thresholds | 9 files | Clinical safety owner | M1–M3 |

About 130 items. Founder hours are estimated from this table in section 14.

### 7.12 Notifications (simulated)

**FR-66 Outbox.** Every notification body is a neutral approved item ("You have a new item from your care team") and never contains screen results, mood content, referral details, or sensitive wording.
AC: A programmatic scan of the whole outbox asserts neutral bodies; network capture shows no outbound calls other than the model host when enabled.

**FR-67 Provider adapter.** `MessageProvider` with `SimulatedProvider` as its only implementation; no real-provider code or credentials exist.
AC: Repository scan (NFR-08).

**FR-68 Suppression applies to notifications.** Quiet hours, sensitive status, pause, safety-question "no," FR-14.
AC: 6.4 shows suppressed rows with reasons.

**FR-69 Patient inbox (simulated).** Shows neutral bodies with "SIMULATED."

## 8. AI requirements and boundaries

The review's position governs: use AI to explain approved material, assemble draft summaries for review, and organize patient questions; any symptom or urgency workflow requires clinical design, regulatory review, documented escalation rules, and independent validation; a model must not override an emergency instruction or reassure a patient. Prototype default: `AI_ENABLED=false`, canned clinician-approved exemplars with the same labels. No discovery decision D1–D9 depends on live generation; live AI is a founder opt-in (open question 8) and, if chosen, AI-15 to AI-22 apply before the first demo and `free_text_urgency_scan` must be set on by the clinical safety owner (FR-17). If not chosen, AI-15 to AI-20 and AI-22 are pilot-gate items (G10) and only the gateway interface, deny-lists (as content validators), labels, the block response, and the fallback store are built.

### 8.1 Allowed uses

**AI-01** Reword a named approved item for reading level, given only that item, locale, and active sensitive subtypes.
AC: Prompt contains no free text, answers, or scores.

**AI-02** Draft the summary narrative from an allowlist only: episode week; care-plan titles and states; referral, visit, callback, and queue-item state names and dates; saved-question titles; content titles referenced. Never scores, item responses, critical flags, symptom answers, free text, or minutes.
AC: A fixture with a positive screen produces a narrative with no instrument name, score, or mood or risk descriptor, while the structured section shows them; the payload builder test omits every AI-05 field.

**AI-03** Group and title saved questions; never answer or reprioritize. A question that produced a lexicon match or a prefilter block is never sent to the organizer and keeps its original text in her list.
AC: No answer field; original text alongside; the flagged question is absent from the prompt.

**AI-04** Spanish generation deferred.

### 8.2 Prohibited uses

**AI-05** No triage, urgency, risk, score interpretation, or diagnosis.
AC: AI-02 allowlist test; the prefilter handles an emergency-lexicon match with the FR-17 match behavior (full-screen instruction, Urgent item), never a Needs-review-only item or a canned reply alone.

**AI-06** No therapy or treatment recommendation. A therapy-intent block is handled as AI-15 specifies: the locked instruction with crisis line and named contact, the pending sentence, and a Needs-review item, in the same transaction.

**AI-07** No reassurance or softening; FR-22 injection test.

**AI-08** No new clinical content: numbers permitted only if verbatim in the structured payload; medications checked against `medications.yaml`.

**AI-09** No free-form chat; the question organizer is the only patient text that reaches the model, after the prefilter.

**AI-10** Stateless calls.

### 8.3 Grounding and labeling

**AI-11** Retrieval by ID; draft, retired, locked IDs abort.
**AI-12** Citations required.
**AI-13** Patient label: "Written from your care team's approved materials. This is not medical advice. For urgent symptoms, [after-hours instruction]." The label is for patient clarity; it has no bearing on FDA classification (SR-09, SR-21) and must not be described as a safeguard in demos.
**AI-14** Staff label "AI draft, not reviewed."

### 8.4 Deterministic safety layer

**AI-15 Prefilter.** Runs only when live AI is enabled, before every model call, and is therefore only ever active with `free_text_urgency_scan` on (FR-61). Checks episode state, the emergency lexicon (the same file as FR-17), therapy intent, length, and locale. A block never ends in a canned response alone. Emergency-lexicon block: exactly the FR-17 match behavior (full-screen FR-22, one Urgent item, `help_requested` source `lexicon_match`, lexicon version logged) in the same transaction, plus `ai_call_blocked` with reason `emergency_lexicon`. Therapy-intent block: renders the locked instruction with crisis line and named contact plus the pending sentence, creates one Needs-review item, emits `help_requested` source `ai_prefilter`, logs `ai_call_blocked` with reason `therapy_intent`; when a text matches both lists the emergency branch wins and one Urgent item is created. State, length, and locale blocks serve the generic fallback (AI-21), log the reason, and create no queue item. The block response shown to the patient is the locked content plus the pending sentence and nothing else: no answer, no grouping, no reassurance.
AC: 60+ fixtures; every emergency block has an Urgent item, every therapy-intent block a Needs-review item, a fixture matching both produces one Urgent item and no Needs-review item; the block response is byte-identical to the locked content plus the pending sentence; no block response is rendered with the flag off, because the prefilter cannot run.

**AI-16 Postfilter.** Schema, citations, reassurance, number and medication checks, emergency language, claims, length, locale, and a mood or risk descriptor list for AI-02.
AC: No partial pass.

**AI-17 Model configuration.** Pinned model, temperature 0, versioned prompts, JSON schema, 8-second timeout. `prompt_hash` = SHA of system prompt, templates, model ID, temperature, schemas, prefilter and postfilter lexicon versions; content bodies excluded, with the content manifest hash recorded separately.

### 8.5 Logging, data use, fallback

**AI-18** Full log per call; retention setting approved by counsel before any non-synthetic prompt (G10).
**AI-19** Blocked and fallback events by reason.
**AI-20 Data use.** Before enabling AI, the founders record in `docs/vendors.md` the vendor's data-use, retention, and training terms as read on a stated date; the build reads a flag set only after that record exists. No non-synthetic text is sent before executed vendor terms are recorded.
**AI-21 Scripted fallback.** Canned responses keyed by (feature, key): content ID for AI-01, persona plus period for AI-02, persona for AI-03; a missing key serves the generic response and emits `ai_fallback_used`, reason `no_canned_key`. The generic response never mentions her text and always carries the inline locked instruction.
AC: A test enumerates every reachable (feature, key) pair in 6.1–6.8.

### 8.6 Founder evaluation before demos (only if live AI is enabled)

**AI-22** Fifty-plus prompts across templates and personas, in and out of sensitive status, fifteen adversarial; zero unacceptable safety outputs; quality threshold founder-set; evaluation stored with prompt hash and content manifest hash; the build refuses to enable AI when the prompt hash differs and warns when the manifest differs.

## 9. Safety, privacy and regulatory requirements

The prototype must not make clinical claims, must not hold real data, and must be designed so the pilot can undergo an FDA CDS function-by-function assessment, operate under HIPAA as a business associate and, for any flow outside that relationship, under FTC health-data rules, and undergo an Ohio state-law review (A2). "Undergo" is deliberate: the outcome is not assumed.

### 9.1 Required in the prototype

**SR-01 Synthetic only.** `is_synthetic` required; no import path; no sign-up.
**SR-02 No real identifiers.** Fictional pools; reserved domains; non-dialable practice numbers labeled as placeholders (the crisis and emergency numbers are real, FR-04).
**SR-03 Synthetic banner** on every screen and export.
**SR-04 No trackers.** Browser CSP allows only the application origin; the model host is reachable only from the server, asserted by a network test.
**SR-05** As AI-20.
**SR-06 Rules inspectable.** Every routing rule is config with description, author, version, date.
**SR-07 No claims.** Lint over content, UI, scripts, and worksheet for `claims.yaml`. The list exists because claims are subject to FTC and state consumer-protection review independent of HIPAA; counsel reviews it before the first practice demo.
**SR-08 Coverage honesty.** As FR-24, FR-25.
**SR-09 FDA function inventory.** `docs/fda-function-inventory.md`: every FR, AI, and config rule that reads or writes a symptom answer, screen response, critical item, urgency flag, lexicon match, queue routing, or patient-facing recommendation is its own row (including FR-17 with the scan flag state, the AI-15 emergency-lexicon evaluation and therapy-intent block as two separate rows, and FR-30a with flag state) with inputs, outputs, viewer, basis shown, rules or model, and two empty columns "regulatory reviewer determination" and "date" filled only by the G5 reviewer; every row reads "not yet assessed"; all other IDs appear in one appendix line marked not applicable with a reason. The inventory is regenerated at the end of each phase (section 14) so it never describes code that does not exist.
**SR-10 Queue ownership sheet** generated from config with employer per role.
**SR-11 Minimal collection.** Section 11 is the allowlist.
**SR-12 Deletion and reset**, logged.
**SR-13 Audit log.** Every write to patient, queue, referral, visit, summary, consent, status, and config, and every staff read of screening responses or free text, with actor and time; append-only.
**SR-14 Access by role at the data layer.** FR-06 categories (including the coordinator exclusion) and the budget-owner exclusion are enforced in data access and tested; other views are route-gated.
**SR-15 Emergency path independence.**
**SR-16 Incident record**, including discovery-session distress events.
**SR-17 Jurisdiction.** "State-law review required" shows for every jurisdiction, including Ohio, until an admin records a counsel-memo reference and date for that state in config.
AC: Ohio shows the flag until the memo field is filled.
**SR-27 Real-participant demo mode.** `DEMO_PARTICIPANT_MODE` disables every model call, replaces all free-text and comment fields with "typing in your own words is not available in this demo," tags every record with `demo_session_id`, and shows the SR-28 statement on the acknowledgment; the dataset is reset (SR-12) after each session and the reset is logged.
AC: A test asserts no `ai_interaction` or free-text row can be created in this mode.
**SR-28 Discovery-session safety protocol.** `docs/discovery-safety-protocol.md`, approved by the clinical safety owner before the first session: a clinician present or reachable at every session with a woman; a printed card of real, current crisis and practice resources given before the demo; the facilitator states aloud that the app is a demonstration, that nothing entered is seen by a clinician, and how to get real help; the persona, not the participant, answers the instrument; 6.3 and 6.4 only after a content warning and opt-in; sessions with women who have experienced loss scheduled with the tone reviewer's input; a disclosure of distress ends the demo and is handled by the clinician, not the app, and is entered in SR-16; no recording without written consent.

### 9.2 Designed for now, decided before the pilot

**SR-18 HIPAA posture (counsel).** Practice as covered entity, NestWell as business associate under A16; if NestWell staff perform any patient contact, counsel re-scopes SR-18, SR-20, SR-25.
**SR-19 FTC health-data obligations (counsel).** For each data flow in `docs/data-flows.md` (device, server, model vendor, referral partner, exports), counsel determines whether it falls within the business-associate relationship or under the FTC Health Breach Notification Rule and other FTC obligations, regardless of a practice contract.
**SR-20 Ohio state-law review (counsel).** Licensure and scope for queue staff and for any person performing services from outside Ohio; telehealth; AI or mental-health rules; consent and sharing rules exceeding HIPAA; minors' consent, parental record access, and sharing of a minor's results; breach notification; TMaH participation; whether a founder acting as backup would be practicing across an institutional boundary.
**SR-21 FDA assessment (regulatory counsel or consultant with FDA digital-health experience, independent of the rule author).** Before any of FR-17, FR-23, FR-30, FR-30a, AI-01, AI-13, or AI-15 is enabled in a build a patient can reach.
**SR-22 Independent rules validation.**
**SR-23 Instrument licensing.**
**SR-24 Messaging consent.**
**SR-25 Operational and legal decisions**, including the sharing-withheld and critical-item policy.
**SR-26 Staffed coverage.** No queue definition NOT YET ASSIGNED; every backup is a practice role.
**SR-29 Pilot access controls (product owner).** Every-read auditing, an endpoint permissions matrix, session policy, and real identity move here.

## 10. Non-functional requirements

**NFR-01 Accessibility.** WCAG 2.1 AA automated checks; the manual screen-reader pass is a cut candidate.
**NFR-02 Mobile performance.** Help path under 500 ms with no network.
**NFR-03 Demo reliability.** All scenarios in fallback mode; reset in one command.
**NFR-04 Determinism.** In fallback mode, identical logs excluding `wall_at`, ids, `ai_interaction`; with AI enabled, all events except `ai_call` identical.
**NFR-05 Auditability.** Config version, content manifest SHA, build hash on every event.
**NFR-06 Retention.** Reset purges; retention is config.
**NFR-07 Roles and permissions.** Three logins; view switcher; permissions `config_approver`, `content_approver`, `on_call`. Table: sensitive status set by coordinator, clinician, patient (own controls); lift by coordinator (loss, NICU) or patient (trauma, pause); ratings by clinician; audit and AI log read by admin and clinician; referral_partner writes limited to `referral.state`, `coverage_status`, `capacity_state`.
**NFR-08 Environments.** Local, CI, hosted demo; no secrets locally; repository scan.
**NFR-09 Localization readiness.**
**NFR-10 Evolvability.** The prototype preserves only (a) section 11 field names, (b) event names and envelope, (c) config and content file formats. All application code, UI, and infrastructure may be rewritten. FR-17, FR-23, FR-30, FR-30a, AI-01, AI-13, AI-15 are excluded from any carry-forward and listed in `docs/pilot-debt.md` as "subject to G5 outcome," alongside live scheduling and read auditing.
**NFR-11 Time handling.** One time service; the seeder executes ordered virtual ticks stamping each event with its due timestamp, never the jump target; staff actions after a jump are stamped with the clock at the action; `practice.timezone` default America/New_York.
**NFR-12 Test coverage.** Pure functions unit-tested; each scenario has an end-to-end test in fallback mode; the AC record (section 14) lists every acceptance criterion with its test name and the build hash of the last pass.
**NFR-13 Offline help path.** Cached via service worker.

## 11. Data model and metric events

### 11.1 Entities and key fields

| Entity | Key fields | Notes |
|---|---|---|
| `practice` | id, name, jurisdiction, state_review_memo_ref, timezone, named_contact, after_hours_content_id, practice_setup_minutes | SR-17, FR-47 |
| `staff_user` | id, role, permissions[], display_name, practice_id | NFR-07 |
| `coverage_schedule` | queue_key, weekday, start, end, on_duty_user_id, backup_user_id | FR-44 |
| `referral_partner` | id, name, specialty, capacity_state, accepted_insurance_types[], consented_fields_allowed, secured | FR-36 |
| `queue_def` (config) | key, owner_role, owner_permission, backup_role, employer, ack_target_minutes, backup_ack_target_minutes, resolution_target_minutes, timer_basis, no_answer_content_id | 5.4 |
| `patient` | id, is_synthetic, is_adult, display_name, preferred_name, locale, formality, insurance_type, access_barriers[], contact_windows, safe_to_message, baby_reference_permission, baby_name, sharing_category | SR-11 |
| `sensitive_status_event` | id, patient_id, subtype, active, set_by, set_at, lifted_by, lifted_at, lift_reason | FR-54 |
| `eligibility` | id, patient_id, status, reason, recorded_at | FR-01 |
| `episode` | id, patient_id, expected_date, delivery_date, enrollment_point, status, close_reason, transition_primary_care, transition_mental_health, transition_owner, next_contact_date, initial_contact_day | FR-37, FR-39 |
| `consent` | patient_id, category, basis, state, version, timestamp | FR-33 |
| `checkin_template` (config) | key, version, items[], instrument_key, closing_statement_ids | FR-09a |
| `checkin` | id, episode_id, scheduled_at, window_end_at, template_version, state (scheduled, sent, opened, completed, partial, skipped, unopened, not_applicable, paused), reminder_count | FR-08 |
| `checkin_response` | id, checkin_id, question_key, value, free_text, queue_item_id, lexicon_match (nullable: lexicon version and term class, never the matched text) | FR-17 |
| `instrument` (config) | key, version, items[], scoring, thresholds, critical_items[], attribution, thresholds_confirmed_by | FR-26 |
| `screen_result` | id, episode_id, instrument_key, version, item_responses[], score, positive, critical_item_hit, administered_at, shared_with[], declined | FR-29 |
| `rule` (config) | key, description, trigger, conditions[], action, queue_key, author, version, effective_from | FR-23 |
| `queue_item` | id, queue_key, episode_id, trigger_type, trigger_ref, created_at, owner_user_id, acknowledged_at, escalated_at, resolved_at, state (open, acknowledged, escalated, UNOWNED, resolved), outcome, open_clinical_flag, rating | FR-25 |
| `assessment` | id, screen_result_id (nullable), trigger_ref, clinician_id, outcome, recorded_at | FR-32 |
| `referral` | id, episode_id, partner_id, screen_result_id (nullable), state, coverage_status, consent_basis, created_at, sent_at, scheduled_for, completed_at | FR-33 |
| `visit` | id, patient_id, episode_id (nullable), type, scheduled_for, state, completed_at | FR-35 |
| `contact` | id, episode_id, type, occurred_at, staff_user_id, outcome, day_number | FR-38 |
| `callback` | id, queue_item_id, promised_at, occurred, occurred_at, outcome | FR-34 |
| `staff_time` | id, user_id, episode_id, source_type, source_id, minutes, recorded_at | Single ledger |
| `care_plan_template` (config), `care_plan_item` | key, version, title_content_id, owner_role, due_window_days, tags[]; item adds episode_id, state | FR-18 |
| `saved_question` | id, episode_id, text, order, group_title, queue_item_id, lexicon_match (as `checkin_response`) | FR-20 |
| `content_item` | id, locale, title, body, tags[], status, version, approver, tone_review_by, claims_checked_by, locked, safety_critical, counsel_review_pending, layouts[] | FR-60, FR-22 |
| `summary` | id, episode_id, period, structured_payload, narrative, ai_draft, state, reviewer_id, withheld_notices[] | FR-40 |
| `notification` | id, episode_id, channel, content_id (neutral), scheduled_at, simulated_state, suppressed_reason | FR-66 |
| `missed_escalation` | id, episode_id, related_entity, related_id, flagged_by, reason, occurred_at | FR-51 |
| `usefulness_rating` | id, episode_id, week (6 or 12), rating, comment_queue_item_id (the comment is free text governed by FR-17), recorded_at | FR-52 |
| `ai_interaction` | id, feature (reword, summary_narrative, question_organizer), episode_id, content_ids[], prompt_hash, content_manifest_hash, model_id, request_ref, response_ref, prefilter_result, postfilter_result, fallback_used, blocked_reason, latency_ms, occurred_at | AI-17, AI-18 |
| `incident` | id, type (false_reassurance, missed_escalation, unowned_timeout, discovery_session_distress, data_handling, other), related_entity, related_id, reported_by, description, occurred_at, resolved_at, resolution | SR-16 |
| `audit_log` | id, actor_type, actor_id, action (create, update, read), entity, entity_id, field_summary, occurred_at; append-only | SR-13 |
| `config_change` | id, file, version_from, version_to, git_commit, author, approved_by, occurred_at | FR-61 |
| `demo_clock` | id, current_time, scenario_branch, set_by, set_at | FR-48 |

Every record in every table carries `demo_session_id` (SR-27).
| `metric_event` | id, event_type, occurred_at, wall_at, patient_id, episode_id, actor_type, actor_id, queue_key, related_entity, related_id, attributes, locale, insurance_type, access_barriers[], config_version, content_version (manifest SHA), build_hash, client_reported | Append-only |

### 11.2 Metric events

Emitted by domain services in the same transaction as the state change. Exception: client-reported view events (`emergency_instruction_shown` from FR-21, `checkin_opened`) arrive through one validated endpoint, flagged `client_reported`, and never drive state transitions.

Event names, grouped by domain. Attributes in parentheses are required on that event; every event also carries the `metric_event` envelope fields in 11.1.

- **Eligibility and enrollment:** `eligibility_changed` (status, reason), `enrolled` (enrollment_point), `acknowledged` (mode), `preferences_changed` (field), `checkins_paused` (actor, duration), `checkins_resumed`, `episode_closed` (status, close_reason), `dropout_recorded`, `transition_completed` (destination, owner), `demo_session_reset`.
- **Check-ins:** `checkin_scheduled`, `checkin_sent`, `checkin_opened` (client_reported), `checkin_completed`, `checkin_partial`, `checkin_item_skipped` (question_key), `checkin_skipped`, `checkin_not_now`, `checkin_unopened`, `checkin_not_applicable`, `reminder_sent`, `unreached_item_created` (open_clinical_flag), `outreach_logged` (outcome), `burden_cap_deferred` (item_key), `free_text_routed` (field, queue_key).
- **Help and escalation:** `help_requested` (source: patient, lexicon_match, ai_prefilter; lexicon_version when applicable), `emergency_instruction_shown` (layout; client_reported), `rule_fired` (rule_key, version), `queue_item_created` (queue_key, trigger_type), `queue_item_acknowledged` (minutes_to_ack), `escalation_escalated`, `escalation_unacknowledged_timeout` (patient_notified), `queue_item_resolved` (outcome), `escalation_rated` (rating), `missed_escalation_recorded` (reason), `false_reassurance_reported` (source, content_id or ai_interaction_id).
- **Screening and sharing:** `screen_offered`, `screen_administered` (instrument_key, version), `screen_scored` (positive), `screen_skipped`, `screen_declined`, `critical_item_hit` (shared), `sharing_changed` (category), `sharing_reasked` (count), `screen_responses_read` (role).
- **Follow-through:** `referral_created`, `referral_sent` (consent_basis, version), `referral_scheduled`, `referral_completed`, `referral_missed`, `referral_no_capacity`, `referral_not_covered`, `referral_declined`, `referral_reopened_for_plan`, `referral_closed`, `callback_requested`, `callback_completed` (outcome), `contact_logged` (contact_id, type; carries no minutes), `initial_contact_confirmed` (day_number), `no_contact_by_day_21`, `visit_scheduled`, `visit_rescheduled`, `visit_completed` (type), `barrier_item_created` (type), `care_plan_item_completed`, `staff_time_logged` (minutes, source_type, source_id) — the only minutes event.
- **Summaries and notifications:** `summary_drafted` (ai_draft), `summary_reviewed`, `summary_delivered`, `notification_scheduled` (channel), `notification_suppressed` (reason), `usefulness_rated` (week, rating).
- **Sensitive paths:** `sensitive_status_set` (subtype, set_by), `sensitive_status_lifted` (lift_reason), `content_suppressed` (tag, count).
- **AI and configuration:** `ai_call` (feature, prompt_hash), `ai_call_blocked` (reason), `ai_fallback_used` (reason), `config_changed` (file, version), `incident_recorded` (type).

### 11.3 Metric definitions

Cohort rule: eligible patients whose delivery date falls in the selected range and whose boundary (day 21, week 6, or week 12) is at or before the demo clock. Every completion-type measure reports all-eligible as primary and enrolled as secondary.

| Measure | Computation |
|---|---|
| Enrollment | enrolled / eligible (latest status per patient) |
| Program completion (reached week 12 transition) | `transition_completed` / eligible; enrolled secondary |
| Care completion | episodes with comprehensive visit completed and, where a positive screen occurred, referral completed or documented alternative / eligible |
| Completion of planned visits | `visit_completed` comprehensive ≤ week 12 / eligible past boundary |
| Initial contact by day 21 | `initial_contact_confirmed` with day_number ≤ 21 / eligible past day 21; enrolled secondary |
| Time from positive screen to assessment and to connection | median and p90 of (assessment.recorded_at or referral.completed_at) − screen.administered_at for linked screens; "referral without screen" counted separately |
| Referral completion | completed / created; `no_capacity`, `not_covered`, `declined` reported separately |
| Staff minutes per patient | sum(`staff_time.minutes`) per episode; median, mean, p90, top decile |
| Escalation appropriateness; missed escalations | rating distribution; `missed_escalation` + timeouts, by queue, with "unreached with open clinical item" separate |
| False reassurance reports | `false_reassurance_reported` from SR-16 and FR-51 |
| Usefulness | mean and distribution by week |
| Fully loaded delivery cost | practice-entered inputs (FR-47); after-hours coverage cost per week × cohort weeks, allocated per episode as a labeled secondary figure, reported separately |
| Dropout | `dropout_recorded` / enrolled past week 12; all-eligible secondary; `no_contact_by_day_21` count; Unreached by trigger |
| Differences by language, insurance, barrier | every measure grouped |
| Transition destination gap | destination = none / transitions |
| Free-text routing | `free_text_routed` count by field and queue; `help_requested` by source; time to acknowledgment for items with `trigger_type = free_text` |

## 12. Suggested technical approach

Recommendations, not mandates. Binding constraints: SR-18, NFR-10, A3, A5.

Stack: one TypeScript codebase (Next.js App Router or similar) with patient, practice, and admin route groups; PostgreSQL; Zod for config and content; Anthropic SDK called only from `server/ai/service.ts`; print CSS for export; Vitest plus a browser-driven end-to-end runner.

Layout: `apps/web/app/(patient|practice|admin)`, `server/{time,rules,scheduler,screening,queues,followthrough,summaries,content,notifications,ai,metrics,audit}`, `config/{practice,queues,cadence,freetext}.yaml`, `config/checkins/*.yaml`, `config/instruments/*.yaml`, `config/rules/*.yaml`, `config/lexicons/*.yaml`, `content/{en,es}/*.md`, `demo/{personas,scripts,findings,seed.ts}`, `docs/{fda-function-inventory,queue-ownership,vendors,data-flows,alternatives-worksheet,discovery-safety-protocol,pilot-gate,pilot-debt,ac-record}.md`, `docs/ai-eval/`. CLI: `nestwell validate`, `nestwell harness`, `nestwell preview`, `nestwell seed`.

Design rules: rules, scoring, prefilter, and postfilter are pure functions; all time through the demo clock; events from domain services except the one client endpoint; the AI gateway is the only module that may call the model; locked content readable only by the renderer; the free-text save, its queue item, and any lexicon match commit in one database transaction (FR-17), and the same service function is called from the check-in, saved-question, usefulness, and sensitive-preferences paths so that no field can bypass it.

Time model: personas are seeded with their complete 12-week event history through the domain services at seed time using ordered virtual ticks (NFR-11); setting the clock filters what is visible by `occurred_at`; scripted variants (timer lapse, sharing withheld, late enrollment, pause, scan on and scan off) are separate seed branches selected in the admin panel. Live scheduling in the running app is pilot debt.

AI flow (when enabled): assemble, prefilter, load by ID, build prompt and compare hashes, call, postfilter, log. Environments: local (no key), CI (fallback plus one recorded-response job), hosted demo (password-protected, BAA-capable host, reset before each session). Cohort: seven personas plus an optional 40–60 background patients from archetype distributions, generated through the domain services, with an archetype report.

## 13. Out of scope for the prototype, and the pilot-readiness gate

Out of scope: section 2 non-goals plus real identity, consent management beyond the acknowledgment, ordinary Spanish content, real delivery, PDF signing, EHR or scheduling integration, blood pressure, billing, tenancy logic, conversational memory, live scheduling, every-read auditing, config and content editors.

### Pilot-readiness gate

No real patient is enrolled until every item is recorded in `docs/pilot-gate.md` and signed by the three owners.

| # | Gate item | Owner |
|---|---|---|
| G1 | A practice with a named clinical owner and a budget owner who has agreed a priced pilot with defined support limits; the staffing model (A16) defined in the agreement; every backup is a practice role | Founders |
| G2 | Named clinical safety, operations, and product/technical owners with committed hours | Founders |
| G3 | Every queue has owner, backup, coverage, targets, employer, after-hours arrangement confirmed in writing; no queue NOT YET ASSIGNED; after-hours cost line populated from the practice's actual arrangement | Operations owner |
| G4 | Referral partner with confirmed intake, capacity, wait, confirmation channel, accepted insurance; counsel confirms the legal basis for each consented field, whether Ohio mental-health or federal substance-use confidentiality rules apply to the partner, and the consent form required (the in-app preference is a product control, not a determination) | Operations owner, counsel |
| G5 | FDA assessment on SR-09 by a reviewer named and dated in `docs/pilot-gate.md`, before any listed function is enabled in a patient-reachable build; redesign log | Clinical safety owner with regulatory reviewer |
| G6 | HIPAA posture; BAA or equivalent with hosting and model vendor; AI-log retention approved; security risk analysis; FTC determination per data flow (SR-19) | Founders, counsel |
| G7 | Ohio state-law review including minors, staff location, founder-backup question (SR-20) | Founders, counsel |
| G8 | Instruments, thresholds, urgent list, lexicons, free-text and critical-item flags confirmed; independent validation (SR-22); licensing (SR-23) | Clinical safety owner |
| G9 | Written decisions on record access, sharing-withheld and critical-item policy, liability insurance, incident handling (SR-25) | Founders |
| G10 | AI decision recorded; if enabled, AI-15 to AI-22 complete on pilot configuration, `free_text_urgency_scan` set on by the clinical safety owner, vendor terms and retention recorded | Product/technical owner |
| G11 | Messaging provider and consent (SR-24) | Product/technical owner |
| G12 | Every patient-facing item approved; tone review; Spanish approved if required | Clinical safety owner |
| G13 | Baseline at the practice, all eligible as denominator, using the FR-35 table | Operations owner |
| G14 | Pause conditions monitored: four from section 11 (false reassurance reports, missed escalations and UNOWNED, referral no_capacity and not_covered, staff minutes trend) and, for buyer enthusiasm, a written pricing-conversation log owned by the operations owner; a named person can pause enrollment | Clinical safety owner |
| G15 | Small-batch enrollment plan | Operations owner |
| G16 | A12a and A12b confirmed | Founders |
| G17 | Retention policy; pilot debt reviewed; SR-29 access controls built | Product/technical owner |

## 14. Build plan

### Scope honesty

The figures below come from the bottom-up estimate table, which assigns every requirement to one work package, every work package to one phase, and every phase a base-day count plus a stated contingency. The three numbers the founders should plan around:

| Scope | Base days | Contingency | Planning days | One engineer, five days per week | One engineer, four days per week |
|---|---|---|---|---|---|
| Phase 1: interview-ready walkthrough (W1–W12) | 32 | 8 | 40 | 8 weeks | 10 weeks |
| Phase 2: complete prototype (W13–W22) | 26.5 | 5.5, plus 3 days reserved for changes from Phase 1 interviews | 35 | 7 weeks | 9 weeks |
| Prototype as specified (Phase 1 + Phase 2) | 58.5 | 16.5 | 75 | 15 weeks | 19 weeks |
| Pilot-deferred items named in this document (P1–P10) | 31 | 6 | 37 | 7–8 weeks | 9–10 weeks |
| Everything this document names | 89.5 | 22.5 | 112 | about 22 weeks | about 28 weeks |

Contingency is 20–25 percent of base, which is the usual allowance for a single engineer estimating from a specification before any code exists; it covers test rework and content-driven changes, not scope additions. The brief's target of 4–6 weeks (A4) is therefore not met by the prototype as specified. What a fixed six-week date buys is stated under "If the date is fixed." The critical path is content approval, not engineering: no milestone exit criterion is met while any content item on its path is unapproved; engineering builds against draft text flagged UNAPPROVED, and the demo date moves with content, not code. Open question 2 is a precondition of M0.

Two rules keep the numbers honest going forward. First, `docs/ac-record.md` lists every acceptance criterion with its test name and last passing build hash, so "done" is a count of passing tests, not a milestone name. Second, any requirement added after this version is added to a work package with a day estimate in the same commit, and the phase totals are recomputed; a requirement without a row in the table is not in scope.

### Screen inventory

Patient (10): home (contact, help, pause and stop, sensitive controls, who-has-seen), acknowledgment, preferences, check-in, instrument step, help screen — Phase 1; care plan and visit preparation, saved questions, transition page, inbox — Phase 2. Practice (9 screens plus the coverage banner component): queues, patient panel (list), outcome form, screening review and assessment, coverage banner (component) — Phase 1; patient timeline, referral and partner panel, summary review and export, metrics and breakdowns, budget-owner calculator and scope sheet — Phase 2. Admin (5): clock and scenario branch, reset, content and config validation report — Phase 1; AI, incident, and audit logs, exports — Phase 2. Total 24 screens, the coverage banner being a component rather than a screen; about 123 acceptance-criterion tests as counted per package below (a criterion asserting more than one mode counts once per mode).

### Bottom-up estimate

Base days are for one engineer with the section 12 stack, including unit tests for the package but excluding the end-to-end scenario tests, which are their own packages (W12, W21). "Requirements" lists what the package satisfies; a requirement listed in two packages is split as described.

| Package | Screens and components built | Requirements | AC tests | Base days | Phase |
|---|---|---|---|---|---|
| W1 Foundation | Repository, schema for every section 11 entity, three logins with view switcher, time service and demo clock, event emitter and `metric_event`, audit middleware (writes), synthetic guards and banner, `DEMO_PARTICIPANT_MODE`, incident record, jurisdiction flag, CI, hosted demo | SR-01–04, SR-12, SR-13 (writes), SR-16, SR-17, SR-27, NFR-05, NFR-08, NFR-11 | 6 | 4 | 1 |
| W2 Config and content pipeline | YAML and markdown loaders, Zod schemas, `nestwell validate`, approved-only serving, UNAPPROVED watermark, lexicon lints (burden, monitoring, claims, reassurance), locale slots and marker, safety-critical class check, AI-flag consistency check | FR-09 (validator), FR-12, FR-60, FR-61, FR-61a, FR-63, FR-63a, SR-06, SR-07 | 8 | 2.5 | 1 |
| W3 Seeder and scenario branches | `nestwell seed`, ordered virtual ticks, branch selection, reset with fixed seed; personas Dana (two branches), Priya (five variants), Marisol (two), Keisha (two), Lucía (blocked branch) | FR-48, NFR-03 | 3 | 2.5 | 1 |
| W4 Enrollment and home | Eligibility, enrollment timing, preferences, acknowledgment in both modes, contact card, who-has-seen, patient status controls (suppression flags and Sensitive-review item; dialog and check-in sets are W13), pause and stop | FR-01–07, FR-13a | 9 | 3.5 | 1 |
| W5 Check-ins | Template schema, schedule and window states, check-in screen, skip, not-now and help controls, partial, reminders, Unreached routing, burden cap, closing statements, free-text routing at entry with the inline locked instruction and the scan flag | FR-08–17 | 14 | 3.5 | 1 |
| W6 Help path and coverage copy | Help screen, locked content renderer (both layouts), coverage-state copy, client-reported event endpoint, service-worker cache for the help path | FR-21, FR-22, FR-24, NFR-02, NFR-13, SR-15 | 5 | 1.5 | 1 |
| W7 Rules engine and harness | Rule grammar and evaluation, `nestwell harness`, changed-unconfirmed report | FR-23, FR-31 | 3 | 2 | 1 |
| W8 Queues and timers | Queue definitions, acknowledgment, escalation and UNOWNED transitions on both timer bases, queue views, coverage banner, outcome form, `staff_time` ledger, queue ownership sheet generation | FR-25, FR-43–45, SR-08, SR-10 | 5 | 3 | 1 |
| W9 Screening, routing and sharing | Instrument config, framing with the flag-dependent sentence, thresholds banner and `config_approver`, scoring, coping trigger, routing, FR-30a in both modes, sharing categories enforced at the data layer, staff read records | FR-06, FR-26–30a, SR-14 | 10 | 3 | 1 |
| W10 Follow-through minimum | Referral states and reopen rule, callbacks, contact log with day number, initial-contact flag, patient panel as a list | FR-33, FR-34, FR-37, FR-38, FR-46 (list) | 5 | 2 | 1 |
| W11 Phase 1 documents and scripts | Function inventory for everything built to date, queue ownership sheet, findings template, alternatives worksheet, discovery-safety protocol, data-flow map skeleton, AC record; scripts 6.1, 6.2, 6.3, 6.5, 6.6 (blocked branch); one dry run | FR-70, SR-09, SR-10, SR-28 | 4 | 2 | 1 |
| W12 Phase 1 end-to-end tests | Scenario tests for 6.1 (both branches), 6.2 (all variants), 6.3 (both), 6.5 (both), 6.6 (blocked) in fallback mode; AC record populated | NFR-12 | — | 2.5 | 1 |
| W13 Sensitive paths | Status events and stacking, suppression matrix across plan, check-ins and outbox, sensitive dialog, loss, NICU and trauma check-in sets, continuing care, no automated resumption, tone-attribute gating; Elena branch | FR-54–59 | 7 | 4 | 2 |
| W14 Care plan and education | Care plan items from template, explanations with the AI-01 label, visit preparation, saved questions with FR-17 on entry, barrier resource items | FR-18–20, FR-36a | 5 | 2.5 | 2 |
| W15 Follow-through completion | Referral partner panel, capacity and insurance warning, planned visits, assessment linkage and intervals, transition and closure with the destination rule, patient timeline | FR-32, FR-35, FR-36, FR-39, FR-46 (timeline) | 6 | 3 | 2 |
| W16 Clinician summary | Templated structured section, narrative allowlist builder with canned AI-02, review states, print-styled export with footer | FR-40–42, AI-02 | 4 | 2.5 | 2 |
| W17 Metrics and budget-owner view | Recompute from events, every 11.3 measure, breakdowns, escalation ratings and `missed_escalation`, usefulness item, CSV and JSONL export, calculator, scope sheet | FR-47, FR-47a, FR-49–53 | 8 | 4 | 2 |
| W18 Notifications (simulated) | Outbox, neutral bodies, `MessageProvider` and `SimulatedProvider`, suppression reasons, patient inbox | FR-66–69 | 4 | 1.5 | 2 |
| W19 AI gateway (canned) | Gateway interface, labels, canned store keyed by (feature, key), generic fallback and events, deny-lists as content validators, block response with locked instruction, canned AI-03 grouping; Tamsin branches (scan on, scan off) | AI-01, AI-03, AI-05–AI-09, AI-11–AI-14, AI-21 | 6 | 2 | 2 |
| W20 Content tooling | Tone validator (reading level, sentence length, deny-lists, formality), preview CLI, claims field, content and rules export | FR-60a, FR-62, FR-64, FR-65 | 3 | 1.5 | 2 |
| W21 Phase 2 end-to-end tests and NFR checks | Scenario tests for 6.4, 6.6 (both branches), 6.7 (both branches), 6.8; determinism test; CSP and network test; repository secret scan; accessibility automation | NFR-01, NFR-04, NFR-08, NFR-12, SR-04 | 5 | 3.5 | 2 |
| W22 Phase 2 documents, scripts and hardening | Admin log screens (AI, incident, audit); vendor record, data-flow map completed, pilot-gate and pilot-debt files, inventory regenerated; scripts 6.4, 6.6, 6.7, 6.8; two dry runs; hosted demo hardening | SR-09, SR-19 inputs, NFR-03 | 3 | 2 | 2 |
| P1 Live AI | Prefilter and postfilter runtime, model configuration and hashes, per-call logging, retention setting, AI-22 evaluation harness | AI-15–AI-20, AI-22 | 6 | 6 | Pilot |
| P2 Config and content editors | Editing screens with approval workflow | 7.11 | — | 5 | Pilot |
| P3 Six-role RBAC | Endpoint permissions matrix and session policy | SR-29 | — | 4 | Pilot |
| P4 Every-read auditing | Read auditing across all entities | SR-29 | — | 2 | Pilot |
| P5 Live scheduler | Replay of the seeded scheduler as a running job | NFR-10 debt | — | 3 | Pilot |
| P6 Accessibility and offline completion | Manual screen-reader pass; offline caching beyond the help path | NFR-01, NFR-13 | — | 2 | Pilot |
| P7 Background cohort | 40–60 archetype patients and the archetype report | Section 12 | — | 2 | Pilot |
| P8 PDF export | Signed PDF from the print-styled HTML | A7 | — | 1 | Pilot |
| P9 Real messaging | Provider implementation and consent capture | SR-24 | — | 3 | Pilot |
| P10 Real identity and consent management | Identity provider, consent forms beyond the acknowledgment | SR-29, section 13 | — | 3 | Pilot |

Phase 1: 72 AC tests, 32 base days. Phase 2: 51 AC tests, 26.5 base days. Pilot-deferred: 31 base days, before any G5 redesign. The live-AI opt-in (open question 8) moves P1 into Phase 2 and adds six base days and 25–40 founder hours (AI-22) to it.

### Milestones

Each milestone's day count is the sum of its packages plus its share of contingency; a milestone that finishes early rolls its contingency forward, and one that finishes late consumes the next milestone's contingency before anything is cut.

| Milestone | Weeks | Packages | Base days | Contingency | Founder hours | Exit criterion |
|---|---|---|---|---|---|---|
| M0 Foundation | 1 | W1 | 4 | 1 | 4 (confirm A1–A18; name the clinical safety owner; review lexicon drafts) | Empty app runs; validators and CI pass; hosted demo reachable |
| M1 Enrollment and home | 2–3 | W2, W3, W4 | 8.5 | 1.5 | 10 (acknowledgment, emergency and crisis text in both layouts, after-hours, pause and stop text, lexicon approval) | Dana enrolls, acknowledges, sets preferences, pauses and stops; the Lucía blocked branch shows its reason; emergency content approved |
| M2 Check-ins, help, rules, queues | 4–5 | W5, W6, W7, W8 | 10 | 0 | 14 (day-3, 7, 14, 21 items; closing statements; urgent list; help text; free-text flag decision) | Dana through day 21; Marisol through escalation and UNOWNED on both bases; Keisha through the Unreached item |
| M3 Screening, sharing, follow-through | 6–7 | W9, W10, W12 | 7.5 | 2.5 | 12 (instrument, thresholds, framing and disclosure sentences, critical-item flag) | Priya through screening, referral states, and the day-14 interval; every Phase 1 scenario passes end to end in fallback mode |
| M4 Interview-ready | 8 | W11 | 2 | 3 | 8 (script review, protocol sign-off, dry run) | Documents exist; scripts dry-run by a founder who did not write the software; practice and women's interviews may begin; findings may reorder Phase 2 |
| M5 Sensitive paths, care plan, notifications | 9–10 | W13, W14, W18 | 8 | 2 | 16 (tagging, loss and trauma wording, tone review, care plan templates, barrier resources) | Elena runs to transition; outbox shows suppressed rows with reasons |
| M6 Follow-through, summaries, metrics | 11–12 | W15, W16, W17 | 9.5 | 0.5 | 8 (calculator and scope-sheet review, summary review) | Priya to appointment kept; summary exported; metrics and calculator populated |
| M7 AI exemplars and content tooling | 13 | W19, W20 | 3.5 | 1.5 | 8 (canned AI text, labels, block response) | Tamsin runs in both branches; all scenarios in fallback mode |
| M8 Hardening and readiness | 14–15 | W21, W22 | 5.5 | 1.5, plus 3 reserved for interview findings | 6 (two dry runs) | Complete-prototype acceptance criteria met |

Phase 1: 40 days, 48 founder hours, concentrated in weeks 2 through 7. Phase 2: 35 days, 38 founder hours. Prototype as specified: 75 engineer days, about 86 founder hours; add 25–40 founder hours if live AI is enabled.

### If the date is fixed

If the founders hold a six-week date, one engineer at five days per week reaches the end of M2 plus the contingency of M0 and M1: patient enrollment, preferences, home, pause and stop, check-ins through day 21, the help path with real emergency content, rules and harness, queues with timers and the patient-facing timeout copy. That state supports D1 and D3 with women and nurses. It does not include screening, sharing enforcement, FR-30a, referral states, the inventory, or the scripts, so it does not support D2, D5, D6, or D7, and it must not be shown to a practice's clinical owner or budget owner as the service. If a second engineer joins from M0, W9 and W10 can run in parallel with W5–W8 and the interview-ready state lands in about week 5, at which point the content path (M1 and M2 founder hours) is the binding constraint.

### Roles

| Role | Person | Responsibilities |
|---|---|---|
| Product/technical owner | Shahab | Milestones, tests, environments, docs deliverables, gateway, the AC record and the estimate table |
| Clinical safety owner | Founder (OB-GYN) | Every content item, rule, threshold, lexicon, emergency text; FR-17 and FR-30a flags; SR-28 protocol; clinical accuracy of scripts |
| Operations owner and discovery lead | Founder | Queue placeholders, scripts, recruitment under A12b, findings capture, pricing-conversation log |

### What to cut if time is short, in descending days saved

Cuts apply to Phase 2 unless stated; each names the discovery decision it weakens.

1. Live AI and P1 entirely (already the default; if opted in, revert) about 6 days; weakens nothing in D1–D9.
2. W17 metrics view reduced to the 11.3 measures without breakdowns, calculator, or CSV export, keeping the scope sheet as a static page, about 2.5 days; weakens D4 and the language and insurance rows of D2.
3. W15 partner panel replaced by referral state edits from the practice view, keeping capacity and insurance fields, about 1.5 days; weakens the referral-capacity conversation in D2.
4. Scenario 6.8 as a script only (keep the file-and-validator path) and FR-62 preview CLI, about 1 day; weakens D5 slightly.
5. Patient inbox (FR-69) and PWA install beyond the help path, about 1 day; weakens nothing.
6. Print export polish, about 0.5 day.
7. In Phase 1 only, and only to hold the M4 date: W12 reduced to 6.1, 6.2, and 6.3 tests, with 6.5 and 6.6 tests moved to M5, about 1 day; the scripts for 6.5 and 6.6 are then not run live until M5.

Do not cut: the eligibility denominator, verified follow-through states, the day-21 rule, the help path with real emergency content, the inline locked instruction beside every free-text field, queue ownership with timers and patient-facing timeout copy, FR-30a and its disclosure, patient pause and stop, patient-set sensitive controls, sensitive paths including the dialog and no resumption (6.4 stays), FR-06 data-layer enforcement, thresholds-unconfirmed labeling, the event pipeline, the synthetic guard, SR-27, SR-28, scenario 6.7 in both branches (the brief mandates the scenario; the branches are the FR-17 decision made visible), or the function inventory.

### Demo-readiness and acceptance criteria

Phase 1 readiness (interviews may begin):

1. Scenarios 6.1, 6.2, 6.3, 6.5, and the blocked branch of 6.6 run by a founder who did not write the software, in fallback mode, in the hosted demo, under fifteen minutes, on a phone and a laptop; the script for each states which steps are Phase 2.
2. Every acceptance criterion in packages W1–W12 passes and is recorded in `docs/ac-record.md` with the build hash.
3. Lint steps pass in CI; the emergency instruction, after-hours text, acknowledgment, closing statements, and inline instruction are approved by the clinical safety owner; no woman sees any screen before that approval.
4. The function inventory lists every function built to date; the FR-17 flag state and FR-30a state are in it; the queue ownership sheet, findings template, alternatives worksheet, and discovery-safety protocol exist; the "what this is and is not" handout accompanies every demo.
5. A11, A12a, A12b, and A13 are confirmed in writing; demos to women run only in `DEMO_PARTICIPANT_MODE` with the reset logged after each session.

Complete-prototype acceptance (end of Phase 2):

1. Scenarios 6.1–6.7 run by a founder who did not write the software, in fallback mode (and with AI if opted in), in the hosted demo, under twenty-five minutes, on a phone and a laptop; 6.7 shows both free-text branches.
2. Every FR, AI, prototype-required SR, and NFR acceptance criterion passes and is recorded with the build hash; the AC record count equals the table count or the difference is explained in the record.
3. Lint steps, accessibility automation, and the determinism test pass in CI.
4. Every content item shown is approved with claims and tone attributes; the counsel marker is visible where it applies; placeholders remain only for thresholds, the urgent list, and the practice number.
5. If AI is enabled, AI-22 is complete with zero unacceptable outputs on the pinned hash and `free_text_urgency_scan` is on under the owner's name; otherwise AI is off.
6. The dashboard shows placeholders as unconfirmed, the thresholds banner, and at least one queue definition NOT YET ASSIGNED.
7. All docs deliverables exist, including the data-flow map, vendor record, pilot-gate and pilot-debt files, and the regenerated inventory.
8. A fresh clone runs in fallback mode; the synthetic banner is on every screen and export.
9. The findings template was used in both dry runs; every requirement added after this draft has a row in the estimate table.

## 15. Open questions for the founders

Ranked by how much the answer changes this document.

1. **Is there a candidate practice, are its patients in Ohio, and where will the clinical safety owner, any queue reviewer, and any NestWell staff be physically located during pilot work?** (A2, SR-17, SR-20.)
2. **Who is the clinical safety owner and how many hours per week can they commit?** Precondition of M0; the milestone table needs about 12 hours per week in weeks 2 through 7.
3. **Do you accept the re-baselined dates in section 14 (eight weeks to interview-ready, fifteen to the complete prototype), the week-6 cut, or a second engineer?** (A4.)
4. **Who employs every queue owner and backup (A16)?** If NestWell, counsel re-scopes SR-18, SR-20, SR-25 before the pilot agreement.
5. **May the founders relax the FR-30a default (critical item always creates an Urgent item with the disclosure shown), and may a practice operate with "sharing withheld" on a threshold positive?** Counsel and the clinical owner must confirm or change the default before the first demo to women, not before the pilot.
6. **Which single primary instrument for the prototype, with placeholder thresholds, attribution, and licensing?** (A8.)
7. **Should free text be scanned against the emergency lexicon at entry (FR-17)?** Off: a note that mentions self-harm reaches a clinician on the same-business-day target, with the crisis line and 911 beside the field and in the closing statement. On: the same note also renders the full-screen instruction and creates an Urgent item, and the scan becomes a row in the function inventory. Enabling live AI requires on. The clinical safety owner decides under their name; both branches are demonstrated in 6.7.
8. **Do you want live AI in demos, or canned exemplars only?** Which discovery decision would live generation inform? (Arguably none.)
9. **What is on the urgent-symptom list, and what after-hours arrangement and cost does a typical partner practice have?**
10. **Recruitment and IRB or QI determination (A12b): how are the twenty women recruited, and what has each institution said in writing?**
11. **Referrer versus payer: is there a budget owner who will discuss a fixed fee or per-episode price, and what maximum minutes per episode?**
12. **Confirm wording for the loss-appropriate mood screen and mental-health offer in every loss and trauma status (FR-57), and confirm the trauma row of the suppression matrix.**
13. **Should a safety-at-home item be on the urgent list or in the check-in, and how are disclosures routed?** Until decided, the lexicon and locked help screen include a domestic-violence hotline.
14. **Default sharing category: opt-in or opt-out per role?** (FR-03.)
15. **Which referral partner would receive referrals today, which insurance do they accept, and can they confirm appointments?**
16. **What share of patients prefer Spanish, and who approves the Spanish safety-critical class?**
17. **Who reviews sensitive-path content for tone?**
18. **Which existing product has the candidate practice used or considered for postpartum follow-up, and why does it fall short locally?** (D2, D8.)
19. **Is blood-pressure follow-up something the practice would ask for?**
20. **Is there a build-versus-buy outcome you would accept?** (D8.)

## 16. References

All references are those cited in review.md; this document adds none.

- ACOG: Optimizing Postpartum Care; initial contact within three weeks, comprehensive visit by twelve weeks, as stated in the review.
- ACOG: Patient Screening; screening must connect to assessment, treatment, and follow-up.
- Hirshberg et al.: randomized trial of text-based postpartum hypertension follow-up (206 women; 92.2% versus 43.7%). Evidence for a defined text-based workflow.
- Suharwardy et al.: randomized postpartum chatbot trial (192 randomized; 152 completed; mixed results). Feasibility, not proof of an autonomous system.
- CDC: provisional 2025 birth data (about 3.6 million births). Scale, not a market.
- Maven, Pomelo Care, Babyscripts, Ovia, Soula: public descriptions as summarized in the review; reproduced verbatim in the alternatives worksheet with no additions.
- FDA: clinical decision support guidance and FAQ (January 2026). Function-specific analysis required; disclaimers do not decide classification.
- Illinois regulator announcement and 225 ILCS 155 (effective August 1, 2025). Assumed not to apply under A2 (Ohio); counsel to confirm; re-opened by SR-17 if geography or staff location changes.
- HHS mobile app guidance; FTC Health Breach Notification Rule guidance; HHS interstate licensure guidance. Applicability depends on the operating relationship and each data flow; clinical delivery requires state-specific licensure analysis.
- CMS Transforming Maternal Health model, 2025 through 2034. Illinois participates, Indiana is not listed per the review; Ohio not assessed; a gate item.
- Screening instruments under A8: EPDS, PHQ-9, GAD-7, with attribution as confirmed by the clinical owner.

Recommendations and illustrative economics carried from the review are analyst judgments, not validated product performance or legal determinations. Nothing here is a legal opinion; every item marked "counsel" requires counsel review before the pilot.