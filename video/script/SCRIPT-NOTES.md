# Script notes

Voice `af_heart`, speed 0.88, sentence gap 0.55 s. Total **324 words** (whitespace-separated;
330 if hyphenated words such as "made-up" and "clinician-approved" count as two).

Revision 2 applies the claims critic's and pacing critic's findings (see "What changed" below).

Scene length = lead_in + spoken audio + gaps + tail, raised to `min_seconds` if shorter.
Two estimates are given:

- **Rule of thumb**: 2.6 words per second.
- **Measured**: each sentence of this revision was run through Kokoro (same model, voice and
  speed), with silence trimmed at -45 dBFS and 40 ms kept, as brief section 3.6 describes. This
  was a throwaway run in the scratchpad. VOICE still owns `build/voice.wav` and
  `build/timings.json`. Kokoro spoke at about 2.9 words per second on average.

| # | id | words | lead_in | tail | min_s | est. at 2.6 w/s | measured speech | measured scene |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | open | 11 | 1.6 | 1.0 | 7 | 7.4 | 4.52 | 7.67 |
| 2 | weeks | 22 | 0.8 | 0.8 | 10.2 | 11.2 | 7.45 | 10.2 (min) |
| 3 | promise | 20 | 0.8 | 0.9 | 8.3 | 10.5 | 5.49 | 8.3 (min) |
| 4 | demo | 10 | 0.8 | 0.9 | 6.5 | 6.5 (min) | 4.01 | 6.5 (min) |
| 5 | home | 22 | 0.8 | 0.8 | 9.5 | 10.6 | 6.59 | 9.5 (min) |
| 6 | checkin | 33 | 0.7 | 0.8 | 13.5 | 15.9 | 10.80 | 13.95 |
| 7 | help | 30 | 0.7 | 0.8 | 10.5 | 13.6 | 10.86 | 12.91 |
| 8 | mood | 32 | 0.7 | 0.8 | 11 | 14.9 | 11.09 | 13.69 |
| 9 | queue | 34 | 0.9 | 0.8 | 12 | 15.9 | 9.49 | 12.29 |
| 10 | followthrough | 29 | 0.8 | 0.8 | 12 | 13.9 | 9.41 | 12.11 |
| 11 | loss | 30 | 1.6 | 1.0 | 11 | 15.2 | 9.98 | 13.68 |
| 12 | summary | 32 | 0.7 | 0.8 | 10 | 15.2 | 13.93 | 16.53 |
| 13 | close | 19 | 0.8 | 1.2 | 9 | 9.9 | 7.50 | 10.05 |
| | **total** | **324** | | | | **~160** | 111.1 | **~147.4** |

The measured total is **about 147 s**, inside the 135–150 s window but with less than 3 s of
margin. The rule-of-thumb total (~160 s) is over the ceiling; it assumes slower speech than
Kokoro produces, so trust the measured figure, then VOICE's real `timings.json`.

`min_seconds` was lowered on weeks, promise, home, checkin, queue and followthrough so those
scenes end close to where the speech ends. If VOICE's real total still comes in over 150 s, cut
in this order:

1. demo `min_seconds` 6.5 -> 6.0 (speech-driven length is about 5.9 s).
2. summary sentence 3, "The practice can also see where follow-up stalls." (about 3.2 s with
   its gap; then show `desk-metrics.png` briefly or not at all).
3. loss `lead_in` 1.6 -> 1.3.

The pacing critic's optional closing callback ("One next step at a time, followed through.")
was **not** added: there is no time for it.

## What changed in revision 2

- **summary (blocker):** now states that AI explains clinician-approved material and drafts
  summaries for her clinician to review, and that it never triages, diagnoses, or reassures,
  and never takes a person's place. "Replaces" is on the banned list (and in the website's
  copy test that will scan the VTT), so the script says "takes a person's place" instead. The
  chip now reads "AI draft (example text in this demo) · clinician reviews", because AI is off in
  the demo. The second sentence became "where follow-up stalls" instead of "what is working"
  (no outcome suggestion).
- **queue (blocker):** "every request has an owner" and "nobody has to guess" are gone. The new
  lines: each request goes to a set role with a clock; if no one picks it up in time it
  escalates (FR-25); her phone tells her to call, not to wait. Title is now "The practice side".
  The visual note tells SCENES to show a role chip, never a made-up name next to UNOWNED.
- **promise:** "makes one promise" / "she completes the next step" became an aim: "NestWell has
  one aim." / "Help her complete the next step in her care." / "And let her practice confirm it
  happened." The on-screen text now types one line per sentence with the same words. Title is
  now "The aim".
- **open / weeks:** she is introduced before "she" is used ("Gentle support for new mothers,
  and their practices." / "For a new mother, the twelve weeks after birth are full."). The list
  is now three items: "Feeding, healing, and very little sleep."
- **help:** no longer says "written by clinicians" as a fact about the demo. Now "clear
  emergency steps, and can call from the screen" plus "In a real practice, clinicians approve
  that wording, and it stays the same every time." The demo text is signed by placeholders
  (`content/en/safety.json`). The claims critic's fuller list (911, 988, hotline) cost about 4 s
  and was cut for time; the tel links still pulse on screen.
- **mood:** merged "decides who sees" and "can change that any time" (confirmed by
  `content/en/acknowledgment.json`: "You can change it any time from home"), and added the
  exception: "One safety question is the exception, and she is told up front." This matches
  FR-27 and FR-30a (`screening.json` locked line). "First" is banned, so the script says "up
  front" and not "first".
- **home:** "help is always one tap away" became "On every screen, “I need help now” is one tap
  away." "The name of the person" became "who to contact at her practice, and when", because the
  demo contact is "Care coordinator (NOT YET ASSIGNED)".
- **checkin:** "say not now" became "leave the whole check-in for later" (FR-10: "Not now"
  applies to the whole check-in). "There are no streaks and no scores" became "She sees no
  streaks, badges, or scores." (the practice side does score the screens). Sentence 3 now sits on
  a still screen, and the tap ripple moves to the start of sentence 4.
- **followthrough:** "follows it through" became "tracks each step". The final line is now "A
  referral counts when the appointment is kept, not when it is sent." (no "link"; clear subject).
- **loss:** "After a pregnancy or baby loss" (FR-54 subtypes). Sentence 2 matches the preferences
  dialog: "She chooses how she is addressed, and how often to be contacted." `lead_in` 1.2 -> 1.6
  to mark the change of tone; `tail` 1.2 -> 1.0.
- **close:** "we are" was dropped ("and looking for pilot practices in Ohio"). A caption override
  was added (see below).

## Notes for VOICE and captions

- **Caption override (new use of the `caption` field).** When a scene's `caption` is not null, it
  is an array with one display string per sentence, in the same order. Use it for the VTT and
  `transcript.md` in place of `sentences`. Speak `sentences` as usual. Only `close` uses it, so
  "hello NestWell dot com" displays as "hellonestwell.com". Kokoro garbles the joined form
  (`hˈɛloʊnstwˌɛl.kˈɑːm`).
- The home sentence uses curly quotes around “I need help now”. Kokoro spoke it cleanly
  (3.31 s). If VOICE hears a problem, removing the quotes is safe.
- "NestWell" is spoken as "nest well", which is right.
- No digits are spoken. A scan of all sentences for banned words (first, only, replaces,
  guaranteed, proven, monitoring, always watching, 24/7, AI triage/therapy/diagnosis) finds
  nothing. "It never triages, diagnoses" is a required negative statement, not "AI triage".
- The required statements each appear once: working demonstration with made-up patients
  (demo); in development, pilot practices in Ohio (close); AI explains and drafts for clinician
  review and never triages, diagnoses, reassures or takes a person's place (summary); clinicians
  approve the emergency wording and it stays the same every time (help); kept, not sent
  (followthrough); call, not wait (queue); after a loss baby content stops at once and nothing
  starts again on its own (loss); she decides who sees her mood answers (mood).
- The script says "clinicians approve" only as "in a real practice". The demo's emergency content
  is not clinically signed yet (BUILD-STATUS item 20).
