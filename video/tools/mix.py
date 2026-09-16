"""Mix narration and music, mux them with the silent video, and write the poster (owner: SCENES).

Run with the video venv, from anywhere:
    .venv/Scripts/python.exe tools/mix.py [--no-music] [--gap-db 17] [--min-gap-db 15.5] [--poster-time 25.6] [--no-poster]

Steps (VIDEO-BRIEF.md 3.6, with the finishing edit's audio review applied):
  1. build/music.wav    tools/music.py --duration <total> --lift-at <close start> --fade-out-at <end of the
                        last sentence> --fade-in 1.0. --no-music reuses an existing build/music.wav if its
                        length matches.
  2. voice              high-pass 80 Hz, gentle de-ess, gentle compressor (threshold -18 dB, ratio 2.5,
                        attack 5 ms, release 120 ms) to tame onset peaks.
  3. music              ducked under the voice with a gain envelope built from timings.json, not a
                        sidechain compressor (the compressor pumped in the 0.55 s sentence gaps):
                        sentences closer than 1.2 s form one span; each span is ducked by --duck-db
                        (default 8 dB) with 300 ms ramps, so the music does not move between close
                        sentences. One music trim puts the ducked music --gap-db below the speech
                        overall (K-weighted, BS.1770); spans holding a sentence that would sit less than
                        --min-gap-db below its speech get extra attenuation. After the last sentence
                        the music is not ducked (it resolves and fades).
  4. master             voice + ducked music, pre-gained to about -16.3 LUFS, alimiter (-2.6 dBFS, auto
                        level off), then loudnorm I=-16 LUFS, TP=-2.0 dBTP, LRA=11 in two passes. Pass 2
                        must report linear normalization or the script stops. Trimmed to the video stream's duration,
                        AAC 160 kbps, 48 kHz.
  5. out/nestwell-walkthrough.mp4         muxed with build/video-silent.mp4 (video stream copied), -shortest.
  6. out/nestwell-walkthrough-poster.jpg  `node tools/render.mjs --poster <t>` as JPEG quality 88.
Finally it measures the output with ffmpeg ebur128 and stops with an error if the true peak is above
-1.5 dBTP.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
SR = 48000
MERGE_GAP = 1.2
RAMP = 0.30


def rel(*parts: str) -> str:
    return os.path.join(ROOT, *parts)


def run(cmd: list[str], what: str) -> subprocess.CompletedProcess:
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=ROOT)
    if r.returncode != 0:
        sys.stderr.write((r.stdout or "")[-3000:] + "\n" + (r.stderr or "")[-3000:] + "\n")
        raise SystemExit(f"{what} failed (exit {r.returncode})")
    return r


def probe_duration(path: str, stream: str | None = None) -> float:
    cmd = ["ffprobe", "-v", "error"]
    if stream:
        cmd += ["-select_streams", stream, "-show_entries", "stream=duration"]
    else:
        cmd += ["-show_entries", "format=duration"]
    r = run(cmd + ["-of", "default=nw=1:nk=1", path], "ffprobe")
    return float(r.stdout.strip().splitlines()[0])


def wav_seconds(path: str) -> float:
    info = sf.info(path)
    return info.frames / info.samplerate


# ---------------------------------------------------------------- loudness helpers
def k_weight(x: np.ndarray) -> np.ndarray:
    """BS.1770 K-weighting filter at 48 kHz."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def span_loudness(xk: np.ndarray, spans) -> float:
    """Ungated loudness over the spans; channel powers are summed as in BS.1770."""
    energy, count = 0.0, 0
    for a, b in spans:
        seg = xk[int(round(a * SR)):int(round(b * SR))]
        energy += float(np.sum(seg * seg))
        count += seg.shape[0]
    return -0.691 + 10.0 * np.log10(energy / max(count, 1) + 1e-20)


def integrated_lufs(xk: np.ndarray) -> float:
    """Gated integrated loudness of an already K-weighted signal."""
    block, hop = int(0.4 * SR), int(0.1 * SR)
    p = np.array([np.sum(np.mean(xk[s:s + block] ** 2, axis=0)) for s in range(0, len(xk) - block + 1, hop)])
    lk = -0.691 + 10 * np.log10(p + 1e-20)
    g = p[lk > -70]
    relg = -0.691 + 10 * np.log10(np.mean(g)) - 10
    return float(-0.691 + 10 * np.log10(np.mean(p[(lk > -70) & (lk > relg)])))


def parse_loudnorm_json(stderr: str) -> dict:
    blocks = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, flags=re.S)
    if not blocks:
        raise SystemExit("loudnorm did not print its measurement")
    return json.loads(blocks[-1])


# ---------------------------------------------------------------- duck envelope
def duck_spans(sentences):
    spans = []
    for a, b, i in sentences:
        if spans and a - spans[-1][1] < MERGE_GAP:
            spans[-1][1] = b
            spans[-1][2].append(i)
        else:
            spans.append([a, b, [i]])
    return spans


def envelope(n: int, spans, depth_db) -> np.ndarray:
    """Gain curve: 1 outside spans, 10^(-depth/20) inside, sin^2 ramps of RAMP s ending at the span
    start and starting at the span end. depth_db is a list, one value per span."""
    t = np.arange(n) / SR
    att = np.zeros(n)  # dB of attenuation, >= 0
    for (a, b, _), d in zip(spans, depth_db):
        down = np.clip((t - (a - RAMP)) / RAMP, 0, 1)
        up = np.clip(((b + RAMP) - t) / RAMP, 0, 1)
        shape = np.sin(np.minimum(down, up) * np.pi / 2) ** 2
        att = np.maximum(att, d * shape)
    return 10 ** (-att / 20)


def main() -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--no-music", action="store_true", help="reuse build/music.wav if its length matches")
    ap.add_argument("--duck-db", type=float, default=8.0, help="how far the music dips under speech spans (dB)")
    ap.add_argument("--gap-db", type=float, default=17.0, help="overall ducked-music level below speech (dB)")
    ap.add_argument("--min-gap-db", type=float, default=15.5, help="no sentence may have its music closer than this (dB)")
    ap.add_argument("--poster-time", type=float, default=None, help="poster moment in seconds (default: end of the promise scene)")
    ap.add_argument("--no-poster", action="store_true")
    args = ap.parse_args()

    with open(rel("build", "timings.json"), encoding="utf-8") as f:
        T = json.load(f)
    total = float(T["total"])
    n_total = int(round(total * SR))
    scenes = {s["id"]: s for s in T["scenes"]}
    voice = rel(*T.get("voice_wav", "build/voice.wav").split("/"))
    music = rel("build", "music.wav")
    video = rel("build", "video-silent.mp4")
    out_mp4 = rel("out", "nestwell-walkthrough.mp4")
    poster = rel("out", "nestwell-walkthrough-poster.jpg")
    os.makedirs(rel("out"), exist_ok=True)

    for need in (voice, video):
        if not os.path.exists(need):
            raise SystemExit(f"missing {need}")
    vdur = wav_seconds(voice)
    print(f"timings total {total:.3f} s | voice.wav {vdur:.3f} s | video-silent.mp4 {probe_duration(video):.3f} s")
    if abs(vdur - total) > 0.01:
        raise SystemExit("voice.wav length does not match timings.total")

    sentences = [(s["start"], s["end"], s["text"]) for sc in T["scenes"] for s in sc["sentences"]]
    last_end = sentences[-1][1]

    # 1. music
    lift = scenes["close"]["start"] if "close" in scenes else max(0.0, total - 10.0)
    if args.no_music and os.path.exists(music) and abs(wav_seconds(music) - total) < 0.01:
        print(f"music: reusing build/music.wav ({wav_seconds(music):.3f} s)")
    else:
        print(f"music: tools/music.py --duration {total} --lift-at {lift} --fade-out-at {last_end}")
        run([sys.executable, rel("tools", "music.py"), "--duration", f"{total}", "--out", music, "--lift-at", f"{lift}",
             "--fade-out-at", f"{last_end}", "--fade-in", "1.0"], "music.py")
        print(f"music: wrote build/music.wav ({wav_seconds(music):.3f} s)")

    # 2. voice chain (ffmpeg) -> float wav
    vproc = rel("build", "mix-voice.wav")
    run(["ffmpeg", "-y", "-hide_banner", "-v", "error", "-i", voice, "-af",
         f"aresample={SR},aformat=sample_fmts=fltp:channel_layouts=mono,highpass=f=80:poles=2,"
         "deesser=i=0.35:m=0.5:f=0.5:s=o,acompressor=threshold=-18dB:ratio=2.5:attack=5:release=120:makeup=1",
         "-c:a", "pcm_f32le", vproc], "voice chain")
    v, sr = sf.read(vproc, dtype="float64", always_2d=True)
    m, srm = sf.read(music, dtype="float64", always_2d=True)
    if sr != SR or srm != SR:
        raise SystemExit("unexpected sample rate")
    v = np.repeat(v[:n_total, :1], 2, axis=1)
    m = m[:n_total]
    if len(v) < n_total:
        v = np.pad(v, ((0, n_total - len(v)), (0, 0)))
    if len(m) < n_total:
        m = np.pad(m, ((0, n_total - len(m)), (0, 0)))

    # 3. ducking
    vk, mk = k_weight(v), k_weight(m)
    sp = [(a, b) for a, b, _ in sentences]
    spans = duck_spans([(a, b, i) for i, (a, b, _) in enumerate(sentences)])
    extra = [0.0] * len(spans)
    voice_s = [span_loudness(vk, [x]) for x in sp]
    for it in range(4):
        g = envelope(n_total, spans, [args.duck_db + e for e in extra])[:, None]
        mdk = mk * g
        music_all = span_loudness(mdk, sp)
        trim = (span_loudness(vk, sp) - music_all) - args.gap_db if it == 0 else trim
        mt = 10 ** (trim / 20)
        gaps = [voice_s[i] - (span_loudness(mdk, [x]) + trim) for i, x in enumerate(sp)]
        changed = False
        for k, (_, _, idx) in enumerate(spans):
            need = min(gaps[i] for i in idx) - args.min_gap_db
            if need < -0.05:
                extra[k] = min(10.0, extra[k] - need + 0.2)
                changed = True
        if not changed:
            break
    ducked = m * g * mt
    mdk = k_weight(ducked)
    gaps = [voice_s[i] - span_loudness(mdk, [x]) for i, x in enumerate(sp)]
    between = [(b + RAMP + 0.05, a2 - RAMP - 0.05) for (_, b, _), (a2, _, _) in zip(spans, spans[1:]) if a2 - b > 2 * RAMP + 0.2]
    print(f"ducking: {len(spans)} spans, duck {args.duck_db:.1f} dB, music trim {trim:+.2f} dB, extra on "
          f"{sum(1 for e in extra if e > 0)} span(s) (max {max(extra):.1f} dB)")
    print(f"ducking: speech {span_loudness(vk, sp):.1f} LUFS, music under speech {span_loudness(mdk, sp):.1f} LUFS "
          f"(overall gap {span_loudness(vk, sp) - span_loudness(mdk, sp):.1f} dB), music between spans "
          f"{span_loudness(mdk, between):.1f} LUFS; per-sentence gap min {min(gaps):.1f} dB "
          f"('{sentences[int(np.argmin(gaps))][2][:40]}'), max {max(gaps):.1f} dB")
    if min(gaps) < 14.0:
        raise SystemExit("a sentence has music less than 14 dB below its speech")

    # 4. premaster: pre-gain to about -16.3 LUFS, write float wav
    pre = v + ducked
    lu = integrated_lufs(k_weight(pre))
    pre *= 10 ** ((-16.3 - lu) / 20)
    premaster = rel("build", "mix-premaster.wav")
    sf.write(premaster, pre.astype(np.float32), SR, subtype="FLOAT")
    print(f"premaster: {lu:.2f} LUFS -> -16.3 LUFS, sample peak {20 * np.log10(np.max(np.abs(pre))):.2f} dBFS")

    chain = "alimiter=limit=0.741:attack=3:release=60:level=0:latency=1"
    target = "I=-16:TP=-2.0:LRA=11"
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", premaster, "-af", f"{chain},loudnorm={target}:print_format=json",
             "-f", "null", "-"], "loudnorm pass 1")
    ln = parse_loudnorm_json(r.stderr)
    print(f"loudnorm pass 1: input {ln['input_i']} LUFS, true peak {ln['input_tp']} dBTP, LRA {ln['input_lra']} LU, "
          f"offset {ln['target_offset']}")
    vtrim = min(total, probe_duration(video, "v:0")) - 0.022  # audio never runs past the last video frame (AAC pads up to one 21 ms frame)
    measured = (f"measured_I={ln['input_i']}:measured_TP={ln['input_tp']}:measured_LRA={ln['input_lra']}:"
                f"measured_thresh={ln['input_thresh']}:offset={ln['target_offset']}:linear=true")
    r = run(["ffmpeg", "-y", "-hide_banner", "-nostats", "-i", video, "-i", premaster,
             "-filter_complex", f"[1:a]{chain},loudnorm={target}:{measured}:print_format=json,aresample={SR},"
                                f"atrim=0:{vtrim:.3f},asetpts=PTS-STARTPTS[aout]",
             "-map", "0:v:0", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", str(SR),
             "-shortest", "-movflags", "+faststart", out_mp4], "loudnorm pass 2 + mux")
    ln2 = parse_loudnorm_json(r.stderr)
    print(f"loudnorm pass 2: {ln2.get('normalization_type', '?')} normalization, output {ln2['output_i']} LUFS, "
          f"true peak {ln2['output_tp']} dBTP")
    if ln2.get("normalization_type") != "linear":
        raise SystemExit("loudnorm fell back to dynamic normalization")

    # 6. poster
    if not args.no_poster:
        pt = args.poster_time if args.poster_time is not None else scenes["promise"]["end"] - 0.6
        run(["node", rel("tools", "render.mjs"), "--poster", f"{pt:.3f}", "--out", poster], "poster render")
        print(f"poster: out/nestwell-walkthrough-poster.jpg at {pt:.2f} s ({os.path.getsize(poster) / 1024:.0f} KB)")

    # measure the result
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", out_mp4, "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], "ebur128")
    summary = r.stderr[r.stderr.rfind("Summary:"):]
    i_m = re.search(r"I:\s+(-?[\d.]+) LUFS", summary)
    lra_m = re.search(r"LRA:\s+(-?[\d.]+) LU", summary)
    tp_m = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary)
    print(f"output: {os.path.getsize(out_mp4) / 1e6:.1f} MB, format {probe_duration(out_mp4):.3f} s, "
          f"video {probe_duration(out_mp4, 'v:0'):.3f} s, audio {probe_duration(out_mp4, 'a:0'):.3f} s, "
          f"integrated {i_m.group(1) if i_m else '?'} LUFS, LRA {lra_m.group(1) if lra_m else '?'} LU, "
          f"true peak {tp_m.group(1) if tp_m else '?'} dBTP")
    if not tp_m or float(tp_m.group(1)) > -1.5:
        raise SystemExit("true peak above -1.5 dBTP")


if __name__ == "__main__":
    main()
