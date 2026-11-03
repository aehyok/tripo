import * as Cesium from 'cesium';
import { ASSETS, SOLID_KEYS, SMALL_COLLIDER } from '../config.js';

const C = {
  paper: '#fff4dc',
  night: '#161b4d',
  night2: '#272f78',
  night3: '#3a4396',
  pink: '#e5127d',
  marigold: '#ffb31a',
  jade: '#12a66a',
  turq: '#1cc0c9',
  ink: '#1d1645',
  wood: '#5b3a2e',
  woodLight: '#d99a5b',
  woodDark: '#7a4a26',
  window: '#ffd98a',
};

/* 每类占位模型的构件：位置为物件局部坐标（x 东、y 北、z 上） */
export const BUILDERS = {
  house(o) {
    const tint = o.tint || C.pink;
    const parts = [
      { kind: 'box', size: [4.4, 3.4, 4.6], at: [0, 0, 2.3], color: tint },
      { kind: 'box', size: [4.6, 3.6, 0.26], at: [0, 0, 4.73], color: C.paper },
      { kind: 'box', size: [4.4, 3.4, 0.3], at: [0, 0, 0.15], color: C.night3 },
      { kind: 'box', size: [1, 0.08, 1.9], at: [0, 1.72, 0.95], color: '#3a2453' },
      { kind: 'box', size: [2, 0.6, 0.1], at: [0, 1.95, 2.62], color: C.night2 },
    ];
    for (const [x, z] of [[-1.35, 1.45], [1.35, 1.45], [-1.35, 3.25], [0, 3.25], [1.35, 3.25]]) {
      parts.push({ kind: 'box', size: [0.84, 0.08, 0.98], at: [x, 1.72, z], color: C.paper });
      parts.push({ kind: 'box', size: [0.64, 0.1, 0.78], at: [x, 1.73, z], color: C.window });
    }
    for (const x of [-1.2, 1.2]) {
      parts.push({ kind: 'box', size: [0.84, 0.08, 0.98], at: [x, -1.72, 3.1], color: C.paper });
      parts.push({ kind: 'box', size: [0.64, 0.1, 0.78], at: [x, -1.73, 3.1], color: C.window });
    }
    parts.push({ kind: 'box', size: [0.9, 0.08, 1.8], at: [-1.2, -1.72, 0.9], color: '#3a2453' });
    return { parts, footprint: [-2.3, 2.3, -1.8, 1.8], height: 4.9, solid: true };
  },

  stall(o) {
    const tint = o.tint || C.pink;
    const parts = [
      { kind: 'box', size: [2.7, 1.2, 0.9], at: [0, 0, 0.45], color: C.wood },
      { kind: 'box', size: [2.8, 1.3, 0.08], at: [0, 0, 0.94], color: C.woodLight },
    ];
    for (const [x, y] of [[-1.3, -0.7], [1.3, -0.7], [-1.3, 0.7], [1.3, 0.7]]) {
      parts.push({ kind: 'cylinder', size: [0.05, 0.05, 2.5], at: [x, y, 1.25], color: C.paper });
    }
    for (let i = 0; i < 7; i++) {
      parts.push({
        kind: 'box',
        size: [0.4, 1.8, 0.14],
        at: [-1.2 + i * 0.4, 0, 2.6 - Math.abs(i - 3) * 0.04],
        color: i % 2 ? C.paper : tint,
      });
    }
    const goods = [C.jade, C.marigold, C.pink, C.turq, C.paper];
    for (let i = 0; i < 5; i++) {
      parts.push({ kind: 'box', size: [0.3, 0.3, 0.14], at: [-1 + i * 0.5, 0, 1.05], color: goods[i] });
    }
    return { parts, footprint: [-1.45, 1.45, -0.95, 0.95], height: 2.9, solid: true };
  },

  cart() {
    const parts = [
      { kind: 'box', size: [2.2, 1.2, 1.1], at: [0, 0, 1.0], color: C.turq },
      { kind: 'box', size: [2.3, 1.3, 0.12], at: [0, 0, 1.6], color: C.paper },
      { kind: 'cylinder', size: [0.04, 0.04, 1.2], at: [0, 0, 2.0], color: C.paper },
      { kind: 'cylinder', size: [0.05, 1.25, 0.52], at: [0, 0, 2.5], color: C.marigold },
    ];
    for (const x of [-0.75, 0.75]) {
      for (const y of [0.65, -0.65]) {
        parts.push({
          kind: 'cylinder',
          size: [0.36, 0.36, 0.14],
          at: [x, y, 0.36],
          color: C.ink,
          rot: ['x', Math.PI / 2],
        });
      }
    }
    for (let i = 0; i < 4; i++) {
      parts.push({
        kind: 'cylinder',
        size: [0.07, 0.09, 0.38],
        at: [-0.6 + i * 0.4, 0.2, 1.84],
        color: '#ffd34d',
        rot: ['z', 0.5],
      });
    }
    return { parts, footprint: [-1.25, 1.25, -0.75, 0.75], height: 2.7, solid: true };
  },

  pinata() {
    const parts = [
      { kind: 'cylinder', size: [0.07, 0.1, 3.7], at: [0, 0, 1.85], color: C.wood },
      { kind: 'box', size: [1.3, 0.09, 0.09], at: [0.6, 0, 3.6], color: C.wood },
      { kind: 'cylinder', size: [0.015, 0.015, 0.5], at: [1.15, 0, 3.32], color: C.paper },
      { kind: 'ellipsoid', size: [0.34, 0.34, 0.34], at: [1.15, 0, 2.65], color: C.pink },
    ];
    const spikes = [
      [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0],
      [0.6, 0.6, 0.5], [-0.6, -0.6, 0.5], [-0.6, 0.6, -0.5], [0.6, -0.6, -0.5],
    ];
    const cols = [C.marigold, C.turq, C.jade, C.paper];
    spikes.forEach((d, i) => {
      const len = Math.hypot(...d);
      parts.push({
        kind: 'ellipsoid',
        size: [0.14, 0.14, 0.14],
        at: [1.15 + (d[0] / len) * 0.42, (d[1] / len) * 0.42, 2.65 + (d[2] / len) * 0.42],
        color: cols[i % 4],
      });
    });
    return { parts, footprint: [-0.2, 1.5, -0.35, 0.35], height: 3.8, solid: false, small: 'pinata' };
  },

  ball() {
    const parts = [{ kind: 'ellipsoid', size: [0.27, 0.27, 0.27], at: [0, 0, 0.27], color: C.paper }];
    const patches = [[0, 0.24, 0.14], [0.18, -0.16, 0.12], [-0.16, 0.05, 0.2]];
    patches.forEach((p) => parts.push({ kind: 'ellipsoid', size: [0.1, 0.1, 0.1], at: p, color: C.ink }));
    return { parts, footprint: [-0.3, 0.3, -0.3, 0.3], height: 0.55, solid: false, small: 'ball' };
  },

  cactus() {
    const parts = [
      { kind: 'cylinder', size: [0.36, 0.27, 0.42], at: [0, 0, 0.21], color: '#c9673a' },
      { kind: 'cylinder', size: [0.21, 0.25, 1.1], at: [0, 0, 0.92], color: C.jade },
      { kind: 'cylinder', size: [0.09, 0.09, 0.5], at: [0.28, 0, 1.05], color: C.jade, rot: ['z', -0.8] },
      { kind: 'cylinder', size: [0.09, 0.09, 0.35], at: [0.46, 0, 1.33], color: C.jade },
    ];
    return { parts, footprint: [-0.4, 0.55, -0.4, 0.4], height: 1.7, solid: false, small: 'cactus' };
  },

  crate() {
    const parts = [
      { kind: 'box', size: [1, 1, 1], at: [0, 0, 0.5], color: '#b67a45' },
      { kind: 'box', size: [1.04, 1.04, 0.12], at: [0, 0, 0.1], color: C.woodDark },
      { kind: 'box', size: [1.04, 1.04, 0.12], at: [0, 0, 0.9], color: C.woodDark },
    ];
    return { parts, footprint: [-0.52, 0.52, -0.52, 0.52], height: 1, solid: false };
  },

  lamp() {
    const parts = [
      { kind: 'cylinder', size: [0.06, 0.1, 3.2], at: [0, 0, 1.6], color: C.ink },
      { kind: 'box', size: [0.42, 0.42, 0.5], at: [0, 0, 3.35], color: C.window },
      { kind: 'box', size: [0.5, 0.5, 0.08], at: [0, 0, 3.64], color: C.ink },
    ];
    return { parts, footprint: [-0.2, 0.2, -0.2, 0.2], height: 3.6, solid: false, small: 'lamp' };
  },

  bunting() {
    const L = 8.9;
    const parts = [
      { kind: 'cylinder', size: [0.07, 0.1, 4.6], at: [-L, 0, 2.3], color: C.paper },
      { kind: 'cylinder', size: [0.07, 0.1, 4.6], at: [L, 0, 2.3], color: C.paper },
    ];
    const rope = [];
    const cols = [C.pink, C.marigold, C.turq, C.jade, C.paper];
    for (let i = 0; i <= 56; i++) {
      const t = i / 56;
      const x = -L + 2 * L * t;
      const z = 4.5 - 1.1 * (1 - Math.pow(2 * t - 1, 2));
      rope.push([x, 0, z]);
      if (i % 2 === 1) {
        parts.push({ kind: 'box', size: [0.52, 0.04, 0.62], at: [x, 0, z - 0.34], color: cols[(i >> 1) % 5] });
      } else if (i % 4 === 0) {
        parts.push({ kind: 'ellipsoid', size: [0.07, 0.07, 0.07], at: [x, 0, z - 0.08], color: C.window });
      }
    }
    parts.push({ kind: 'polyline', points: rope, color: C.paper, width: 1.5 });
    return { parts, footprint: null, height: 4.6, solid: false, poles: L };
  },
};

/* ---------- 坐标换算 ---------- */
export function rotate2(x, y, ry) {
  const cos = Math.cos(ry);
  const sin = Math.sin(ry);
  return [x * cos + y * sin, -x * sin + y * cos];
}

function makeFrameMatrix(anchor) {
  return Cesium.Transforms.eastNorthUpToFixedFrame(
    Cesium.Cartesian3.fromDegrees(anchor.lon, anchor.lat, anchor.height),
  );
}

function frameQuat(frame) {
  const m3 = Cesium.Matrix4.getMatrix3(frame, new Cesium.Matrix3());
  return Cesium.Quaternion.fromRotationMatrix(m3);
}

function colorOf(css) {
  return Cesium.Color.fromCssColorString(css);
}

/** 把物件局部的点换算成 ECEF 坐标 */
export function localToWorld(frame, x, y, z) {
  return Cesium.Matrix4.multiplyByPoint(frame, new Cesium.Cartesian3(x, y, z), new Cesium.Cartesian3());
}

const AXIS = {
  x: Cesium.Cartesian3.UNIT_X,
  y: Cesium.Cartesian3.UNIT_Y,
  z: Cesium.Cartesian3.UNIT_Z,
};

/**
 * 只计算碰撞与提示用的元数据，不创建实体（正式模型也复用同一套设计数据）
 */
export function propMeta(spec) {
  const builder = BUILDERS[spec.key];
  if (!builder) return { box: null, solid: false, small: null, poles: null };
  const built = builder(spec);
  let box = null;
  if (built.footprint) {
    const [x0, x1, y0, y1] = built.footprint;
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => rotate2(x, y, spec.ry || 0));
    const xs = corners.map((c) => c[0] + spec.x);
    const ys = corners.map((c) => c[1] + spec.y);
    box = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      height: built.height,
    };
  }
  return {
    box,
    solid: !!built.solid && SOLID_KEYS.has(spec.key),
    small: built.small ? SMALL_COLLIDER[built.small] : null,
    poles: built.poles || null,
  };
}

/**
 * 生成一个物件的所有占位实体。
 * @param {Cesium.Viewer} viewer
 * @param {Cesium.Matrix4} frame ENU 基准矩阵
 * @param {object} spec LAYOUT 中的一项
 * @param {Cesium.Quaternion} fq 基准朝向
 */
export function createProp(viewer, frame, spec, fq) {
  const builder = BUILDERS[spec.key];
  if (!builder) return { entities: [], meta: propMeta(spec) };
  const built = builder(spec);
  const ry = spec.ry || 0;
  const yawQ = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, -ry);
  const objQ = Cesium.Quaternion.multiply(fq, yawQ, new Cesium.Quaternion());

  const entities = [];
  for (const part of built.parts) {
    /* 纸旗的绳索是一整条折线，没有单点位置 */
    if (part.kind === 'polyline') {
      const pts = part.points.map(([x, y, z]) => {
        const [rx, ry2] = rotate2(x, y, ry);
        return localToWorld(frame, spec.x + rx, spec.y + ry2, z);
      });
      entities.push(
        viewer.entities.add({
          polyline: {
            positions: pts,
            width: part.width,
            material: colorOf(part.color),
          },
        }),
      );
      continue;
    }

    const [ox, oy] = rotate2(part.at[0], part.at[1], ry);
    const position = localToWorld(frame, spec.x + ox, spec.y + oy, part.at[2]);
    let orientation = objQ;
    if (part.rot) {
      const q = Cesium.Quaternion.fromAxisAngle(AXIS[part.rot[0]], part.rot[1]);
      orientation = Cesium.Quaternion.multiply(objQ, q, new Cesium.Quaternion());
    }
    const material = colorOf(part.color);

    if (part.kind === 'box') {
      entities.push(
        viewer.entities.add({
          position,
          orientation,
          box: {
            dimensions: new Cesium.Cartesian3(part.size[0], part.size[1], part.size[2]),
            material,
          },
        }),
      );
    } else if (part.kind === 'cylinder') {
      entities.push(
        viewer.entities.add({
          position,
          orientation,
          cylinder: {
            length: part.size[2],
            topRadius: part.size[0],
            bottomRadius: part.size[1],
            material,
          },
        }),
      );
    } else if (part.kind === 'ellipsoid') {
      entities.push(
        viewer.entities.add({
          position,
          orientation,
          ellipsoid: {
            radii: new Cesium.Cartesian3(part.size[0], part.size[1], part.size[2]),
            material,
          },
        }),
      );
    }
  }

  /* 碰撞与提示用的轴对齐包围盒（街区局部坐标） */
  return { entities, meta: propMeta(spec) };
}

/**
 * GLB 模型：填了 ASSETS[key].glb 时用它替换占位模型。
 * 约定（PRD 8.5）：模型底部贴地、比例真实、前向与视觉朝向一致，
 * 因此这里默认 scale = 1，个别资产可用 ASSETS[key].scale 微调。
 * 载入失败时返回 null，调用方回退到占位模型（PRD 9.3）。
 */
const validatedModels = new Map();

export async function createModelEntity(viewer, frame, spec, key, fq) {
  const cfg = ASSETS[key];
  if (!cfg?.glb) return null;

  if (!validatedModels.has(cfg.glb)) {
    try {
      const probe = await Cesium.Model.fromGltfAsync({ url: cfg.glb, show: false });
      probe.destroy();
      validatedModels.set(cfg.glb, true);
    } catch (err) {
      console.warn('[资产] GLB 载入失败，改用占位模型：', cfg.glb, err);
      validatedModels.set(cfg.glb, false);
    }
  }
  if (!validatedModels.get(cfg.glb)) return null;

  const [ox, oy] = rotate2(0, 0, spec.ry || 0);
  const position = localToWorld(frame, spec.x + ox, spec.y + oy, 0);
  const yawQ = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, -(spec.ry || 0));
  const orientation = Cesium.Quaternion.multiply(fq, yawQ, new Cesium.Quaternion());

  return viewer.entities.add({
    position,
    orientation,
    model: {
      uri: cfg.glb,
      scale: cfg.scale ?? 1,
      minimumPixelSize: 24,
      heightReference: Cesium.HeightReference.NONE,
    },
  });
}

export { makeFrameMatrix, frameQuat, colorOf, C };
