# Demo scripts

One script per scenario in requirements section 6. A founder who did not write the software
can run each one from the admin panel. Synthetic data only: every persona is generated, every
phone number is 911, 988, the DV hotline or a labelled 555 placeholder, and the banner says so
on every screen.

| Script | Branches (Admin → Scenarios) | Women | Practice stakeholders |
|---|---|---|---|
| [6.1 Dana](6.1-dana.md) | `dana`, `dana_late_enrollment` | Default | Default |
| [6.2 Priya](6.2-priya.md) | `priya`, `priya_declined_screen`, `priya_sharing_withheld`, `priya_critical_withheld`, `priya_referral_declined`, `priya_escalated_then_acknowledged` | Default, without variant (c); the persona, never the participant, answers the instrument | Default, with variants |
| [6.3 Marisol](6.3-marisol.md) | `marisol`, `marisol_after_hours` | Only after a stated content warning and opt-in | Default |
| [6.4 Elena](6.4-elena.md) | `elena` | Only after a stated content warning and opt-in; not shown to a participant with a known loss history without the tone reviewer's input | Default |
| [6.5 Keisha](6.5-keisha.md) | `keisha`, `keisha_paused` | Default | Default |
| [6.6 Lucía](6.6-lucia.md) | `lucia_blocked`, `lucia_enrolled` | Default | Default |
| [6.7 Tamsin](6.7-tamsin.md) | `tamsin_scan_off`, `tamsin_scan_on` | Not shown | Default |
| [6.8 Threshold change](6.8-threshold-change.md) | none (a config edit and restart) | Not shown | Optional |

The default branch `all_personas` carries every baseline history at once, staggered so that at
the default clock (Monday 2026-04-20, 11:00 practice time) the dashboard shows Marisol at day 13,
Elena at day 19, Keisha at day 27 (reached that morning), Priya at day 32, Dana at day 48,
Tamsin at day 84, and Lucía registered but not offered enrollment.

## How the time model works in a demo

- Every branch is fully seeded: the persona's whole twelve-week history was replayed through the
  same domain services at virtual times. Setting the clock (Admin → Clock) filters what is
  visible by `occurred_at`; timers, unopened check-ins, reminders, Unreached items and the day-21
  sweep are derived from the clock, so moving it backwards makes them disappear.
- To show a step, **advance the clock** to the time in the script. Prefer that to acting live:
  a live action is stamped at the current clock and stays in the log next to the seeded history.
  Act live only where a script says "Live".
- Reload a branch (Admin → Scenarios → Load) to reset everything in this browser (SR-12). Two
  loads of the same branch produce identical logs apart from wall time and ids (FR-48, NFR-04).
- Times in the scripts are practice time (config `practice.timezone`, America/New_York).

## Session rules

- Every session with a woman runs under SR-27 (demo participant mode: nothing entered is seen by
  any clinician; the numbers on screen are not real) and SR-28 (discovery-session safety
  protocol). The "what this is and is not" handout accompanies every demo.
- Every practice-facing script opens with the cross-scenario block and closes with the paired
  questions below. The alternatives worksheet (FR-70) is shown after the dashboard. Answers go in
  the findings template (FR-70).

**Opening block (practice audiences).** "Who owns the postpartum gap at your practice today?
Which tools (Babyscripts, EHR portal, Maven or Pomelo via a plan, phone protocols) do you use
or have evaluated, and what remains unresolved after them? Who would pay?"

**Closing paired questions (practice audiences).** To the clinician: "Would you recommend this to
patients?" To the budget owner: "Would you pay for it, from which budget, at which structure?"

## Running a script

1. Open the app, switch to **Admin** (role switcher in the banner), go to **Scenarios**, load the
   branch the script names. The clock jumps to the script's starting clock.
2. Use the role switcher to move between the **Patient** app (`#/p/…`), the **Practice**
   dashboard (`#/practice/…`, views coordinator, clinician, budget owner, referral partner) and
   **Admin** (`#/admin/…`: clock, scenarios, reset, logs, inventory, validation).
3. Follow the steps table. Each row gives the clock to set, the actor whose view to open, the
   screen, the action (seeded or live) and the result to look for.
4. Show the expected events in Admin → Logs when the audience is technical.
5. Ask the discovery questions and record the answers in the findings template.

Placeholders are visible on purpose: thresholds, the urgent-symptom list, the practice phone
numbers, queue owners (NOT YET ASSIGNED), the referral partner (NOT YET SECURED) and barrier
resources (NOT YET PROVIDED) render with the placeholder label until a named owner sets them.
