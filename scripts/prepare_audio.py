"""Prepare shipped audio from the CC0 recordings and the existing local Kokoro cache.

Run: python3 scripts/prepare_audio.py [--voices]
Requires numpy, ffmpeg; voice regeneration also needs kokoro-onnx, misaki[zh], soundfile.
No model weights are shipped with the game and no generation API is called.
"""
import argparse
import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/assets/audio"
RATE = 24000
LINES = [
    ("mo-intro", "mo", "小年，墨西哥的球迷街传来了求助。点击发光区域，去看看吧。"),
    ("mo-complete", "mo", "墨西哥点亮了！点击发光区域，再次挑战第一关。"),
    ("lupe-task", "lupe", "吉拿一转眼就跑丢了。它穿着绿色球衣，你能帮我找找吗？"),
    ("lupe-thanks", "lupe", "谢谢你，小年！它总爱追着足球跑。"),
    ("xiaonian-start", "xiaonian", "交给我吧，我去找找！"),
    ("xiaonian-found", "xiaonian", "是吉拿！"),
]


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


def encode(samples, dest):
    with tempfile.TemporaryDirectory() as directory:
        wav = Path(directory) / "source.wav"
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
        with wave.open(str(wav), "wb") as f:
            f.setnchannels(1 if pcm.ndim == 1 else pcm.shape[1])
            f.setsampwidth(2)
            f.setframerate(RATE)
            f.writeframes(pcm.tobytes())
        ffmpeg("-i", wav, "-map_metadata", "-1", "-codec:a", "libmp3lame", "-b:a", "96k", dest)


def guitar_loop():
    """An original 16-bar, 108 BPM plucked-string sketch; tails wrap at the seam."""
    beat = 60 / 108
    count = round(16 * 4 * beat * RATE)
    mix = np.zeros(count)
    rng = np.random.default_rng(20261104)

    def add(at, samples, gain=1):
        index = (round(at * RATE) + np.arange(len(samples))) % count
        np.add.at(mix, index, samples * gain)

    def pluck(midi, duration=2.5):
        t = np.arange(round(duration * RATE)) / RATE
        frequency = 440 * 2 ** ((midi - 69) / 12)
        signal = np.zeros_like(t)
        for harmonic in range(1, 10):
            signal += np.sin(2 * np.pi * frequency * harmonic * t + harmonic * .14) * np.exp(-t * (1.6 + .5 * harmonic)) / harmonic ** 1.65
        return signal * (1 - np.exp(-t * 220)) * .2

    chords = [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62],
              [38, 45, 50, 53, 57], [45, 52, 57, 60, 64], [40, 47, 52, 56, 59], [40, 47, 52, 56, 59]]
    melody = [76, 72, 74, 71, 69, 72, 71, 68, 76, 77, 79, 74, 77, 76, 71, 68]
    for bar in range(16):
        notes = chords[bar % 8]
        start = bar * 4 * beat
        for b, gain in [(0, .75), (1.5, .44), (2, .6), (3.5, .35)]:
            for i, note in enumerate(notes):
                add(start + b * beat + i * .018, pluck(note), gain)
        add(start + beat * .5, pluck(melody[bar], 1.6), .25)
        for eighth in range(8):
            n = round(.075 * RATE)
            t = np.arange(n) / RATE
            noise = rng.normal(0, .0028, n)
            shaker = np.diff(noise, prepend=0) * np.exp(-t * 65)
            add(start + eighth * .5 * beat, shaker)
    mix *= .72 / max(.001, np.max(np.abs(mix)))
    encode(mix, OUT / "guitar-loop.mp3")


def recordings():
    candidates = ROOT / "assets/audio/candidates"
    for source in OUT.glob("footstep_concrete_*.ogg"):
        ffmpeg("-i", source, "-ar", RATE, "-ac", "1", "-map_metadata", "-1", "-b:a", "96k", source.with_suffix(".mp3"))
    ffmpeg("-ss", "0.13", "-i", candidates / "dog-bark-source.mp3", "-t", "0.72",
           "-af", "highpass=f=100,afade=t=in:d=0.015,afade=t=out:st=0.62:d=0.1,loudnorm=I=-16:TP=-2:LRA=7",
           "-ac", "1", "-ar", RATE, "-map_metadata", "-1", "-b:a", "96k", OUT / "dog-bark.mp3")
    # Overlap the last two seconds into the first two for a continuous ambience loop.
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", "32", "-i", str(candidates / "market-source.mp3"),
                                   "-t", "26", "-af", "highpass=f=150,lowpass=f=1500", "-ar", str(RATE), "-ac", "2", "-f", "f32le", "-"])
    x = np.frombuffer(raw, dtype="<f4").reshape(-1, 2).copy()
    overlap = 2 * RATE
    loop = x[:-overlap].copy()
    k = np.linspace(0, 1, overlap)[:, None]
    loop[:overlap] = x[-overlap:] * (1 - k) + x[:overlap] * k
    loop *= .5 / max(.001, np.max(np.abs(loop)))
    encode(loop, OUT / "market-loop.mp3")


def voices(cache):
    import onnxruntime as ort
    import soundfile as sf
    from kokoro_onnx import Kokoro
    from misaki.zh import ZHG2P

    # Keep generation bounded on the user's workstation.
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    model = ort.InferenceSession(str(cache / "models/kokoro-v1.0.onnx"), sess_options=opts, providers=["CPUExecutionProvider"])
    kokoro = Kokoro.from_session(model, str(cache / "voices/voices-v1.0.bin"))
    g2p = ZHG2P()
    config = {"mo": ("zm_yunyang", .94), "lupe": ("zf_xiaoxiao", 1.0), "xiaonian": ("zm_yunxi", 1.07)}
    layout = (ROOT / "src/config.js").read_text()
    import re
    inspections = re.findall(r"say: '([^']+)'", layout)
    lines = LINES + [(f"look-{i + 1:02}", "xiaonian", text) for i, text in enumerate(inspections)]
    (OUT / "voice").mkdir(exist_ok=True)
    for key, role, text in lines:
        voice, speed = config[role]
        # Explicit names prevent the generic word segmenter from joining names incorrectly.
        from pypinyin import load_phrases_dict
        load_phrases_dict({"吉拿": [["jí"], ["ná"]], "小年": [["xiǎo"], ["nián"]], "卢佩": [["lú"], ["pèi"]]})
        phonemes, _ = g2p(text)
        samples, rate = kokoro.create(phonemes, voice=voice, speed=speed, is_phonemes=True)
        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / "voice.wav"
            sf.write(wav, samples, rate)
            ffmpeg("-i", wav, "-af", "loudnorm=I=-18:TP=-2:LRA=7,afade=t=in:d=0.015", "-ar", RATE,
                   "-map_metadata", "-1", "-b:a", "96k", OUT / "voice" / f"{key}.mp3")
        print(f"voice {key}: {len(samples) / rate:.1f}s", flush=True)
    manifest = json.dumps([
        {"id": key, "role": role, "text": text, "file": f"{key}.mp3", "voice": config[role][0]}
        for key, role, text in lines
    ], ensure_ascii=False, indent=2) + "\n"
    (OUT / "voice/lines.json").write_text(manifest)
    (ROOT / "src/data/audioLines.json").write_text(manifest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--voices", action="store_true")
    parser.add_argument("--cache", type=Path, default=Path.home() / ".cache/hyperframes/tts")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    recordings()
    guitar_loop()
    if args.voices:
        voices(args.cache)
