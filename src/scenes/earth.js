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

function dotTexture(size, color, core, outline = '#fff4dc') {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const r = size / 2;
  c.fillStyle = color;
  c.beginPath();
  c.arc(r, r, r * core, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = outline;
  c.lineWidth = size * 0.06;
  c.beginPath();
  c.arc(r, r, r * core, 0, Math.PI * 2);
  c.stroke();
  return cv.toDataURL();
}

/** 单张贴图依次合成光晕、星芒和白核，避免多层 Billboard 互相覆盖。 */
function sparkleTexture(size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const r = size / 2;
  const glow = c.createRadialGradient(r, r, 0, r, r, r);
  glow.addColorStop(0, 'rgba(235,253,255,.92)');
  glow.addColorStop(0.14, 'rgba(83,237,255,.88)');
  glow.addColorStop(0.38, 'rgba(112,91,255,.72)');
  glow.addColorStop(0.68, 'rgba(174,72,255,.3)');
  glow.addColorStop(1, 'rgba(151,64,255,0)');
  c.fillStyle = glow;
  c.fillRect(0, 0, size, size);

  c.translate(r, r);
  for (let i = 0; i < 4; i++) {
    c.rotate(Math.PI / 2);
    const beam = c.createLinearGradient(0, 0, r, 0);
    beam.addColorStop(0, 'rgba(255,255,255,1)');
    beam.addColorStop(0.35, 'rgba(135,248,255,1)');
    beam.addColorStop(0.72, 'rgba(190,229,255,.9)');
    beam.addColorStop(1, 'rgba(148,100,255,0)');
    c.fillStyle = beam;
    c.beginPath();
    c.moveTo(0, -size * 0.018);
    c.lineTo(r * 0.98, 0);
    c.lineTo(0, size * 0.018);
    c.closePath();
    c.fill();
  }
  const core = c.createRadialGradient(0, 0, 0, 0, 0, size * 0.11);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.36, '#f4ffff');
  core.addColorStop(0.62, '#65edff');
  core.addColorStop(0.84, '#9a68ff');
  core.addColorStop(1, 'rgba(138,82,255,0)');
  c.fillStyle = core;
  c.beginPath();
  c.arc(0, 0, size * 0.11, 0, Math.PI * 2);
  c.fill();
  return cv.toDataURL();
}

export class EarthScene {
  constructor(viewer) {
    this.viewer = viewer;
    this.mexEntities = [];
    this.dotEntities = [];
    this.sparkleEntities = [];
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

    /* 电光青 + 蓝紫星芒与绿色区域形成强对比，闪烁峰值更亮、节奏更清晰。 */
    const sparklePos = Cesium.Cartesian3.fromDegrees(REGION.sparkle.lon, REGION.sparkle.lat, 0);
    const sparklePulse = () => {
      const wave = (Math.sin((performance.now() / 950) * Math.PI * 2) + 1) / 2;
      return Math.pow(wave, 1.45);
    };
    const sparkle = viewer.entities.add({
      position: sparklePos,
      billboard: {
        image: sparkleTexture(128),
        scale: new Cesium.CallbackProperty(() => 0.72 + sparklePulse() * 0.28, false),
        color: new Cesium.CallbackProperty(() => Cesium.Color.WHITE.withAlpha(0.5 + sparklePulse() * 0.5), false),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    /* 环境装饰光点不受关卡完成状态影响，绿色高亮时依然可见 */
    this.sparkleEntities.push(sparkle);
    this.regionPickables = new Set([...this.mexEntities, ...this.dotEntities, ...this.sparkleEntities]);
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

  /** 选关页：略抬高视线，让地球下移，露出卡片下方的大陆与球体轮廓。 */
  goSelectView(instant = false, onDone) {
    const { camera } = this.viewer;
    const dest = Cesium.Cartesian3.fromDegrees(-64, 32, 3.15e7);
    const portrait = this.viewer.canvas.clientHeight > this.viewer.canvas.clientWidth;
    const orientation = { heading: 0, pitch: Cesium.Math.toRadians(portrait ? -90 : -83), roll: 0 };
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
    this.flightFovBase = camera.frustum.fov;
    if (!REDUCED) this.buildFlightEffects();
    const stages = REDUCED
      ? [{ lon: ANCHOR.lon, lat: ANCHOR.lat, height: ANCHOR.height + 700, heading: 0, pitch: -55, roll: 0, duration: 0, from: 0, to: 1 }]
      : [
        { lon: REGION.sparkle.lon - 6, lat: REGION.sparkle.lat - 3, height: 4.8e6, heading: 22, pitch: -72, roll: -7, duration: 1, from: 0, to: 0.24, easing: Cesium.EasingFunction.SINUSOIDAL_IN },
        { lon: REGION.sparkle.lon - 0.14, lat: REGION.sparkle.lat - 0.12, height: 95000, heading: -12, pitch: -64, roll: 9, duration: 1.55, from: 0.24, to: 0.72, easing: Cesium.EasingFunction.LINEAR },
        { lon: REGION.sparkle.lon, lat: REGION.sparkle.lat, height: ANCHOR.height + 700, heading: 0, pitch: -55, roll: 0, duration: 1.15, from: 0.72, to: 1, easing: Cesium.EasingFunction.SINUSOIDAL_OUT },
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
          easingFunction: stage.easing || Cesium.EasingFunction.SINUSOIDAL_IN_OUT,
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
      const delta = Cesium.Math.negativePiToPi(Cesium.Math.toRadians(REGION.sparkle.lon - lon));
      return Cesium.Cartesian3.fromDegrees(
        lon + Cesium.Math.toDegrees(delta) * t,
        lat + (REGION.sparkle.lat - lat) * t,
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
        position: Cesium.Cartesian3.fromDegrees(REGION.sparkle.lon, REGION.sparkle.lat, ANCHOR.height + 30),
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
    /* 完成、取消和销毁都必须还原透视视野，不能把跃迁 FOV 带回选关页。 */
    if (Number.isFinite(this.flightFovBase)) {
      this.viewer.camera.frustum.fov = this.flightFovBase;
      this.flightFovBase = null;
    }
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
      const eased = s.easing ? s.easing(t) : t;
      this.journeyProgress = s.from + (s.to - s.from) * eased;
      /* 中段视野从 60° 平滑拉到约 74°，进出都归零，制造加速与俯冲张力。 */
      const fovPhase = Cesium.Math.clamp((this.journeyProgress - 0.14) / 0.7, 0, 1);
      const fovPulse = Math.sin(Math.PI * fovPhase);
      if (Number.isFinite(this.flightFovBase)) {
        this.viewer.camera.frustum.fov = this.flightFovBase * (1 + 0.24 * fovPulse);
      }
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
