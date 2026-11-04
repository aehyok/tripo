import 'cesium/Build/Cesium/Widgets/widgets.css';
import './styles.css';
import * as Cesium from 'cesium';

import { ASSETS, LEVELS, TUNING } from './config.js';
import { EarthScene } from './scenes/earth.js';
import { StreetScene } from './scenes/street.js';
import { dogThumbnail } from './ui/dogArt.js';
import { getProgress, updateProgress, recordClear } from './core/progress.js';
import { runTweens, REDUCED } from './core/tween.js';
import { JourneyEffects } from './core/journey.js';
import * as sfx from './core/audio.js';
import {
  $, fmtTime, toast, showScreen, iris, irisInstant,
  loadingStart, loadingReady, loadingFail, onRetry,
  bindSoundButtons, syncSoundButtons,
} from './core/ui.js';

const COARSE = window.matchMedia('(pointer: coarse)').matches;

let viewer = null;
let earth = null;
let street = null;
let journey = null;

const app = {
  mode: 'boot',
  round: 0,
  viewer: null,
  earth: null,
  street: null,
  progress: getProgress(),
  nearTarget: null,
  resultTimer: 0,
  lastTimer: '',
  streetReady: false,
};

/* ---------- 选关页 ---------- */
function renderFlags() {
  const p = app.progress;
  const stars = p.stars || 0;
  $('flags').innerHTML = LEVELS.map((lv, i) => {
    const open = lv.state === 'open';
    const state = open
      ? p.done
        ? `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} · 再玩一次`
        : '点击开始'
      : '制作中';
    return `<li><button class="flag ${open ? 'open' : 'locked'}" data-i="${i}"
      aria-label="第 ${i + 1} 关，${lv.nation}，${lv.where}，${state}">
      <span class="no">${i + 1}</span>
      <span class="nation">${lv.nation}</span>
      <span class="where">${lv.where}</span>
      <span class="state">${state}</span></button></li>`;
  }).join('');
}

$('flags').addEventListener('click', (e) => {
  const btn = e.target.closest('.flag');
  if (!btn) return;
  sfx.unlock();
  const i = Number(btn.dataset.i);
  if (i !== 0) {
    btn.classList.remove('shake');
    void btn.offsetWidth;
    btn.classList.add('shake');
    toast('当前版本仅开放第一关。');
    return;
  }
  sfx.blip();
  enterEarth();
});

/* ---------- 地球 ---------- */
function updateEarthLine() {
  const done = app.progress.done;
  $('earthLine').textContent = done
    ? '墨西哥点亮了！点击发光区域，再次挑战第一关。'
    : '小年，墨西哥的球迷街传来了求助。点击发光区域，去看看吧。';
  $('earthDone').hidden = !done;
  $('earthBack').hidden = done;
}

async function enterEarth() {
  if (app.mode !== 'select') return;
  app.mode = 'earth';
  const token = ++app.round;
  showScreen('earth');
  earth.setCompleted(app.progress.done);
  updateEarthLine();
  earth.setControlsEnabled(true);
  sfx.unlock();
  await earth.flyToRegion();
  if (token !== app.round) return;
}

function toSelect() {
  if (app.mode === 'select' || app.mode === 'street' || app.mode === 'result') return;
  app.round++;
  earth.cancelFlight();
  journey.stop();
  // 取消进场时同时使旧遮罩动画失效，并立即恢复选关画面。
  irisInstant(true);
  app.mode = 'select';
  setGlobeVisible(true);
  earth.setCompleted(app.progress.done);
  earth.setControlsEnabled(false);
  showScreen('select');
  renderFlags();
  hideTip();
  sfx.blip();
  earth.goSelectView();
}

/* ---------- 街区 ---------- */
function streetHooks() {
  return {
    onNear(info) {
      app.nearTarget = info?.target || null;
      renderNear(info);
    },
    onTick(ms) {
      const t = fmtTime(ms);
      if (t !== app.lastTimer) {
        app.lastTimer = t;
        $('timer').textContent = t;
      }
    },
    onFirstMove() {
      $('coach').hidden = true;
    },
    onCrouch(on) {
      const btn = $('crouch');
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? '站' : '蹲';
    },
    onFound(result) {
      handleFound(result);
    },
  };
}

async function ensureStreet() {
  if (app.streetReady) return;
  loadingStart('正在前往球迷街…');
  await street.build();
  app.streetReady = true;
}

function resetStreetUI() {
  $('timer').textContent = '00:00';
  app.lastTimer = '00:00';
  $('hint').hidden = true;
  $('coach').hidden = true;
  $('near').hidden = true;
  $('takeDog').hidden = true;
  $('stick').hidden = true;
  $('crouch').hidden = true;
  syncHintButton();
}

function syncHintButton() {
  const left = street ? street.hintState.left : TUNING.hintsPerRound;
  const btn = $('hint');
  btn.textContent = left ? `听叫声（剩 ${left} 次）` : '提示用完了';
  btn.disabled = left <= 0;
}

async function enterStreet() {
  if (app.mode !== 'earth') return;
  app.mode = 'flying';
  const token = ++app.round;
  sfx.blip();
  hideTip();

  journey.start();
  let irisClosing = null;
  const landed = await earth.flyToAnchor((progress) => {
    journey.setProgress(progress);
    /* 最后进近时同步收拢虹膜，用遮罩衔接云层与街区，避免落地后再次黑屏。 */
    if (!REDUCED && progress >= 0.8 && !irisClosing) irisClosing = iris(false, 320);
  });
  if (token !== app.round) return;
  if (!landed) {
    if (irisClosing) await iris(true, 160);
    journey.stop();
    earth.setControlsEnabled(true);
    app.mode = 'earth';
    return;
  }

  if (irisClosing) await irisClosing;
  else await iris(false, 260);
  if (token !== app.round) return;

  setGlobeVisible(false);
  try {
    await ensureStreet();
  } catch (err) {
    console.error('街区构建失败', err);
    journey.stop();
    loadingFail('街区资源加载失败，请刷新页面重试。');
    app.mode = 'error';
    return;
  }
  loadingReady();
  if (token !== app.round) return;

  street.enterRound();
  showScreen('street');
  resetStreetUI();
  // 从街区上空轻轻落入跟随视角，遮罩揭开后仍有真实的镜头运动。
  const camera = viewer.camera;
  const destination = Cesium.Cartesian3.clone(camera.positionWC);
  const orientation = {
    direction: Cesium.Cartesian3.clone(camera.directionWC),
    up: Cesium.Cartesian3.clone(camera.upWC),
  };
  if (!REDUCED) {
    const offset = Cesium.Matrix4.multiplyByPointAsVector(street.frame, new Cesium.Cartesian3(7, 5, 15), new Cesium.Cartesian3());
    camera.setView({ destination: Cesium.Cartesian3.add(destination, offset, new Cesium.Cartesian3()), orientation });
  }
  journey.arrive();
  await Promise.all([
    iris(true, 650),
    new Promise((resolve) => camera.flyTo({
      destination, orientation, duration: REDUCED ? 0 : 1.2,
      easingFunction: Cesium.EasingFunction.CUBIC_OUT,
      complete: resolve, cancel: resolve,
    })),
  ]);
  if (token !== app.round) return;

  journey.stop();
  app.mode = 'street';
  showTask();
}

function showTask() {
  $('task').hidden = false;
  $('startFind').focus({ preventScroll: true });
}

function beginFind() {
  $('task').hidden = true;
  $('hint').hidden = false;
  $('stick').hidden = !COARSE;
  $('crouch').hidden = !COARSE;
  $('coach').hidden = false;
  $('coach').textContent = COARSE ? '左下摇杆移动，拖动画面转视角' : 'WASD 移动（双击方向键奔跑），按住鼠标拖动转视角，C 蹲下';
  syncHintButton();
  app.mode = 'street';
  street.beginPlay();
  sfx.crowdOn(true);
  sfx.bark(0);
}

async function leaveStreet() {
  if (app.mode !== 'street' && app.mode !== 'result') return;
  app.mode = 'leaving';
  journey.stop();
  const token = ++app.round;
  sfx.blip();
  clearResultTimer();
  hideResult();
  $('task').hidden = true;
  $('coach').hidden = true;
  $('near').hidden = true;
  $('takeDog').hidden = true;
  street.exit();
  sfx.crowdOn(false);

  await iris(false, 380);
  if (token !== app.round) return;

  setGlobeVisible(true);
  showScreen('earth');
  earth.setControlsEnabled(true);
  earth.setCompleted(app.progress.done);
  updateEarthLine();
  app.mode = 'earth';
  await iris(true, 420);
  if (token !== app.round) return;
  await earth.flyBack();
}

function replay() {
  if (app.mode !== 'result') return;
  sfx.blip();
  clearResultTimer();
  hideResult();
  $('result').hidden = true;
  street.enterRound();
  resetStreetUI();
  beginFind();
}

/* ---------- 找到吉拿 ---------- */
function clearResultTimer() {
  if (app.resultTimer) {
    clearTimeout(app.resultTimer);
    app.resultTimer = 0;
  }
}

function handleFound({ ms, hints, stars }) {
  const token = ++app.round;
  app.mode = 'result';
  app.progress = recordClear(stars);
  renderFlags();
  sfx.bark(0);
  sfx.fanfare();
  burstConfetti();
  $('hint').hidden = true;
  $('coach').hidden = true;
  $('stick').hidden = true;
  $('crouch').hidden = true;
  $('near').hidden = true;
  $('takeDog').hidden = true;

  clearResultTimer();
  app.resultTimer = setTimeout(() => {
    if (token !== app.round) return;
    $('stars').innerHTML = '★'.repeat(stars) + `<i>${'★'.repeat(3 - stars)}</i>`;
    $('stars').setAttribute('aria-label', `获得 ${stars} 颗星`);
    $('resTime').textContent = fmtTime(ms);
    $('resHint').textContent = `${hints} 次`;
    $('resBest').textContent = `${app.progress.stars} 星`;
    $('resNote').textContent = stars === 3
      ? '满星通关：60 秒内找到，且没有用提示。'
      : stars === 2
        ? '3 星条件：60 秒内找到，且不用提示。'
        : '2 星条件：120 秒内找到，提示最多 1 次。';
    $('result').hidden = false;
    $('again').focus({ preventScroll: true });
  }, 1700);
}

function hideResult() {
  $('result').hidden = true;
}

/* ---------- 附近提示 ---------- */
function renderNear(info) {
  const el = $('near');
  const take = $('takeDog');
  if (!info) {
    el.hidden = true;
    take.hidden = true;
    return;
  }
  $('nearText').textContent = info.text;
  take.hidden = !info.dog || !street.s.playing;
  if (!info.target) {
    el.hidden = true;
    return;
  }
  const world = street.localPoint(info.target);
  const cam = viewer.camera;
  const toPoint = Cesium.Cartesian3.subtract(world, cam.positionWC, new Cesium.Cartesian3());
  const inFront = Cesium.Cartesian3.dot(toPoint, cam.directionWC) > 0;
  if (!inFront) {
    el.hidden = true;
    return;
  }
  const win = Cesium.SceneTransforms.worldToWindowCoordinates(viewer.scene, world);
  if (!win || !Number.isFinite(win.x) || !Number.isFinite(win.y)) {
    el.hidden = true;
    return;
  }
  const W = window.innerWidth;
  const H = window.innerHeight;
  el.hidden = false;
  const halfW = el.offsetWidth / 2 + 8;
  const left = Math.max(halfW, Math.min(W - halfW, win.x));
  const top = Math.max(el.offsetHeight + 96, Math.min(H - 24, win.y - 10));
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/* ---------- 彩纸 ---------- */
function burstConfetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cols = ['#e5127d', '#ffb31a', '#1cc0c9', '#12a66a', '#fff4dc'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  document.body.appendChild(layer);
  for (let i = 0; i < 70; i++) {
    const p = document.createElement('i');
    const size = 6 + Math.random() * 8;
    p.style.cssText = `left:${50 + (Math.random() - 0.5) * 26}%;top:${40 + Math.random() * 12}%;
      width:${size}px;height:${size * 1.3}px;background:${cols[i % 5]};
      animation-delay:${Math.random() * 0.18}s;animation-duration:${1.1 + Math.random() * 0.9}s;
      --dx:${(Math.random() - 0.5) * 420}px;--rot:${Math.random() * 720 - 360}deg;`;
    layer.appendChild(p);
  }
  setTimeout(() => layer.remove(), 2400);
}

/* ---------- 地球指针交互 ---------- */
function hideTip() {
  $('tip').hidden = true;
  if (viewer) viewer.canvas.style.cursor = '';
}

/** 街区是悬在地球上方的独立场景，进入后隐藏地球避免远处地表穿帮 */
function setGlobeVisible(on) {
  if (viewer) viewer.scene.globe.show = on;
}

function bindEarthPointer() {
  const canvas = viewer.canvas;
  let down = null;
  const overviewPointers = new Set();

  const releaseOverview = (e) => {
    if (!overviewPointers.delete(e.pointerId)) return;
    earth.setInteracting(overviewPointers.size > 0);
    if (!overviewPointers.size) canvas.style.cursor = '';
  };
  // 在卡片或画布外松手，也要结束拖动，避免自转一直暂停。
  window.addEventListener('pointerup', releaseOverview);
  window.addEventListener('pointercancel', releaseOverview);
  window.addEventListener('blur', () => {
    overviewPointers.clear();
    earth.setInteracting(false);
    canvas.style.cursor = '';
  });
  canvas.addEventListener('wheel', () => {
    if (app.mode === 'select') earth.setInteracting(overviewPointers.size > 0);
  }, { passive: true });

  canvas.addEventListener('pointerdown', (e) => {
    if (app.mode === 'select') {
      overviewPointers.add(e.pointerId);
      earth.setInteracting(true);
      canvas.style.cursor = 'grabbing';
      return;
    }
    if (app.mode !== 'earth') return;
    down = { x: e.clientX, y: e.clientY };
  });

  canvas.addEventListener('pointerup', (e) => {
    if (app.mode !== 'earth' || !down) {
      down = null;
      return;
    }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 8) return;
    if (earth.pickRegion(e.clientX, e.clientY, COARSE ? 32 : 22)) enterStreet();
  });

  canvas.addEventListener('pointercancel', () => {
    down = null;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (app.mode === 'select') {
      canvas.style.cursor = overviewPointers.size ? 'grabbing' : 'grab';
      return;
    }
    if (app.mode !== 'earth' || e.pointerType !== 'mouse') return;
    const on = earth.pickRegion(e.clientX, e.clientY, 18);
    canvas.style.cursor = on ? 'pointer' : 'grab';
    const tip = $('tip');
    tip.hidden = !on;
    if (on) {
      tip.innerHTML = '<b>墨西哥</b> · 北美洲 · 球迷狂欢';
      tip.style.left = `${e.clientX}px`;
      tip.style.top = `${e.clientY}px`;
    }
  });

  canvas.addEventListener('pointerleave', hideTip);
}

/* ---------- 启动 ---------- */
function createViewer() {
  const credit = document.createElement('div');
  credit.style.display = 'none';
  document.body.appendChild(credit);
  return new Cesium.Viewer('cesium', {
    baseLayer: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    creditContainer: credit,
    contextOptions: { webgl: { alpha: false, antialias: true } },
  });
}

let lastFrame = performance.now();

function startLoop() {
  viewer.scene.preRender.addEventListener(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    runTweens(dt);
    if (app.mode === 'select' || app.mode === 'earth' || app.mode === 'flying') earth.update(dt);
    if (app.mode === 'street' || app.mode === 'result' || app.mode === 'leaving') street.update(dt, now);
    journey.update(now);
  });
}

async function boot() {
  loadingStart('正在准备地球…');
  onRetry(() => location.reload());

  try {
    viewer = createViewer();
  } catch (err) {
    console.error('3D 初始化失败', err);
    loadingFail('3D 画面加载失败。请确认浏览器支持 WebGL，然后刷新页面。');
    return;
  }

  viewer.scene.renderError.addEventListener((scene, error) => {
    console.error('渲染错误', error);
    loadingFail('3D 渲染出错，请刷新页面重试。');
  });

  earth = new EarthScene(viewer);
  street = new StreetScene(viewer, streetHooks());
  journey = new JourneyEffects(viewer);
  app.earth = earth;
  app.street = street;
  app.viewer = viewer;

  try {
    await earth.init();
  } catch (err) {
    console.error('地球初始化失败', err);
    loadingFail('地球资源加载失败，请刷新页面重试。');
    return;
  }

  earth.setControlsEnabled(false);
  earth.setCompleted(app.progress.done);
  earth.goSelectView(true);

  const thumb = $('thumb');
  thumb.onerror = () => {
    thumb.onerror = null;
    thumb.src = dogThumbnail();
  };
  thumb.src = ASSETS.dog.card || dogThumbnail();
  renderFlags();
  street.bindInput();
  street.bindJoystick($('stick'), $('knob'));
  bindEarthPointer();
  bindSoundButtons((on) => {
    app.progress = updateProgress({ sound: on });
    if (on) sfx.crowdOn(app.mode === 'street' || app.mode === 'result');
    else sfx.crowdOn(false);
  });
  sfx.setSound(app.progress.sound);
  syncSoundButtons();

  $('earthBack').addEventListener('click', toSelect);
  $('earthDone').addEventListener('click', toSelect);
  $('streetBack').addEventListener('click', leaveStreet);
  $('startFind').addEventListener('click', beginFind);
  $('hint').addEventListener('click', useHint);
  $('takeDog').addEventListener('click', () => street.tryConfirm());
  $('crouch').addEventListener('click', () => street.toggleCrouch());
  $('again').addEventListener('click', replay);
  $('toEarth').addEventListener('click', leaveStreet);

  startLoop();
  irisInstant(false);
  app.mode = 'select';
  loadingReady();
  await iris(true, 700);
  window.__hqReady = true;

  /* 调试接口：仅开发环境可用，便于自动化验收 */
  if (import.meta.env.DEV) {
    window.__hq = {
      app, viewer, earth, street, Cesium, enterEarth, enterStreet, leaveStreet, toSelect, beginFind, replay, useHint,
    };
  }
}

function useHint() {
  if (app.mode !== 'street' || !street.s.playing) return;
  const r = street.useHint();
  if (!r) {
    toast('提示已经用完了，继续找找看。');
    return;
  }
  syncHintButton();
  sfx.bark(r.pan);
  toast(r.text, 3000);
}

window.addEventListener('error', (e) => {
  console.error('未捕获错误', e.error || e.message);
});

boot();
