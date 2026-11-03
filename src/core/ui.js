import { tween, REDUCED } from './tween.js';
import { isSoundOn, setSound, unlock } from './audio.js';

export const $ = (id) => document.getElementById(id);

export const fmtTime = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/* ---------- 提示条 ---------- */
let toastTimer = 0;
export function toast(text, ms = 2600) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, ms);
}

export function hideToast() {
  clearTimeout(toastTimer);
  $('toast').hidden = true;
}

/* ---------- 屏幕切换 ---------- */
const SCREENS = [
  ['select', 'select'],
  ['earthUI', 'earth'],
  ['streetUI', 'street'],
];

export function showScreen(name) {
  for (const [id, key] of SCREENS) $(id).hidden = name !== key;
}

/* ---------- 圈入圈出转场 ---------- */
let irisToken = 0;
/**
 * @param {boolean} open true 表示揭开画面（圆收缩到 0），false 表示遮住画面（圆放大到 150）
 */
export function iris(open, ms = 460) {
  const token = ++irisToken;
  return new Promise((resolve) => {
    const el = $('iris');
    const from = open ? 150 : 0;
    const to = open ? 0 : 150;
    if (REDUCED) {
      el.style.clipPath = `circle(${to}% at 50% 50%)`;
      resolve();
      return;
    }
    tween(ms, (k) => {
      if (token !== irisToken) return;
      el.style.clipPath = `circle(${from + (to - from) * k}% at 50% 50%)`;
    }, resolve);
  });
}

export function irisInstant(open) {
  irisToken++;
  $('iris').style.clipPath = `circle(${open ? 0 : 150}% at 50% 50%)`;
}

/* ---------- 加载遮罩：超过 15 秒提示“加载较慢”，就绪后必定移除 ---------- */
const SLOW_MS = 15000;
let slowTimer = 0;

export function loadingStart(text = '正在准备地球…') {
  const el = $('loading');
  el.hidden = false;
  el.classList.remove('is-done');
  $('loadingText').textContent = text;
  $('loadingSlow').hidden = true;
  clearTimeout(slowTimer);
  slowTimer = setTimeout(() => {
    if (!el.classList.contains('is-done')) $('loadingSlow').hidden = false;
  }, SLOW_MS);
}

export function loadingText(text) {
  $('loadingText').textContent = text;
}

export function loadingReady() {
  const el = $('loading');
  clearTimeout(slowTimer);
  $('loadingSlow').hidden = true;
  if (el.hidden) return;
  el.classList.add('is-done');
  setTimeout(() => {
    el.hidden = true;
  }, REDUCED ? 0 : 520);
}

export function loadingFail(message) {
  clearTimeout(slowTimer);
  $('loading').hidden = true;
  const el = $('fail');
  if (message) el.querySelector('p').textContent = message;
  el.hidden = false;
}

export function onRetry(fn) {
  $('loadingRetry').addEventListener('click', fn);
}

/* ---------- 声音开关 ---------- */
export function syncSoundButtons() {
  const on = isSoundOn();
  document.querySelectorAll('.sound').forEach((b) => {
    b.textContent = `声音：${on ? '开' : '关'}`;
    b.setAttribute('aria-pressed', String(on));
  });
}

export function bindSoundButtons(onChange) {
  document.querySelectorAll('.sound').forEach((b) =>
    b.addEventListener('click', () => {
      unlock();
      setSound(!isSoundOn());
      syncSoundButtons();
      onChange?.(isSoundOn());
    }),
  );
  syncSoundButtons();
}
