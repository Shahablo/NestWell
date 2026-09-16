# Clarifying questions (ranked)

## 1. [HIGH] Is the prototype only a synthetic-data discovery demo for the first-30-days interviews, or do you expect it to be the software you enroll real patients on in the 12-week pilot?

- Why it matters: A discovery demo can defer authentication hardening, audit logging, a BAA-ready hosting environment, real notifications, and formal clinical sign-off, and can use invented content freely. A pilot-ready product pulls every SR-xx and NFR-xx item forward, roughly doubles the build effort, and requires the FDA function-by-function assessment, HIPAA business-associate setup, Ohio state-law review, and a staffed queue before launch. The answer sets the scope of sections 2, 9, 10, 13 and 14 and the acceptance criteria.
- Working assumption: A1: synthetic-only discovery demo whose architecture and data handling can evolve into the pilot without a rewrite, but which is not the pilot product and never holds real patient data.

## 2. [HIGH] Do you have a specific Ohio OB practice today, with a named clinical owner (a nurse or physician who will own the queue) and a named budget owner, who has agreed to look at the prototype and discuss a paid pilot?

- Why it matters: The review calls this the most consequential unanswered question. With a named practice, the dashboard, queue roles, clinician summary format, enrollment workflow, and demo scripts can be built around how that practice actually works, and the practice stakeholders become the primary demo audience. Without one, the prototype must stay generic, make the missing roles visible as placeholders, and the first milestone becomes securing that conversation rather than polishing features.
- Working assumption: A9: no practice, clinical owner, budget owner, or referral partner is secured; the prototype works as a demo without them and shows their roles as explicit, named-but-unfilled placeholders.

## 3. [HIGH] Which of you is the clinical safety owner, which is the operations owner, and is Shahab the product/technical owner, and how many hours per week can each of you commit during the build?

- Why it matters: The clinical safety owner must approve every check-in question, care-plan explanation, escalation rule, screening threshold, and emergency instruction before it is shown to anyone; the operations owner defines queue coverage and the practice workflow; the technical owner builds. If these roles are not assigned, content approval becomes the critical path and the build plan slips. Hours available determine whether 4–6 weeks is realistic and what gets cut.
- Working assumption: A4 plus the review's founder implications: one OB-GYN founder is clinical safety owner, the other is operations owner, Shahab is product/technical owner; founders supply and approve clinical content on a weekly cadence.

## 4. [HIGH] Have you confirmed with your employers what your intellectual-property, outside-work, and conflict-of-interest obligations are, and whether you may use your own patients, staff, or practice systems for discovery interviews and demos?

- Why it matters: If an employer claims IP in work done by its physicians, or prohibits outside ventures without disclosure, the founders may not be able to author clinical content or approach their own practice. This changes who can be interviewed, whether the founders' current practice can be the partner, who owns the prototype code and content, and whether a separate content-authoring arrangement is needed. It also determines whether any employer device or account may be used to view the prototype.
- Working assumption: Obligations are unreviewed; the document treats employer review as a prerequisite before any employer patient, staff member, or system is involved, and the founders author content as NestWell, not as employees.

## 5. [HIGH] Do you agree that no real person's health information will ever be entered into the prototype, including you testing on yourselves, colleagues, or friends, and that demo participants will only watch or drive synthetic personas?

- Why it matters: A single real entry turns a synthetic demo into a system holding health data, triggering HIPAA or FTC obligations, breach-notification exposure, and the question of whether an unreviewed AI feature gave clinical advice to a real person. If founders want to try the patient flow themselves, the prototype needs a hard block on free-text identifiers, a 'demo persona only' enrollment path, and a data-purge routine, and the consent language for interviewees must say the tool is not for their own use.
- Working assumption: A1: synthetic patients only; enrollment is restricted to pre-built personas; free-text fields are labeled and purged after each demo; interviewees never enter their own information.

## 6. [HIGH] Is the single operational priority for the prototype completion of postpartum follow-up visits plus completion of mental-health referrals, or does your prospective practice want blood-pressure follow-up instead?

- Why it matters: Visit and referral completion needs scheduling data, a referral-partner model, screening instruments, and a follow-through tracker. Blood-pressure follow-up needs cuff provisioning, numeric thresholds, a same-day clinical response path, and higher-acuity escalation design, and it is the workflow with the strongest trial evidence. Supporting both doubles the pathway content and safety review. The choice drives sections 5, 6, 7 (screening and routing, follow-through), and 11.
- Working assumption: Visit completion and mental-health referral completion; blood-pressure follow-up is documented as an alternative and excluded from the prototype unless a partner practice asks for it.

## 7. [HIGH] Who is building the prototype, over what calendar period, and what budget is available for hosting, an LLM API, a messaging provider, and any contractor time?

- Why it matters: A one-person build over 4–6 weeks supports the seven demo scenarios, a basic dashboard, and simulated notifications, but not real SMS, accessibility audit, or Spanish content. If there is a second engineer or more time, the pilot-readiness items (audit logging, role-based access, retention controls) can be started now. If there is no budget for an LLM API, the AI features become scripted only. The answer sets the milestone plan and the cut list in section 14.
- Working assumption: A4: Shahab, possibly with one additional engineer, roughly 4–6 weeks of build effort; nominal spend on hosting and a Claude API key; no contractors.

## 8. [HIGH] For each demo audience (postpartum women, nurses and medical assistants, OB clinicians, the practice budget owner, and possibly a behavioral-health partner), what single decision or answer do you want each demo to produce?

- Why it matters: The demo scripts in section 6 and the discussion guides must be built backwards from those decisions: patients need to say whether the check-ins are worth their time and what they would skip; nurses need to say whether the queue fits their day and how many minutes it costs; the budget owner needs to react to a priced pilot scope. If the founders mainly want the budget-owner conversation, the dashboard and metrics view take priority over patient-side polish, and vice versa.
- Working assumption: Patient demos test whether the follow-through promise resonates and which check-ins feel like a burden; staff demos test workload and queue ownership; the budget-owner demo makes a priced pilot concrete; each persona script ends with a fixed set of interview questions.

## 9. [MEDIUM] Will the partner practice and the enrolled patients be in Ohio, and do you expect any patient to be located in another state during the 12 weeks?

- Why it matters: State law follows the practice and the patient, not the state of incorporation. If the practice or patients are elsewhere, the pilot-readiness gate must include that state's licensure, telehealth, and AI or mental-health rules (Illinois in particular has a statute restricting AI in therapy). The prototype itself is unaffected, but the gate in section 13 and the regulatory posture in section 9 change.
- Working assumption: A2: company incorporated in Ohio; practice and patients in Ohio; an Ohio state-law review is a pilot-readiness gate item; Illinois law is not a design constraint.

## 10. [MEDIUM] Is a mobile-responsive web app for patients and a web dashboard for the practice acceptable for the prototype, and does the pilot need real SMS from day one rather than simulated messages?

- Why it matters: If the practice or founders believe patients will only respond to text, the prototype should demonstrate an SMS-first flow (short messages, reply keywords, links into the web app) and the architecture must include a messaging-provider adapter, consent capture, opt-out handling, and delivery logging now. A native app changes the build effort and distribution plan substantially. If simulated notifications are enough for discovery, the notification module stays a stub that renders messages in a demo panel.
- Working assumption: A3: mobile-responsive web app (PWA acceptable) plus a practice web dashboard; SMS and email are simulated and shown in a demo notification panel; the design leaves a clean seam for a real messaging provider in the pilot.

## 11. [MEDIUM] Do you want a live language model in the demo, generating explanations and draft summaries from your approved content, or should every AI output shown to stakeholders be pre-written by you?

- Why it matters: A live model shows stakeholders realistic adaptive language and lets you probe trust, but it requires a grounding corpus, a deterministic safety layer, output logging, and a founder review process before each demo, and it can behave unexpectedly in front of a budget owner. Scripted output is safer and cheaper but tests less. The answer determines the AI-xx requirements, the fallback design, and about a week of build effort.
- Working assumption: A5: a real model (Claude API) may be used on synthetic data only, grounded in clinician-approved content, with a deterministic safety layer and a scripted fallback so every demo can run without live model behavior.

## 12. [MEDIUM] Which behavioral-health referral partners (practices, therapists, psychiatric providers, or a crisis line) would actually receive the referrals in the pilot, do they accept the relevant insurance, and what is their typical time to a first appointment?

- Why it matters: The core demo scenario is positive screen, referral, confirmed appointment. If no partner exists or wait times are weeks, the 'confirmed follow-through' step cannot be honest and the service promise weakens. The prototype's referral-partner persona, the appointment-confirmation workflow, and the metric 'time from positive screen to treatment connection' all depend on a real partner model, and the pilot-readiness gate needs a capacity commitment.
- Working assumption: A9: no referral partner is secured; the prototype models a generic behavioral-health partner with a manual confirmation step performed by the practice coordinator and flags partner capacity as a gate item.

## 13. [MEDIUM] Does your prospective practice already use Babyscripts or any other patient-engagement, remote-monitoring, or postpartum follow-up tool, and if so what remains unresolved after that tool?

- Why it matters: If an incumbent tool is in place, the prototype must demonstrate a specific gap it fills (for example, verified referral completion or a lower-workload queue) rather than duplicating education and reminders, and the discovery guide must ask staff to compare directly. If there is no tool, the practice's current manual process becomes the baseline for the workload and completion metrics. The build-versus-buy question in the review may also resolve toward partnering.
- Working assumption: The practice has no dedicated postpartum follow-up tool and relies on phone calls and the EHR; the discovery guide asks about existing tools explicitly.

## 14. [MEDIUM] Who would monitor the practice queue during the pilot, what are the coverage hours, and what do you expect to happen to a message that arrives at night or on a weekend?

- Why it matters: The prototype must show real, correct after-hours instructions and an explicit 'nobody is watching this queue right now' state, with acknowledgment timers and an unanswered-item escalation path. Whether coverage is business hours with an on-call line, an existing nurse triage line, or a NestWell-staffed service changes the queue design, the emergency-instruction copy, the staffing cost in the pilot budget, and the demo script for the same-day-call scenario.
- Working assumption: Business-hours monitoring by a practice care coordinator; outside those hours the product displays the practice's existing after-hours number and 911/emergency guidance and never implies a response is coming; an unacknowledged item escalates to a named backup on the next business morning.

## 15. [MEDIUM] Which screening instruments do you want in the prototype (EPDS, PHQ-9, GAD-7), at what score thresholds, and at what points in the 12 weeks should they be offered?

- Why it matters: Instrument choice affects licensing and attribution, question count and patient burden, the routing rules in the screening-and-routing requirements, the positive-screen demo scenario, and the self-harm item handling, which needs its own immediate-instruction path. Thresholds and timing are clinician-owned configuration, but the demo data and scripts must be built against specific values.
- Working assumption: A8: EPDS with the standard published attribution, offered at weeks 1–3 and again around week 6–8; PHQ-9 available as an alternative; GAD-7 optional; thresholds and routing stored as configuration and set by the clinical safety owner before the first demo.

## 16. [MEDIUM] At what point should enrollment happen (a late-pregnancy visit, hospital discharge, or the first postpartum contact), and who performs it: practice staff, hospital staff, or the patient herself?

- Why it matters: Enrollment at a prenatal visit means the practice owns enrollment and the denominator is all eligible prenatal patients; enrollment at discharge often involves hospital staff the practice does not control; self-enrollment changes the consent flow and the completion metric. The choice determines the enrollment requirements, the preference-capture screen, the week-0 timeline, and the 'patient who stops responding' scenario.
- Working assumption: Enrollment by practice staff at a late-pregnancy visit (about 36 weeks) with a backup enrollment at the first postpartum contact; the patient confirms consent and preferences on her own device.

## 17. [MEDIUM] Can you share the original business case, any clinical pathways or check-in scripts you have already drafted, your preferred screening and escalation rules, and any brand name, logo, or tone guidance?

- Why it matters: Existing pathways and scripts become the approved content corpus the AI is grounded in and shorten content authoring, which is otherwise the critical path. The business case may contain pricing, persona, or partner details the review did not have. Brand assets determine whether the prototype uses a neutral placeholder look or NestWell branding, which matters for how stakeholders perceive it.
- Working assumption: No approved content exists yet; the document includes a content backlog the clinical safety owner must author and approve, and the prototype uses a neutral NestWell wordmark with no marketing claims.

## 18. [MEDIUM] Is English-only acceptable for the prototype, and what share of the practice's postpartum patients speak Spanish or another language?

- Why it matters: If a meaningful share of the practice's patients are Spanish-speaking, the Spanish persona demo needs real translated content approved by a clinician (machine translation of clinical instructions is not acceptable), which adds content work now rather than in the pilot. Language also affects the dropout-by-language metric and whether interpreter access must appear in the help path.
- Working assumption: A6: English content in the prototype; the content model carries a language key and the Spanish persona is demonstrated with a small approved subset; full Spanish content is a pilot requirement.

## 19. [LOW] How should the practice receive the clinician summary and mental-health results, and what control should the patient have over which information is shared with the practice and the referral partner?

- Why it matters: A7 keeps the summary in the dashboard with a printable export, but a practice may insist on an EHR inbox or fax, which changes the pilot integration plan. The review asks for mental-health integration with patient control over sharing; the answer sets the consent and preference requirements, what the referral partner persona sees, and how the summary is redacted, and it must be consistent with how the practice documents screening today.
- Working assumption: A7: summary shown in the dashboard and exportable as PDF or print; screening results are shared with the practice by default and with the referral partner only after the patient confirms, with the choice recorded as a preference and an audit event.
