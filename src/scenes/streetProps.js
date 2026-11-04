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
    const parts = [
      { kind: 'box', size: [2.2, 0.9, 0.72], at: [0, 0, 0.36], color: C.wood },
      { kind: 'box', size: [2.34, 1.06, 0.16], at: [0, 0, 0.77], color: C.woodLight },
    ];
    for (const x of [-1.055, 1.055]) {
      for (const y of [-0.43, 0.43]) {
        parts.push({ kind: 'box', size: [0.14, 0.14, 1.05], at: [x, y, 1.285], color: C.wood });
      }
    }
    for (let i = 0; i < 8; i++) {
      parts.push({ kind: 'box', size: [0.3, 1.2, 0.16], at: [-1.05 + i * 0.3, 0, 2.12], color: i % 2 ? C.paper : C.marigold });
    }
    parts.push(...BUILDERS.stallGoods(o).parts);
    return { parts, footprint: [-1.0764, 1.0764, -0.4876, 0.4876], height: 0.85, solid: true };
  },

  stallGoods(o) {
    const parts = [];
    if (o.accessory === 'scarf') {
      parts.push({ kind: 'box', size: [0.28, 0.75, 0.014], at: [0, 0.13, 0.858], color: C.pink });
      parts.push({ kind: 'box', size: [0.28, 0.014, 0.34], at: [0, 0.55, 0.68], color: C.pink });
      parts.push({ kind: 'box', size: [0.28, 0.018, 0.07], at: [0, 0.55, 0.65], color: C.paper });
    } else if (o.accessory === 'caps') {
      [C.pink, C.turq, C.marigold].forEach((color, i) => {
        parts.push({ kind: 'ellipsoid', size: [0.145, 0.145, 0.08], at: [-0.62 + i * 0.62, 0, 0.93], color });
        parts.push({ kind: 'box', size: [0.25, 0.19, 0.025], at: [-0.62 + i * 0.62, 0.15, 0.8625], color: C.paper });
      });
    }
    return { parts, footprint: null, height: 1.02, solid: false };
  },

  cart() {
    const parts = [
      { kind: 'box', size: [2, 0.75, 0.83], at: [0, -0.115, 0.735], color: C.pink },
      { kind: 'box', size: [2, 0.75, 1.05], at: [0, -0.115, 1.665], color: C.paper },
      { kind: 'box', size: [2.2, 1, 0.12], at: [0, -0.05, 2.34], color: C.pink },
      { kind: 'box', size: [1.7, 0.025, 0.66], at: [0, 0.27, 1.67], color: '#91a1b7' },
      { kind: 'box', size: [1.9, 0.33, 0.08], at: [0, 0.385, 1.1], color: C.woodLight },
    ];
    for (const x of [-0.73, 0.73]) {
      for (const y of [-0.46, 0.3]) {
        parts.push({ kind: 'cylinder', size: [0.18, 0.18, 0.13], at: [x, y, 0.18], color: C.ink, rot: ['x', Math.PI / 2] });
      }
    }
    for (let i = 0; i < 10; i++) {
      parts.push({ kind: 'box', size: [0.22, 0.18, 0.25], at: [-0.99 + i * 0.22, 0.36, 2.14], color: i % 2 ? C.marigold : C.pink });
    }
    for (let i = 0; i < 7; i++) {
      parts.push({ kind: 'ellipsoid', size: [0.04, 0.04, 0.04], at: [-0.9 + i * 0.3, 0.435, 2.265], color: '#ffd79a' });
    }
    return { parts, footprint: [-0.92, 0.92, -0.46, 0.23], height: 2.15, solid: true };
  },

  pinata() {
    const parts = [
      { kind: 'cylinder', size: [0.055, 0.075, 3.7], at: [0, 0, 1.85], color: C.wood },
      { kind: 'box', size: [1.33, 0.09, 0.09], at: [0.6, 0, 3.6], color: C.wood },
      { kind: 'cylinder', size: [0.012, 0.012, 0.655], at: [1.15, 0, 3.2275], color: C.paper },
      ...BUILDERS.pinataBody().parts,
    ];
    return { parts, footprint: [-0.2, 1.67, -0.26, 0.26], height: 3.7, solid: false, small: 'pinata' };
  },

  /* 与 pinata.glb 同尺寸的七角星：球心离地 2.374 米，尖角在 x-z 平面内 */
  pinataBody() {
    const parts = [{ kind: 'ellipsoid', size: [0.255, 0.255, 0.255], at: [1.15, 0, 2.374], color: C.pink }];
    const cols = [C.marigold, C.turq, C.paper];
    for (let i = 0; i < 7; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 7;
      parts.push({
        kind: 'ellipsoid',
        size: [0.1, 0.1, 0.1],
        at: [1.15 + Math.cos(a) * 0.38, 0, 2.374 + Math.sin(a) * 0.38],
        color: cols[i % 3],
      });
    }
    return { parts, footprint: null, height: 1.0, solid: false };
  },

  /* 与 ball.glb 同尺寸：直径 0.4 米 */
  ball() {
    const parts = [{ kind: 'ellipsoid', size: [0.2, 0.2, 0.2], at: [0, 0, 0.2], color: C.paper }];
    const patches = [[0, 0.18, 0.11], [0.135, -0.12, 0.09], [-0.12, 0.035, 0.155]];
    patches.forEach((p) => parts.push({ kind: 'ellipsoid', size: [0.07, 0.07, 0.07], at: p, color: C.ink }));
    return { parts, footprint: [-0.2, 0.2, -0.2, 0.2], height: 0.4, solid: false, small: 'ball' };
  },

  /* 与 cactus.glb 同尺寸：盆高 0.48、盆口半径 0.325，总高 1.1 米 */
  cactus() {
    const parts = [
      { kind: 'cylinder', size: [0.325, 0.24, 0.48], at: [0, 0, 0.24], color: '#c9673a' },
      { kind: 'cylinder', size: [0.12, 0.13, 0.64], at: [0, 0, 0.78], color: C.jade },
    ];
    for (const x of [-1, 1]) {
      parts.push({ kind: 'box', size: [0.16, 0.11, 0.11], at: [x * 0.2, 0, 0.7], color: C.jade });
      parts.push({ kind: 'cylinder', size: [0.065, 0.065, 0.26], at: [x * 0.28, 0, 0.83], color: C.jade });
    }
    return { parts, footprint: [-0.343, 0.343, -0.317, 0.317], height: 1.1, solid: false, small: 'cactus' };
  },

  /* 与 crate.glb 同尺寸：0.6 米立方 */
  crate() {
    const parts = [
      { kind: 'box', size: [0.56, 0.56, 0.56], at: [0, 0, 0.3], color: '#b67a45' },
      { kind: 'box', size: [0.6, 0.6, 0.07], at: [0, 0, 0.035], color: C.woodDark },
      { kind: 'box', size: [0.6, 0.6, 0.07], at: [0, 0, 0.565], color: C.woodDark },
    ];
    return { parts, footprint: [-0.276, 0.276, -0.276, 0.276], height: 0.6, solid: false };
  },

  /* 与 lamp.glb 同尺寸：总高 3.2 米，灯头约 0.67 米宽，底座半径 0.24 米 */
  lamp() {
    const parts = [
      { kind: 'cylinder', size: [0.2, 0.24, 0.45], at: [0, 0, 0.225], color: '#1f3a2f' },
      { kind: 'cylinder', size: [0.05, 0.06, 2.05], at: [0, 0, 1.475], color: '#1f3a2f' },
      { kind: 'box', size: [0.42, 0.42, 0.48], at: [0, 0, 2.74], color: C.window },
      { kind: 'box', size: [0.66, 0.66, 0.1], at: [0, 0, 3.03], color: '#1f3a2f' },
      { kind: 'ellipsoid', size: [0.06, 0.06, 0.06], at: [0, 0, 3.14], color: '#1f3a2f' },
    ];
    return { parts, footprint: [-0.333, 0.333, -0.337, 0.337], height: 3.2, solid: false, small: 'lamp' };
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
        parts.push({ kind: 'box', size: [0.18, 0.02, 0.18], at: [x, 0, z - 0.1], color: cols[(i >> 1) % 5] });
      } else if (i % 4 === 0) {
        parts.push({ kind: 'ellipsoid', size: [0.03, 0.03, 0.03], at: [x, 0, z - 0.045], color: C.window });
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
  // Gameplay proxy is independent of roof/balcony geometry.
  const collider = ASSETS[spec.key]?.collider || built;
  let box = null;
  if (collider.footprint) {
    const [x0, x1, y0, y1] = collider.footprint;
    const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => rotate2(x, y, spec.ry || 0));
    const xs = corners.map((c) => c[0] + spec.x);
    const ys = corners.map((c) => c[1] + spec.y);
    box = {
      x0: Math.min(...xs),
      x1: Math.max(...xs),
      y0: Math.min(...ys),
      y1: Math.max(...ys),
      height: collider.height,
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
        return localToWorld(frame, spec.x + rx, spec.y + ry2, z + (spec.z || 0));
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
    const position = localToWorld(frame, spec.x + ox, spec.y + oy, part.at[2] + (spec.z || 0));
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

export async function createModelEntity(viewer, frame, spec, key, fq, assetOverride) {
  const cfg = assetOverride || ASSETS[key];
  const uri = cfg?.variants?.[spec.variant] || cfg?.glb;
  if (!uri) return null;

  if (!validatedModels.has(uri)) {
    try {
      const probe = await Cesium.Model.fromGltfAsync({ url: uri, show: false });
      probe.destroy();
      validatedModels.set(uri, true);
    } catch (err) {
      console.warn('[资产] GLB 载入失败，改用占位模型：', uri, err);
      validatedModels.set(uri, false);
    }
  }
  if (!validatedModels.get(uri)) return null;

  const [ox, oy] = rotate2(0, 0, spec.ry || 0);
  const position = localToWorld(frame, spec.x + ox, spec.y + oy, spec.z || 0);
  // Cesium maps glTF +Z forward to model +X; face the local +Y street direction.
  const yawQ = Cesium.Quaternion.fromAxisAngle(Cesium.Cartesian3.UNIT_Z, Math.PI / 2 - (spec.ry || 0));
  const orientation = Cesium.Quaternion.multiply(fq, yawQ, new Cesium.Quaternion());

  return viewer.entities.add({
    position,
    orientation,
    model: {
      uri,
      scale: cfg.scale ?? 1,
      minimumPixelSize: cfg.minimumPixelSize ?? 24,
      heightReference: Cesium.HeightReference.NONE,
    },
  });
}

export { makeFrameMatrix, frameQuat, colorOf, C };
