import * as Cesium from 'cesium';
import geo from '../data/world.json';

/**
 * 自绘矢量地球瓦片。
 *
 * 不接入任何在线地图服务：海岸线来自项目内置的 world.json，
 * 按 Cesium 标准的 GeographicTilingScheme 逐级把矢量重绘成 256×256 瓦片。
 * 放大时不是「把一张图拉伸」，而是真的向上一层要新瓦片，
 * 海岸线和经纬网在任何缩放级别都保持清晰。
 *
 * 云层用「世界坐标里的分形噪声」生成：同一个经纬度在任何瓦片上取到同一个值，
 * 因此瓦片之间没有接缝；细节随层级加深，放大后才会有新的云纹出现。
 */

const TILE = 256;
const MAX_LEVEL = 8;
const CELL = 10; // 空间索引格子（度）
const F0 = 1 / 55; // 云系的基础频率：约 55° 一个大型云团

const C_OCEAN = '#10336f';
const C_SHELF = 'rgba(116,164,255,.10)';
const C_LAND = '#8d96dd';
const C_LAND_EDGE = 'rgba(214,218,255,.85)';
const C_GRID = 'rgba(176,200,255,.14)';

/* ---------- 陆地矢量 ---------- */

/** 把扁平点数组包成 Path2D（坐标单位：度，x = 经度 + 180，y = 90 - 纬度） */
function toPath(ring) {
  const path = new Path2D();
  path.moveTo(ring[0], ring[1]);
  for (let i = 2; i < ring.length; i += 2) path.lineTo(ring[i], ring[i + 1]);
  path.closePath();
  return path;
}

function prepare(rings) {
  const out = [];
  for (const ring of rings) {
    if (ring.length < 6) continue;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      const x = ring[i], y = ring[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    out.push({ path: toPath(ring), minX, maxX, minY, maxY });
  }
  return out;
}

/** 10° 网格索引：一个瓦片只处理与它相交的环 */
function buildIndex(rings) {
  const cols = 360 / CELL;
  const rows = 180 / CELL;
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => []));
  for (const r of rings) {
    const c0 = Math.max(0, Math.min(cols - 1, Math.floor(r.minX / CELL)));
    const c1 = Math.max(0, Math.min(cols - 1, Math.floor(r.maxX / CELL)));
    const r0 = Math.max(0, Math.min(rows - 1, Math.floor(r.minY / CELL)));
    const r1 = Math.max(0, Math.min(rows - 1, Math.floor(r.maxY / CELL)));
    for (let y = r0; y <= r1; y++) {
      for (let x = c0; x <= c1; x++) grid[y][x].push(r);
    }
  }
  return { grid, cols, rows };
}

function collect(index, x0, y0, x1, y1) {
  const { grid, cols, rows } = index;
  const c0 = Math.max(0, Math.min(cols - 1, Math.floor(x0 / CELL)));
  const c1 = Math.max(0, Math.min(cols - 1, Math.floor(x1 / CELL)));
  const r0 = Math.max(0, Math.min(rows - 1, Math.floor(y0 / CELL)));
  const r1 = Math.max(0, Math.min(rows - 1, Math.floor(y1 / CELL)));
  const seen = new Set();
  const out = [];
  for (let y = r0; y <= r1; y++) {
    for (let x = c0; x <= c1; x++) {
      for (const r of grid[y][x]) {
        if (seen.has(r)) continue;
        seen.add(r);
        out.push(r);
      }
    }
  }
  return out;
}

/** 经纬网间隔随层级加密，放大时才「有东西可看」 */
function gridStep(level) {
  if (level <= 1) return 30;
  if (level <= 3) return 10;
  if (level <= 5) return 5;
  return 1;
}

/* ---------- 分形噪声（世界坐标，跨瓦片连续） ---------- */

function hash2(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 一个八度组的加权叠加，返回 0..1 */
function octaves(lon, y, freq, count) {
  let v = 0;
  let amp = 1;
  let total = 0;
  let f = freq;
  for (let i = 0; i < count; i++) {
    v += amp * vnoise(lon * f, y * f);
    total += amp;
    amp *= 0.55;
    f *= 2;
  }
  return v / total;
}

/**
 * 云量场：粗层决定「这片区域多云还是晴」，细节层决定云的形状。
 * 粗层频率固定在世界坐标里，任何层级都参与计算，保证瓦片之间连续；
 * 细节层的频率随层级下探，放大后才长出新云纹。
 */
function cloudValue(lon, y, level) {
  const stretch = 1 / Math.max(0.2, Math.cos(((90 - y) * Math.PI) / 180));
  const lx = lon * stretch;
  const coarse = octaves(lx, y, F0, 3);
  const detail = octaves(lx, y, F0 * 2 ** Math.max(0, level - 1), 4);
  return 0.5 + (coarse - 0.5) * 0.7 + (detail - 0.5) * 0.95;
}

/** 一个瓦片内的云量图（0..1） */
function cloudField(x0, y0, w, h, level, size) {
  const out = new Float32Array(size * size);
  for (let py = 0; py < size; py++) {
    const y = y0 + (h * (py + 0.5)) / size;
    for (let px = 0; px < size; px++) {
      const lon = x0 + (w * (px + 0.5)) / size;
      out[py * size + px] = cloudValue(lon, y, level);
    }
  }
  return out;
}

/* ---------- 瓦片绘制 ---------- */

/** 一个瓦片内的起伏纹理（灰度，128 为中性），用来给纯色块加一点地表质感 */
function reliefCanvas(x0, y0, w, h, level) {
  const size = 48;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const f = F0 * 2 ** Math.max(0, level - 1);
  for (let py = 0; py < size; py++) {
    const y = y0 + (h * (py + 0.5)) / size;
    const stretch = 1 / Math.max(0.2, Math.cos(((90 - y) * Math.PI) / 180));
    for (let px = 0; px < size; px++) {
      const x = x0 + (w * (px + 0.5)) / size;
      const v = octaves(x * stretch, y, f, 4);
      const k = Math.max(0, Math.min(255, Math.round(128 + (v - 0.5) * 300)));
      const o = (py * size + px) * 4;
      d[o] = k;
      d[o + 1] = k;
      d[o + 2] = k;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

/** 在度坐标下画一个瓦片的经纬网 */
function strokeGrid(ctx, x0, y0, x1, y1, step, s) {
  ctx.beginPath();
  for (let gx = Math.ceil(x0 / step) * step; gx <= x1; gx += step) {
    ctx.moveTo(gx, y0);
    ctx.lineTo(gx, y1);
  }
  for (let gy = Math.ceil(y0 / step) * step; gy <= y1; gy += step) {
    ctx.moveTo(x0, gy);
    ctx.lineTo(x1, gy);
  }
  ctx.lineWidth = 0.8 / s;
  ctx.strokeStyle = C_GRID;
  ctx.stroke();
}

function drawLandTile(ctx, rings, index, x0, y0, w, h, level) {
  const s = TILE / w; // 每度多少像素
  const x1 = x0 + w;
  const y1 = y0 + h;

  const path = new Path2D();
  for (const r of collect(index, x0, y0, x1, y1)) {
    for (const off of [-360, 0, 360]) {
      if (r.maxX + off < x0 || r.minX + off > x1) continue;
      if (r.maxY < y0 || r.minY > y1) continue;
      path.addPath(r.path, { a: 1, b: 0, c: 0, d: 1, e: off, f: 0 });
    }
  }

  const relief = reliefCanvas(x0, y0, w, h, level);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'overlay';

  // 海面：极淡的纹理，避免大面积纯色
  ctx.globalAlpha = 0.1;
  ctx.drawImage(relief, 0, 0, TILE, TILE);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);

  // 大陆架：近岸几道极淡的宽线，制造浅海层次
  ctx.lineJoin = 'round';
  ctx.strokeStyle = C_SHELF;
  for (const k of [3, 1.6]) {
    ctx.lineWidth = k / s;
    ctx.stroke(path);
  }

  // 经纬网：先在海底铺一层，陆地填完再压一层，放大时才看得出层级在变密
  const step = gridStep(level);
  strokeGrid(ctx, x0, y0, x1, y1, step, s);

  // 陆地
  ctx.fillStyle = C_LAND;
  ctx.fill(path);

  // 陆地起伏
  ctx.save();
  ctx.clip(path);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.3;
  ctx.drawImage(relief, x0, y0, w, h);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  strokeGrid(ctx, x0, y0, x1, y1, step, s);

  ctx.strokeStyle = C_LAND_EDGE;
  ctx.lineWidth = 0.9 / s;
  ctx.stroke(path);
}

function drawCloudTile(ctx, x0, y0, w, h, level) {
  const size = 96;
  const field = cloudField(x0, y0, w, h, level, size);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c2 = cv.getContext('2d');
  const img = c2.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < field.length; i++) {
    const a = smoothstep(0.54, 0.75, field[i]) * 0.72;
    const o = i * 4;
    d[o] = 226;
    d[o + 1] = 236;
    d[o + 2] = 255;
    d[o + 3] = a * 255;
  }
  c2.putImageData(img, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cv, 0, 0, TILE, TILE);
}

/* ---------- ImageryProvider ---------- */

class TileCanvasProvider {
  constructor(draw, hasAlpha) {
    this._draw = draw;
    this._hasAlpha = hasAlpha;
    this._cache = new Map();
    this._scheme = new Cesium.GeographicTilingScheme();
    this._rect = Cesium.Rectangle.fromDegrees(-180, -90, 180, 90);
  }

  get rectangle() { return this._rect; }
  get tileWidth() { return TILE; }
  get tileHeight() { return TILE; }
  get maximumLevel() { return MAX_LEVEL; }
  get minimumLevel() { return 0; }
  get tilingScheme() { return this._scheme; }
  get tileDiscardPolicy() { return undefined; }
  get errorEvent() { return undefined; }
  get credit() { return undefined; }
  get proxy() { return undefined; }
  get hasAlphaChannel() { return this._hasAlpha; }
  get ready() { return true; }
  get readyPromise() { return Promise.resolve(true); }

  requestImage(x, y, level) {
    const key = `${level}/${x}/${y}`;
    const hit = this._cache.get(key);
    if (hit) return Promise.resolve(hit);

    // GeographicTilingScheme：0 级是 2×1 块，每块 180°×180°
    const cols = 2 ** (level + 1);
    const rows = 2 ** level;
    const w = 360 / cols;
    const h = 180 / rows;
    const x0 = x * w;
    const y0 = y * h;

    const cv = document.createElement('canvas');
    cv.width = cv.height = TILE;
    const ctx = cv.getContext('2d');
    this._draw(ctx, x0, y0, w, h, level);

    if (this._cache.size > 420) this._cache.clear();
    this._cache.set(key, cv);
    return Promise.resolve(cv);
  }
}

const rings = prepare(geo.land);
const index = buildIndex(rings);

export function createGlobeImagery() {
  return new TileCanvasProvider((ctx, x0, y0, w, h, level) => {
    ctx.fillStyle = C_OCEAN;
    ctx.fillRect(0, 0, TILE, TILE);
    drawLandTile(ctx, rings, index, x0, y0, w, h, level);
  }, false);
}

export function createCloudImagery() {
  return new TileCanvasProvider((ctx, x0, y0, w, h, level) => {
    ctx.clearRect(0, 0, TILE, TILE);
    drawCloudTile(ctx, x0, y0, w, h, level);
  }, true);
}
