import * as Cesium from 'cesium';
import { ANCHOR } from '../config.js';
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
    this.anchor = Cesium.Cartesian3.fromDegrees(ANCHOR.lon, ANCHOR.lat, ANCHOR.height);
    this.streaks = Array.from({ length: 54 }, (_, i) => ({
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
    const text = phase === 'lock' ? '锁定坐标 · 准备出发' : phase === 'dive' ? '加速俯冲 · 穿越云层' : '目的地就在前方';
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
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const t = (now - this.started) / 1000;
    const p = this.progress;
    const intensity = Math.min(1, p / 0.24) * (0.6 + Math.sin(Math.PI * p) * 0.3);
    const fade = this.arrivedAt ? 1 - arrival : 1;
    const center = this.arrivedAt ? null : Cesium.SceneTransforms.worldToWindowCoordinates(this.viewer.scene, this.anchor);
    const x = center ? Math.max(w * 0.2, Math.min(w * 0.8, center.x)) : w / 2;
    const y = center ? Math.max(h * 0.25, Math.min(h * 0.65, center.y)) : h * 0.46;
    const reach = Math.hypot(w, h) * 0.65;

    // 中央保持清晰，速度线从视野边缘向外拉伸。
    c.save();
    c.globalCompositeOperation = 'screen';
    for (const s of this.streaks) {
      const k = (s.phase + t * s.speed * (0.3 + p)) % 1;
      const radius = (0.17 + k * k * 0.95) * reach;
      const tail = Math.max(reach * 0.15, radius - reach * s.length * (0.3 + intensity * 3));
      const dx = Math.cos(s.angle + Math.sin(t * 0.45) * 0.035);
      const dy = Math.sin(s.angle + Math.sin(t * 0.45) * 0.035);
      c.strokeStyle = `rgba(${s.speed > 1 ? '255,211,124' : '157,249,255'},${intensity * Math.sin(k * Math.PI) * fade * 0.65})`;
      c.lineWidth = s.speed > 1 ? 2 : 1;
      c.beginPath();
      c.moveTo(x + dx * tail, y + dy * tail);
      c.lineTo(x + dx * radius, y + dy * radius);
      c.stroke();
    }

    // 云雾只掠过两侧，避免遮挡地球和落点。
    const cloud = Math.min(1, Math.max(0, (p - 0.45) / 0.25)) * fade;
    for (let i = 0; i < 4 && cloud > 0; i++) {
      const cx = i % 2 ? w + 80 - Math.sin(t * 2 + i) * 90 : -80 + Math.sin(t * 2 + i) * 90;
      const cy = h * ((t * 0.5 + i * 0.27) % 1);
      const gradient = c.createRadialGradient(cx, cy, 0, cx, cy, w * 0.42);
      gradient.addColorStop(0, `rgba(200,224,255,${cloud * 0.36})`);
      gradient.addColorStop(1, 'rgba(200,224,255,0)');
      c.fillStyle = gradient;
      c.fillRect(0, 0, w, h);
    }

    // 临近城市时，几层光环迎面掠过，衔接大尺度地球与微缩街区。
    const tunnel = Math.max(0, (p - 0.6) / 0.4) * fade;
    for (let i = 0; i < 3 && tunnel > 0; i++) {
      const k = (t * 0.85 + i / 3) % 1;
      const radius = (0.1 + k * k) * reach;
      c.strokeStyle = `rgba(145,255,244,${Math.sin(k * Math.PI) * tunnel * 0.22})`;
      c.lineWidth = 1 + k * 2;
      c.beginPath();
      c.ellipse(x, y, radius, radius * 0.75, Math.sin(t) * 0.12, 0, Math.PI * 2);
      c.stroke();
    }

    // 锁定环旋转收拢；抵达时向外扩散。
    const radius = this.arrivedAt ? 45 + arrival * reach * 0.75 : 46 + (1 - Math.min(p / 0.24, 1)) * 36;
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
  }
}
