import * as Cesium from 'cesium';
import { ANCHOR, ASSETS, LAYOUT, DOG_SPOTS, TUNING, INSPECTABLES } from '../config.js';
import { REDUCED } from '../core/tween.js';
import { HeroAvatar } from '../core/heroAvatar.js';
import {
  createProp, createModelEntity, propMeta, makeFrameMatrix, frameQuat, localToWorld, rotate2, C,
} from './streetProps.js';

const UP = Cesium.Cartesian3.UNIT_Z;

/* ---------- 角色占位模型构件 ----------
   pivot：在角色局部坐标里的关节点；offset：相对关节点的中心位置。
   swing 部位在走路时绕 x 轴摆动，下蹲时保持弯曲角度。 */
const HERO_PARTS = [
  { name: 'legL', kind: 'cylinder', size: [0.1, 0.085, 0.72], pivot: [-0.14, 0, 0.82], offset: [0, 0, -0.36], color: '#2b3170', swing: 'legL' },
  { name: 'legR', kind: 'cylinder', size: [0.1, 0.085, 0.72], pivot: [0.14, 0, 0.82], offset: [0, 0, -0.36], color: '#2b3170', swing: 'legR' },
  { name: 'shoeL', kind: 'box', size: [0.2, 0.32, 0.1], pivot: [-0.14, 0, 0.82], offset: [0, 0.06, -0.74], color: C.paper, swing: 'legL' },
  { name: 'shoeR', kind: 'box', size: [0.2, 0.32, 0.1], pivot: [0.14, 0, 0.82], offset: [0, 0.06, -0.74], color: C.paper, swing: 'legR' },
  { name: 'torso', kind: 'box', size: [0.58, 0.34, 0.68], pivot: [0, 0, 1.14], offset: [0, 0, 0], color: '#1cc0c9', body: true },
  { name: 'pack', kind: 'box', size: [0.42, 0.18, 0.5], pivot: [0, -0.25, 1.18], offset: [0, 0, 0], color: '#e5127d', body: true },
  { name: 'armL', kind: 'cylinder', size: [0.075, 0.065, 0.58], pivot: [-0.37, 0, 1.42], offset: [0, 0, -0.29], color: '#1cc0c9', swing: 'armL', body: true },
  { name: 'armR', kind: 'cylinder', size: [0.075, 0.065, 0.58], pivot: [0.37, 0, 1.42], offset: [0, 0, -0.29], color: '#1cc0c9', swing: 'armR', body: true },
  { name: 'handL', kind: 'ellipsoid', size: [0.08, 0.08, 0.08], pivot: [-0.37, 0, 1.42], offset: [0, 0, -0.62], color: '#f0c79a', swing: 'armL', body: true },
  { name: 'handR', kind: 'ellipsoid', size: [0.08, 0.08, 0.08], pivot: [0.37, 0, 1.42], offset: [0, 0, -0.62], color: '#f0c79a', swing: 'armR', body: true },
  { name: 'scarf', kind: 'cylinder', size: [0.25, 0.27, 0.13], pivot: [0, 0, 1.5], offset: [0, 0, 0], color: '#ffb31a', body: true },
  { name: 'scarfTail', kind: 'box', size: [0.13, 0.05, 0.34], pivot: [0.12, 0.19, 1.3], offset: [0, 0, 0], color: '#ffb31a', body: true },
  { name: 'head', kind: 'ellipsoid', size: [0.26, 0.26, 0.26], pivot: [0, 0, 1.74], offset: [0, 0, 0], color: '#f0c79a', body: true },
  { name: 'hair', kind: 'ellipsoid', size: [0.275, 0.25, 0.24], pivot: [0, -0.05, 1.81], offset: [0, 0, 0], color: '#2a1a3e', body: true },
  { name: 'eyeL', kind: 'ellipsoid', size: [0.03, 0.03, 0.03], pivot: [-0.1, 0.24, 1.73], offset: [0, 0, 0], color: '#1d1645', body: true },
  { name: 'eyeR', kind: 'ellipsoid', size: [0.03, 0.03, 0.03], pivot: [0.1, 0.24, 1.73], offset: [0, 0, 0], color: '#1d1645', body: true },
];

const DOG_PARTS = [
  { kind: 'box', size: [0.78, 0.36, 0.36], at: [0, 0, 0.46], color: '#d99a5b' },
  { kind: 'box', size: [0.48, 0.42, 0.42], at: [0, 0.03, 0.48], color: '#12a66a' },
  { kind: 'box', size: [0.5, 0.07, 0.44], at: [0, 0.02, 0.48], color: C.paper },
  { kind: 'cylinder', size: [0.06, 0.05, 0.3], at: [-0.28, 0.13, 0.15], color: '#d99a5b' },
  { kind: 'cylinder', size: [0.06, 0.05, 0.3], at: [-0.28, -0.13, 0.15], color: '#d99a5b' },
  { kind: 'cylinder', size: [0.06, 0.05, 0.3], at: [0.28, 0.13, 0.15], color: '#d99a5b' },
  { kind: 'cylinder', size: [0.06, 0.05, 0.3], at: [0.28, -0.13, 0.15], color: '#d99a5b' },
  { kind: 'ellipsoid', size: [0.25, 0.25, 0.25], at: [0, 0.46, 0.78], color: '#d99a5b' },
  { kind: 'box', size: [0.2, 0.17, 0.13], at: [0, 0.66, 0.73], color: '#f0c79a' },
  { kind: 'box', size: [0.08, 0.06, 0.06], at: [0, 0.76, 0.77], color: '#1d1645' },
  { kind: 'ellipsoid', size: [0.035, 0.035, 0.035], at: [-0.1, 0.62, 0.85], color: '#1d1645' },
  { kind: 'ellipsoid', size: [0.035, 0.035, 0.035], at: [0.1, 0.62, 0.85], color: '#1d1645' },
  { kind: 'box', size: [0.12, 0.06, 0.24], at: [-0.2, 0.42, 0.9], color: '#7a4a26' },
  { kind: 'box', size: [0.12, 0.06, 0.24], at: [0.2, 0.42, 0.9], color: '#7a4a26' },
  { kind: 'cylinder', size: [0.035, 0.06, 0.34], at: [0, -0.38, 0.62], color: '#7a4a26', rot: ['x', -0.9] },
];

const DOG_SCALE = 1.35;

function angleOf(swing, s) {
  if (s.crouch) return swing.startsWith('leg') ? 0.55 : -0.25;
  /* 左右腿交替迈步，同侧手臂与腿反向摆动，避免四肢同向甩动。 */
  const side = swing.endsWith('L') ? 1 : -1;
  const base = swing.startsWith('leg') ? s.swingAngle : -s.swingAngle * 0.65;
  return base * side;
}

export class StreetScene {
  constructor(viewer, hooks = {}) {
    this.viewer = viewer;
    this.hooks = hooks;
    this.frame = makeFrameMatrix(ANCHOR);
    this.fq = frameQuat(this.frame);
    this.built = false;
    this.active = false;
    this.colliders = [];
    this.solids = [];
    this.sights = [];
    this.inspectables = [];
    this.inspectByEntity = new Map();
    this.entities = [];
    this.nearKey = null;
    this.pointer = null;
    this.pointers = new Map();
    this.pinch = 0;
    this.keys = Object.create(null);
    this.joy = { x: 0, y: 0 };
    this.dragActive = false;
    this.round = 0;
    this.animToken = 0;
    this.movedOnce = false;
    this.pitchBias = 0;
    this.yawBias = 0;
    this.focusBias = 0;
    this.timers = new Set();

    this.s = {
      x: TUNING.spawn.x,
      y: TUNING.spawn.y,
      yaw: Math.PI,
      camYaw: 0,
      camPitch: TUNING.camPitch,
      camDist: TUNING.camDist,
      curDist: TUNING.camDist,
      crouch: false,
      running: false,
      swingAngle: 0,
      walkAmt: 0,
      playing: false,
      found: false,
      dogSpot: -1,
      hop: 0,
      hopCount: 0,
      celebrate: 0,
    };

    this.hintState = { left: TUNING.hintsPerRound, used: 0 };
    this.startAt = 0;
    this.elapsed = 0;
    this.paused = false;
  }

  /* ---------- 构建 ---------- */
  async build() {
    if (this.built) return;
    const { viewer } = this;
    this.applyLight();

    this.buildGround();
    for (const spec of LAYOUT) await this.addObject(spec);
    await this.buildDog();
    await this.buildHero();
    this.built = true;
  }

  applyLight() {
    const scene = this.viewer.scene;
    this.previousLighting ??= {
      light: scene.light,
      backgroundColor: scene.backgroundColor,
      skyBox: scene.skyBox.show,
      skyAtmosphere: scene.skyAtmosphere.show,
      groundAtmosphere: scene.globe.showGroundAtmosphere,
      globeLighting: scene.globe.enableLighting,
      sphericalHarmonicCoefficients: scene.sphericalHarmonicCoefficients,
    };

    scene.globe.enableLighting = false;
    // 主光照向房屋正面，柔和的蓝色环境光补亮背光面。
    const dir = Cesium.Matrix4.multiplyByPointAsVector(
      this.frame,
      new Cesium.Cartesian3(0.3, -0.5, -0.85),
      new Cesium.Cartesian3(),
    );
    scene.light = new Cesium.DirectionalLight({
      direction: Cesium.Cartesian3.normalize(dir, dir),
      intensity: 3.2,
    });
    scene.sphericalHarmonicCoefficients = Array.from({ length: 9 }, (_, i) =>
      i === 0 ? new Cesium.Cartesian3(1.05, 1.1, 1.2) : new Cesium.Cartesian3(),
    );
    scene.globe.showGroundAtmosphere = false;
    scene.skyAtmosphere.show = false;
    scene.skyBox.show = false;
    scene.backgroundColor = Cesium.Color.fromCssColorString('#6378a5');
  }

  buildGround() {
    const { viewer } = this;
    const r = TUNING.groundRadius;
    /* 地面高度使用绝对海拔：实体椭圆的 height 是相对椭球面的绝对高度 */
    const h = ANCHOR.height;
    this.entities.push(
      viewer.entities.add({
        position: localToWorld(this.frame, 0, 0, 0),
        ellipse: {
          semiMajorAxis: r,
          semiMinorAxis: r,
          height: h,
          extrudedHeight: h - 0.7,
          material: Cesium.Color.fromCssColorString('#998baa'),
        },
      }),
      viewer.entities.add({
        position: localToWorld(this.frame, 0, 0, -0.7),
        ellipse: {
          semiMajorAxis: r - 0.6,
          semiMinorAxis: r - 0.6,
          height: h - 0.7,
          extrudedHeight: h - 4.2,
          material: Cesium.Color.fromCssColorString('#665577'),
        },
      }),
      /* 街道铺装与地标线 */
      viewer.entities.add({
        position: localToWorld(this.frame, 0, 0.2, 0.02),
        box: {
          dimensions: new Cesium.Cartesian3(20, 5.2, 0.04),
          material: Cesium.Color.fromCssColorString('#746d92'),
        },
      }),
    );
    for (let i = 0; i < 9; i++) {
      this.entities.push(
        viewer.entities.add({
          position: localToWorld(this.frame, -8 + i * 2, 0.2, 0.05),
          box: {
            dimensions: new Cesium.Cartesian3(1.1, 0.14, 0.05),
            material: Cesium.Color.fromCssColorString('#ffb31a'),
          },
        }),
      );
    }

    /* 暖色光斑：Cesium 只提供一盏主光源，摊位与路灯的照明用贴地柔光贴图表现 */
    const pools = [
      [-2.4, -1.6, 3.6], [4.6, 3.8, 3.8], [-3.6, 3.6, 3.4], [0, 0.4, 4.6], [-8.4, -0.2, 3.2],
    ];
    const glowImage = this.lightPoolTexture();
    for (const [x, y, r] of pools) {
      this.entities.push(
        viewer.entities.add({
          position: localToWorld(this.frame, x, y, 0.02),
          ellipse: {
            semiMajorAxis: r,
            semiMinorAxis: r,
            height: ANCHOR.height + 0.02,
            material: new Cesium.ImageMaterialProperty({
              image: glowImage,
              color: Cesium.Color.fromCssColorString('#ffb86b').withAlpha(0.5),
              transparent: true,
            }),
          },
        }),
      );
    }
  }

  lightPoolTexture() {
    if (this._poolTex) return this._poolTex;
    const size = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
    this._poolTex = cv.toDataURL();
    return this._poolTex;
  }

  async addObject(spec) {
    const { viewer } = this;
    /* 有正式 GLB 时优先用模型，否则用占位构件；两者共用同一套碰撞与提示数据 */
    const meta = propMeta(spec);
    const modelEntity = await createModelEntity(viewer, this.frame, spec, spec.key, this.fq);
    const entities = modelEntity ? [modelEntity] : createProp(viewer, this.frame, spec, this.fq).entities;
    const accessory = modelEntity && ASSETS[spec.key]?.accessories?.[spec.accessory];
    if (accessory) {
      const [ax, ay] = rotate2(accessory.x || 0, accessory.y || 0, spec.ry || 0);
      const mount = { ...spec, x: spec.x + ax, y: spec.y + ay, z: (spec.z || 0) + (accessory.z || 0) };
      const item = await createModelEntity(viewer, this.frame, mount, spec.key, this.fq, accessory);
      if (item) entities.push(item);
      else entities.push(...createProp(viewer, this.frame, { ...spec, key: accessory.fallback }, this.fq).entities);
    }
    this.entities.push(...entities);

    let inspectable = null;
    if (INSPECTABLES[spec.key]) {
      inspectable = {
        id: `${spec.key}:${spec.x}:${spec.y}`, spec, entities, box: meta.box,
        title: spec.key === 'stall' ? (spec.accessory === 'scarf' ? '球迷围巾摊' : '球迷帽子摊') : INSPECTABLES[spec.key],
      };
      this.inspectables.push(inspectable);
      for (const entity of entities) this.inspectByEntity.set(entity, inspectable);
    }

    if (meta.box) {
      const b = meta.box;
      if (meta.small) {
        this.colliders.push({ x0: spec.x - meta.small, x1: spec.x + meta.small, y0: spec.y - meta.small, y1: spec.y + meta.small });
      } else {
        this.colliders.push({ x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 });
      }
      if (meta.solid) this.solids.push(b);
      this.sights.push({ key: spec.key, say: spec.say, box: b, inspectable });
    }
    if (meta.poles) {
      for (const x of [-meta.poles, meta.poles]) {
        this.colliders.push({ x0: spec.x + x - 0.15, x1: spec.x + x + 0.15, y0: spec.y - 0.15, y1: spec.y + 0.15 });
      }
    }
  }

  /* ---------- 吉拿 ---------- */
  async buildDog() {
    const { viewer } = this;
    this.dogEntities = [];
    this.dogAnchor = { x: 0, y: 0, yaw: 0 };

    const model = await createModelEntity(viewer, this.frame, { x: 0, y: 0 }, 'dog', this.fq);
    if (model) {
      model.name = '吉拿';
      model.position = new Cesium.CallbackProperty(
        () => localToWorld(this.frame, this.dogAnchor.x, this.dogAnchor.y, (this.dogAnchor.z || 0) + this.s.hop), false,
      );
      model.orientation = new Cesium.CallbackProperty(() => {
        // Cesium converts glTF +Z forward to local +X; the street uses +Y at yaw 0.
        const yaw = Cesium.Quaternion.fromAxisAngle(UP, Math.PI / 2 - this.dogAnchor.yaw);
        return Cesium.Quaternion.multiply(this.fq, yaw, new Cesium.Quaternion());
      }, false);
      this.dogEntities.push(model);
    }

    for (const part of model ? [] : DOG_PARTS) {
      const dims = part.size;
      const opts = {
        position: new Cesium.CallbackProperty(() => this.dogPartPosition(part), false),
        orientation: new Cesium.CallbackProperty(() => this.dogPartOrientation(part), false),
      };
      if (part.kind === 'box') {
        opts.box = { dimensions: new Cesium.Cartesian3(dims[0] * DOG_SCALE, dims[1] * DOG_SCALE, dims[2] * DOG_SCALE), material: Cesium.Color.fromCssColorString(part.color) };
      } else if (part.kind === 'cylinder') {
        opts.cylinder = { length: dims[2] * DOG_SCALE, topRadius: dims[0] * DOG_SCALE, bottomRadius: dims[1] * DOG_SCALE, material: Cesium.Color.fromCssColorString(part.color) };
      } else {
        opts.ellipsoid = { radii: new Cesium.Cartesian3(dims[0] * DOG_SCALE, dims[1] * DOG_SCALE, dims[2] * DOG_SCALE), material: Cesium.Color.fromCssColorString(part.color) };
      }
      const e = viewer.entities.add(opts);
      this.dogEntities.push(e);
    }

    /* 第二次提示用的高亮标记：短暂显示，且不被建筑遮挡 */
    this.dogMarker = viewer.entities.add({
      position: new Cesium.CallbackProperty(
        () => localToWorld(this.frame, this.dogAnchor.x, this.dogAnchor.y, 2.1),
        false,
      ),
      show: false,
      billboard: {
        image: this.markerTexture(),
        scale: 0.9,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }

  markerTexture() {
    if (this._markerTex) return this._markerTex;
    const W = 128;
    const H = 160;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const c = cv.getContext('2d');
    /* 深色描边让标记在亮色墙面上也能看清 */
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(64, 140);
    c.lineTo(46, 104);
    c.lineTo(82, 104);
    c.closePath();
    c.fillStyle = '#ffb31a';
    c.strokeStyle = '#1d1645';
    c.lineWidth = 7;
    c.fill();
    c.stroke();
    c.beginPath();
    c.arc(64, 64, 48, 0, Math.PI * 2);
    c.fillStyle = '#ffb31a';
    c.fill();
    c.stroke();
    c.fillStyle = '#1d1645';
    c.font = 'bold 56px "Noto Sans SC", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('汪', 64, 66);
    this._markerTex = cv.toDataURL();
    return this._markerTex;
  }

  dogPartPosition(part) {
    const d = this.dogAnchor;
    const hop = this.s.hop;
    let x = part.at[0];
    let y = part.at[1];
    let z = part.at[2] * DOG_SCALE + hop;
    if (part.rot) {
      /* 尾巴等带倾斜的构件：绕 x 轴旋转偏移量 */
      const [axis, ang] = part.rot;
      if (axis === 'x') {
        const cy = Math.cos(ang);
        const sy = Math.sin(ang);
        const ny = y * cy - z * sy;
        const nz = y * sy + z * cy;
        y = ny;
        z = nz;
      }
    }
    const [rx, ry] = rotate2(x * DOG_SCALE, y * DOG_SCALE, d.yaw);
    return localToWorld(this.frame, d.x + rx, d.y + ry, z + (d.z || 0));
  }

  dogPartOrientation(part) {
    const yawQ = Cesium.Quaternion.fromAxisAngle(UP, -this.dogAnchor.yaw);
    let q = Cesium.Quaternion.multiply(this.fq, yawQ, new Cesium.Quaternion());
    if (part.rot) {
      const axis = { x: Cesium.Cartesian3.UNIT_X, y: Cesium.Cartesian3.UNIT_Y, z: Cesium.Cartesian3.UNIT_Z }[part.rot[0]];
      q = Cesium.Quaternion.multiply(q, Cesium.Quaternion.fromAxisAngle(axis, part.rot[1]), new Cesium.Quaternion());
    }
    return q;
  }

  /* ---------- 小年 ---------- */
  async buildHero() {
    this.heroEntities = [];
    this.heroSpeed = 0;
    if (ASSETS.hero.glb) {
      this.heroAvatar = new HeroAvatar(
        this.viewer, this.frame, this.fq, () => this.s,
        () => this.buildHeroPlaceholder(),
      );
      if (await this.heroAvatar.load(ASSETS.hero.glb)) return;
      this.heroAvatar = null;
    }
    this.buildHeroPlaceholder();
  }

  buildHeroPlaceholder() {
    const { viewer } = this;
    if (this.heroEntities?.length) return;
    this.heroEntities = [];
    for (const part of HERO_PARTS) {
      const opts = {
        position: new Cesium.CallbackProperty(() => this.heroPartPosition(part), false),
        orientation: new Cesium.CallbackProperty(() => this.heroPartOrientation(part), false),
      };
      if (part.kind === 'box') {
        opts.box = { dimensions: new Cesium.Cartesian3(...part.size), material: Cesium.Color.fromCssColorString(part.color) };
      } else if (part.kind === 'cylinder') {
        opts.cylinder = { length: part.size[2], topRadius: part.size[0], bottomRadius: part.size[1], material: Cesium.Color.fromCssColorString(part.color) };
      } else {
        opts.ellipsoid = { radii: new Cesium.Cartesian3(...part.size), material: Cesium.Color.fromCssColorString(part.color) };
      }
      this.heroEntities.push(viewer.entities.add(opts));
    }
  }

  heroPartPosition(part) {
    const s = this.s;
    const drop = s.crouch && part.body ? -0.28 : 0;
    const ang = part.swing ? angleOf(part.swing, s) : 0;
    const [ox, oy, oz] = part.offset;
    /* 绕关节点的 x 轴摆动 */
    const ry = oy * Math.cos(ang) - oz * Math.sin(ang);
    const rz = oy * Math.sin(ang) + oz * Math.cos(ang);
    const lx = part.pivot[0] + ox;
    const ly = part.pivot[1] + ry;
    const lz = part.pivot[2] + rz + drop;
    const [rx, ryy] = rotate2(lx, ly, s.yaw);
    return localToWorld(this.frame, s.x + rx, s.y + ryy, lz);
  }

  heroPartOrientation(part) {
    const s = this.s;
    const yawQ = Cesium.Quaternion.fromAxisAngle(UP, -s.yaw);
    let q = Cesium.Quaternion.multiply(this.fq, yawQ, new Cesium.Quaternion());
    if (part.swing) {
      const ang = angleOf(part.swing, s);
      q = Cesium.Quaternion.multiply(q, Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_X, ang), new Cesium.Quaternion());
    }
    return q;
  }

  /* ---------- 回合 ---------- */
  placeDog(spot) {
    let i = spot;
    if (i == null) {
      do {
        i = Math.floor(Math.random() * DOG_SPOTS.length);
      } while (i === this.s.dogSpot && DOG_SPOTS.length > 1);
    }
    this.s.dogSpot = i;
    const sp = DOG_SPOTS[i];
    this.dogAnchor = { x: sp.x, y: sp.y, z: sp.z || 0, yaw: sp.ry };
    this.dogCol = { x0: sp.x - 0.5, x1: sp.x + 0.5, y0: sp.y - 0.5, y1: sp.y + 0.5 };
  }

  enterRound({ spot = null } = {}) {
    this.applyLight();
    this.round++;
    this.placeDog(spot);
    this.resetHero();
    this.overview = true;
    this.overviewZoom = 1;
    this.overviewBlend = 0;
    this.s.camYaw = TUNING.overviewYaw;
    this.s.camPitch = TUNING.overviewPitch;
    this.hintState = { left: TUNING.hintsPerRound, used: 0 };
    this.elapsed = 0;
    this.startAt = 0;
    this.paused = false;
    this.nearKey = null;
    this.s.found = false;
    this.s.playing = false;
    this.movedOnce = false;
    this.s.hop = 0;
    this.s.hopCount = 0;
    this.dogMarker.show = false;
    this.clearTimers();
    this.active = true;
    this.viewer.scene.screenSpaceCameraController.enableInputs = false;
    this.viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    this.updateCamera(1);
  }

  /** 竖屏时把镜头拉远，保证角色和前方街区都在画面内 */
  aspectScale() {
    const el = this.viewer.canvas;
    const aspect = (el.clientWidth || 1) / (el.clientHeight || 1);
    return Math.min(1.55, Math.max(1, 0.95 / aspect));
  }

  resetHero() {
    const s = this.s;
    this.distScale = this.aspectScale();
    s.x = TUNING.spawn.x;
    s.y = TUNING.spawn.y;
    s.yaw = Math.PI;
    s.camYaw = 0;
    s.camPitch = TUNING.camPitch;
    s.camDist = TUNING.camDist * this.distScale;
    s.curDist = s.camDist;
    s.walkAmt = 0;
    s.swingAngle = 0;
    s.celebrate = 0;
    this.pitchBias = 0;
    this.yawBias = 0;
    this.focusBias = 0;
    this.setCrouch(false);
    s.running = false;
    this.lastTap = null;
    this.joy.x = 0;
    this.joy.y = 0;
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
  }

  beginPlay(now = performance.now()) {
    this.overview = false;
    this.overviewBlend = REDUCED ? 0 : 1;
    this.s.camPitch = TUNING.camPitch;
    this.s.playing = true;
    this.startAt = now;
    this.elapsed = 0;
  }

  /* ---------- 计时（切后台暂停） ---------- */
  getElapsed(now = performance.now()) {
    if (!this.s.playing) return this.elapsed;
    return now - this.startAt;
  }

  pauseTimer() {
    if (!this.s.playing || this.paused) return;
    this.elapsed = performance.now() - this.startAt;
    this.paused = true;
  }

  resumeTimer() {
    if (!this.s.playing || !this.paused) return;
    this.startAt = performance.now() - this.elapsed;
    this.paused = false;
  }

  /* ---------- 输入 ---------- */
  bindInput() {
    const canvas = this.viewer.canvas;
    const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    /* 方向键与 WASD 视为同一方向，双击判定不区分两者 */
    const DIRECTION = { ArrowUp: 'KeyW', ArrowLeft: 'KeyA', ArrowDown: 'KeyS', ArrowRight: 'KeyD' };

    window.addEventListener('keydown', (e) => {
      if (!this.active || !this.s.playing) return;
      if (MOVE.includes(e.code)) {
        this.keys[e.code] = true;
        if (!e.repeat) this.tapDirection(DIRECTION[e.code] || e.code, e.timeStamp);
        e.preventDefault();
      } else if (e.code === 'KeyC' && !e.repeat) {
        this.toggleCrouch();
        e.preventDefault();
      } else if (e.code === 'KeyE' && !e.repeat) {
        this.tryConfirm();
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (MOVE.includes(e.code)) this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => this.clearInput());
    window.addEventListener('resize', () => {
      this.distScale = this.aspectScale();
      this.s.camDist = Math.max(TUNING.camMinDist, Math.min(TUNING.camMaxDist * this.distScale, this.s.camDist));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clearInput();
        this.pauseTimer();
      } else {
        this.resumeTimer();
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.active || this.inspecting) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pinch = 0;
      this.dragActive = false;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.active || this.inspecting) return;
      const t = this.pointers.get(e.pointerId);
      if (!t) return;
      const dx = e.clientX - t.x;
      const dy = e.clientY - t.y;
      if (Math.hypot(dx, dy) > 1) this.dragActive = true;
      if (this.pointers.size === 1 && !this.s.found) {
        /* 第三人称视角：向右拖动时镜头向右看，向左拖动则反向。 */
        this.s.camYaw += dx * 0.006;
        this.s.camPitch = Math.max(0.1, Math.min(1.2, this.s.camPitch + dy * 0.004));
      }
      t.x = e.clientX;
      t.y = e.clientY;
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) {
          this.zoomCamera(this.pinch / d);
        }
        this.pinch = d;
      }
    });
    const end = (e) => {
      this.pointers.delete(e.pointerId);
      this.pinch = 0;
      if (this.pointers.size === 0) this.dragActive = false;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.active || this.inspecting) return;
        e.preventDefault();
        this.zoomCamera(Math.max(0.1, 1 + e.deltaY * 0.001));
      },
      { passive: false },
    );
  }

  /* 同一方向在 doubleTapMs 内按下两次即开始奔跑，松开全部方向键或蹲下时结束 */
  tapDirection(dir, time) {
    const last = this.lastTap;
    if (last && last.dir === dir && time - last.time <= TUNING.doubleTapMs && !this.s.crouch) this.s.running = true;
    this.lastTap = { dir, time };
  }

  clearInput() {
    this.s.running = false;
    this.lastTap = null;
    for (const k of Object.keys(this.keys)) this.keys[k] = false;
    this.joy.x = 0;
    this.joy.y = 0;
    this.pointers.clear();
    this.dragActive = false;
  }

  zoomCamera(factor) {
    if (this.overview) {
      this.overviewZoom = Cesium.Math.clamp(this.overviewZoom * factor, 0.85, 1.5);
      return;
    }
    const k = this.distScale || 1;
    this.s.camDist = Cesium.Math.clamp(this.s.camDist * factor, TUNING.camMinDist, TUNING.camMaxDist * k);
  }

  bindJoystick(el, knob) {
    let id = null;
    const move = (e) => {
      const b = el.getBoundingClientRect();
      const R = b.width / 2;
      let x = e.clientX - b.left - R;
      let y = e.clientY - b.top - R;
      const l = Math.hypot(x, y);
      if (l > R) {
        x *= R / l;
        y *= R / l;
      }
      this.joy.x = x / R;
      this.joy.y = y / R;
      knob.style.transform = `translate(${x}px, ${y}px)`;
    };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      el.setPointerCapture(e.pointerId);
      move(e);
      e.preventDefault();
      e.stopPropagation();
    });
    el.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.joy.x = 0;
      this.joy.y = 0;
      knob.style.transform = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  /* ---------- 下蹲 ---------- */
  setCrouch(on) {
    this.s.crouch = !!on;
    if (this.s.crouch) this.s.running = false;
    this.hooks.onCrouch?.(this.s.crouch);
  }

  toggleCrouch() {
    if (!this.active || this.s.found) return;
    this.setCrouch(!this.s.crouch);
  }

  /* ---------- 碰撞 ---------- */
  blocked(x, y, r = TUNING.heroRadius) {
    if (Math.hypot(x, y) > TUNING.walkRadius - r) return true;
    for (const c of this.colliders) {
      if (x + r > c.x0 && x - r < c.x1 && y + r > c.y0 && y - r < c.y1) return true;
    }
    if (this.dogCol) {
      const d = this.dogCol;
      if (x + r > d.x0 && x - r < d.x1 && y + r > d.y0 && y - r < d.y1) return true;
    }
    return false;
  }

  move(dt) {
    const s = this.s;
    const beforeX = s.x;
    const beforeY = s.y;
    const k = this.keys;
    const ix = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0) + this.joy.x;
    const fwd = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0) - this.joy.y;
    const len = Math.hypot(ix, fwd);
    let target = 0;

    if (len > 0.08) {
      const n = Math.min(1, len) / len;
      const nx = ix * n;
      const ny = fwd * n;
      target = Math.min(1, len);
      const moveYaw = s.camYaw + this.yawBias;
      const sin = Math.sin(moveYaw);
      const cos = Math.cos(moveYaw);
      /* 使用包含自动侧移的实际相机角度，前方为 (-sin, -cos)，右方为 (-cos, sin) */
      const mx = -sin * ny - cos * nx;
      const my = -cos * ny + sin * nx;
      const speed = (s.running ? TUNING.runSpeed : TUNING.walkSpeed * (s.crouch ? TUNING.crouchSpeedFactor : 1)) * dt;
      const px = s.x + mx * speed;
      const py = s.y + my * speed;
      if (!this.blocked(px, s.y)) s.x = px;
      if (!this.blocked(s.x, py)) s.y = py;

      const want = Math.atan2(mx, my);
      let d = want - s.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      s.yaw += d * Math.min(1, dt * 12);
      if (!this.movedOnce) {
        this.movedOnce = true;
        this.hooks.onFirstMove?.();
      }
    } else {
      s.running = false;
    }

    this.heroSpeed = dt > 0 ? Math.hypot(s.x - beforeX, s.y - beforeY) / dt : 0;
    if (this.heroSpeed < 0.02) target = 0;
    s.walkAmt += (target - s.walkAmt) * Math.min(1, dt * 10);
    s.swingAngle = Math.sin((s.walkPhase = (s.walkPhase || 0) + dt * 11 * s.walkAmt)) * 0.5 * s.walkAmt;
    if (s.walkAmt < 0.02) s.swingAngle = 0;
  }

  /* ---------- 相机 ---------- */
  focusHeight() {
    return TUNING.camFocusHeight - (this.s.crouch ? TUNING.crouchDrop : 0);
  }

  cameraDir(yaw, pitch) {
    const cp = Math.cos(pitch);
    return new Cesium.Cartesian3(Math.sin(yaw) * cp, Math.cos(yaw) * cp, Math.sin(pitch));
  }

  /** 从焦点沿相机方向能走多远（遇到房屋、摊位、小吃车就缩短） */
  clearAlong(yaw, pitch) {
    const o = new Cesium.Cartesian3(this.s.x, this.s.y, this.focusHeight());
    const d = this.cameraDir(yaw, pitch);
    let best = 99;
    for (const b of this.solids) {
      const t = rayBox(o, d, b);
      if (t !== null && t < best) best = t;
    }
    return best;
  }

  updateCamera(dt) {
    if (this.overview) {
      this.updateOverviewCamera();
      return;
    }
    this.overviewBlend = Math.max(0, this.overviewBlend - dt / 0.9);
    const s = this.s;
    const full = s.found ? Math.min(s.camDist, 7) : s.camDist;
    const need = Math.min(full, 5.5);
    const viewYaw = s.camYaw + this.yawBias;
    const viewPitch = Math.max(0.1, Math.min(1.25, s.camPitch + this.pitchBias));
    const clear = this.clearAlong(viewYaw, viewPitch);

    /* 被建筑挡住时缓慢转到开阔方向，玩家正在拖动时不干预 */
    if (!this.dragActive && this.pointers.size === 0 && clear < need) {
      const offsets = [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75, 2.1, -2.1, 2.6, -2.6, 3.14];
      for (const off of offsets) {
        if (this.clearAlong(viewYaw + off, viewPitch) >= need) {
          s.camYaw += Math.sign(off) * Math.min(Math.abs(off), dt * 2.6);
          break;
        }
      }
    }

    /* 主动拖动时冻结自动偏移，避免相机与玩家反向争夺控制。 */
    const nearDog = this.nearKey === 'dog' || s.found;
    if (!this.dragActive) {
      const wantPitchBias = (clear < 2.8 ? 0.55 : 0) + (nearDog ? 0.12 : 0);
      this.pitchBias += (wantPitchBias - this.pitchBias) * Math.min(1, dt * 2.2);
      const wantYawBias = nearDog ? 0.42 : 0;
      this.yawBias += (wantYawBias - this.yawBias) * Math.min(1, dt * 2);
    }
    const pitch = Math.max(0.1, Math.min(1.25, s.camPitch + this.pitchBias));
    const yaw = s.camYaw + this.yawBias;

    const want = Math.max(0.9, Math.min(full, this.clearAlong(yaw, pitch) - 0.3));
    const k = want < s.curDist ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 3);
    s.curDist += (want - s.curDist) * (dt >= 1 ? 1 : k);

    /* 环绕中心平滑偏移，避免进入提示范围时画面突然跳到一侧。 */
    const wantFocusBias = s.found ? 0.55 : nearDog ? 0.45 : 0;
    this.focusBias += (wantFocusBias - this.focusBias) * Math.min(1, dt * 4);
    const focusLocal = new Cesium.Cartesian3(
      s.x + (this.dogAnchor.x - s.x) * this.focusBias,
      s.y + (this.dogAnchor.y - s.y) * this.focusBias,
      this.focusHeight(),
    );
    const dir = this.cameraDir(yaw, pitch);
    const camLocal = Cesium.Cartesian3.add(
      focusLocal,
      Cesium.Cartesian3.multiplyByScalar(dir, s.curDist, new Cesium.Cartesian3()),
      new Cesium.Cartesian3(),
    );
    if (this.overviewBlend > 0 && this.overviewPose) {
      const t = this.overviewBlend * this.overviewBlend * (3 - 2 * this.overviewBlend);
      Cesium.Cartesian3.lerp(focusLocal, this.overviewPose.focus, t, focusLocal);
      Cesium.Cartesian3.lerp(camLocal, this.overviewPose.camera, t, camLocal);
    }
    this.setCameraPose(focusLocal, camLocal);
  }

  /** 以整个街区为焦点，按视口最窄的方向留出完整的立体轮廓。 */
  updateOverviewCamera() {
    const canvas = this.viewer.canvas;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const fovy = this.viewer.camera.frustum.fovy;
    const halfFov = Math.min(fovy / 2, Math.atan(Math.tan(fovy / 2) * aspect));
    const radius = TUNING.groundRadius + 2;
    const distance = radius / Math.sin(halfFov) / 0.68 * this.overviewZoom;
    const pitch = Cesium.Math.clamp(this.s.camPitch, 0.4, 1.2);
    const direction = this.cameraDir(this.s.camYaw, pitch);
    const focus = new Cesium.Cartesian3(0, 0, 1.7);
    // 窄屏的任务卡在底部，把完整街区稍微向上摆放。
    if (canvas.clientWidth <= 720) {
      const right = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(UP, direction, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      const viewUp = Cesium.Cartesian3.normalize(Cesium.Cartesian3.cross(direction, right, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      Cesium.Cartesian3.multiplyByScalar(viewUp, -distance * Math.tan(fovy / 2) * 0.24, focus);
      focus.z += 1.7;
    }
    const camera = Cesium.Cartesian3.add(focus, Cesium.Cartesian3.multiplyByScalar(direction, distance, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    this.overviewPose = { focus, camera };
    this.setCameraPose(focus, camera);
  }

  setCameraPose(focusLocal, camLocal) {
    const focusEcef = Cesium.Matrix4.multiplyByPoint(this.frame, focusLocal, new Cesium.Cartesian3());
    const camEcef = Cesium.Matrix4.multiplyByPoint(this.frame, camLocal, new Cesium.Cartesian3());
    const direction = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(focusEcef, camEcef, new Cesium.Cartesian3()), new Cesium.Cartesian3());
    const up = Cesium.Matrix4.multiplyByPointAsVector(this.frame, UP, new Cesium.Cartesian3());
    this.viewer.camera.setView({
      destination: camEcef,
      orientation: { direction, up },
      endTransform: Cesium.Matrix4.IDENTITY,
    });
  }

  /* ---------- 附近提示与确认 ---------- */
  distanceToDog() {
    return Math.hypot(this.s.x - this.dogAnchor.x, this.s.y - this.dogAnchor.y);
  }

  /** 视线检测：角色到吉拿之间是否有房屋、摊位、小吃车遮挡 */
  hasLineOfSight() {
    const from = new Cesium.Cartesian3(this.s.x, this.s.y, 1.5);
    const to = new Cesium.Cartesian3(this.dogAnchor.x, this.dogAnchor.y, (this.dogAnchor.z || 0) + 0.3);
    const d = Cesium.Cartesian3.subtract(to, from, new Cesium.Cartesian3());
    const len = Cesium.Cartesian3.magnitude(d);
    if (len < 1e-4) return true;
    Cesium.Cartesian3.divideByScalar(d, len, d);
    for (const b of this.solids) {
      const t = rayBox(from, d, b);
      if (t !== null && t < len - 0.05) return false;
    }
    return true;
  }

  canConfirm() {
    return this.s.playing && !this.s.found
      && this.distanceToDog() < TUNING.nearDog
      && this.hasLineOfSight();
  }

  updateNear() {
    const s = this.s;
    if (!s.playing || s.found) {
      if (this.nearKey !== null) {
        this.nearKey = null;
        this.hooks.onNear?.(null);
      }
      return;
    }

    const dogNear = this.canConfirm();
    let best = null;
    let bestD = TUNING.nearObject;
    if (!dogNear) {
      for (const sight of this.sights) {
        const d = boxDistance(sight.box, s.x, s.y);
        if (d < bestD) {
          bestD = d;
          best = sight;
        }
      }
    }

    const key = dogNear ? 'dog' : best ? `say:${best.say}` : null;
    const target = dogNear
      ? { x: this.dogAnchor.x, y: this.dogAnchor.y, z: 1.5 }
      : best
        ? {
          x: Math.max(best.box.x0, Math.min(s.x, best.box.x1)),
          y: Math.max(best.box.y0, Math.min(s.y, best.box.y1)),
          z: Math.min(2.5, best.box.height + 0.15),
        }
        : null;

    this.hooks.onNear?.(key ? { key, dog: dogNear, text: dogNear ? '汪！是吉拿！' : best.say, target, inspectable: best?.inspectable || null } : null);
    this.nearKey = key;
  }

  /* ---------- 提示 ---------- */
  useHint() {
    if (!this.active || !this.s.playing || this.s.found) return null;
    if (this.hintState.left <= 0) return null;
    this.hintState.left--;
    this.hintState.used++;
    const used = this.hintState.used;

    const hintYaw = this.s.camYaw + this.yawBias;
    const fx = -Math.sin(hintYaw);
    const fy = -Math.cos(hintYaw);
    const dx = this.dogAnchor.x - this.s.x;
    const dy = this.dogAnchor.y - this.s.y;
    const cross = fx * dy - fy * dx;
    const dot = fx * dx + fy * dy;
    const a = Math.atan2(cross, dot);
    const where = Math.abs(a) > 2.3 ? '你身后' : Math.abs(a) < 0.75 ? '你前方' : a > 0 ? '你左边' : '你右边';

    this.hopDog(2);

    if (used === 1) {
      // a 的正方向为画面左侧，StereoPanner 的正值则代表右声道。
      return { index: 1, text: `汪汪！叫声来自${where}。`, pan: Math.max(-1, Math.min(1, -Math.sin(a))), where };
    }

    /* 第二次提示：短暂标出位置 */
    const marker = this.dogMarker;
    marker.show = true;
    const token = ++this.animToken;
    this.after(TUNING.hintHighlightMs, () => {
      if (token === this.animToken || !this.active) marker.show = false;
    });
    return { index: 2, text: '汪汪！吉拿的位置亮起来了。', pan: 0 };
  }

  hopDog(times = 2) {
    const start = performance.now();
    const token = ++this.animToken;
    const step = () => {
      if (!this.active || token !== this.animToken) return;
      const t = (performance.now() - start) % 320;
      this.s.hop = Math.sin((t / 320) * Math.PI) * 0.5;
      if (performance.now() - start < times * 320) requestAnimationFrame(step);
      else this.s.hop = 0;
    };
    step();
  }

  after(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
    return id;
  }

  clearTimers() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
  }

  /* ---------- 确认找到 ---------- */
  tryConfirm() {
    if (!this.canConfirm()) return null;
    this.s.found = true;
    this.s.playing = false;
    this.elapsed = performance.now() - this.startAt;
    this.dogMarker.show = false;
    this.hooks.onNear?.(null);

    /* 小年转向吉拿，双臂抬起表示抱起 */
    this.s.yaw = Math.atan2(this.dogAnchor.x - this.s.x, this.dogAnchor.y - this.s.y);
    this.s.camYaw = this.s.yaw + Math.PI;
    this.hopDog(4);
    this.setCrouch(false);

    const stars = this.starsFor(this.elapsed, this.hintState.used);
    this.hooks.onFound?.({ ms: this.elapsed, hints: this.hintState.used, stars });
    return { ms: this.elapsed, hints: this.hintState.used, stars };
  }

  starsFor(ms, hints) {
    if (hints <= TUNING.star3.hints && ms <= TUNING.star3.time) return 3;
    if (hints <= TUNING.star2.hints && ms <= TUNING.star2.time) return 2;
    return 1;
  }

  /* ---------- 工具 ---------- */
  localPoint({ x, y, z = 0 }) {
    return localToWorld(this.frame, x, y, z);
  }

  /* ---------- 退出 ---------- */
  exit() {
    const previous = this.previousLighting;
    if (previous) {
      const scene = this.viewer.scene;
      scene.light = previous.light;
      scene.backgroundColor = previous.backgroundColor;
      scene.skyBox.show = previous.skyBox;
      scene.skyAtmosphere.show = previous.skyAtmosphere;
      scene.globe.showGroundAtmosphere = previous.groundAtmosphere;
      scene.globe.enableLighting = previous.globeLighting;
      scene.sphericalHarmonicCoefficients = previous.sphericalHarmonicCoefficients;
      this.previousLighting = null;
    }
    this.active = false;
    this.s.playing = false;
    this.s.found = false;
    this.clearTimers();
    this.clearInput();
    this.dogMarker.show = false;
    this.setCrouch(false);
    this.viewer.scene.screenSpaceCameraController.enableInputs = true;
  }

  update(dt, now) {
    if (!this.active) return;
    if (this.s.playing) this.move(dt);
    else {
      this.heroSpeed = 0;
      this.s.walkAmt += (0 - this.s.walkAmt) * Math.min(1, dt * 10);
      this.s.swingAngle = 0;
    }
    this.heroAvatar?.update(dt, this.heroSpeed);
    this.updateCamera(dt);
    this.updateNear();
    this.hooks.onTick?.(this.s.playing ? now - this.startAt : this.elapsed);
  }
}

/* ---------- 工具 ---------- */
function boxDistance(b, x, y) {
  const dx = Math.max(b.x0 - x, 0, x - b.x1);
  const dy = Math.max(b.y0 - y, 0, y - b.y1);
  return Math.hypot(dx, dy);
}

/** 射线与轴对齐包围盒求交（局部米制坐标），返回最近交点距离 */
function rayBox(o, d, b) {
  let tmin = 0;
  let tmax = Infinity;
  const bounds = [
    [b.x0, b.x1, o.x, d.x],
    [b.y0, b.y1, o.y, d.y],
    [0, b.height, o.z, d.z],
  ];
  for (const [lo, hi, org, dir] of bounds) {
    if (Math.abs(dir) < 1e-8) {
      if (org < lo || org > hi) return null;
      continue;
    }
    let t1 = (lo - org) / dir;
    let t2 = (hi - org) / dir;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? tmin : null;
}
