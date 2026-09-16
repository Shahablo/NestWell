# NestWell walkthrough video — production brief

This is the contract between everyone (and every agent) working on the video. Read it in full
before touching anything. Everything lives under `D:/NestWell/video/`. Do not edit the app
(`D:/NestWell/src`, `config`, `content`) or the website (`D:/nestwell_website`) unless your task
says so.

## 1. What we are making

A calm, animated walkthrough of the NestWell prototype, **2:00–2:30 long (hard ceiling 150 s)**,
1920×1080, 30 fps, with a soothing narrator, low ambient music, and burned-in-free captions
delivered as a WebVTT file. It goes on https://hellonestwell.com.

Audience: OB practices, families, and partners visiting the website. Tone: warm, unhurried,
plain words, second person where natural, never salesy. It walks through **the app** — the
patient's phone and the practice dashboard — using real screens from the working prototype,
placed inside simple device frames and animated gently. Characters are simple and undefined:
rounded figures (a head circle and a soft body shape), no faces beyond, at most, a closed-eye
curve. A mother holding a small bundle, a care coordinator with a headset arc, a clinician.

### Non-negotiable content rules

Same as the website (`D:/nestwell_website/docs/BRIEF.md` section 2). Never say or show:
"first", "only", "first-of-its-kind", "better than", "replaces", "guaranteed", "proven",
"clinically validated", "HIPAA compliant", "FDA cleared/approved", "24/7", "monitoring",
"always watching", "we'll know", "AI triage/therapy/diagnosis", "prevents complications",
"saves lives", "reduces mortality", any NestWell outcome statistic, any competitor.

Must be true and said once, plainly: this is a **working demonstration with made-up patients**;
NestWell is **in development** and **looking for pilot practices in Ohio**. AI explains
clinician-approved material and drafts summaries for a clinician to review — it never triages,
diagnoses, reassures, or replaces a person. Emergency guidance is written by clinicians and
shown the same way every time. A referral counts when the appointment is **kept**, not when a
link is sent. When nobody at the practice has answered in time, the patient is told to **call**,
not to wait. After a loss, baby-related content stops at once and nothing resumes on its own.
She decides who sees her mood answers.

## 2. Scene plan (ids are fixed; durations are targets, set finally by the voice timings)

| # | id | target s | what the viewer sees | what the narration covers |
|---|---|---|---|---|
| 1 | `open` | 8 | Nest mark draws in (three arcs, then the egg), wordmark fades up, soft ground | Welcome; this is NestWell |
| 2 | `weeks` | 12 | A mother figure at home holding a bundle; a gentle twelve-week band draws across (birth, day 3, 7, 14, 21, week 6, 9, 12) | The twelve weeks after birth are full, and follow-up care can quietly slip |
| 3 | `promise` | 10 | A phone and a clinic building connected by a soft dotted line; the promise line types in | The promise: she completes the next step, and her practice can verify it happened |
| 4 | `demo` | 7 | A small "working demonstration · made-up patients" label settles over a phone and a laptop | What follows is a working demonstration with made-up patients |
| 5 | `home` | 12 | Phone: patient home (`phone-home`); highlight ring on "I need help now", then on the named contact card | Her phone: a named person at her practice, and help always one tap away |
| 6 | `checkin` | 16 | Phone sequence: check-in intro → a question → an answer tapped → the saved screen (`phone-checkin-*`) | A few short questions at set points; skip any, or say not now; no streaks or scores |
| 7 | `help` | 11 | Phone: the emergency instruction (`phone-help`); the tel links pulse softly | If something is urgent, clear instructions written by clinicians, the same every time; she can call straight from the screen |
| 8 | `mood` | 13 | Phone: mood questions (`phone-epds`) then sharing choice (`phone-preferences`) | Mood questions are optional and not a diagnosis; she decides who sees her answers |
| 9 | `queue` | 16 | Laptop: coordinator queue after hours (`desk-queues-urgent`); a small clock and owner chip animate; then the patient phone shows "we have not been able to reach a nurse yet" (`phone-nobody-reached`) | On the practice side every item has an owner and a clock; if nobody answers in time, she is told to call, not to wait |
| 10 | `followthrough` | 14 | Laptop: referral record (`desk-referral`); three chips light in turn: sent → scheduled → kept | Follow-through means the appointment was kept, not that a link was sent |
| 11 | `loss` | 12 | Phone: Elena's home after a loss (`phone-elena-home`) beside a softly fading "baby content" card | After a loss, baby content stops at once; she chooses how to be contacted; nothing resumes on its own |
| 12 | `summary` | 11 | Laptop: summary list (`desk-summaries`) then metrics (`desk-metrics`); a small "AI draft · clinician reviews" chip | A short summary for her clinician — AI drafts it, a clinician reviews it; the practice can see what's working |
| 13 | `close` | 10 | Nest mark returns; "In development · looking for pilot practices in Ohio" and `hellonestwell.com` | NestWell is in development and looking for pilot practices in Ohio; visit hellonestwell.com |

Target total ≈ 150 s before timing; the voice step must land the final total at 135–150 s.

## 3. File contracts

```
video/
  VIDEO-BRIEF.md                 this file
  script/narration.json          the script (owner: SCRIPT)
  tools/capture.mjs              captures app states into assets/app (owner: CAPTURE)
  tools/music.py                 procedural music → build/music.wav (owner: MUSIC)
  tools/tts.py                   narration audio + timings + captions (owner: VOICE)
  tools/render.mjs               frames via Chrome DevTools Protocol → ffmpeg (owner: SCENES)
  tools/mix.py                   ducking mix + mux + poster (owner: SCENES)
  scenes/index.html, scenes.css, scenes.js, art.js   the animation (owner: SCENES; art.js: ART)
  assets/app/*.png               app captures (owner: CAPTURE)
  build/                         intermediates (gitignored)
  out/nestwell-walkthrough.mp4   final video
  out/nestwell-walkthrough.vtt   captions
  out/nestwell-walkthrough-poster.jpg
  out/transcript.md              plain transcript
```

### 3.1 `script/narration.json`

```json
{
  "voice": "af_heart",
  "speed": 0.88,
  "sentence_gap": 0.55,
  "scenes": [
    {
      "id": "open",
      "title": "NestWell",
      "min_seconds": 7,
      "lead_in": 1.6,
      "tail": 1.0,
      "sentences": ["Welcome to NestWell."],
      "caption": null,
      "visual": "free text for the scene builder"
    }
  ]
}
```

Sentences are spoken in order with `sentence_gap` seconds between them. Keep sentences short
(ideally ≤ 18 words), concrete, and speakable. Spell out numbers the way they should be said
("twelve weeks", "nine one one" is NOT needed — write "911" only in on-screen text, say
"nine-one-one"). About 290–330 words in total.

### 3.2 `build/timings.json` (written by VOICE, read by SCENES and the mixer)

```json
{
  "fps": 30, "width": 1920, "height": 1080, "total": 146.4,
  "voice_wav": "build/voice.wav",
  "scenes": [
    { "id": "open", "start": 0.0, "end": 8.2,
      "sentences": [ { "text": "Welcome to NestWell.", "start": 1.6, "end": 3.0 } ] }
  ]
}
```

All times are absolute seconds from the start of the video. A scene's `end` equals the next
scene's `start`. `build/voice.wav` is 24 kHz or 48 kHz mono, exactly `total` seconds long,
with every sentence placed at its `start`.

### 3.3 Captures (`assets/app/*.png`)

Phone captures: viewport 390×844 CSS px at deviceScaleFactor 3, mobile emulation on.
Desktop captures: 1440×900 at deviceScaleFactor 2. Live app base URL:
`https://shahablo.github.io/NestWell/`. Deep links go before the hash:
`?branch=<key>&role=<patient|coordinator|clinician|budget_owner|referral_partner|admin>&persona=<pt-id>&clock=<ISO>`
(a branch reseeds that browser's data). Patient ids: `pt-dana`, `pt-priya`, `pt-marisol`,
`pt-elena`, `pt-keisha`, `pt-lucia`, `pt-tamsin`. Hide the practice coverage banner on desktop
captures where it crowds the content by evaluating
`document.querySelectorAll('.coverage-banner').forEach(e => e.style.display='none')`.

Required files (names are fixed):

| file | how |
|---|---|
| `phone-home.png` | branch `priya`, role patient, persona `pt-priya`, `#/p` |
| `phone-checkin-intro.png` | branch `priya`, clock `2026-04-09T14:16:00Z`, `#/p/checkin/ci-00011` |
| `phone-checkin-question.png` | same, after clicking the "Start" button (first question visible) |
| `phone-checkin-answer.png` | same, after tapping one calm option (e.g. "None of these") on the first question |
| `phone-checkin-saved.png` | same check-in completed with calm answers (no urgent symptom), the "Your answers are saved" screen |
| `phone-help.png` | branch `priya`, `#/p/help` |
| `phone-epds.png` | branch `priya`, `#/p/screen/epds` |
| `phone-preferences.png` | branch `priya`, `#/p/preferences`, scrolled so "Who sees my mood answers" and its choices fill the view |
| `phone-nobody-reached.png` | branch `marisol_after_hours`, persona `pt-marisol`, clock `2026-04-15T00:10:00Z`, `#/p` — must show the "not been able to reach a nurse yet" item |
| `phone-elena-home.png` | branch `elena`, persona `pt-elena`, `#/p` |
| `phone-elena-careplan.png` | branch `elena`, persona `pt-elena`, `#/p/careplan` |
| `desk-queues-urgent.png` | branch `marisol_after_hours`, role coordinator, `#/practice/queues` (banner visible: it shows "nobody on duty") |
| `desk-queues-unowned.png` | same with clock `2026-04-15T00:10:00Z` (item shows UNOWNED) |
| `desk-referral.png` | branch `priya`, role clinician, clock `2026-06-12T16:00:00Z`, `#/practice/referrals`, banner hidden |
| `desk-patient.png` | same clock, `#/practice/patients/pt-priya`, banner hidden |
| `desk-summaries.png` | same clock, `#/practice/summaries`, banner hidden |
| `desk-metrics.png` | branch `all_personas`, role clinician, `#/practice/metrics`, banner hidden |

Each capture must be checked by looking at it (Read the PNG). Wrong state = recapture.

### 3.4 Visual language

Brand tokens (from the website): ground `#FBF9F4`, surface `#FFFFFF`, ink `#16221F`,
muted `#5A6763`, line `#DCD8CE`, spruce `#1F5F5B`, spruce-deep `#0F2E2C`, spruce-soft `#E1EEEB`,
dawn `#E9A24B` (accent, sparingly), night `#0E1B1A`. Type: Bricolage Grotesque (display),
Source Sans 3 (body), JetBrains Mono (small labels such as "day 21", "acknowledged 14 min"),
loaded from Google Fonts:
`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap`
(the renderer must await `document.fonts.ready` before the first frame).

Motion: slow and soft. Ease-in-out cubic or sine, 500–900 ms moves, gentle 2–4 % scale drifts,
cross-fades between scenes (~0.6 s). No bounces, no spins, no fast zooms. Highlight rings are
soft spruce or dawn glows that fade in and out. Device frames: phone with 44 px corner radius
and a thin dark bezel; laptop as a rounded screen on a thin base. Real app screens sit inside
the frames, scaled to fit, never stretched. The app's own "Synthetic data" banner may be
visible — that is fine and honest.

Safe area: keep text and key UI 80 px inside the frame edges; nothing important in the bottom
140 px (captions live there when shown by the site player).

### 3.5 Deterministic rendering

`scenes/index.html` loads `scenes.css`, `art.js`, `scenes.js`, then fetches
`../build/timings.json`. It exposes:

- `window.videoReady: Promise<void>` — resolves after fonts, images, and timings load.
- `window.renderAt(t: number): void` — sets the entire DOM state for time `t` seconds. Pure
  function of `t`: no CSS transitions or animations, no timers, no randomness except seeded.
- `window.videoDuration: number` — equals `timings.total`.

`tools/render.mjs` launches Chrome headless with remote debugging (port **9401** for the final
render; use **9402–9409** for anything else), opens `scenes/index.html` over a local static
server (`npx http-server` is NOT installed; write a tiny Node `http` static server in
render.mjs, port **8765**), sets the viewport to 1920×1080 at deviceScaleFactor 1, awaits
`videoReady`, then for each frame `n` calls `renderAt(n / fps)` and captures a PNG (or JPEG
q≥92), piping frames into ffmpeg:
`ffmpeg -y -f image2pipe -framerate 30 -i - -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow -movflags +faststart build/video-silent.mp4`.
`--preview` flag: render only frames at given times into `build/preview/` as PNGs.

Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`. ffmpeg is on PATH.
Node 24 has global `fetch` and `WebSocket`.

### 3.6 Audio

- Voice: Kokoro-82M via `D:/NestWell/video/.venv/Scripts/python.exe` (packages `kokoro_onnx`,
  `soundfile`, `numpy`, `scipy` installed), model `video/.models/kokoro-v1.0.onnx`, voices
  `video/.models/voices-v1.0.bin`. `Kokoro(...).create(text, voice=..., speed=..., lang="en-us")`
  returns `(samples, 24000)`. Synthesize **per sentence**, trim leading/trailing silence
  (threshold ~ -45 dBFS, keep 40 ms), place on the timeline.
- Music (`tools/music.py`, same venv): procedural, license-free. Gentle ambient bed at ~60–66
  bpm: a warm pad (additive, few harmonics, slow 2–4 s attack/release), sparse felt-piano-like
  plucks (sine + soft 2nd/3rd partials, fast attack, 2–4 s exponential decay, slight detune),
  a soft low root note, no percussion; progression in F major such as
  Fmaj7 – Am7 – Dm9 – Bbmaj7 (4 bars each), with a lift for the `close` scene; synthetic
  stereo reverb (Schroeder or a convolution with a generated decaying-noise impulse); fade in
  2.5 s, fade out 4 s; exactly `total` seconds; 48 kHz stereo; no clipping; integrated
  loudness around -30 LUFS before mixing. Seeded randomness only.
- Mix (`tools/mix.py`, ffmpeg): voice high-pass 80 Hz and gentle de-ess; music ducked under the
  voice with `sidechaincompress` (threshold ~0.02, ratio 6, attack 80 ms, release 600 ms) so
  it sits about 14–18 dB below speech; final `loudnorm` to I=-16 LUFS, TP=-1.5 dBTP, LRA=11;
  AAC 160 kbps 48 kHz; mux with `build/video-silent.mp4` → `out/nestwell-walkthrough.mp4`.
  Poster: a representative frame from the `promise` or `home` scene → JPEG q=88.

### 3.7 Captions and transcript

`out/nestwell-walkthrough.vtt`: one cue per sentence (split sentences longer than ~84 characters
into two cues at a natural break), times from `timings.json`. `out/transcript.md`: the
narration as paragraphs, one per scene, with the scene title as a heading.

## 4. Website integration (owner: WEB, after the video is final)

Repository `D:/nestwell_website` (read its `docs/BRIEF.md`). Copy the three `out/` files into
`public/media/`. Add a "Watch the walkthrough" section on the home page directly after the hero
(and a compact version near the top of `how-it-works.html`): a heading, one sentence of intro,
a `<video controls playsinline preload="none" poster="./media/nestwell-walkthrough-poster.jpg">`
with the mp4 source and `<track kind="captions" srclang="en" label="English" default>`, the
duration shown as text (e.g. "2 min 24 s"), and a `<details>` "Read the transcript" containing
the transcript. Match the site's design system (read `src/styles/*.css`, use existing classes;
add page CSS only if needed). Extend `tests/copy.test.ts` so it also scans `public/media/*.vtt`.
Run `npm run check`, `npm test`, `npm run build`. Do not deploy and do not run git.
