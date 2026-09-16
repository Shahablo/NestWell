"""Narration audio, timings, captions and transcript for the NestWell walkthrough.

Usage (from D:/NestWell/video):
    .venv/Scripts/python.exe tools/tts.py [--script script/narration.json] [--no-cache]

Implements VIDEO-BRIEF.md sections 3.2, 3.6 and 3.7:

- Each sentence of script/narration.json is synthesised on its own with Kokoro-82M
  (voice and speed from the script), trimmed at about -45 dBFS keeping 40 ms of room,
  RMS-matched to a common level, given 8 ms fades at both edges, and resampled from
  24 kHz to 48 kHz with scipy.signal.resample_poly.
- Layout, per scene: start = previous scene end; first sentence at start + lead_in;
  sentence_gap between sentences; end = max(start + min_seconds, last end + tail).
  Scene ends are rounded up to a whole video frame (1/30 s) so boundaries land on frames.
- Writes build/voice.wav (48 kHz mono 16-bit, exactly `total` seconds), build/timings.json,
  out/nestwell-walkthrough.vtt and out/transcript.md.

Pronunciation fixes change only the text sent to the synthesiser (SPEECH_FIXES below),
never the caption text. A scene's optional "caption" list gives on-screen caption text
per sentence where it differs from the spoken words (e.g. "hellonestwell.com").
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import sys

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL = os.path.join(ROOT, ".models", "kokoro-v1.0.onnx")
VOICES = os.path.join(ROOT, ".models", "voices-v1.0.bin")

KOKORO_SR = 24000
OUT_SR = 48000
FPS = 30
WIDTH, HEIGHT = 1920, 1080

TRIM_DBFS = -45.0
TRIM_KEEP = 0.040  # seconds kept before the first and after the last loud sample
FADE = 0.008  # seconds
TARGET_RMS_DBFS = -20.0  # speech-active RMS each sentence is matched to
PEAK_CEILING = 10 ** (-1.0 / 20)  # global safety ceiling after matching
MAX_CUE_CHARS = 84

# Speech-only substitutions (regex, replacement). Checked against Kokoro's phonemiser:
# "NestWell" already reads as "nest well"; "OB" reads as "ahb"; digits and the domain need
# spelling out. Captions keep the original text.
SPEECH_FIXES: list[tuple[str, str]] = [
    (r"\bhellonestwell\.com\b", "hello Nest Well dot com"),
    (r"\bNestWell\b", "Nest Well"),
    (r"\bOBs\b", "O Bees"),
    (r"\bOB\b", "O B"),
    (r"\b911\b", "nine one one"),
    (r"\b988\b", "nine eight eight"),
    (r"\bnine-one-one\b", "nine one one"),
    (r"\bnine-eight-eight\b", "nine eight eight"),
    (r"[\u201c\u201d]", '"'),
    (r"[\u2018\u2019]", "'"),
    (r"\u00b7", ","),
]


def speech_text(text: str) -> str:
    for pat, rep in SPEECH_FIXES:
        text = re.sub(pat, rep, text)
    return text


def dbfs(x: float) -> float:
    return 20 * math.log10(max(x, 1e-12))


# ---------------------------------------------------------------- synthesis


class Synth:
    def __init__(self, voice: str, speed: float, cache_dir: str | None):
        self.voice = voice
        self.speed = speed
        self.cache_dir = cache_dir
        self._kokoro = None
        if cache_dir:
            os.makedirs(cache_dir, exist_ok=True)

    def kokoro(self):
        if self._kokoro is None:
            from kokoro_onnx import Kokoro

            self._kokoro = Kokoro(MODEL, VOICES)
        return self._kokoro

    def __call__(self, text: str) -> np.ndarray:
        key = hashlib.sha1(f"{self.voice}|{self.speed:.4f}|{text}".encode("utf-8")).hexdigest()[:16]
        path = os.path.join(self.cache_dir, key + ".npy") if self.cache_dir else None
        if path and os.path.exists(path):
            return np.load(path)
        samples, sr = self.kokoro().create(text, voice=self.voice, speed=self.speed, lang="en-us")
        if sr != KOKORO_SR:
            raise RuntimeError(f"unexpected Kokoro sample rate {sr}")
        samples = np.asarray(samples, dtype=np.float32).reshape(-1)
        if path:
            np.save(path, samples)
        return samples


# ---------------------------------------------------------------- per-sentence processing


def trim(x: np.ndarray, sr: int) -> np.ndarray:
    thr = 10 ** (TRIM_DBFS / 20)
    loud = np.flatnonzero(np.abs(x) > thr)
    if loud.size == 0:
        raise RuntimeError("sentence synthesised as silence")
    keep = int(TRIM_KEEP * sr)
    a = max(0, loud[0] - keep)
    b = min(len(x), loud[-1] + 1 + keep)
    return x[a:b]


def active_rms(x: np.ndarray, sr: int) -> float:
    """RMS over 20 ms blocks whose level is within 30 dB of the loudest block (speech only)."""
    n = int(0.020 * sr)
    blocks = len(x) // n
    if blocks == 0:
        return float(np.sqrt(np.mean(x**2)))
    b = x[: blocks * n].reshape(blocks, n)
    e = np.mean(b**2, axis=1)
    mask = e > e.max() * 10 ** (-30 / 10)
    return float(np.sqrt(np.mean(e[mask])))


def fade_edges(x: np.ndarray, sr: int) -> np.ndarray:
    n = min(int(FADE * sr), len(x) // 2)
    if n > 0:
        ramp = np.sin(np.linspace(0, np.pi / 2, n)) ** 2
        x = x.copy()
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


# ---------------------------------------------------------------- captions


def fmt_vtt(t: float) -> str:
    ms = int(round(t * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def split_caption(text: str) -> list[str]:
    """Split text longer than MAX_CUE_CHARS in two at a natural break near the middle."""
    if len(text) <= MAX_CUE_CHARS:
        return [text]
    mid = len(text) / 2
    candidates = []
    for m in re.finditer(r"[,;:\u2014] ", text):  # after punctuation: best
        candidates.append((abs(m.end() - mid), 0, m.end()))
    for m in re.finditer(r" (?=(and|or|but|for|to|with|so|then|not|because|when|if)\b)", text):
        candidates.append((abs(m.start() - mid) + len(text) * 0.08, 1, m.start()))
    for m in re.finditer(r" ", text):
        candidates.append((abs(m.start() - mid) + len(text) * 0.2, 2, m.start()))
    # Neither half may exceed the limit if avoidable.
    ok = [c for c in candidates if c[2] <= MAX_CUE_CHARS and len(text) - c[2] <= MAX_CUE_CHARS]
    pool = ok or candidates
    _, _, pos = min(pool)
    return [text[:pos].strip(), text[pos:].strip()]


PAUSE_DBFS = -40.0  # a spoken pause: 10 ms frames below this level ...
PAUSE_MIN = 0.120  # ... for at least this long
PAUSE_SNAP = 0.40  # search this far either side of the character-count estimate


def find_pauses(voice: np.ndarray, sr: int, a: float, b: float) -> list[tuple[float, float]]:
    """Runs of quiet 10 ms frames (>= PAUSE_MIN) strictly inside [a, b] seconds."""
    hop = int(0.010 * sr)
    i0, i1 = int(a * sr), int(b * sr)
    x = voice[i0:i1]
    n = len(x) // hop
    if n == 0:
        return []
    rms = np.sqrt(np.mean(x[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-20)
    quiet = 20 * np.log10(rms) < PAUSE_DBFS
    runs, k = [], 0
    while k < n:
        if quiet[k]:
            j = k
            while j < n and quiet[j]:
                j += 1
            if (j - k) * 0.010 >= PAUSE_MIN and k > 0 and j < n:
                runs.append((a + k * 0.010, a + j * 0.010))
            k = j
        else:
            k += 1
    return runs


def cue_times(parts: list[str], start: float, end: float, voice: np.ndarray | None = None, sr: int = OUT_SR) -> list[tuple[float, float]]:
    """Split a sentence's time by character count, then snap each split to the middle of the nearest
    spoken pause within PAUSE_SNAP seconds (so the next cue never shows before its words are spoken)."""
    if len(parts) == 1:
        return [(start, end)]
    total = sum(len(p) for p in parts)
    pauses = find_pauses(voice, sr, start, end) if voice is not None else []
    out, t, acc = [], start, 0
    for i, p in enumerate(parts):
        if i == len(parts) - 1:
            e = end
        else:
            acc += len(p)
            e = start + (end - start) * acc / total
            near = [(abs((pa + pb) / 2 - e), (pa + pb) / 2) for pa, pb in pauses if abs((pa + pb) / 2 - e) <= PAUSE_SNAP + (pb - pa) / 2]
            if near:
                e = min(near)[1]
            e = round(e, 3)
        out.append((t, e))
        t = e
    return out


# ---------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--script", default=os.path.join(ROOT, "script", "narration.json"))
    ap.add_argument("--no-cache", action="store_true", help="resynthesise every sentence")
    args = ap.parse_args()

    with open(args.script, encoding="utf-8") as f:
        script = json.load(f)

    voice = script["voice"]
    speed = float(script["speed"])
    gap = float(script["sentence_gap"])
    cache = None if args.no_cache else os.path.join(ROOT, "build", "tts-cache")
    synth = Synth(voice, speed, cache)

    # 1. synthesise, trim, level, fade, resample
    clips: list[list[dict]] = []
    target = 10 ** (TARGET_RMS_DBFS / 20)
    for scene in script["scenes"]:
        captions = scene.get("caption")
        sentences = scene["sentences"]
        if captions is not None and len(captions) != len(sentences):
            raise SystemExit(f"scene {scene['id']}: caption list length != sentences length")
        row = []
        for i, text in enumerate(sentences):
            spoken = speech_text(text)
            raw = synth(spoken)
            x = trim(raw, KOKORO_SR)
            rms = active_rms(x, KOKORO_SR)
            gain = target / max(rms, 1e-9)
            x = x * gain
            x = resample_poly(x, OUT_SR // KOKORO_SR, 1).astype(np.float64)
            x = fade_edges(x, OUT_SR)
            row.append(
                dict(text=text, spoken=spoken, caption=(captions[i] if captions else text),
                     audio=x, gain_db=dbfs(gain), rms_db=dbfs(rms))
            )
            print(f"  [{scene['id']:>13}] {len(x) / OUT_SR:5.2f}s  gain {dbfs(gain):+5.1f} dB  {spoken}")
        clips.append(row)

    # 2. layout
    frame = 1.0 / FPS
    scenes_out = []
    t_scene = 0.0
    for scene, row in zip(script["scenes"], clips):
        start = t_scene
        t = start + float(scene["lead_in"])
        sents = []
        for j, c in enumerate(row):
            if j > 0:
                t += gap
            s0 = round(t, 3)
            dur = len(c["audio"]) / OUT_SR
            s1 = round(s0 + dur, 3)
            c["start"] = s0
            sents.append(dict(text=c["text"], caption=c["caption"], start=s0, end=s1))
            t = s0 + dur
        end = max(start + float(scene["min_seconds"]), t + float(scene["tail"]))
        end = math.ceil(round(end / frame, 6)) * frame
        end = round(end, 3)
        scenes_out.append(dict(id=scene["id"], title=scene["title"], start=round(start, 3), end=end, sentences=sents))
        t_scene = end
    total = scenes_out[-1]["end"]

    # 3. mix down
    n_total = int(round(total * OUT_SR))
    voice_buf = np.zeros(n_total, dtype=np.float64)
    for row in clips:
        for c in row:
            a = int(round(c["start"] * OUT_SR))
            b = a + len(c["audio"])
            if b > n_total:
                raise SystemExit("sentence runs past the end of the timeline")
            voice_buf[a:b] += c["audio"]
    peak = float(np.max(np.abs(voice_buf)))
    if peak > PEAK_CEILING:
        voice_buf *= PEAK_CEILING / peak
        print(f"global scale {dbfs(PEAK_CEILING / peak):+.2f} dB to keep peak at -1 dBFS")
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "out"), exist_ok=True)
    sf.write(os.path.join(ROOT, "build", "voice.wav"), voice_buf.astype(np.float32), OUT_SR, subtype="PCM_16")

    # 4. timings
    timings = dict(
        fps=FPS, width=WIDTH, height=HEIGHT, total=total,
        voice_wav="build/voice.wav", voice=voice, speed=speed, sentence_gap=gap,
        scenes=scenes_out,
    )
    with open(os.path.join(ROOT, "build", "timings.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(timings, f, ensure_ascii=False, indent=2)
        f.write("\n")

    # 5. captions
    lines = ["WEBVTT", ""]
    n = 0
    for sc in scenes_out:
        for s in sc["sentences"]:
            parts = split_caption(s["caption"])
            for part, (a, b) in zip(parts, cue_times(parts, s["start"], s["end"], voice_buf)):
                n += 1
                lines += [str(n), f"{fmt_vtt(a)} --> {fmt_vtt(b)}", part, ""]
    with open(os.path.join(ROOT, "out", "nestwell-walkthrough.vtt"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))

    # 6. transcript
    md = ["# NestWell walkthrough: transcript", ""]
    for sc in scenes_out:
        md += [f"## {sc['title']}", "", " ".join(s["caption"] for s in sc["sentences"]), ""]
    with open(os.path.join(ROOT, "out", "transcript.md"), "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(md))

    for sc in scenes_out:
        print(f"{sc['id']:>13}  {sc['start']:7.3f} -> {sc['end']:7.3f}  ({sc['end'] - sc['start']:5.2f}s)")
    print(f"total {total:.3f}s, {n} cues, voice peak {dbfs(float(np.max(np.abs(voice_buf)))):.2f} dBFS")
    if not 135 <= total <= 150:
        print("WARNING: total is outside 135-150 s", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
