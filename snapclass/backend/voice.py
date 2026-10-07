"""Lightweight text-independent voice fingerprinting (MFCC statistics).

The browser records mono PCM and uploads it as a 16-bit WAV. We turn it into a
fixed-length vector (mean + std of 19 MFCCs over the voiced frames) and compare
vectors with cosine similarity.

This is a dependency-free, demo-grade speaker check. For production, swap
`extract()` / `similarity()` for a neural speaker embedding (ECAPA-TDNN,
Resemblyzer, ...); the rest of the app only relies on those two functions.
"""
import base64
import io
import wave

import numpy as np

TARGET_SR = 16000
N_FFT = 512
FRAME = 400  # 25 ms
HOP = 160  # 10 ms
N_MELS = 26
N_MFCC = 20
MIN_VOICED_FRAMES = 40  # ~0.4 s of actual speech


class VoiceError(ValueError):
    pass


def decode_wav(b64_or_bytes):
    raw = base64.b64decode(b64_or_bytes.split(",")[-1]) if isinstance(b64_or_bytes, str) else b64_or_bytes
    try:
        with wave.open(io.BytesIO(raw), "rb") as w:
            sr, ch, width = w.getframerate(), w.getnchannels(), w.getsampwidth()
            frames = w.readframes(w.getnframes())
    except Exception as e:  # noqa: BLE001
        raise VoiceError("Could not read audio. Please record again.") from e
    if width != 2:
        raise VoiceError("Unsupported audio format (need 16-bit PCM).")
    x = np.frombuffer(frames, dtype="<i2").astype(np.float64) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if sr != TARGET_SR and len(x):
        t_old = np.linspace(0, 1, len(x), endpoint=False)
        n_new = int(len(x) * TARGET_SR / sr)
        x = np.interp(np.linspace(0, 1, n_new, endpoint=False), t_old, x)
    return x


def _mel_filterbank():
    def hz2mel(f):
        return 2595 * np.log10(1 + f / 700)

    def mel2hz(m):
        return 700 * (10 ** (m / 2595) - 1)

    pts = mel2hz(np.linspace(hz2mel(80), hz2mel(TARGET_SR / 2), N_MELS + 2))
    bins = np.floor((N_FFT + 1) * pts / TARGET_SR).astype(int)
    fb = np.zeros((N_MELS, N_FFT // 2 + 1))
    for m in range(1, N_MELS + 1):
        l, c, r = bins[m - 1], bins[m], bins[m + 1]
        for k in range(l, c):
            fb[m - 1, k] = (k - l) / max(c - l, 1)
        for k in range(c, r):
            fb[m - 1, k] = (r - k) / max(r - c, 1)
    return fb


_FB = _mel_filterbank()
_DCT = np.cos(np.pi / N_MELS * (np.arange(N_MELS) + 0.5)[None, :] * np.arange(N_MFCC)[:, None])
_WIN = np.hamming(FRAME)


def extract(b64_or_bytes):
    """Return a list[float] voice vector (length 2 * (N_MFCC - 1))."""
    x = decode_wav(b64_or_bytes)
    if len(x) < TARGET_SR * 0.8:
        raise VoiceError("Recording too short. Speak for at least 2 seconds.")
    x = np.append(x[0], x[1:] - 0.97 * x[:-1])
    n = 1 + (len(x) - FRAME) // HOP
    idx = np.arange(FRAME)[None, :] + HOP * np.arange(n)[:, None]
    frames = x[idx] * _WIN
    energy = 10 * np.log10(np.sum(frames**2, axis=1) + 1e-10)
    voiced = energy > energy.max() - 25
    if voiced.sum() < MIN_VOICED_FRAMES or energy.max() < -45:
        raise VoiceError("We could barely hear you. Move closer to the mic and try again.")
    frames = frames[voiced]
    spec = np.abs(np.fft.rfft(frames, N_FFT)) ** 2
    logmel = np.log(spec @ _FB.T + 1e-10)
    mfcc = (logmel @ _DCT.T)[:, 1:]  # drop c0 (loudness)
    vec = np.concatenate([mfcc.mean(axis=0), mfcc.std(axis=0)])
    return vec.tolist()


def similarity(a, b):
    a, b = np.asarray(a), np.asarray(b)
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))


def best_similarity(probe, templates):
    return max(similarity(probe, t) for t in templates) if templates else 0.0
