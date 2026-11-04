import * as Cesium from 'cesium';
import { ANCHOR, REGION } from '../config.js';
import { REDUCED } from './tween.js';

/** 随真实相机飞行进度绘制；没有独立 RAF 或遗留定时器。 */
export class JourneyEffects {
  constructor(viewer) {
    this.viewer = viewer;
    this.el = document.getElementById('journey');
    this.canvas = document.getElementById('journeyCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.label = document.getElementById('journeyStage');
    this.meter = document.getElementById('journeyMeter');
    /* 转场视觉终点与地图闪烁点严格共用同一组经纬度。 */
    this.anchor = Cesium.Cartesian3.fromDegrees(REGION.sparkle.lon, REGION.sparkle.lat, ANCHOR.height);
    this.streaks = Array.from({ length: 112 }, (_, i) => ({
      angle: i * 2.39996,
      phase: Math.random(),
      speed: 0.45 + Math.random() * 0.6,
      length: 0.035 + Math.random() * 0.075,
    }));
  }

  start() {
    this.active = true;
    this.progress = 0;
    this.started = performance.now();
    this.arrivedAt = 0;
    this.el.hidden = false;
    this.el.dataset.phase = 'lock';
    document.body.classList.add('is-travelling');
    this.setProgress(0);
  }

  setProgress(value) {
    this.progress = value;
    const phase = value < 0.24 ? 'lock' : value < 0.72 ? 'dive' : 'approach';
    this.el.dataset.phase = phase;
    const text = phase === 'lock' ? '锁定坐标 · 跃迁引擎启动' : phase === 'dive' ? '星际跃迁 · 全速前进' : '能量汇聚 · 即将抵达';
    if (this.label.textContent !== text) this.label.textContent = text;
    this.meter.style.transform = `scaleX(${value})`;
  }

  arrive() {
    this.arrivedAt = performance.now();
    this.el.dataset.phase = 'arrived';
    this.label.textContent = '已抵达 · 冒险即将开始';
    this.meter.style.transform = 'scaleX(1)';
  }

  stop() {
    this.active = false;
    this.el.hidden = true;
    document.body.classList.remove('is-travelling');
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  update(now) {
    if (!this.active) return;
    const arrival = this.arrivedAt ? (now - this.arrivedAt) / (REDUCED ? 300 : 1350) : 0;
    if (arrival >= 1) return this.stop();
    if (REDUCED || !this.ctx) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const c = this.ctx;
    const clamp = (v) => Math.min(1, Math.max(0, v));
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const t = (now - this.started) / 1000;
    const p = this.progress;
    const settle = clamp((p - 0.78) / 0.22);
    const intensity = clamp(p / 0.18) * (0.76 + Math.sin(Math.PI * p) * 0.24) * (1 - settle * 0.78);
    const warp = Math.sin(Math.PI * clamp((p - 0.14) / 0.7));
    const fade = this.arrivedAt ? 1 - arrival : 1;
    const mobile = w < 700;
    const center = this.arrivedAt ? null : Cesium.SceneTransforms.worldToWindowCoordinates(this.viewer.scene, this.anchor);
    const x = center ? Math.max(w * 0.2, Math.min(w * 0.8, center.x)) : w / 2;
    const y = center ? Math.max(h * 0.25, Math.min(h * 0.65, center.y)) : h * 0.46;
    const reach = Math.hypot(w, h) * 0.68;

    /* 跃迁时边缘压暗，视线自然收束到目的地，中央始终保持清晰。 */
    if (warp > 0) {
      const vignette = c.createRadialGradient(x, y, Math.min(w, h) * 0.1, x, y, reach);
      vignette.addColorStop(0, 'rgba(11,13,45,0)');
      vignette.addColorStop(0.55, 'rgba(11,13,45,0)');
      vignette.addColorStop(1, `rgba(11,13,45,${warp * fade * 0.58})`);
      c.fillStyle = vignette;
      c.fillRect(0, 0, w, h);
    }

    c.save();
    c.globalCompositeOperation = 'screen';

    /* 双层星线：宽光轨提供能量，白亮线芯提供清晰的速度方向。 */
    const streakCount = mobile ? 58 : this.streaks.length;
    for (let i = 0; i < streakCount; i++) {
      const s = this.streaks[i];
      const k = (s.phase + t * s.speed * (0.5 + p * 1.4)) % 1;
      const radius = (0.08 + k * k * 1.08) * reach;
      const tail = Math.max(reach * 0.055, radius - reach * s.length * (0.7 + intensity * 5.2));
      const angle = s.angle + Math.sin(t * 0.45) * 0.035;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const alpha = intensity * Math.sin(k * Math.PI) * fade;
      const gold = s.speed > 1;
      c.strokeStyle = `rgba(${gold ? '255,196,105' : '115,232,255'},${alpha * 0.82})`;
      c.lineWidth = gold ? 2.8 : 1.7;
      c.beginPath();
      c.moveTo(x + dx * tail, y + dy * tail);
      c.lineTo(x + dx * radius, y + dy * radius);
      c.stroke();
      if (intensity > 0.38 && i % 2 === 0) {
        c.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(x + dx * (tail + (radius - tail) * 0.35), y + dy * (tail + (radius - tail) * 0.35));
        c.lineTo(x + dx * radius, y + dy * radius);
        c.stroke();
      }
    }

    /* 云雾只在中段掠过两侧，抵达前散开，让落点重新清晰出现。 */
    const cloud = clamp((p - 0.4) / 0.2) * (1 - clamp((p - 0.78) / 0.18)) * fade;
    for (let i = 0; i < 4 && cloud > 0; i++) {
      const cx = i % 2 ? w + 80 - Math.sin(t * 2 + i) * 90 : -80 + Math.sin(t * 2 + i) * 90;
      const cy = h * ((t * 0.5 + i * 0.27) % 1);
      const gradient = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.42);
      gradient.addColorStop(0, `rgba(200,224,255,${cloud * 0.24})`);
      gradient.addColorStop(1, 'rgba(200,224,255,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, w, h);
    }

    /* 多层分段星门持续从中心迎面扩张，形成可读的空间隧道。 */
    const tunnel = clamp((p - 0.28) / 0.24) * (1 - clamp((p - 0.88) / 0.12)) * fade;
    const ringCount = mobile ? 7 : 11;
    for (let i = 0; i < ringCount && tunnel > 0; i++) {
      const k = (t * 0.48 + i / ringCount) % 1;
      const radius = (0.035 + k * k * 1.02) * reach;
      const alpha = Math.sin(k * Math.PI) * tunnel * 0.52;
      const color = i % 3 === 0 ? '255,207,112' : i % 3 === 1 ? '145,255,244' : '176,159,255';
      c.strokeStyle = `rgba(${color},${alpha})`;
      c.lineWidth = 0.8 + k * 3;
      for (let j = 0; j < 3; j++) {
        const start = j * Math.PI * 2 / 3 + t * 0.18 * (i % 2 ? 1 : -1);
        c.beginPath();
        c.ellipse(x, y, radius, radius * 0.72, Math.sin(t * 0.7) * 0.1, start, start + Math.PI * 0.48);
        c.stroke();
      }
    }

    /* 中心能量核随跃迁视野一起增强，但不遮挡目的地区域。 */
    if (warp > 0.02) {
      const coreRadius = 75 + warp * 85;
      const core = c.createRadialGradient(x, y, 0, x, y, coreRadius);
      core.addColorStop(0, `rgba(255,255,255,${warp * fade * 0.2})`);
      core.addColorStop(0.2, `rgba(118,246,255,${warp * fade * 0.16})`);
      core.addColorStop(1, 'rgba(118,246,255,0)');
      c.fillStyle = core;
      c.fillRect(x - coreRadius, y - coreRadius, coreRadius * 2, coreRadius * 2);
    }

    /* 最后进近时，目的地释放三道能量脉冲，与虹膜收拢同步。 */
    const energy = Math.sin(Math.PI * clamp((p - 0.62) / 0.36)) * fade;
    for (let i = 0; i < 3 && energy > 0; i++) {
      const k = (t * 1.25 + i / 3) % 1;
      c.strokeStyle = `rgba(${i % 2 ? '255,207,112' : '145,255,244'},${(1 - k) * energy * 0.85})`;
      c.lineWidth = 1.5 + (1 - k) * 3;
      c.beginPath();
      c.arc(x, y, 30 + k * 145, 0, Math.PI * 2);
      c.stroke();
    }

    /* 锁定环旋转收拢；抵达后由冲击波接管视觉。 */
    const radius = this.arrivedAt ? 45 + arrival * reach * 0.75 : 46 + (1 - Math.min(p / 0.24, 1)) * 36;
    c.save();
    c.translate(x, y);
    c.rotate(this.arrivedAt ? 0 : -t * 0.6);
    c.globalAlpha = fade * (this.arrivedAt ? 0.8 : 1 - Math.max(0, p - 0.72) / 0.28);
    c.strokeStyle = '#ffcf70';
    c.lineWidth = 1.5;
    c.setLineDash([14, 10, 3, 10]);
    c.beginPath();
    c.arc(0, 0, radius, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#91fff4';
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.beginPath();
      c.moveTo(radius + 12, -10);
      c.lineTo(radius + 12, 10);
      c.stroke();
    }
    c.restore();

    /* 落地冲击波：三环错峰扩散、短促放射线和中心闪光，持续在街区入镜后播放。 */
    if (this.arrivedAt) {
      const a = clamp(arrival);
      for (let i = 0; i < 3; i++) {
        const local = clamp((a - i * 0.08) / (1 - i * 0.08));
        const eased = 1 - Math.pow(1 - local, 3);
        c.strokeStyle = `rgba(${i === 1 ? '255,207,112' : '145,255,244'},${(1 - local) * 0.9})`;
        c.lineWidth = 1 + (1 - local) * 7;
        c.beginPath();
        c.arc(x, y, 24 + eased * reach * (0.55 + i * 0.15), 0, Math.PI * 2);
        c.stroke();
      }
      const rays = mobile ? 14 : 24;
      for (let i = 0; i < rays; i++) {
        const angle = i * Math.PI * 2 / rays + 0.12;
        const inner = 34 + a * reach * 0.18;
        const outer = inner + (1 - a) * reach * (0.12 + (i % 3) * 0.035);
        c.strokeStyle = `rgba(255,238,190,${(1 - a) * 0.72})`;
        c.lineWidth = 1 + (1 - a) * 2;
        c.beginPath();
        c.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
        c.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
        c.stroke();
      }
      const flashRadius = reach * (0.22 + a * 0.38);
      const flash = c.createRadialGradient(x, y, 0, x, y, flashRadius);
      flash.addColorStop(0, `rgba(255,255,255,${Math.pow(1 - a, 3) * 0.82})`);
      flash.addColorStop(0.18, `rgba(145,255,244,${Math.pow(1 - a, 2) * 0.42})`);
      flash.addColorStop(1, 'rgba(145,255,244,0)');
      c.fillStyle = flash;
      c.fillRect(x - flashRadius, y - flashRadius, flashRadius * 2, flashRadius * 2);
    }
    c.restore();
  }
}
