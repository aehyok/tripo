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
import { ObjectInspector } from './ui/objectInspector.js';
import * as sfx from './core/audio.js';
import {
  $, fmtTime, toast, hideToast, showScreen, iris, irisInstant,
  loadingStart, loadingReady, loadingFail, onRetry,
  bindSoundButtons, syncSoundButtons,
} from './core/ui.js';

const COARSE = window.matchMedia('(pointer: coarse)').matches;
// 暂时关闭物品近景入口与交互，保留实现以便后续恢复。
const OBJECT_INSPECTION_ENABLED = false;

let viewer = null;
let earth = null;
let street = null;
let journey = null;
let inspector = null;

const app = {
  mode: 'boot',
  round: 0,
  viewer: null,
  earth: null,
  street: null,
  progress: getProgress(),
  nearTarget: null,
  nearInspectable: null,
  resultTimer: 0,
  lastTimer: '',
  streetReady: false,
};

/* ---------- 选关页 ---------- */
function renderFlags() {
  const p = app.progress;
  const stars = p.stars || 0;
  const playIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4.5 15 10l-8 5.5Z" fill="currentColor"/></svg>';
  const lockIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4.5" y="8.5" width="11" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  $('flags').innerHTML = LEVELS.map((lv, i) => {
    const open = lv.state === 'open';
    const state = open ? p.done ? '再玩一次' : '点击开始' : '制作中';
    return `<li class="${open ? 'is-open' : 'is-locked'}">
      ${open ? '<span class="flag-availability">现已开放</span>' : ''}
      <button type="button" class="flag ${open ? 'open' : 'locked'}" data-i="${i}" data-country="${lv.country}" ${open ? '' : 'disabled'}
      aria-label="第 ${i + 1} 关，${lv.nation}，${lv.where}，${state}">
      <img class="flag-art" src="${import.meta.env.BASE_URL}assets/ui/flags/${lv.country}.svg" alt="" aria-hidden="true" draggable="false">
      <span class="no">${i + 1}</span>
      <span class="nation">${lv.nation}</span>
      <span class="where">${lv.where}</span>
      ${open && p.done ? `<span class="flag-best" aria-label="最佳成绩 ${stars} 星">最佳 ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>` : ''}
      <span class="state">${open ? playIcon : lockIcon}${state}${open ? '<span class="flag-arrow" aria-hidden="true">→</span>' : ''}</span></button></li>`;
  }).join('');
}

$('flags').addEventListener('click', (e) => {
  const btn = e.target.closest('.flag');
  if (!btn || btn.disabled) return;
  sfx.unlock();
  if (LEVELS[Number(btn.dataset.i)]?.state !== 'open') return;
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
  sfx.setScene('earth');
  earth.setCompleted(app.progress.done);
  updateEarthLine();
  sfx.speak(app.progress.done ? 'mo-complete' : 'mo-intro', { delay: 300 });
  earth.setControlsEnabled(true);
  sfx.unlock();
  await earth.flyToRegion();
  if (token !== app.round) return;
}

function toSelect() {
  if (app.mode === 'select' || app.mode === 'street' || app.mode === 'result' || app.mode === 'inspect') return;
  app.round++;
  earth.cancelFlight();
  journey.stop();
  // 取消进场时同时使旧遮罩动画失效，并立即恢复选关画面。
  irisInstant(true);
  app.mode = 'select';
  sfx.setScene('select');
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
      app.nearInspectable = info?.inspectable || null;
      renderNear(info);
      sfx.observe(info);
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
  $('nearInspect').hidden = true;
  app.nearInspectable = null;
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
  sfx.setScene('flying');
  const token = ++app.round;
  sfx.blip();
  hideTip();

  journey.start();
  sfx.warp();
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
    sfx.setScene('earth');
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
    sfx.setScene('error');
    return;
  }
  loadingReady();
  if (token !== app.round) return;

  street.enterRound();
  sfx.resetRound();
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
  sfx.arrive();
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
  sfx.setScene('street');
  showTask();
}

function showTask() {
  $('task').hidden = false;
  sfx.speak('lupe-task', { delay: 200 });
  $('startFind').focus({ preventScroll: true });
}

function beginFind() {
  sfx.stopVoice();
  $('task').hidden = true;
  $('hint').hidden = false;
  $('stick').hidden = !COARSE;
  $('crouch').hidden = !COARSE;
  $('coach').hidden = false;
  const movementGuide = COARSE ? '摇杆移动，拖动转视角' : 'WASD 移动（双击奔跑），拖动转视角，C 蹲下';
  $('coach').textContent = movementGuide + (OBJECT_INSPECTION_ENABLED ? '，点击物品放大查看' : '');
  syncHintButton();
  app.mode = 'street';
  street.beginPlay();
  sfx.setScene('street');
  sfx.speak('xiaonian-start');
}

async function leaveStreet(destination = 'earth') {
  if (app.mode === 'inspect') inspector.close();
  if (app.mode !== 'street' && app.mode !== 'result') return;
  app.mode = 'leaving';
  sfx.setScene('leaving');
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

  await iris(false, 380);
  if (token !== app.round) return;

  setGlobeVisible(true);
  earth.setCompleted(app.progress.done);
  if (destination === 'select') {
    app.mode = 'select';
    sfx.setScene('select');
    showScreen('select');
    renderFlags();
    hideTip();
    earth.goSelectView(true);
  } else {
    showScreen('earth');
    earth.setControlsEnabled(true);
    updateEarthLine();
    app.mode = 'earth';
    sfx.setScene('earth');
    sfx.speak(app.progress.done ? 'mo-complete' : 'mo-intro', { delay: 500 });
  }
  await iris(true, 420);
  if (token !== app.round) return;
  if (destination !== 'select') await earth.flyBack();
}

function replay() {
  if (app.mode !== 'result') return;
  sfx.blip();
  clearResultTimer();
  hideResult();
  $('result').hidden = true;
  street.enterRound();
  sfx.resetRound();
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
  sfx.setScene('result');
  app.progress = recordClear(stars);
  renderFlags();
  sfx.bark(0);
  sfx.fanfare();
  $('foundCelebration').hidden = false;
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
    $('foundCelebration').hidden = true;
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
    sfx.speak('lupe-thanks', { delay: 150 });
    $('again').focus({ preventScroll: true });
  }, 1700);
}

function hideResult() {
  $('result').hidden = true;
  $('foundCelebration').hidden = true;
  clearConfetti();
}

/* ---------- 附近提示 ---------- */
function renderNear(info) {
  const el = $('near');
  const take = $('takeDog');
  $('nearInspect').hidden = !OBJECT_INSPECTION_ENABLED || !info?.inspectable;
  if (OBJECT_INSPECTION_ENABLED && info?.inspectable) $('nearInspect').setAttribute('aria-label', `放大查看${info.inspectable.title}`);
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

/* ---------- 物品放大查看 ---------- */
function openInspection(item) {
  if (!OBJECT_INSPECTION_ENABLED) return;
  if (app.mode !== 'street' || !street.s.playing || !$('task').hidden || !item) return;
  if (!inspector.inReach(item)) {
    toast('走近物品后，再点击查看。');
    return;
  }
  hideToast();
  try {
    if (!inspector.open(item)) return;
  } catch (error) {
    console.error('物品查看失败', error);
    inspector.close();
    toast('暂时无法查看这个物品，请稍后再试。');
    return;
  }
  street.pauseTimer();
  street.s.playing = false;
  street.clearInput();
  app.inspectCoachHidden = $('coach').hidden;
  app.inspectControls = ['hint', 'stick', 'crouch', 'takeDog'].map((id) => [id, $(id).hidden]);
  for (const [id] of app.inspectControls) $(id).hidden = true;
  app.mode = 'inspect';
  $('coach').hidden = true;
  $('near').hidden = true;
  sfx.setScene('inspect');
  sfx.blip();
  sfx.describeObject(item.spec.say);
}

function endInspection() {
  if (app.mode !== 'inspect') return;
  street.clearInput();
  street.s.playing = true;
  if (!document.hidden) street.resumeTimer();
  app.mode = 'street';
  for (const [id, hidden] of app.inspectControls) $(id).hidden = hidden;
  $('coach').hidden = app.inspectCoachHidden;
  viewer.canvas.style.cursor = 'grab';
  sfx.setScene('street');
}

function bindObjectInspection() {
  const canvas = viewer.canvas;
  let tap = null;
  let lastHover = 0;
  const canInspect = () => app.mode === 'street' && street.s.playing && $('task').hidden;
  canvas.addEventListener('pointerdown', (e) => {
    if (!canInspect() || e.button > 0) return;
    if (tap) { tap.multi = true; return; }
    tap = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, multi: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (tap?.id === e.pointerId && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
    if (!canInspect() || e.pointerType !== 'mouse' || tap || performance.now() - lastHover < 70) return;
    lastHover = performance.now();
    canvas.style.cursor = inspector.inReach(inspector.pick(e.clientX, e.clientY)) ? 'pointer' : 'grab';
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!tap || tap.id !== e.pointerId) return;
    const down = tap;
    tap = null;
    if (!canInspect() || down.multi || down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    openInspection(inspector.pick(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointercancel', () => { tap = null; });
  window.addEventListener('blur', () => { tap = null; });
  $('nearInspect').addEventListener('click', () => openInspection(app.nearInspectable));
}

/* ---------- 彩纸 ---------- */
let confettiLayer = null;
let confettiTimer = 0;

function clearConfetti() {
  clearTimeout(confettiTimer);
  confettiTimer = 0;
  confettiLayer?.remove();
  confettiLayer = null;
}

function burstConfetti() {
  clearConfetti();
  if (REDUCED) return;
  const cols = ['#e5127d', '#ffb31a', '#1cc0c9', '#12a66a', '#fff4dc'];
  const layer = document.createElement('div');
  layer.className = 'confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  confettiLayer = layer;
  document.body.appendChild(layer);
  // 两侧礼花分两轮向上散开，彩纸继续飘落到成绩页出现之后。
  const count = window.innerWidth < 600 ? 100 : 160;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    const side = i % 2 === 0 ? 1 : -1;
    const volley = i < count / 2 ? 0 : 0.55;
    const size = 6 + Math.random() * 8;
    p.style.cssText = `left:${side === 1 ? 8 : 92}%;top:65%;
      width:${size}px;height:${size * 1.3}px;background:${cols[i % 5]};
      border-radius:${i % 3 === 0 ? '50%' : '2px'};
      animation-delay:${volley + Math.random() * 0.2}s;animation-duration:${2.8 + Math.random() * 0.6}s;
      --dx:${side * (12 + Math.random() * 64)}vw;--rise:${-(25 + Math.random() * 38)}vh;
      --rot:${Math.random() * 1080 - 540}deg;`;
    layer.appendChild(p);
  }
  confettiTimer = setTimeout(clearConfetti, 4400);
}

/* ---------- 地球指针交互 ---------- */
function hideTip() {
  $('tip').hidden = true;
  if (viewer) viewer.canvas.style.cursor = '';
}

/** 街区是悬在地球上方的独立场景，进入后隐藏地球避免远处地表穿帮 */
function setGlobeVisible(on) {
  if (viewer) viewer.scene.globe.show = on;
  // Globe billboards must not float above the street when its camera is near the ground.
  if (earth?.regionPickables) for (const entity of earth.regionPickables) entity.show = on;
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
    sfx.updateFootsteps(dt, app.mode === 'street' && street.s.playing ? street.heroSpeed : 0, street.s.crouch);
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
    sfx.setScene('error');
    loadingFail('3D 渲染出错，请刷新页面重试。');
  });

  earth = new EarthScene(viewer);
  street = new StreetScene(viewer, streetHooks());
  journey = new JourneyEffects(viewer);
  if (OBJECT_INSPECTION_ENABLED) inspector = new ObjectInspector(viewer, street, endInspection);
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
  if (OBJECT_INSPECTION_ENABLED) bindObjectInspection();
  bindSoundButtons((on) => {
    app.progress = updateProgress({ sound: on });
    if (on && app.mode === 'street' && !$('task').hidden) sfx.speak('lupe-task');
    else if (on && app.mode === 'earth') sfx.speak(app.progress.done ? 'mo-complete' : 'mo-intro');
  });
  sfx.setSound(app.progress.sound);
  syncSoundButtons();
  document.addEventListener('pointerdown', sfx.unlock, { once: true });
  document.addEventListener('keydown', sfx.unlock, { once: true });
  document.addEventListener('visibilitychange', () => sfx.setPageActive(!document.hidden));
  window.addEventListener('blur', () => sfx.setPageActive(false));
  window.addEventListener('focus', () => sfx.setPageActive(!document.hidden));

  $('earthBack').addEventListener('click', toSelect);
  $('earthDone').addEventListener('click', toSelect);
  $('streetBack').addEventListener('click', leaveStreet);
  $('startFind').addEventListener('click', beginFind);
  $('hint').addEventListener('click', useHint);
  $('takeDog').addEventListener('click', () => street.tryConfirm());
  $('crouch').addEventListener('click', () => street.toggleCrouch());
  $('again').addEventListener('click', replay);
  $('resultToSelect').addEventListener('click', () => leaveStreet('select'));

  startLoop();
  irisInstant(false);
  app.mode = 'select';
  loadingReady();
  await iris(true, 700);
  window.__hqReady = true;

  /* 调试接口：仅开发环境可用，便于自动化验收 */
  if (import.meta.env.DEV) {
    window.__hq = {
      app, viewer, earth, street, Cesium, audio: sfx, inspector, openInspection, enterEarth, enterStreet, leaveStreet, toSelect, beginFind, replay, useHint,
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
  sfx.hint(r.pan);
  toast(r.text, 3000);
}

window.addEventListener('error', (e) => {
  console.error('未捕获错误', e.error || e.message);
});

boot();
