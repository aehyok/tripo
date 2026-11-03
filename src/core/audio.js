/**
 * 音效：全部用 WebAudio 合成，不依赖音频素材文件。
 * 音频不可用时（浏览器不支持或用户未交互）所有调用静默失败，不影响通关。
 */
let ctx = null;
let master = null;
let crowd = null;
let soundOn = true;

function ensure() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = soundOn ? 1 : 0;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlock() {
  ensure();
}

export function isSoundOn() {
  return soundOn;
}

export function setSound(on) {
  soundOn = !!on;
  if (master) master.gain.value = soundOn ? 1 : 0;
  if (soundOn) ensure();
}

function tone(f0, f1, dur, type, vol, pan = 0, at = 0) {
  if (!ensure() || !soundOn) return;
  try {
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    p.pan.value = pan;
    o.connect(g).connect(p).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {
    /* 音频异常不影响游戏 */
  }
}

export const blip = () => tone(520, 700, 0.08, 'triangle', 0.12);

export const bark = (pan = 0) => {
  tone(720, 300, 0.11, 'sawtooth', 0.26, pan);
  tone(760, 320, 0.13, 'sawtooth', 0.28, pan, 0.17);
};

export const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.26, 'triangle', 0.2, 0, i * 0.13));

export function crowdOn(on) {
  if (!ensure() || !soundOn) {
    if (!on) crowdOff();
    return;
  }
  try {
    if (on && !crowd) {
      const n = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, n, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 700;
      f.Q.value = 0.6;
      const g = ctx.createGain();
      g.gain.value = 0.018;
      src.connect(f).connect(g).connect(master);
      src.start();
      crowd = src;
    }
  } catch {
    crowd = null;
  }
  if (!on) crowdOff();
}

function crowdOff() {
  if (!crowd) return;
  try {
    crowd.stop();
  } catch {
    /* ignore */
  }
  crowd = null;
}
