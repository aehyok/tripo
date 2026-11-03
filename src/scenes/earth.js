import * as Cesium from 'cesium';
import geo from '../data/world.json';
import { ANCHOR, REGION } from '../config.js';
import { createGlobeImagery, createCloudImagery } from './globeTiles.js';
import { REDUCED } from '../core/tween.js';

const NIGHT = Cesium.Color.fromCssColorString('#161b4d');

/** 固定光源的「日下点」：让墨西哥落在受光面偏侧，球体才有明暗过渡 */
const SUBSOLAR = { lon: -55, lat: 12 };

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
    this.interacting = false;
    this.spinResumeAt = 0;
  }

  async init() {
    const { viewer } = this;
    const scene = viewer.scene;

    scene.backgroundColor = NIGHT;
    scene.globe.baseColor = Cesium.Color.fromCssColorString('#10336f');
    scene.globe.enableLighting = true;
    scene.globe.showGroundAtmosphere = true;
    scene.globe.nightAlpha = 0.55;
    scene.globe.dayAlpha = 1;
    scene.fog.enabled = false;
    scene.skyAtmosphere.show = true;
    scene.skyAtmosphere.brightnessShift = 0.05;
    scene.sun.show = false;
    scene.moon.show = false;
    scene.highDynamicRange = true;

    // 分块矢量瓦片：放大时逐级请求新瓦片，海岸线与经纬网始终保持清晰
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(createGlobeImagery());
    const clouds = viewer.imageryLayers.addImageryProvider(createCloudImagery());
    clouds.alpha = 0.48;
    clouds.brightness = 1.05;
    this.clouds = clouds;

    this.applyLight();
    this.buildRegion();
  }

  /** 地球用固定方向光，返回地球页时要从街区的局部光恢复回来 */
  applyLight() {
    const normal = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.fromDegrees(SUBSOLAR.lon, SUBSOLAR.lat, 0),
      new Cesium.Cartesian3(),
    );
    const direction = Cesium.Cartesian3.negate(normal, new Cesium.Cartesian3());
    this.viewer.scene.light = new Cesium.DirectionalLight({ direction, intensity: 1.7 });
  }

  buildRegion() {
    const { viewer } = this;
    this.baseColor = Cesium.Color.fromCssColorString('#ffb31a');
    this.fillAlpha = -1;
    const highlight = this.baseColor.withAlpha(0.86);
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
    this.baseColor = Cesium.Color.fromCssColorString(done ? '#12a66a' : '#ffb31a');
    this.applyFill(this.fillAlpha, true);
    /* 完成后不再显示小点，避免暗示还有未完成的线索 */
    this.dotEntities.forEach((e) => {
      e.show = !done;
    });
  }

  /**
   * 高亮块的浓度跟随镜头高度：远看是醒目的色块，推近后逐渐透明，
   * 让云和地表透出来——否则一放大整个屏幕就是一块纯色。
   */
  applyFill(alpha, force = false) {
    const a = Cesium.Math.clamp(alpha, 0, 1);
    if (!force && Math.abs(a - this.fillAlpha) < 0.015) return;
    this.fillAlpha = a;
    const color = this.baseColor.withAlpha(a);
    this.mexEntities.forEach((e) => {
      e.polygon.material = color;
    });
  }

  /** 选关页：地球作为背景缓慢自转，镜头略偏北让地球落在画面下方 */
  goSelectView(instant = false, onDone) {
    const { camera } = this.viewer;
    const dest = Cesium.Cartesian3.fromDegrees(-64, 32, 3.15e7);
    const orientation = { heading: 0, pitch: -Math.PI / 2, roll: 0 };
    this.setCloudAlpha(0.3);
    this.cancelFlight();
    this.spin = false;
    this.setInteracting(false);
    if (instant) {
      camera.setView({ destination: dest, orientation });
      this.spin = true;
      this.setControlsEnabled(true, true);
      onDone?.();
      return;
    }
    camera.flyTo({
      destination: dest,
      orientation,
      duration: 1.1,
      complete: () => {
        this.spin = true;
        this.setControlsEnabled(true, true);
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
    this.setCloudAlpha(0.48);
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

  /** 先锁定航线，再侧倾俯冲，最后拉平镜头进入城市。 */
  async flyToAnchor(onProgress) {
    this.cancelFlight();
    const { camera } = this.viewer;
    const token = ++this.flightToken;
    this.spin = false;
    this.setControlsEnabled(false);
    this.journeyProgress = 0;
    if (!REDUCED) this.buildFlightEffects();
    const stages = REDUCED
      ? [{ lon: ANCHOR.lon, lat: ANCHOR.lat, height: ANCHOR.height + 700, heading: 0, pitch: -55, roll: 0, duration: 0, from: 0, to: 1 }]
      : [
        { lon: ANCHOR.lon - 6, lat: ANCHOR.lat - 3, height: 4.8e6, heading: 22, pitch: -72, roll: -7, duration: 1.05, from: 0, to: 0.24 },
        { lon: ANCHOR.lon - 0.14, lat: ANCHOR.lat - 0.12, height: 95000, heading: -12, pitch: -64, roll: 9, duration: 1.8, from: 0.24, to: 0.72 },
        { lon: ANCHOR.lon, lat: ANCHOR.lat, height: ANCHOR.height + 700, heading: 0, pitch: -55, roll: 0, duration: 1.25, from: 0.72, to: 1 },
      ];

    for (const stage of stages) {
      if (token !== this.flightToken) return false;
      this.flightStage = { ...stage, started: performance.now(), onProgress };
      onProgress?.(stage.from);
      const done = await new Promise((resolve) => {
        camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(stage.lon, stage.lat, stage.height),
          orientation: {
            heading: Cesium.Math.toRadians(stage.heading),
            pitch: Cesium.Math.toRadians(stage.pitch),
            roll: Cesium.Math.toRadians(stage.roll),
          },
          duration: stage.duration,
          easingFunction: Cesium.EasingFunction.SINUSOIDAL_IN_OUT,
          complete: () => resolve(token === this.flightToken),
          cancel: () => resolve(false),
        });
      });
      if (!done) {
        if (token === this.flightToken) this.clearFlightEffects();
        return false;
      }
    }
    this.clearFlightEffects();
    onProgress?.(1);
    return true;
  }

  buildFlightEffects() {
    const { viewer } = this;
    this.flightEffectTime = performance.now();
    const start = viewer.camera.positionCartographic;
    const lon = Cesium.Math.toDegrees(start.longitude);
    const lat = Cesium.Math.toDegrees(start.latitude);
    const positions = Array.from({ length: 97 }, (_, i) => {
      const t = i / 96;
      // 最短经度方向，地表上方拱起的航线不会穿入地球。
      const delta = Cesium.Math.negativePiToPi(Cesium.Math.toRadians(ANCHOR.lon - lon));
      return Cesium.Cartesian3.fromDegrees(
        lon + Cesium.Math.toDegrees(delta) * t,
        lat + (ANCHOR.lat - lat) * t,
        ANCHOR.height + 2000 + Math.sin(t * Math.PI) * 8e5,
      );
    });
    this.flightEntities = [viewer.entities.add({
      polyline: {
        positions: new Cesium.CallbackProperty(() => positions.slice(0, Math.max(2, Math.ceil(Math.min(1, this.journeyProgress / 0.24) * positions.length))), false),
        width: 5,
        material: new Cesium.PolylineGlowMaterialProperty({
          color: new Cesium.CallbackProperty(() => Cesium.Color.fromCssColorString('#6af5ec').withAlpha(Cesium.Math.clamp((0.7 - this.journeyProgress) / 0.2, 0, 1)), false),
          glowPower: 0.28,
        }),
      },
    })];
    for (let i = 0; i < 3; i++) {
      const radius = () => {
        const t = ((this.flightEffectTime / 1300) + i / 3) % 1;
        return Math.max(45, Math.min(6e5, viewer.camera.positionCartographic.height * 0.12)) * (0.3 + t);
      };
      this.flightEntities.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ANCHOR.lon, ANCHOR.lat, ANCHOR.height + 30),
        ellipse: {
          semiMajorAxis: new Cesium.CallbackProperty(radius, false),
          semiMinorAxis: new Cesium.CallbackProperty(radius, false),
          height: ANCHOR.height + 30 + i * 10,
          fill: false,
          outline: true,
          outlineColor: new Cesium.CallbackProperty(() => Cesium.Color.fromCssColorString('#ffcf70').withAlpha((1 - ((this.flightEffectTime / 1300 + i / 3) % 1)) * 0.8), false),
        },
      }));
    }
  }

  clearFlightEffects() {
    this.flightStage = null;
    this.flightEntities?.forEach((entity) => this.viewer.entities.remove(entity));
    this.flightEntities = [];
  }

  /** 离开街区后回到地球浏览视角 */
  flyBack() {
    const { camera } = this.viewer;
    const portrait = this.viewer.canvas.clientHeight > this.viewer.canvas.clientWidth;
    const height = portrait ? 2.4e7 : 1.85e7;
    this.spin = false;
    this.setCloudAlpha(0.48);
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
    this.clearFlightEffects();
    try {
      this.viewer.camera.cancelFlight();
    } catch {
      /* ignore */
    }
  }

  /** 选关页地球只是背景，云淡一点才不会盖住卡片 */
  setCloudAlpha(a) {
    if (this.clouds) this.clouds.alpha = a;
  }

  setControlsEnabled(on, overview = false) {
    const c = this.viewer.scene.screenSpaceCameraController;
    c.enableInputs = on;
    c.enableTranslate = false;
    c.minimumZoomDistance = overview ? 1.1e7 : 4e5;
    c.maximumZoomDistance = overview ? 5e7 : 9e7;
    if (on) this.applyLight();
  }

  /** 拖动时暂停自转，松手后留一点时间看清当前位置。 */
  setInteracting(on) {
    this.interacting = on;
    this.spinResumeAt = performance.now() + 2400;
  }

  /** 命中墨西哥区域或小点（带触屏容错范围） */
  pickRegion(x, y, tolerance = 22) {
    const scene = this.viewer.scene;
    const picked = scene.pick(new Cesium.Cartesian2(x, y), tolerance, tolerance);
    if (!picked?.id) return false;
    return this.regionPickables.has(picked.id);
  }

  update(dt) {
    if (this.flightStage) {
      this.flightEffectTime = performance.now();
      const s = this.flightStage;
      const t = Math.min(1, (performance.now() - s.started) / Math.max(1, s.duration * 1000));
      this.journeyProgress = s.from + (s.to - s.from) * t;
      this.setCloudAlpha(0.48 * (1 - this.journeyProgress));
      s.onProgress?.(this.journeyProgress);
    }
    if (this.spin && !this.interacting && performance.now() >= this.spinResumeAt && !REDUCED) {
      this.viewer.camera.rotate(Cesium.Cartesian3.UNIT_Z, -dt * 0.045);
    }
    const h = this.viewer.camera.positionCartographic.height;
    // 进入区域内部后色块就没意义了，直接让位给地表；区域还完整可见时保持醒目
    const k = Cesium.Math.clamp((h - 1.05e6) / (2.2e6 - 1.05e6), 0, 1);
    this.applyFill(0.86 * k * k * (3 - 2 * k));
  }

  dispose() {
    this.cancelFlight();
    this.viewer.entities.removeAll();
  }
}
