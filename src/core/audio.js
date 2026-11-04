/** Local audio, one shared mixer, and scene-scoped playback. No generation API at runtime. */
import lines from '../data/audioLines.json';

const files = {
  music: 'guitar-loop.mp3',
  crowd: 'market-loop.mp3',
  dog: 'dog-bark.mp3',
  ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`step${i}`, `footstep_concrete_00${i}.mp3`])),
  ...Object.fromEntries(lines.map((line) => [line.id, `voice/${line.file}`])),
};
const inspections = new Map(lines.filter((line) => line.id.startsWith('look-')).map((line) => [line.text, line.id]));
const buffers = new Map();
const pending = new Map();
const failed = new Map();
const loops = new Map();
const loopRequests = new Map();
const effects = new Set();
const seen = new Set();
const ducks = new Set();
const plays = {};
const lastPans = {};
let ctx = null;
let master = null;
let meter = null;
let soundOn = true;
let unlocked = false;
let pageActive = !document.hidden;
let scene = 'select';
let epoch = 0;
let voiceVersion = 0;
let voice = null;
let voiceTimer = 0;
let voiceWatchdog = 0;
let hintTimer = 0;
let stepDistance = 0;
let stepIndex = 0;
let lastStep = -1;

function ensure() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = soundOn && pageActive ? 1 : 0;
    if (import.meta.env.DEV) {
      meter = ctx.createAnalyser();
      meter.fftSize = 256;
      master.connect(meter).connect(ctx.destination);
    } else master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
  return ctx;
}

const audible = () => !!ctx && unlocked && soundOn && pageActive;

async function load(key) {
  if (buffers.has(key)) return buffers.get(key);
  if (pending.has(key)) return pending.get(key);
  if (!ensure() || !files[key] || (failed.has(key) && Date.now() - failed.get(key) < 10000)) return null;
  const audioContext = ctx;
  const promise = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/${files[key]}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Audio ${key}: ${response.status}`);
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      buffers.set(key, buffer);
      failed.delete(key);
      return buffer;
    } catch {
      failed.set(key, Date.now());
      return null; // Sound never blocks loading or gameplay.
    } finally {
      clearTimeout(timeout);
      pending.delete(key);
    }
  })();
  pending.set(key, promise);
  return promise;
}

export function unlock() {
  if (!ensure()) return;
  unlocked = true;
  if (ctx.state === 'suspended' && soundOn && pageActive) ctx.resume().catch(() => {});
  if (!soundOn || !pageActive) return;
  // Fetch/decode while the player is browsing the globe, before the first hint.
  for (const key of Object.keys(files)) void load(key);
  syncLoops();
}

export const isSoundOn = () => soundOn;

function ramp(gain, value, seconds = 0.12) {
  gain.gain.cancelScheduledValues(ctx.currentTime);
  gain.gain.setTargetAtTime(value, ctx.currentTime, seconds);
}

function desiredLoops() {
  if (!audible()) return {};
  const music = { select: 0.13, earth: 0.11, flying: 0.055, street: 0.19, inspect: 0.09, result: 0.13 }[scene] || 0;
  const duck = ducks.size ? 0.24 : 1;
  return {
    ...(music ? { music: music * duck } : {}),
    ...(['street', 'result', 'inspect'].includes(scene) ? { crowd: (scene === 'street' ? 0.14 : scene === 'inspect' ? 0.06 : 0.08) * duck } : {}),
  };
}

function stopLoop(key) {
  const item = loops.get(key);
  if (!item) return;
  loops.delete(key);
  try { item.source.stop(); } catch { /* already ended */ }
  item.source.disconnect();
  item.gain.disconnect();
}

function syncLoops() {
  const wanted = desiredLoops();
  for (const key of loops.keys()) if (!(key in wanted)) stopLoop(key);
  for (const [key, volume] of Object.entries(wanted)) {
    const existing = loops.get(key);
    if (existing) {
      ramp(existing.gain, volume);
      continue;
    }
    if (loopRequests.get(key) === epoch) continue;
    const token = epoch;
    loopRequests.set(key, token);
    void load(key).then((buffer) => {
      if (!buffer || token !== epoch || !audible() || !(key in desiredLoops()) || loops.has(key)) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0;
      source.connect(gain).connect(master);
      source.start();
      loops.set(key, { source, gain });
      ramp(gain, desiredLoops()[key]);
    }).finally(() => {
      if (loopRequests.get(key) === token) loopRequests.delete(key);
    });
  }
}

function duck(reason, on) {
  if (on) ducks.add(reason);
  else ducks.delete(reason);
  syncLoops();
}

function track(source, nodes) {
  const item = { source, nodes };
  effects.add(item);
  source.onended = () => {
    effects.delete(item);
    source.disconnect();
    for (const node of nodes) node.disconnect();
  };
  return source;
}

function stopEffects() {
  for (const item of effects) {
    try { item.source.stop(); } catch { /* already ended */ }
  }
  effects.clear();
  clearTimeout(hintTimer);
  ducks.delete('hint');
}

export function stopVoice() {
  voiceVersion++;
  clearTimeout(voiceTimer);
  clearTimeout(voiceWatchdog);
  if (voice?.source) {
    try { voice.source.stop(); } catch { /* already ended */ }
  }
  voice = null;
  duck('voice', false);
}

function invalidate() {
  epoch++;
  stepDistance = 0;
  stopEffects();
  stopVoice();
}

export function setSound(on) {
  soundOn = !!on;
  if (!soundOn) invalidate();
  if (master) ramp(master, soundOn && pageActive ? 1 : 0, 0.008);
  if (soundOn && unlocked) unlock();
  syncLoops();
}

export function setPageActive(on) {
  if (pageActive === !!on) return;
  pageActive = !!on;
  if (!pageActive) invalidate();
  if (master) ramp(master, soundOn && pageActive ? 1 : 0, 0.008);
  if (pageActive && unlocked && soundOn && ctx?.state === 'suspended') ctx.resume().catch(() => {});
  syncLoops();
}

export function setScene(next) {
  if (scene === next) return;
  scene = next;
  invalidate();
  syncLoops();
}

export function resetRound() {
  invalidate();
  seen.clear();
  stepIndex = 0;
  syncLoops();
}

function sample(key, { volume = 1, pan = 0, at = 0, rate = 1, buffer = buffers.get(key) } = {}) {
  if (!audible() || !buffer) return null;
  try {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = volume;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(gain).connect(panner).connect(master);
    track(source, [gain, panner]).start(ctx.currentTime + at);
    if (import.meta.env.DEV) {
      plays[key] = (plays[key] || 0) + 1;
      lastPans[key] = panner.pan.value;
    }
    return source;
  } catch { return null; }
}

function tone(f0, f1, duration, type, volume, at = 0) {
  if (!audible()) return;
  try {
    const time = ctx.currentTime + at;
    const source = ctx.createOscillator();
    const gain = ctx.createGain();
    source.type = type;
    source.frequency.setValueAtTime(f0, time);
    source.frequency.exponentialRampToValueAtTime(f1, time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(gain).connect(master);
    track(source, [gain]).start(time);
    source.stop(time + duration + 0.02);
  } catch { /* optional cue */ }
}

export const blip = () => tone(520, 700, 0.075, 'triangle', 0.065);
export const fanfare = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.48, 'triangle', 0.105, i * 0.14));
export const arrive = () => [440, 660].forEach((f, i) => tone(f, f, 0.28, 'sine', 0.07, i * 0.12));

export function warp() {
  if (!audible()) return;
  tone(100, 480, 1.6, 'sine', 0.045);
  try {
    const source = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2.3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(220, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(2400, ctx.currentTime + 1.7);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 1.5);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 2.3);
    source.connect(filter).connect(gain).connect(master);
    track(source, [filter, gain]).start();
  } catch { /* optional transition */ }
}

export function bark(pan = 0, twice = false) {
  if (!audible()) return;
  const token = epoch;
  const requested = performance.now();
  void load('dog').then((buffer) => {
    if (!buffer || token !== epoch || !audible() || performance.now() - requested > 1800) return;
    sample('dog', { buffer, pan, volume: 0.72 });
    if (twice) sample('dog', { buffer, pan, volume: 0.68, at: 0.86, rate: 1.025 });
  });
}

export function hint(pan) {
  if (!audible()) return;
  stopVoice();
  duck('hint', true);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => duck('hint', false), 2400);
  bark(pan, true);
}

export function speak(id, { delay = 0, inspection = false } = {}) {
  if (!audible() || !files[id] || (inspection && voice)) return false;
  stopVoice();
  const version = voiceVersion;
  const token = epoch;
  voice = { id, inspection, source: null };
  duck('voice', true);
  const finish = () => {
    if (version !== voiceVersion) return;
    clearTimeout(voiceWatchdog);
    voice = null;
    duck('voice', false);
  };
  voiceTimer = setTimeout(async () => {
    const buffer = await load(id);
    if (version !== voiceVersion || token !== epoch || !audible()) return;
    if (buffer) {
      const source = sample(id, { buffer, volume: 0.94 });
      if (!source) return finish();
      voice.source = source;
      source.addEventListener('ended', finish, { once: true });
      voiceWatchdog = setTimeout(finish, (buffer.duration + 1) * 1000);
    } else finish(); // The visible dialogue remains usable if a recording cannot load.
  }, delay);
  return true;
}

export function observe(info) {
  if (!info || !audible() || scene !== 'street' || seen.has(info.key)) return;
  const id = info.dog ? 'xiaonian-found' : inspections.get(info.text);
  if (!id || !speak(id, { inspection: true, delay: info.dog ? 650 : 250 })) return;
  seen.add(info.key);
  if (info.dog) bark();
}

export function describeObject(text) {
  const id = inspections.get(text);
  if (id) speak(id, { delay: 200 });
}

export function updateFootsteps(dt, speed, crouch = false) {
  if (!audible() || scene !== 'street' || speed < 0.05) {
    stepDistance = 0;
    return;
  }
  stepDistance += Math.min(dt, 0.1) * speed;
  const stride = speed > 3 ? 1.05 : crouch ? 0.64 : 0.85;
  if (stepDistance < stride || ctx.currentTime - lastStep < 0.19) return;
  stepDistance %= stride;
  lastStep = ctx.currentTime;
  const key = `step${stepIndex++ % 5}`;
  sample(key, { volume: crouch ? 0.17 : speed > 3 ? 0.48 : 0.33, rate: 0.97 + Math.random() * 0.06 });
}

/** Development QA can inspect actual playback without changing the production UI. */
export function getAudioState() {
  const waveform = new Float32Array(meter?.fftSize || 0);
  meter?.getFloatTimeDomainData(waveform);
  const rms = waveform.length ? Math.sqrt(waveform.reduce((sum, value) => sum + value * value, 0) / waveform.length) : 0;
  return {
    scene, soundOn, unlocked, pageActive, context: ctx?.state || 'none',
    loaded: [...buffers.keys()], failed: [...failed.keys()], loops: [...loops.keys()],
    effects: effects.size, voice: voice?.id || null, seen: [...seen], ducked: ducks.size > 0, rms,
    plays: { ...plays }, lastPans: { ...lastPans },
    gains: Object.fromEntries([...loops].map(([key, value]) => [key, value.gain.gain.value])),
  };
}
