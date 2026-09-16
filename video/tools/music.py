"""Procedural, license-free ambient bed for the NestWell walkthrough.

Usage:
    python tools/music.py --duration 146.4 --out build/music.wav [--lift-at 136] [--fade-out-at 143.5]
                          [--fade-in 1.0] [--seed 7]

Everything is synthesised here with numpy/scipy; randomness is seeded, so the same
arguments always produce the same file. Output: 48 kHz, stereo, 16-bit PCM, exactly
round(duration * 48000) samples, normalised to about -30 LUFS integrated.

Musical plan (brief section 3.6): ~63 bpm, F major, Fmaj7 - Am7 - Dm9 - Bbmaj7, four bars
each. Layers: a soft sub root (roots and fifths only in the low register), a warm additive
pad whose chord changes cross-fade over several seconds, sparse felt-piano plucks on a
humanised eighth-note grid, and a generated stereo reverb. From --lift-at the harmony returns
home to Fmaj9 with a slightly brighter, higher pluck line and a +3 dB pad swell that is at full level
by lift_at + 0.5 s. From --fade-out-at (the end of the last spoken sentence) a soft resolving F major
pluck chord sounds and the whole bed fades out over the remaining time (at most 3 s).
"""

from __future__ import annotations

import argparse
import os

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
BPM = 63.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TARGET_LUFS = -30.0


def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69) / 12.0)


# MIDI note numbers. F2=41, A2=45, D2=38, Bb1=34.
# bass: sub root (+ soft fifth); pad: open voicing, lowest pad interval a fifth or wider;
# pluck: chord tones available for the melody-ish plucks.
CHORDS = {
    "Fmaj7": dict(root=41, pad=[53, 60, 64, 69], pluck=[65, 69, 72, 76, 77]),
    "Am7": dict(root=45, pad=[57, 64, 67, 72], pluck=[64, 67, 69, 72, 76]),
    "Dm9": dict(root=38, pad=[50, 57, 60, 65, 76], pluck=[62, 65, 69, 72, 76]),
    "Bbmaj7": dict(root=46 - 12, pad=[46, 53, 62, 69], pluck=[62, 65, 69, 70, 74]),
    # the closing lift: home chord with an added ninth, brighter pluck register
    "Fmaj9": dict(root=41, pad=[53, 60, 64, 69, 79], pluck=[69, 72, 76, 77, 79, 81]),
}
PROGRESSION = ["Fmaj7", "Am7", "Dm9", "Bbmaj7"]


def butter_sos(kind: str, freq, order: int = 2):
    return signal.butter(order, freq, btype=kind, fs=SR, output="sos")


def raised_env(n: int, fade: int) -> np.ndarray:
    """Flat window with sin^2 ramps; overlapping sin^2/cos^2 ramps sum to 1."""
    env = np.ones(n)
    fade = max(1, min(fade, n // 2))
    ramp = np.sin(np.linspace(0.0, np.pi / 2, fade)) ** 2
    env[:fade] = ramp
    env[-fade:] = ramp[::-1]
    return env


# --------------------------------------------------------------------------- schedule

def build_segments(duration: float, lift_at: float):
    segs = []
    t = 0.0
    i = 0
    seg_len = 4 * BAR
    while t < lift_at - 1e-6:
        end = min(t + seg_len, lift_at)
        segs.append([t, end, PROGRESSION[i % len(PROGRESSION)]])
        t = end
        i += 1
    # avoid a very short chord right before the lift: stretch the previous one
    if len(segs) > 1 and segs[-1][1] - segs[-1][0] < 5.0:
        segs[-2][1] = segs[-1][1]
        segs.pop()
    segs.append([lift_at, duration, "Fmaj9"])
    return segs


# --------------------------------------------------------------------------- layers

def render_pad(total_n: int, segs, rng: np.random.Generator) -> np.ndarray:
    out = np.zeros((total_n, 2))
    xfade = 3.2  # seconds of overlap between chords
    for s0, s1, name in segs:
        a = max(0.0, s0 - xfade / 2)
        b = min(total_n / SR, s1 + xfade / 2)
        i0, i1 = int(a * SR), int(b * SR)
        n = i1 - i0
        if n <= 0:
            continue
        t = np.arange(n) / SR
        fade_in = xfade if s0 > 0 else 3.0
        env = raised_env(n, int(min(fade_in, xfade) * SR))
        if s0 <= 0:  # the very start: no slow chord ramp, the overall fade-in shapes it
            env[: int(xfade * SR)] = 1.0
        block = np.zeros((n, 2))
        notes = CHORDS[name]["pad"]
        bright = 1.0 if name != "Fmaj9" else 1.12
        for k, m in enumerate(notes):
            f = midi_hz(m)
            # quieter as voices go up, so the top stays soft
            amp = 0.20 * (0.82 ** k) * bright
            for side, (det, pan) in enumerate(((-3.0, -0.35), (3.0, 0.35))):
                cents = det + rng.uniform(-1.0, 1.0)
                ff = f * 2 ** (cents / 1200)
                vib = 0.0015 * np.sin(2 * np.pi * rng.uniform(0.08, 0.16) * t + rng.uniform(0, 6.28))
                phase = 2 * np.pi * np.cumsum(ff * (1 + vib)) / SR + rng.uniform(0, 6.28)
                # few harmonics, gently rolled off
                wave = np.sin(phase) + 0.30 * np.sin(2 * phase) + 0.10 * np.sin(3 * phase)
                trem = 1.0 + 0.15 * np.sin(2 * np.pi * rng.uniform(0.05, 0.12) * t + rng.uniform(0, 6.28))
                sig = amp * wave * trem
                g_l = np.cos((pan + 1) * np.pi / 4)
                g_r = np.sin((pan + 1) * np.pi / 4)
                # alternate which copy sits left/right per voice for width
                if k % 2:
                    g_l, g_r = g_r, g_l
                block[:, 0] += sig * g_l
                block[:, 1] += sig * g_r
        out[i0:i1] += block * env[:, None]
    sos = butter_sos("lowpass", 3400, order=4)
    out = signal.sosfiltfilt(sos, out, axis=0)
    return out


def render_bass(total_n: int, segs) -> np.ndarray:
    out = np.zeros(total_n)
    xfade = 3.0
    for s0, s1, name in segs:
        a = max(0.0, s0 - xfade / 2)
        b = min(total_n / SR, s1 + xfade / 2)
        i0, i1 = int(a * SR), int(b * SR)
        n = i1 - i0
        t = np.arange(n) / SR
        f = midi_hz(CHORDS[name]["root"])
        phase = 2 * np.pi * f * t
        # soft root, a whisper of octave, and a quiet fifth above (open, never a cluster)
        wave = np.sin(phase) + 0.12 * np.sin(2 * phase) + 0.10 * np.sin(1.5 * phase)
        breathe = 0.85 + 0.15 * np.sin(2 * np.pi * t / (2 * BAR) - np.pi / 2)
        env = raised_env(n, int(xfade * SR))
        if s0 <= 0:
            env[: int(xfade * SR)] = 1.0
        out[i0:i1] += 0.30 * wave * breathe * env
    out = signal.sosfiltfilt(butter_sos("lowpass", 400, order=2), out)
    return np.stack([out, out], axis=1)


def pluck_note(f: float, dur: float, vel: float, rng: np.random.Generator) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    tau = rng.uniform(0.75, 1.05)  # ~2.5-3.5 s to fade into the floor
    attack = int(0.008 * SR)
    sig = np.zeros(n)
    for cents, g in ((0.0, 1.0), (rng.uniform(1.5, 3.0), 0.6)):
        ff = f * 2 ** (cents / 1200)
        ph = rng.uniform(0, 6.28)
        sig += g * (
            np.sin(2 * np.pi * ff * t + ph) * np.exp(-t / tau)
            + 0.22 * np.sin(2 * np.pi * 2 * ff * t + ph) * np.exp(-t / (tau * 0.35))
            + 0.06 * np.sin(2 * np.pi * 3 * ff * t + ph) * np.exp(-t / (tau * 0.2))
        )
    env = np.ones(n)
    env[:attack] = np.sin(np.linspace(0, np.pi / 2, attack)) ** 2
    rel = int(0.05 * SR)
    env[-rel:] *= np.cos(np.linspace(0, np.pi / 2, rel)) ** 2
    return vel * sig * env / 1.6


# eighth-note positions (0..7) per bar; sparse, varied, seeded choice
PLUCK_PATTERNS = [
    [0, 5],
    [2, 6],
    [0, 3, 6],
    [1, 4],
    [0, 6],
    [3],
    [0, 2, 5],
    [4, 7],
]


def render_plucks(total_n: int, duration: float, segs, lift_at: float, rng: np.random.Generator, fade_at: float) -> np.ndarray:
    out = np.zeros((total_n, 2))
    eighth = BEAT / 2
    n_bars = int(np.ceil(duration / BAR))
    prev = None
    note_dur = 4.0
    for bar in range(n_bars):
        bar_t = bar * BAR
        if bar_t < 1.5 or bar_t > fade_at - 0.5:
            continue  # leave the very start and the fade-out quiet
        in_lift = bar_t >= lift_at
        if bar % 4 == 3 and not in_lift and rng.random() < 0.6:
            continue  # breathing room at the end of phrases
        pattern = PLUCK_PATTERNS[rng.integers(len(PLUCK_PATTERNS))]
        for pos in pattern:
            t0 = bar_t + pos * eighth + rng.normal(0, 0.018)
            if t0 < 1.2 or t0 > fade_at - 0.6:
                continue
            name = next(s[2] for s in segs if s[0] <= t0 < s[1]) if t0 < segs[-1][1] else segs[-1][2]
            pool = CHORDS[name]["pluck"]
            # prefer stepwise-ish motion: choose among the nearest pool notes
            if prev is None:
                m = pool[len(pool) // 2]
            else:
                ranked = sorted(pool, key=lambda x: abs(x - prev) + rng.uniform(0, 3))
                choices = [x for x in ranked[:3] if x != prev] or ranked[:1]
                m = choices[rng.integers(len(choices))]
            prev = m
            vel = rng.uniform(0.55, 0.85) * (1.08 if in_lift else 1.0)
            if pos == 0:
                vel *= 1.08
            note = pluck_note(midi_hz(m), note_dur, vel * 0.16, rng)
            i0 = max(0, int(t0 * SR))
            i1 = min(total_n, i0 + len(note))
            pan = rng.uniform(-0.35, 0.35)
            gl, gr = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
            out[i0:i1, 0] += note[: i1 - i0] * gl
            out[i0:i1, 1] += note[: i1 - i0] * gr
    # the resolve: a soft, slightly spread F major chord (F4 A4 C5 F5) where the voice ends
    for k, m in enumerate([65, 69, 72, 77]):
        t0 = fade_at + 0.05 + 0.07 * k
        note = pluck_note(midi_hz(m), 4.0, (0.62 - 0.05 * k) * 0.16, rng)
        i0 = int(t0 * SR)
        if i0 >= total_n:
            continue
        i1 = min(total_n, i0 + len(note))
        out[i0:i1, 0] += note[: i1 - i0]
        out[i0:i1, 1] += note[: i1 - i0]
    # felt: take the edge off the top
    out = signal.sosfiltfilt(butter_sos("lowpass", 2800, order=2), out, axis=0)
    return out


def make_ir(seconds: float, rng: np.random.Generator) -> np.ndarray:
    n = int(seconds * SR)
    t = np.arange(n) / SR
    rt60 = 3.4
    decay = np.exp(-6.91 * t / rt60)
    common = rng.standard_normal((n, 1))
    ir = (0.55 * common + 0.835 * rng.standard_normal((n, 2))) * decay[:, None]
    # darker as it decays: blend a low-passed copy in over time
    dark = signal.sosfiltfilt(butter_sos("lowpass", 1800, order=2), ir, axis=0)
    mix = np.clip(t / 1.2, 0, 1)[:, None]
    ir = (1 - mix) * ir + mix * dark
    ir = signal.sosfiltfilt(butter_sos("lowpass", 5000, order=2), ir, axis=0)
    fade_in = int(0.012 * SR)
    ir[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
    predelay = np.zeros((int(0.025 * SR), 2))
    ir = np.concatenate([predelay, ir])
    ir /= np.sqrt(np.sum(ir ** 2, axis=0, keepdims=True))
    return ir


def reverb(x: np.ndarray, ir: np.ndarray, wet: float) -> np.ndarray:
    y = np.zeros_like(x)
    for c in range(2):
        y[:, c] = signal.oaconvolve(x[:, c], ir[:, c], mode="full")[: len(x)]
    return (1 - wet) * x + wet * y * 1.6


# --------------------------------------------------------------------------- loudness

def integrated_lufs(x: np.ndarray) -> float:
    """ITU-R BS.1770-4 integrated loudness (48 kHz coefficients)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)
    block, hop = int(0.4 * SR), int(0.1 * SR)
    power = []
    for s in range(0, len(y) - block + 1, hop):
        seg = y[s : s + block]
        power.append(np.sum(np.mean(seg ** 2, axis=0)))
    power = np.array(power)
    lk = -0.691 + 10 * np.log10(power + 1e-20)
    g = power[lk > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g)) - 10
    g2 = power[(lk > -70) & (lk > rel)]
    return float(-0.691 + 10 * np.log10(np.mean(g2)))


# --------------------------------------------------------------------------- main

def render(duration: float, lift_at: float, seed: int, fade_at: float, fade_in: float) -> np.ndarray:
    total_n = int(round(duration * SR))
    rng = np.random.default_rng(seed)
    segs = build_segments(duration, lift_at)

    pad = render_pad(total_n, segs, np.random.default_rng(seed + 1))
    bass = render_bass(total_n, segs)
    plucks = render_plucks(total_n, duration, segs, lift_at, np.random.default_rng(seed + 2), fade_at)

    # swell into the closing lift: +3 dB on the pad, full by lift_at + 0.5 s
    tt = np.arange(total_n) / SR
    swell = 1.0 + 0.41 * np.sin(np.clip((tt - (lift_at - 1.5)) / 2.0, 0, 1) * np.pi / 2) ** 2

    dry = pad * 0.9 * swell[:, None] + bass * 0.65 + plucks * 3.6
    ir = make_ir(4.2, rng)
    mix = reverb(dry, ir, wet=0.38)
    # gentle, not extreme, stereo width: tame the side signal
    mid = (mix[:, 0] + mix[:, 1]) / 2
    side = (mix[:, 0] - mix[:, 1]) / 2 * 0.6
    mix = np.stack([mid + side, mid - side], axis=1)

    # remove DC and sub-rumble, fades
    mix = signal.sosfiltfilt(butter_sos("highpass", 28, order=2), mix, axis=0)
    fin = int(fade_in * SR)
    fo0 = int(fade_at * SR)
    fout = total_n - fo0
    mix[:fin] *= (np.sin(np.linspace(0, np.pi / 2, fin)) ** 2)[:, None]
    mix[fo0:] *= (np.cos(np.linspace(0, np.pi / 2, fout)) ** 2)[:, None]
    mix -= mix.mean(axis=0, keepdims=True)
    mix[:64] *= np.linspace(0, 1, 64)[:, None]
    mix[-64:] *= np.linspace(1, 0, 64)[:, None]

    lufs = integrated_lufs(mix)
    mix *= 10 ** ((TARGET_LUFS - lufs) / 20)
    peak = np.max(np.abs(mix))
    ceiling = 10 ** (-4.0 / 20)
    if peak > ceiling:
        mix *= ceiling / peak
    print(f"segments: {[(round(a, 2), round(b, 2), c) for a, b, c in segs]}")
    print(f"pre-gain loudness {lufs:.2f} LUFS -> target {TARGET_LUFS}; sample peak {20*np.log10(np.max(np.abs(mix))):.2f} dBFS")
    return mix


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--duration", type=float, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--lift-at", type=float, default=None)
    ap.add_argument("--fade-out-at", type=float, default=None, help="fade start (default duration - 3)")
    ap.add_argument("--fade-in", type=float, default=1.0)
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()
    lift_at = args.lift_at if args.lift_at is not None else max(0.0, args.duration - 10.0)
    lift_at = min(max(lift_at, 0.0), args.duration)

    fade_at = args.fade_out_at if args.fade_out_at is not None else args.duration - 3.0
    fade_at = min(max(fade_at, args.duration - 3.0), args.duration - 0.5)  # fade lasts at most 3 s
    mix = render(args.duration, lift_at, args.seed, fade_at, max(0.1, args.fade_in))
    rng = np.random.default_rng(args.seed + 99)
    dither = (rng.random(mix.shape) - rng.random(mix.shape)) / 32768.0
    pcm = np.clip(np.round((mix + dither) * 32767), -32768, 32767).astype(np.int16)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    wavfile.write(args.out, SR, pcm)
    print(f"wrote {args.out}: {len(pcm)} samples ({len(pcm)/SR:.3f} s), 48 kHz stereo")


if __name__ == "__main__":
    main()
