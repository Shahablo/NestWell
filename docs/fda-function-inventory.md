# FDA function inventory (SR-09) and queue ownership sheet (SR-10)

Synthetic data only — demonstration build. Generated on 2026-09-16 from the rows shown in
Admin → Inventory (`src/ui/admin/InventoryPage.tsx`) and the shipped configuration
(`config/freetext.json`, `config/instruments/*.json`, `config/lexicons/*.json`,
`config/rules/*.json`, `config/queues.json`, `config/coverage.json`, `config/practice.json`).
The admin page reads the flag states live; this file is a snapshot and is regenerated at the end
of each phase (requirements section 14) so it never describes code that does not exist.

Every row reads **not yet assessed**. The last two columns are filled only by the G5 regulatory
reviewer. The label in AI-13 is for patient clarity and is not a safeguard. Live AI is **off**
in this build.

## Function inventory

| Id | Function | Inputs | Outputs | Viewer | Basis shown | Rules or model | Flag state | Regulatory reviewer determination | Date |
|---|---|---|---|---|---|---|---|---|---|
| FR-17 | Free text routed to a human on entry | Patient free text (check-in note, saved question, usefulness comment, sensitive preferences) | One Needs-review item in the same transaction as the save; with the scan on and an emergency-lexicon match: one Urgent item instead, help_requested (source lexicon_match, lexicon version), full-screen FR-22 | Clinician (Needs review); coordinator (Urgent) | Locked emergency instruction beside the field; pending closing statement with call-by time | Rules only — config/lexicons/emergency (version 0.1.0, 49 entries); no model | `free_text_urgency_scan = off (unconfirmed; no owner has set it)` | not yet assessed | — |
| FR-23 | Rules-based urgent pathway | Check-in response rule tags, screen score and critical item, status subtype, help source | rule_fired; full-screen FR-22; Urgent / Needs-review item; screen offer; pause | Coordinator, clinician | Rule key, version and effective date on every rule_fired | Rules only — 9 configured rules in config/rules; no model | n/a (rules are config with author, version, approver) | not yet assessed | — |
| FR-30 | Routing on threshold and critical items | Instrument item responses (EPDS placeholder, PHQ-9) | Threshold positive: one Needs-review item (subject to FR-06 sharing); critical item: FR-23 pathway | Clinician; coordinator only within the sharing category | Instrument attribution, threshold shown as placeholder until confirmed | Rules only — sum scoring; thresholds EPDS ≥ 10 (placeholder, unconfirmed); PHQ-9 ≥ 10 (placeholder, unconfirmed) | `epds: thresholds_confirmed_by = null; phq9: thresholds_confirmed_by = null` | not yet assessed | — |
| FR-30a | Critical item with sharing withheld (placeholder policy) | critical_item_hit, patient sharing category | Flag true: Urgent item carrying only "critical safety item positive; other results withheld at patient request; policy unconfirmed". Flag false: no queue item; patient sees FR-22 and help resources | Coordinator (Urgent item, no score or item text); patient | Disclosure sentence in the acknowledgment and screen framing matches the flag | Rules only; no model | `critical_item_overrides_sharing = on (unconfirmed; no owner has set it)` | not yet assessed | — |
| AI-01 | Reword a named approved content item for reading level | Content id, locale, active sensitive subtypes — never free text, answers or scores | Reworded text with the AI-13 label; ai_interaction; ai_fallback_used when no exemplar | Patient | AI-13 label on every reworded item | Canned exemplar store (config/ai-exemplars, version 0.1.0); no model call | `ai_enabled = false` | not yet assessed | — |
| AI-13 | Patient-facing label on AI-assisted text | None (static approved label plus the after-hours instruction) | Label text rendered with any reworded item | Patient | The label itself | Static content; no model | `ai_enabled = false` | not yet assessed | — |
| AI-15 (a) | Prefilter — emergency-lexicon evaluation | Patient text submitted to an AI feature | Same as an FR-17 match: full-screen FR-22, one Urgent item, help_requested (lexicon_match), ai_call_blocked (emergency_lexicon) | Coordinator; patient | Locked content plus the pending sentence | Rules only — the same emergency lexicon file as FR-17; runs only when live AI is enabled | `ai_enabled = false; free_text_urgency_scan = off (unconfirmed; no owner has set it)` | not yet assessed | — |
| AI-15 (b) | Prefilter — therapy-intent block | Patient text submitted to an AI feature | Locked instruction with crisis line and named contact plus the pending sentence; one Needs-review item; help_requested (ai_prefilter); ai_call_blocked (therapy_intent) | Clinician; patient | Locked content plus the pending sentence | Rules only — config/lexicons/therapy_intent (version 0.1.0, 11 entries); runs only when live AI is enabled | `ai_enabled = false` | not yet assessed | — |

**Appendix.** All other requirement ids: not applicable — they do not read or write a symptom
answer, screen response, critical item, urgency flag, lexicon match, queue routing or
patient-facing recommendation.

## Queue ownership sheet (SR-10)

Generated from `config/queues.json` and `config/coverage.json`. Every owner is a practice role
(A16); every `owner_user_id` and `backup_user_id` is null in this build, so the owner and backup
render as NOT YET ASSIGNED until the practice sets them. The on-duty person comes from the
coverage schedule (Monday to Friday 08:00–17:00 practice time for every queue; no backup on duty
is configured). Every queue definition is a placeholder.

| Queue | Owner role | Backup role | Queue employer | Ack target | Backup target | Resolution target | Timer basis | Coverage | On duty (from coverage) | If nobody answers |
|---|---|---|---|---|---|---|---|---|---|---|
| Urgent (`urgent`) — urgent rule match, critical item, I need help now, or emergency-lexicon match (FR-17, AI-15); resolution means a contact was attempted and the outcome logged | coordinator — NOT YET ASSIGNED | clinician — NOT YET ASSIGNED | practice | 30 min | 60 min | 120 min | wall | Mon–Fri 08:00–17:00 | Care coordinator (synthetic) | Escalated at the ack target, UNOWNED at the backup target; patient copy switches to `queue.no_answer.urgent` |
| Needs review (`needs_review`) — positive screen, coping-difficulty answer, any free text, therapy-intent block, or referral dead end; same business day (placeholder), counted on coverage hours | clinician — NOT YET ASSIGNED | clinician — NOT YET ASSIGNED | practice | 480 min | 960 min | none set | coverage hours | Mon–Fri 08:00–17:00 | OB clinician (synthetic) | Escalated at the ack target, UNOWNED at the backup target; patient copy switches to `queue.no_answer.needs_review` |
| Follow-through (`follow_through`) — referral, visit, callback, or barrier item; three business days (placeholder, approximated as 4320 wall minutes); ages visibly; listed weekly while unresolved | coordinator — NOT YET ASSIGNED | clinician — NOT YET ASSIGNED | practice | 4320 min | 8640 min | none set | wall | Mon–Fri 08:00–17:00 | Care coordinator (synthetic) | Escalated at the ack target, UNOWNED at the backup target; patient copy switches to `queue.no_answer.follow_through` |
| Unreached (`unreached`) — two consecutive unopened check-ins while not paused (FR-13), or the day-21 sweep; shorter target when flagged with an open clinical item | coordinator — NOT YET ASSIGNED | clinician — NOT YET ASSIGNED | practice | 1440 min (240 min with an open clinical item) | 2880 min | none set | wall | Mon–Fri 08:00–17:00 | Care coordinator (synthetic) | Escalated at the ack target, UNOWNED at the backup target; patient copy switches to `queue.no_answer.unreached` |
| Sensitive review (`sensitive_review`) — sensitive status set by staff or patient; suppression is automatic and does not wait; a loss "not for now" requires a logged human contact within the configured days | clinician — NOT YET ASSIGNED | coordinator — NOT YET ASSIGNED | practice | 1440 min | 2880 min | none set | wall | Mon–Fri 08:00–17:00 | OB clinician (synthetic) | Escalated at the ack target, UNOWNED at the backup target; patient copy switches to `queue.no_answer.sensitive_review` |
| Summaries to review (`summaries`) — week 9, week 12, and on-demand summaries awaiting clinician review; stays draft until reviewed; listed by owner | clinician — NOT YET ASSIGNED | clinician — NOT YET ASSIGNED | practice | 4320 min | 8640 min | none set | wall | Mon–Fri 08:00–17:00 | OB clinician (synthetic) | Escalated at the ack target, UNOWNED at the backup target; patient copy switches to `queue.no_answer.summaries` |

## Staff roles and employers (A16)

| Id | Name | Role | Permissions | Employer |
|---|---|---|---|---|
| `coord-1` | Care coordinator (synthetic) | Coordinator | on_call | practice |
| `ob-1` | OB clinician (synthetic) | Clinician | config_approver, content_approver, on_call | practice |
| `budget-1` | Practice budget owner (synthetic) | Budget owner | — | practice |
| `partner-1` | Referral partner contact (synthetic) | Referral partner | — | partner |

## Regeneration

Open Admin → Inventory in the running app (or read `src/ui/admin/InventoryPage.tsx`) and copy
the rows with the flag states then in force; the flag values come from `config/freetext.json`
and `config/instruments/*.json`. Update the date at the top and record the change in
`docs/BUILD-STATUS.md`.
