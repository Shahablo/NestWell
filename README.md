# NestWell — postpartum follow-through prototype

**Synthetic data only. This is a demonstration build for discovery interviews. It is not a
medical device, not a clinical service, and must never be used with a real patient.**

NestWell is a prototype of a twelve-week postpartum follow-through service tied to a single
OB practice: short check-ins, a care plan the patient can understand, a real path to a named
person at the practice, verified follow-through (a referral counts only when the appointment
was kept), and a concise clinician summary. It exists to make the founders' discovery
conversations with postpartum women and practice staff concrete. The scope comes from
[`docs/requirements.md`](docs/requirements.md), which in turn follows the independent analyst
review in [`docs/analyst-review.md`](docs/analyst-review.md).

## Try it

The app is a static web page hosted from this repository with GitHub Pages:

**https://shahablo.github.io/NestWell/**

Scan this on a phone, then use the browser's *Add to Home Screen* (Share → Add to Home Screen
on iPhone; the install prompt or ⋮ → Add to Home screen on Android) to get the app icon:

![QR code for the NestWell demo](docs/assets/nestwell-qr.png)

Everything runs in the browser you open it in. There is no server and no account: the app
seeds a set of synthetic patients, and a **demo clock** in the Admin panel moves time forward
so you can watch check-ins, escalations, and follow-through unfold. Use the role switcher in
the top banner to move between the **Patient** app, the **Practice** dashboard (coordinator,
clinician, budget owner, referral partner views), and **Admin** (clock, scenarios, reset, logs).

## Run it locally

```bash
npm install
npm run dev        # http://localhost:5173/NestWell/
npm test           # unit + scenario tests
npm run build      # typecheck + production build into dist/
```

Requires Node 20 or newer.

## How it is built

- React + TypeScript + Vite, published as an installable PWA. No backend, no network calls,
  no analytics, no CDN fonts.
- **Event-sourced.** Every action is an event; the current state is a projection of the event
  log up to the demo clock. Timer-driven behaviour (escalation targets, unopened check-ins,
  reminders, the "unreached" rule, the day-21 sweep) is derived from the clock, so nothing is
  scheduled and the demo can move backwards and forwards in time.
- **Config, not code.** Check-in templates, screening instruments and thresholds, routing
  rules, queue ownership and coverage, lexicons, and the care plan live as JSON under
  [`config/`](config); patient-facing text lives under [`content/`](content) with approval,
  tone-review and claims-check fields. Everything is validated at startup and the app refuses
  to run on a violation.
- **AI is off.** The "AI" layer serves clinician-approved canned examples with the required
  labels; the deterministic safety layer and the boundaries in requirements section 8 are
  designed in but no model is ever called in this build.
- **Placeholders are visible.** Screening thresholds, the urgent-symptom list, practice phone
  numbers, queue owners, and the referral partner are all labelled as placeholders that a named
  clinical owner must confirm. Nothing here is clinically set.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the module layout and the domain
model, [`docs/BUILD-STATUS.md`](docs/BUILD-STATUS.md) for what is and is not implemented, and
[`docs/demo-scripts/`](docs/demo-scripts) for the walkthrough scripts founders use in
interviews.

## Documents

| File | What it is |
|---|---|
| [`docs/requirements.md`](docs/requirements.md) | The prototype requirements (working draft v0.1) |
| [`docs/open-questions.md`](docs/open-questions.md) | Ranked questions the founders need to answer |
| [`docs/analyst-review.md`](docs/analyst-review.md) | The independent review the scope is based on |
| [`docs/demo-scripts/`](docs/demo-scripts) | Scenario scripts for discovery sessions |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Technical brief |

## Safety and privacy posture of this build

- No real person's information should ever be entered. Free-text fields are for the synthetic
  persona only, and *Demo participant mode* (Admin → Settings) disables free text entirely
  for sessions with real interviewees.
- Emergency content (911, the 988 Suicide & Crisis Lifeline, the National Domestic Violence
  Hotline) is real and is rendered by non-AI code, byte for byte. Practice numbers are 555
  placeholders.
- Regulatory items (FDA clinical decision support assessment, HIPAA business-associate
  posture, FTC health-data obligations, Ohio state-law review) are tracked as gate items in
  the requirements and are **not** resolved by this build.

## License

Prototype source © the NestWell founders. The Edinburgh Postnatal Depression Scale is
reproduced with its required citation (Cox, Holden & Sagovsky, 1987, *Br J Psychiatry*
150:782–786); the PHQ-9 is in the public domain.
