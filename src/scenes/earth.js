import * as Cesium from 'cesium';
import geo from '../data/world.json';
import { ANCHOR, REGION } from '../config.js';

const NIGHT = Cesium.Color.fromCssColorString('#161b4d');

/** 把原型地理数据（x = 经度 + 180，y = 90 - 纬度）还原成经纬度 */
function ringToPositions(ring) {
  const out = [];
  for (let i = 0; i < ring.length; i += 2) {
    const lon = ring[i] - 180;
    const lat = 90 - ring[i + 1];
    out.push(lon, lat);
  }
  return Cesium.Cartesian3.fromDegreesArray(out);
}

/** 本地简化底图：自绘风格化地球，不接入卫星影像，规避底图授权与国内访问问题 */
function paintGlobe(size) {
  const W = size;
  const H = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');

  c.fillStyle = '#1b3f9c';
  c.fillRect(0, 0, W, H);

  const s = W / 360;
  c.setTransform(s, 0, 0, s, 0, 0);

  c.strokeStyle = 'rgba(180,200,255,.13)';
  c.lineWidth = 0.12;
  for (let x = 0; x <= 360; x += 30) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 180);
    c.stroke();
  }
  for (let y = 0; y <= 180; y += 30) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(360, y);
    c.stroke();
  }

  c.beginPath();
  for (const ring of geo.land) {
    c.moveTo(ring[0], ring[1]);
    for (let i = 2; i < ring.length; i += 2) c.lineTo(ring[i], ring[i + 1]);
    c.closePath();
  }
  c.fillStyle = '#8c95dc';
  c.fill('evenodd');
  c.strokeStyle = '#c4c9f2';
  c.lineWidth = 0.1;
  c.stroke();

  return canvas;
}

function ringTexture(size, color, width) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.strokeStyle = color;
  c.lineWidth = width;
  c.beginPath();
  c.arc(size / 2, size / 2, size / 2 - width, 0, Math.PI * 2);
  c.stroke();
  return cv.toDataURL();
}

function dotTexture(size, color, core) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const r = size / 2;
  c.fillStyle = color;
  c.beginPath();
  c.arc(r, r, r * core, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#fff4dc';
  c.lineWidth = size * 0.06;
  c.beginPath();
  c.arc(r, r, r * core, 0, Math.PI * 2);
  c.stroke();
  return cv.toDataURL();
}

export class EarthScene {
  constructor(viewer) {
    this.viewer = viewer;
    this.mexEntities = [];
    this.dotEntities = [];
    this.completed = false;
    this.flightToken = 0;
    this.spin = true;
  }

  async init() {
    const { viewer } = this;
    const scene = viewer.scene;

    scene.backgroundColor = NIGHT;
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#1b3f9c');
    scene.globe.enableLighting = false;
    scene.globe.showGroundAtmosphere = true;
    scene.fog.enabled = false;
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.brightnessShift = -0.25;
    scene.sun.show = false;
    scene.moon.show = false;
    scene.highDynamicRange = true;

    const size = window.innerWidth < 760 || navigator.hardwareConcurrency <= 4 ? 2048 : 4096;
    const dataUrl = paintGlobe(size).toDataURL('image/png');
    const provider = await Cesium.SingleTileImageryProvider.fromUrl(dataUrl);
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(provider);

    this.buildRegion();
  }

  buildRegion() {
    const { viewer } = this;
    const highlight = Cesium.Color.fromCssColorString('#ffb31a').withAlpha(0.88);
    const outline = Cesium.Color.fromCssColorString('#fff4dc').withAlpha(0.95);

    for (const ring of geo.mex) {
      const positions = ringToPositions(ring);
      if (positions.length < 3) continue;
      const entity = viewer.entities.add({
        name: '墨西哥',
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: highlight,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      });
      this.mexEntities.push(entity);
      viewer.entities.add({
        polyline: {
          positions: [...positions, positions[0]],
          width: 2,
          material: outline,
          clampToGround: true,
        },
      });
    }
    this.highlight = highlight;

    /* 小点只标出关卡大致区域，与真实目的地有意错开 */
    const dotPos = Cesium.Cartesian3.fromDegrees(REGION.dot.lon, REGION.dot.lat, 0);
    const ripple = viewer.entities.add({
      position: dotPos,
      billboard: {
        image: ringTexture(96, 'rgba(229,18,125,.95)', 5),
        scale: new Cesium.CallbackProperty((time) => {
          const t = (performance.now() % 1600) / 1600;
          return 0.5 + t * 1.9;
        }, false),
        color: new Cesium.CallbackProperty(() => {
          const t = (performance.now() % 1600) / 1600;
          return Cesium.Color.fromAlpha(Cesium.Color.fromCssColorString('#e5127d'), 1 - t);
        }, false),
        disableDepthTestDistance: 0,
      },
    });
    const dot = viewer.entities.add({
      position: dotPos,
      billboard: {
        image: dotTexture(64, '#e5127d', 0.55),
        scale: 0.42,
      },
    });
    this.dotEntities.push(ripple, dot);
    this.regionPickables = new Set([...this.mexEntities, ...this.dotEntities]);
  }

  setCompleted(done) {
    this.completed = done;
    const base = Cesium.Color.fromCssColorString(done ? '#12a66a' : '#ffb31a');
    this.mexEntities.forEach((e) => {
      e.polygon.material = base.withAlpha(0.88);
    });
    /* 完成后不再显示小点，避免暗示还有未完成的线索 */
    this.dotEntities.forEach((e) => {
      e.show = !done;
    });
  }

  /** 选关页：地球作为背景缓慢自转，镜头略偏北让地球落在画面下方 */
  goSelectView(instant = false, onDone) {
    const { camera } = this.viewer;
    const dest = Cesium.Cartesian3.fromDegrees(-64, 32, 3.15e7);
    const orientation = { heading: 0, pitch: -Math.PI / 2, roll: 0 };
    this.cancelFlight();
    this.spin = false;
    if (instant) {
      camera.setView({ destination: dest, orientation });
      this.spin = true;
      onDone?.();
      return;
    }
    camera.flyTo({
      destination: dest,
      orientation,
      duration: 1.1,
      complete: () => {
        this.spin = true;
        onDone?.();
      },
    });
  }

  /** 进入地球页：镜头飞向墨西哥 */
  flyToRegion() {
    const { camera } = this.viewer;
    const portrait = this.viewer.canvas.clientHeight > this.viewer.canvas.clientWidth;
    const height = portrait ? 2.4e7 : 1.85e7;
    this.spin = false;
    const token = ++this.flightToken;
    return new Promise((resolve) => {
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(REGION.focus.lon - 3, REGION.focus.lat - 4, height),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
        duration: 2.2,
        complete: () => resolve(token === this.flightToken),
        cancel: () => resolve(false),
      });
    });
  }

  /** 从地球飞向街区锚点，作为进场转场的第一段 */
  flyToAnchor() {
    const { camera } = this.viewer;
    const token = ++this.flightToken;
    return new Promise((resolve) => {
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(ANCHOR.lon, ANCHOR.lat, 900),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-55),
          roll: 0,
        },
        duration: 1.7,
        complete: () => resolve(token === this.flightToken),
        cancel: () => resolve(false),
      });
    });
  }

  /** 离开街区后回到地球浏览视角 */
  flyBack() {
    const { camera } = this.viewer;
    const portrait = this.viewer.canvas.clientHeight > this.viewer.canvas.clientWidth;
    const height = portrait ? 2.4e7 : 1.85e7;
    this.spin = false;
    const token = ++this.flightToken;
    return new Promise((resolve) => {
      camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(REGION.focus.lon - 3, REGION.focus.lat - 4, height),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
        duration: 1.6,
        complete: () => resolve(token === this.flightToken),
        cancel: () => resolve(false),
      });
    });
  }

  cancelFlight() {
    this.flightToken++;
    try {
      this.viewer.camera.cancelFlight();
    } catch {
      /* ignore */
    }
  }

  setControlsEnabled(on) {
    const c = this.viewer.scene.screenSpaceCameraController;
    c.enableInputs = on;
    c.enableTranslate = false;
    c.minimumZoomDistance = 1.4e6;
    c.maximumZoomDistance = 9e7;
  }

  /** 命中墨西哥区域或小点（带触屏容错范围） */
  pickRegion(x, y, tolerance = 22) {
    const scene = this.viewer.scene;
    const picked = scene.pick(new Cesium.Cartesian2(x, y), tolerance, tolerance);
    if (!picked?.id) return false;
    return this.regionPickables.has(picked.id);
  }

  update(dt) {
    if (this.spin) {
      this.viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -dt * 0.045);
    }
  }

  dispose() {
    this.cancelFlight();
    this.viewer.entities.removeAll();
  }
}
