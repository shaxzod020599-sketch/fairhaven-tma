#!/usr/bin/env python3
"""Fairhaven reel soundtrack — synthesized from scratch (no samples, nothing licensed).

48 kHz stereo, exactly 15 s, D major at 120 BPM. Every hit sits on the video timeline
(src/brand.ts frames at 60 fps); heartbeats share HEARTBEATS with src/lib/anim.ts.

    python3 scripts/soundtrack.py            → public/soundtrack.wav
    python3 scripts/soundtrack.py --meter    → also prints per-stem levels by section
"""
import sys
from pathlib import Path

import numpy as np
from scipy import signal
from scipy.io import wavfile
from scipy.ndimage import maximum_filter1d

SR = 48000
DUR = 15.0
N = int(SR * DUR)
FPS = 60

# keep in sync with src/brand.ts (frames) and src/lib/anim.ts (HEARTBEATS)
FR = dict(contact=150, hero=206, toFamily=384, her=390, him=450, family=510, numbers=568, n2003=586, n100=648, finale=720, dotLand=810)
S = {k: v / FPS for k, v in FR.items()}
HEARTBEATS = [0.05, 1.0, 2.0, 12.25]
# Remotion's AAC mux keeps 2048 priming samples without an edit list (measured on the rendered mp4),
# so the file is written that much early and lands on the picture after encoding.
ENCODER_DELAY = 2048

rng = np.random.default_rng(2003)
BED = {'drums', 'hats', 'pad', 'bass', 'arp'}  # tracks that follow the macro dynamics


# ───────────────────────────── helpers ─────────────────────────────
def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def tt(n):
    return np.arange(n) / SR


def filt(x, kind, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, kind, fs=SR, output='sos'), x, axis=0)


def pan2(x, pan):
    a = (np.clip(pan, -1, 1) + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], 1) * np.sqrt(2)


def db(g):
    return 10 ** (g / 20)


def lin_env(n, pts):
    """Piecewise-linear envelope from (seconds, value) points."""
    ts, vs = zip(*pts)
    return np.interp(tt(n), ts, vs)


class Bus:
    def __init__(self):
        self.x = np.zeros((N, 2))

    def add(self, sig, t0, gain=1.0, pan=0.0):
        if sig.ndim == 1:
            sig = pan2(sig, pan)
        i0 = int(round(t0 * SR))
        s0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(len(sig) - s0, N - i0)
        if n > 0:
            self.x[i0:i0 + n] += sig[s0:s0 + n] * gain


class Track:
    """A stem with its own dry path plus reverb/delay sends."""

    tracks = {}

    def __init__(self, name, verb=0.0, delay=0.0, duck=False):
        self.dry, self.verb, self.delay, self.duck = Bus(), verb, delay, duck
        Track.tracks[name] = self

    def add(self, sig, t0, gain=0.0, pan=0.0):
        self.dry.add(sig, t0, db(gain), pan)  # gain in dB


# ───────────────────────────── instruments ─────────────────────────────
def heart(dub=False):
    """Lub (or softer, higher dub): pitched sub thump + knock that reads on phone speakers."""
    n = int(0.7 * SR)
    t = tt(n)
    f0, f1, dec = (66, 42, 0.11) if dub else (58, 36, 0.13)
    f = f1 + (f0 - f1) * np.exp(-t / 0.045)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.005)) * np.exp(-t / dec)
    knock = np.sin(2 * np.pi * (172 if dub else 150) * t) * np.exp(-t / 0.04) * (1 - np.exp(-t / 0.002))
    thump = filt(rng.standard_normal(n), 'band', [120, 700])
    thump *= np.exp(-t / 0.03) * (1 - np.exp(-t / 0.0015)) / np.std(thump)
    x = body + 0.6 * knock + 0.35 * thump
    return np.tanh(1.8 * x) / np.tanh(1.8)


def kick():
    n = int(0.5 * SR)
    t = tt(n)
    f = 50 + 105 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.0015)) * np.exp(-t / 0.17)
    click = filt(rng.standard_normal(n), 'band', [1800, 6500]) * np.exp(-t / 0.0022) * 0.16
    punch = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.015) * 0.25  # reads on phone speakers
    return np.tanh(1.5 * (body + click + punch)) / np.tanh(1.5)


def snap():
    """Soft finger-snap / clap: three micro-bursts and a short room tail."""
    n = int(0.32 * SR)
    t = tt(n)
    x = filt(rng.standard_normal(n), 'band', [1000, 5200], 2)
    env = np.zeros(n)
    for k, d in enumerate((0.0, 0.009, 0.019)):
        i = int(d * SR)
        env[i:] += (0.75 ** k) * np.exp(-t[: n - i] / 0.0045)
    i = int(0.019 * SR)
    env[i:] += 0.4 * np.exp(-t[: n - i] / 0.055)
    tone = np.sin(2 * np.pi * 1650 * t) * np.exp(-t / 0.012) * 0.25
    return x * env + tone


def hat(length=0.018):
    n = int((length * 6 + 0.02) * SR)
    t = tt(n)
    x = filt(rng.standard_normal(n), 'high', 7200, 2)
    for fr in (6150, 8300, 10450):
        x += 0.12 * np.sin(2 * np.pi * fr * t + rng.uniform(0, 6.28))
    return x * (1 - np.exp(-t / 0.0007)) * np.exp(-t / length)


def shaker():
    n = int(0.12 * SR)
    t = tt(n)
    x = filt(rng.standard_normal(n), 'band', [3200, 9500], 2)
    return x * (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.03)


def pluck(freq, dur=1.1, bright=1.0):
    """Felt mallet / kalimba tone for the arpeggio."""
    n = int(dur * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.42)
    x += 0.38 * bright * np.sin(2 * np.pi * 2 * freq * t) * np.exp(-t / 0.15)
    x += 0.14 * bright * np.sin(2 * np.pi * 3 * freq * t) * np.exp(-t / 0.06)
    x += 0.08 * bright * np.sin(2 * np.pi * 4.95 * freq * t) * np.exp(-t / 0.02)
    return x * (1 - np.exp(-t / 0.0012))


def piano(freq, dur=3.5, vel=1.0):
    """Soft felt piano: slightly stretched partials, two detuned strings, damped top."""
    n = int(dur * SR)
    t = tt(n)
    x = np.zeros(n)
    for k in range(1, 14):
        fk = k * freq * np.sqrt(1 + 0.00035 * k * k)
        if fk > 9000:
            break
        amp = vel ** (0.4 + 0.12 * k) / k ** 1.3
        tau = 2.4 / k ** 0.8
        for det in (-0.4, 0.4):
            x += 0.5 * amp * np.sin(2 * np.pi * fk * 2 ** (det / 1200) * t + rng.uniform(0, 6.28)) * np.exp(-t / tau)
    x *= 1 - np.exp(-t / 0.003)
    x += filt(rng.standard_normal(n), 'low', 380) * np.exp(-t / 0.008) * 0.08
    return filt(x, 'low', 2400, 1)


def glock(freq, dur=2.6, vel=1.0):
    """Struck bar (free-free partials 1, 2.76, 5.40, 8.93)."""
    n = int(dur * SR)
    t = tt(n)
    x = np.zeros(n)
    for ratio, amp, tau in ((1.0, 1.0, 0.9), (2.76, 0.42 * vel, 0.28), (5.40, 0.2 * vel, 0.1), (8.93, 0.09 * vel, 0.045)):
        if ratio * freq < 20000:
            x += amp * np.sin(2 * np.pi * ratio * freq * t) * np.exp(-t / tau)
    return x * (1 - np.exp(-t / 0.0008))


def celesta(freq, dur=3.5):
    """Harmonic music-box / celesta tone — a clean, in-key 'ding'."""
    n = int(dur * SR)
    t = tt(n)
    x = np.zeros(n)
    for k, (amp, tau) in enumerate(((1.0, 1.5), (0.32, 0.55), (0.12, 0.25), (0.05, 0.12)), start=1):
        x += amp * np.sin(2 * np.pi * k * freq * (1 + 0.0005 * k * k) * t) * np.exp(-t / tau)
    return x * (1 - np.exp(-t / 0.001))


def boom(f0=64, f1=31, dur=2.2, tau=0.75):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.22)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.004)) * np.exp(-t / tau)
    return np.tanh(1.6 * x) / np.tanh(1.6)


def swept(dur, fc_pts, bw_oct, env_pts, seed, pan_pts=None):
    """Noise through a moving log-gaussian band (STFT domain) — whooshes, risers, air."""
    n = int(dur * SR)
    r = np.random.default_rng(seed)
    out = np.zeros((n, 2))
    for c in range(2):
        x = r.standard_normal(n)
        f, ts, Z = signal.stft(x, SR, nperseg=1024, noverlap=768)
        pts_t, pts_f = zip(*fc_pts)
        fc = np.exp(np.interp(ts, pts_t, np.log(pts_f)))
        lf = np.log2(np.maximum(f, 20))[:, None]
        g = np.exp(-0.5 * ((lf - np.log2(fc)[None, :]) / bw_oct) ** 2)
        _, y = signal.istft(Z * g, SR, nperseg=1024, noverlap=768)
        out[:, c] = y[:n]
    out /= np.sqrt(np.mean(out ** 2)) + 1e-12
    out *= lin_env(n, env_pts)[:, None]
    if pan_pts:
        p = lin_env(n, pan_pts)
        a = (p + 1) * np.pi / 4
        mono = out.mean(1)
        side = (out[:, 0] - out[:, 1]) * 0.5
        out = np.stack([mono * np.cos(a) * np.sqrt(2) + side * 0.4, mono * np.sin(a) * np.sqrt(2) - side * 0.4], 1)
    return out


def pad_segment(notes, t0, t1, cut, att=0.35, rel=0.9, detune=7.0):
    """Additive detuned-saw pad; brightness follows the global cutoff automation `cut(t)`."""
    n = int((t1 - t0 + rel) * SR)
    t = tt(n)
    tabs = t0 + t
    fc = cut(tabs)
    out = np.zeros((n, 2))
    for m in notes:
        base = midi(m)
        for j, cents in enumerate((-detune, 0.0, detune)):
            vib = 1 + 0.0012 * np.sin(2 * np.pi * (0.17 + 0.05 * j) * tabs + j)
            f = base * 2 ** (cents / 1200)
            ph = 2 * np.pi * np.cumsum(f * vib) / SR + rng.uniform(0, 6.28)
            sig = np.zeros(n)
            for k in range(1, 40):
                if k * f > 9000:
                    break
                sig += np.sin(k * ph) / k / np.sqrt(1 + (k * f / fc) ** 4)
            out += pan2(sig, (-0.85, 0.0, 0.85)[j]) / 3
    env = np.minimum(1, t / att) ** 1.5
    env *= np.clip((t1 - t0 + rel - t) / rel, 0, 1) ** 1.2
    return out * env[:, None] / np.sqrt(len(notes))


def bass_note(freq, dur, att=0.03, rel=0.25):
    n = int((dur + rel) * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * freq * t) + 0.42 * np.sin(4 * np.pi * freq * t + 0.4) + 0.16 * np.sin(6 * np.pi * freq * t + 0.9)
    env = np.minimum(1, t / att) * np.clip((dur + rel - t) / rel, 0, 1)
    return np.tanh(1.4 * x * env) / np.tanh(1.4)


def tick(freq):
    n = int(0.035 * SR)
    t = tt(n)
    x = np.sin(2 * np.pi * freq * t) * np.exp(-t / 0.0045) + 0.6 * filt(rng.standard_normal(n), 'high', 2500) * np.exp(-t / 0.0018)
    return x * (1 - np.exp(-t / 0.0003))


def cubic_bezier(x1, y1, x2, y2):
    cx, cy = 3 * x1, 3 * y1
    bx, by = 3 * (x2 - x1) - cx, 3 * (y2 - y1) - cy
    ax, ay = 1 - cx - bx, 1 - cy - by

    def f(x):
        x = np.clip(np.asarray(x, float), 0, 1)
        lo, hi = np.zeros_like(x), np.ones_like(x)
        for _ in range(32):
            mid = (lo + hi) / 2
            below = ((ax * mid + bx) * mid + cx) * mid < x
            lo, hi = np.where(below, mid, lo), np.where(below, hi, mid)
        m = (lo + hi) / 2
        return ((ay * m + by) * m + cy) * m

    return f


swift = cubic_bezier(0.16, 1, 0.3, 1)


# ───────────────────────────── arrangement ─────────────────────────────
def build():
    heartT = Track('heart', verb=0.18)
    drums = Track('drums', verb=0.08)
    hats = Track('hats', verb=0.12)
    padT = Track('pad', verb=0.35, duck=True)
    bassT = Track('bass', duck=True)
    arpT = Track('arp', verb=0.3, delay=0.42, duck=True)
    keys = Track('keys', verb=0.45, delay=0.18)
    fx = Track('fx', verb=0.3)
    bells = Track('bells', verb=0.55, delay=0.25)
    ticks = Track('ticks', verb=0.1)

    # chords: (start s, pad voicing, bass midi) — changes land on the picture's accents
    chords = [
        (0.0, [50, 57, 64], None),  # D(add9), no third — dark, suspended intro
        (S['contact'], [50, 57, 61, 64, 66], 38),  # Dmaj9 — bloom at contact
        (4.5, [54, 57, 61, 62], 35),  # Bm9
        (5.5, [54, 57, 59, 62], 43),  # Gmaj9
        (S['her'], [57, 62, 64, 66], 42),  # D/F#   — "Ayol uchun"
        (S['him'], [55, 59, 62, 66], 40),  # Em9    — "Erkak uchun"
        (S['family'], [59, 62, 66, 69], 43),  # Gmaj9  — "Oila uchun"
        (9.5, [57, 59, 61, 62, 66], 47),  # Bm9    — numbers
        (S['n100'], [55, 57, 62, 64], 45),  # A7sus4 — 100 % + ring riser
        (S['finale'], [50, 57, 61, 64, 66], 38),  # Dmaj9  — home
    ]

    cut_pts = [(0, 420), (1.9, 700), (2.42, 1300), (2.5, 3000), (3.5, 2100), (6.4, 2500), (9.3, 2300), (9.6, 3000), (10.8, 2400),
               (11.95, 4800), (12.02, 1500), (13.4, 1900), (13.52, 3400), (15.0, 2000)]
    ct, cf = zip(*cut_pts)
    cut = lambda ts: np.exp(np.interp(ts, ct, np.log(cf)))

    for i, (t0, notes, bass) in enumerate(chords):
        t1 = chords[i + 1][0] if i + 1 < len(chords) else DUR
        att = 0.06 if t0 in (S['contact'], S['finale']) else (1.2 if t0 == 0 else 0.3)
        padT.add(pad_segment(notes, t0, t1, cut, att=att), t0, gain=-13.5 if t0 else -19)
        if bass is not None:
            bassT.add(bass_note(midi(bass), t1 - t0 + (0.9 if t1 >= DUR else 0.02), att=0.02 if t0 == S['contact'] else 0.05), t0, gain=-16)

    # heartbeats — lub + dub 0.267 s later (same as the picture's pulse)
    for i, b in enumerate(HEARTBEATS):
        g = -3 if b < 3 else -5
        heartT.add(heart(), b, gain=g)
        heartT.add(heart(dub=True), b + 0.267, gain=g - 4)

    # intro: two felt-piano notes on the two opening lines; the same motif returns on the tagline
    keys.add(piano(midi(69), 4.0, 0.7), 14 / FPS, gain=-10, pan=-0.15)  # A4 — "Ikki yurak."
    keys.add(piano(midi(50), 4.0, 0.6), 14 / FPS, gain=-17, pan=0.0)  # D3 under it
    keys.add(piano(midi(74), 4.0, 0.7), 70 / FPS, gain=-10, pan=0.15)  # D5 — "Bitta orzu."
    keys.add(piano(midi(66), 4.0, 0.55), 70 / FPS + 0.012, gain=-18, pan=0.1)  # F#4
    # inside the cell: a glassy air layer from the first frame (high partials of the D chord, slow shimmer)
    n = int(2.6 * SR)
    ta = tt(n)
    air = sum(np.sin(2 * np.pi * midi(m) * ta + k) * (1 + 0.5 * np.sin(2 * np.pi * (0.7 + 0.23 * k) * ta + k)) / (k + 1.5)
              for k, m in enumerate((86, 93, 98, 100)))
    air *= np.minimum(1, ta / 0.25) * np.clip((2.6 - ta) / 0.35, 0, 1)
    keys.add(air, 0.0, gain=-33, pan=0.1)
    fx.add(swept(2.5, [(0, 6500), (2.5, 9000)], 0.9, [(0, 0), (0.2, 0.5), (2.2, 0.35), (2.5, 0)], 12), 0.0, gain=-36)
    # the sperm's swim: a faint breathy rise that leans toward the ovum
    fx.add(swept(2.1, [(0, 900), (1.6, 2600), (2.1, 5200)], 0.9, [(0, 0), (0.6, 0.05), (1.7, 0.16), (2.08, 0.34), (2.1, 0)], 11,
                 pan_pts=[(0, 0.55), (2.1, 0.1)]), 0.4, gain=-24)

    # contact: reverse bloom → sub boom + crystal chord + air burst, then the pull-back rush
    crystal = sum(glock(midi(m), 3.5, 0.8) * g for m, g in ((74, 1.0), (78, 0.7), (81, 0.8), (85, 0.5), (88, 0.35)))
    ir_short = make_ir(2.2, seed=5)[:, 0]
    wet = signal.fftconvolve(crystal, ir_short)[: int(1.5 * SR)]
    rev = wet[::-1] * np.linspace(0, 1, len(wet)) ** 2.2
    fx.add(rev / np.max(np.abs(rev)), S['contact'] - len(rev) / SR, gain=-17)
    fx.add(boom(70, 30, 2.2, 0.55), S['contact'], gain=-7)
    bells.add(crystal / np.max(np.abs(crystal)), S['contact'], gain=-13)
    fx.add(swept(1.2, [(0, 7000), (0.15, 5000), (1.2, 900)], 1.2, [(0, 0), (0.006, 1), (0.25, 0.45), (1.2, 0)], 21), S['contact'], gain=-16)
    fx.add(swept(1.15, [(0, 5200), (0.35, 1800), (1.15, 320)], 0.8, [(0, 0), (0.08, 0.9), (0.45, 0.55), (1.15, 0)], 22,
                 pan_pts=[(0, 0.4), (1.15, -0.3)]), S['contact'] + 0.02, gain=-17)
    # groove: kick on every beat 3.5 → 11.5, snaps on the off-bar beats, hats / shaker
    kick_times = [3.5 + 0.5 * k for k in range(17)]
    for kt in kick_times:
        drums.add(kick(), kt, gain=-10.5 if kt > 3.6 else -7)
    for st in np.arange(5.0, 11.01, 1.0):
        drums.add(snap(), st, gain=-18, pan=0.08)
    for k in range(17):  # off-beat 8ths 3.75 → 11.75
        ht = 3.75 + 0.5 * k
        hats.add(hat(), ht, gain=-17 if ht < 10.9 else -15, pan=0.25)
    for ht in np.arange(6.625, 11.9, 0.25):  # 16th ghosts from the family section, swelling into the riser
        hats.add(shaker(), ht, gain=-25 + 5 * max(0, ht - 10.8), pan=-0.3)

    # arpeggio: felt plucks in 8ths, then 16ths once the family section starts
    arp_order = [0, 2, 1, 3, 2, 4, 1, 3]
    t = 3.5
    step = 0
    while t < 11.95:
        ci = max(i for i, c in enumerate(chords) if c[0] <= t + 1e-6)
        tones = sorted(set(m + 12 * int(np.ceil((64 - m) / 12)) for m in chords[ci][1]))  # into E4–D#5
        tones.append(tones[0] + 12)
        m = tones[arp_order[step % 8] % len(tones)]
        on_beat = abs((t - 3.5) % 0.5) < 1e-6
        vel = 1.0 if on_beat else 0.7
        rise = 1 + 0.6 * max(0, (t - 10.8) / 1.15)
        arpT.add(pluck(midi(m), 1.0, 0.8 + 0.3 * vel) * vel, t, gain=-16 + 20 * np.log10(rise), pan=(-0.35, 0.35)[step % 2])
        dt = 0.25 if t < S['her'] - 1e-6 else 0.125
        t += dt
        step += 1

    # arch folds into the berry circle
    fx.add(swept(0.42, [(0, 1200), (0.3, 4200), (0.42, 5200)], 0.7, [(0, 0), (0.28, 0.8), (0.42, 0)], 31), S['toFamily'] - 0.05, gain=-21)
    # her slides out left / him slides in from the right
    fx.add(swept(0.6, [(0, 700), (0.3, 3200), (0.6, 900)], 0.8, [(0, 0), (0.3, 1), (0.6, 0)], 32, pan_pts=[(0, 0.8), (0.6, -0.8)]),
           S['him'] - 0.2, gain=-17)
    # her returns, the cells meet
    fx.add(swept(0.6, [(0, 600), (0.35, 2600), (0.6, 800)], 0.8, [(0, 0), (0.35, 1), (0.6, 0)], 33, pan_pts=[(0, -0.8), (0.6, 0.1)]),
           S['family'] - 0.15, gain=-19)
    fx.add(boom(80, 38, 1.2, 0.3), S['family'], gain=-13)
    # the new pearl (T.family + 20)
    for m, g, d in ((86, -15, 0.0), (90, -21, 0.05), (93, -25, 0.1)):
        bells.add(glock(midi(m), 2.4, 0.9), S['family'] + 20 / FPS + d, gain=g, pan=0.05)

    # iris opens into the numbers
    fx.add(swept(0.55, [(0, 400), (0.4, 5200), (0.55, 7000)], 1.0, [(0, 0), (0.38, 1), (0.55, 0)], 41), S['numbers'] - 8 / FPS - 0.08, gain=-15)
    fx.add(boom(70, 36, 1.0, 0.22), S['numbers'] + 14 / FPS, gain=-15)

    # odometer ticks from the drums' own motion (numbers scene: roll 34 frames, exit 11 frames)
    def drum_ticks(digits, start, out):
        for i, d in enumerate(digits):
            total = (1 + (i + d) % 2) * 10 + d
            fr = np.arange(start + i * 3 - 1, out + i + 12, 0.01)
            idx = swift((fr - (start + i * 3)) / 34) * total + (np.clip((fr - (out + i)) / 11, 0, 1) ** 3) * 3
            speed = np.gradient(idx, fr)
            cross = np.nonzero(np.floor(idx[1:]) > np.floor(idx[:-1]))[0]
            pan = (i - (len(digits) - 1) / 2) * 0.32
            for c in cross:
                s_ = speed[c]
                g = min(1.0, 1.0 / np.sqrt(max(s_, 1e-3))) * (0.55 if fr[c] > out + i else 1.0)
                ticks.add(tick(2700 + 260 * i + rng.uniform(-60, 60)), fr[c] / FPS, gain=-17 + 20 * np.log10(g), pan=pan)
            # "lock" — a slightly deeper click as the drum settles
            ticks.add(tick(1700 + 120 * i), (start + i * 3 + 22) / FPS, gain=-20, pan=pan)

    drum_ticks([2, 0, 0, 3], FR['n2003'], FR['n100'] - 6)
    drum_ticks([1, 0, 0], FR['n100'], FR['finale'] - 18)
    # "%" springs in
    bells.add(glock(midi(93), 1.2, 0.6), (FR['n100'] + 12 + 9) / FPS, gain=-22, pan=0.25)

    # ring draws itself (10.9 → 11.77) — glass riser + air, then the collapse sucks into the finale
    n = int(1.1 * SR)
    tr = tt(n)
    x = tr / 1.1
    f = midi(62) * 4 ** (x ** 1.5)
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.004 * np.sin(2 * np.pi * 5.5 * tr))) / SR
    glass = (np.sin(ph) + 0.3 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph)) * x ** 2.2 * np.clip((1.1 - tr) / 0.03, 0, 1)
    fx.add(glass, S['n100'] + 0.1, gain=-25)
    fx.add(swept(1.1, [(0, 500), (1.0, 7800), (1.1, 9000)], 1.1, [(0, 0), (0.9, 0.7), (1.07, 1), (1.1, 0)], 51), S['n100'] + 0.1, gain=-17)
    fx.add(boom(52, 32, 1.2, 0.3), S['finale'], gain=-12)
    fx.add(swept(1.4, [(0, 3000), (1.4, 400)], 1.0, [(0, 0), (0.01, 0.8), (1.4, 0)], 52), S['finale'], gain=-24)

    # tagline — the opening motif returns on the heartbeat
    keys.add(piano(midi(69), 3.5, 0.65), 734 / FPS, gain=-13, pan=-0.1)
    keys.add(piano(midi(74), 3.2, 0.65), 746 / FPS, gain=-13, pan=0.1)
    keys.add(piano(midi(62), 3.2, 0.5), 746 / FPS + 0.01, gain=-19)

    # pearl flight: harp-like pentatonic glissando that accelerates into the landing
    penta = [69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93, 95]
    fly0, land = (FR['dotLand'] - 44) / FPS, S['dotLand']
    inv = lambda y: (y / 4) ** (1 / 3) if y < 0.5 else 1 - (2 * (1 - y)) ** (1 / 3) / 2  # inverse inOutCubic
    for k, m in enumerate(penta):
        u = 0.04 + 0.9 * k / (len(penta) - 1)  # a note each time the pearl passes 1/12 of its arc
        bells.add(pluck(midi(m), 1.3, 0.8), fly0 + inv(u) * (land - fly0), gain=-23 + 5 * u, pan=-0.5 * u)
    fx.add(swept(0.75, [(0, 600), (0.6, 4800), (0.75, 6000)], 0.9, [(0, 0), (0.55, 0.8), (0.73, 1), (0.75, 0)], 61,
                 pan_pts=[(0, 0), (0.75, -0.45)]), fly0, gain=-22)

    # landing in the "i": bell + glass + sub, then fairy dust settling
    bells.add(celesta(midi(74), 4.5), land, gain=-10, pan=-0.2)
    bells.add(celesta(midi(81), 4.0), land + 0.003, gain=-15, pan=-0.1)
    bells.add(glock(midi(86), 3.2, 1.0), land, gain=-13, pan=-0.25)
    bells.add(glock(midi(93), 2.4, 0.8), land + 0.004, gain=-19, pan=-0.3)
    fx.add(boom(62, 32, 1.8, 0.5), land, gain=-11)
    fx.add(swept(1.4, [(0, 9000), (1.4, 5000)], 1.0, [(0, 0), (0.004, 1), (1.4, 0)], 71), land, gain=-24, )
    for k, m in enumerate([98, 95, 93, 90, 88, 86, 83, 81]):
        bells.add(glock(midi(m), 1.6, 0.5), land + 0.16 + 0.1 * k + 0.012 * k * k, gain=-27 - 1.2 * k, pan=-0.3 + 0.12 * k)
    # the shine across the wordmark
    fx.add(swept(0.8, [(0, 5000), (0.8, 11000)], 0.6, [(0, 0), (0.3, 1), (0.8, 0)], 72, pan_pts=[(0, -0.7), (0.8, 0.7)]),
           (FR['dotLand'] + 8) / FPS, gain=-29)

    return kick_times


def make_ir(rt60, seed=1, dur=None):
    r = np.random.default_rng(seed)
    dur = dur or rt60 * 1.1
    n = int(dur * SR)
    t = tt(n)
    ir = np.zeros((n, 2))
    for c in range(2):
        x = r.standard_normal(n)
        lo, mid, hi = filt(x, 'low', 700), filt(x, 'band', [700, 4000]), filt(x, 'high', 4000)
        d = lambda rt: np.exp(-6.91 * t / rt)
        y = lo * d(rt60 * 1.05) + mid * d(rt60 * 0.8) + hi * d(rt60 * 0.4)
        ir[:, c] = y * (1 - np.exp(-t / 0.01))
    pre = np.zeros((int(0.02 * SR), 2))
    ir = np.concatenate([pre, ir])
    for k in range(10):
        ir[int(r.uniform(0.003, 0.045) * SR), k % 2] += r.uniform(0.2, 0.5)
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def pingpong(x, delay=0.375, fb=0.4, reps=6):
    d = int(delay * SR)
    out = np.zeros((N, 2))
    cur = x.mean(1)
    for k in range(1, reps + 1):
        cur = filt(cur, 'low', 5200, 1) * fb
        if d * k >= N:
            break
        out[d * k:, k % 2] += cur[: N - d * k]
    return out


def lufs(x):
    """Integrated loudness (ITU-R BS.1770 K-weighting + gating), good enough to calibrate."""
    b1, a1 = signal.iirfilter(2, 1500, btype='highpass', ftype='butter', fs=SR)  # approx. shelf stage
    y = x + 0.58 * signal.lfilter(b1, a1, x, axis=0)
    y = filt(y, 'high', 38)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(np.sum(y[i:i + blk] ** 2, 1)) for i in range(0, len(y) - blk, hop)])
    ld = -0.691 + 10 * np.log10(ms + 1e-12)
    g1 = ms[ld > -70]
    rel = -0.691 + 10 * np.log10(np.mean(g1)) - 10
    g2 = ms[ld > max(-70, rel)]
    return -0.691 + 10 * np.log10(np.mean(g2))


def limiter(x, ceiling=db(-1.0), look=0.003, release=0.09):
    a = np.max(np.abs(x), 1)
    L = int(look * SR)
    peak = maximum_filter1d(a, 2 * L + 1)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    k = np.exp(-1 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i, gi in enumerate(g):
        cur = gi if gi < cur else gi + (cur - gi) * k
        out[i] = cur
    return x * out[:, None]


def main():
    meter = '--meter' in sys.argv
    kick_times = build()

    duck = np.ones(N)
    for kt in kick_times:
        i0 = int(kt * SR)
        n = min(int(0.45 * SR), N - i0)
        t = tt(n)
        e = 1 - 0.42 * (1 - np.exp(-t / 0.006)) * np.exp(-t / 0.13)
        duck[i0:i0 + n] = np.minimum(duck[i0:i0 + n], e)

    # macro dynamics of the music bed: groove → lift for the family → swell into the ring → hush → landing
    macro = lin_env(N, [(0, 1.0), (6.4, 1.0), (6.55, 1.12), (9.4, 1.12), (11.9, 1.45), (12.0, 0.78), (13.45, 0.78), (13.52, 1.0), (15, 1.0)])

    dry = np.zeros((N, 2))
    verb_in = np.zeros((N, 2))
    delay_in = np.zeros((N, 2))
    stems = {}
    for name, tr in Track.tracks.items():
        x = tr.dry.x * (duck[:, None] if tr.duck else 1) * (macro[:, None] if name in BED else 1)
        stems[name] = x
        dry += x
        verb_in += x * tr.verb
        delay_in += x * tr.delay

    echoes = pingpong(delay_in)
    verb_in += echoes * 0.35
    ir = make_ir(2.8, seed=3)
    mono_in = verb_in.mean(1)
    wet = np.stack([signal.fftconvolve(mono_in, ir[:, c])[:N] for c in range(2)], 1)
    wet = filt(wet, 'high', 180)
    mix = dry + echoes * 0.55 + wet * 0.5
    mix = filt(mix, 'high', 24)

    # calibrate to about −14 LUFS, then catch the peaks
    mix *= db(-14.0 - lufs(mix))
    mix = limiter(mix)
    fade = np.ones(N)
    nf = int(0.45 * SR)
    fade[-nf:] = np.cos(np.linspace(0, np.pi / 2, nf)) ** 2
    fade[: int(0.004 * SR)] = np.linspace(0, 1, int(0.004 * SR))
    mix *= fade[:, None]

    out = Path(__file__).resolve().parent.parent / 'public' / 'soundtrack.wav'
    mix = np.concatenate([mix[ENCODER_DELAY:], np.zeros((ENCODER_DELAY, 2))])
    wavfile.write(out, SR, (np.clip(mix, -1, 1) * 32767).astype(np.int16))
    print(f'wrote {out}  peak {20 * np.log10(np.max(np.abs(mix))):.1f} dBFS  loudness {lufs(mix):.1f} LUFS')

    if meter:
        secs = [('intro', 0, 2.5), ('contact', 2.5, 3.5), ('S2', 3.5, 6.4), ('family', 6.4, 9.4), ('numbers', 9.4, 12.0), ('finale', 12.0, 15.0)]
        print('stem'.ljust(8) + ''.join(s[0].rjust(9) for s in secs))
        for name, x in stems.items():
            row = name.ljust(8)
            for _, a, b in secs:
                seg = x[int(a * SR):int(b * SR)]
                r = np.sqrt(np.mean(seg ** 2)) + 1e-12
                row += f'{20 * np.log10(r):9.1f}'
            print(row)
        row = 'MIX'.ljust(8)
        for _, a, b in secs:
            seg = mix[int(a * SR):int(b * SR)]
            row += f'{20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-12):9.1f}'
        print(row)


if __name__ == '__main__':
    main()
