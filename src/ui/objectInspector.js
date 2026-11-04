import * as Cesium from 'cesium';
import { ASSETS, TUNING } from '../config.js';
import { REDUCED } from '../core/tween.js';

/** Move the street camera closer to a nearby object; keep the world and player visible. */
export class ObjectInspector {
  constructor(viewer, street, onClose) {
    this.viewer = viewer;
    this.street = street;
    this.onClose = onClose;
    this.el = document.getElementById('inspect');
    this.stage = viewer.canvas;
    this.pointers = new Map();
    this.active = false;
    this.bind();
  }

  pick(clientX, clientY) {
    const rect = this.stage.getBoundingClientRect();
    const picked = this.viewer.scene.pick(new Cesium.Cartesian2(clientX - rect.left, clientY - rect.top));
    const id = picked?.id || picked?.primitive?.id;
    const entity = typeof id === 'string' ? this.viewer.entities.getById(id) : id;
    return this.street.inspectByEntity.get(entity) || null;
  }

  inReach(item) {
    if (!item?.box) return false;
    const b = item.box;
    const { x, y } = this.street.s;
    return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1)) <= TUNING.nearObject;
  }

  open(item) {
    if (this.active || !this.inReach(item) || !item.entities.length) return false;
    const { viewer, street } = this;
    const camera = viewer.camera;
    const spheres = [];
    for (const entity of item.entities) {
      const sphere = new Cesium.BoundingSphere();
      if (viewer.dataSourceDisplay.getBoundingSphere(entity, false, sphere) === Cesium.BoundingSphereState.DONE && sphere.radius > 0) spheres.push(sphere);
    }
    if (spheres.length) {
      const sphere = Cesium.BoundingSphere.fromBoundingSpheres(spheres);
      this.center = Cesium.Matrix4.multiplyByPoint(Cesium.Matrix4.inverseTransformation(street.frame, new Cesium.Matrix4()), sphere.center, new Cesium.Cartesian3());
      this.radius = Math.max(0.1, sphere.radius);
    } else {
      const b = item.box;
      const height = ASSETS[item.spec.key]?.height || 1;
      this.center = new Cesium.Cartesian3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (item.spec.z || 0) + height / 2);
      this.radius = Math.hypot(b.x1 - b.x0, b.y1 - b.y0, height) / 2;
    }
    this.saved = {
      position: Cesium.Cartesian3.clone(camera.positionWC),
      direction: Cesium.Cartesian3.clone(camera.directionWC),
      up: Cesium.Cartesian3.clone(camera.upWC),
      near: camera.frustum.near,
      focus: document.activeElement,
    };
    camera.frustum.near = Math.max(0.01, this.radius * 0.01);
    this.item = item;
    this.active = true;
    street.inspecting = true;
    this.el.hidden = false;
    document.getElementById('inspectTitle').textContent = item.title;
    document.getElementById('inspectText').textContent = item.spec.say || '';
    this.reset(true);
    return true;
  }

  fitDistance() {
    const canvas = this.stage;
    const tan = Math.tan(this.viewer.camera.frustum.fovy / 2);
    const tanX = Math.max(0.08, tan * canvas.clientWidth / canvas.clientHeight * 0.82);
    const tanY = Math.max(0.08, tan * 0.65);
    const eyeDirection = this.direction();
    const right = new Cesium.Cartesian3(-Math.cos(this.yaw), Math.sin(this.yaw), 0);
    const up = Cesium.Cartesian3.cross(eyeDirection, right, new Cesium.Cartesian3());
    const b = this.item.box;
    const bottom = this.item.spec.z || 0;
    const top = bottom + (ASSETS[this.item.spec.key]?.height || b.height);
    let distance = this.radius * 1.2;
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [bottom, top]) {
      const offset = Cesium.Cartesian3.subtract(new Cesium.Cartesian3(x, y, z), this.center, new Cesium.Cartesian3());
      const depth = Cesium.Cartesian3.dot(eyeDirection, offset);
      distance = Math.max(distance, depth + Math.abs(Cesium.Cartesian3.dot(right, offset)) / tanX, depth + Math.abs(Cesium.Cartesian3.dot(up, offset)) / tanY);
    }
    return distance * 1.18;
  }

  direction() {
    const p = Math.cos(this.pitch);
    return new Cesium.Cartesian3(Math.sin(this.yaw) * p, Math.cos(this.yaw) * p, Math.sin(this.pitch));
  }

  eye() {
    return Cesium.Cartesian3.add(this.center, Cesium.Cartesian3.multiplyByScalar(this.direction(), this.distance, new Cesium.Cartesian3()), new Cesium.Cartesian3());
  }

  clearView(eye) {
    if (eye.z < 0.1) return false;
    // Keep the near-view camera outside other buildings, carts and stalls.
    for (const box of this.street.solids) {
      if (box === this.item.box) continue;
      let start = 0, end = 1;
      for (const [axis, low, high] of [['x', box.x0, box.x1], ['y', box.y0, box.y1], ['z', 0, box.height]]) {
        const delta = this.center[axis] - eye[axis];
        if (Math.abs(delta) < 1e-8) {
          if (eye[axis] < low || eye[axis] > high) { start = 2; break; }
        } else {
          const a = (low - eye[axis]) / delta, b = (high - eye[axis]) / delta;
          start = Math.max(start, Math.min(a, b));
          end = Math.min(end, Math.max(a, b));
        }
      }
      if (start <= end && end > 0 && start < 0.98) return false;
    }
    return true;
  }

  reset(animate = false) {
    if (!this.active) return;
    // View from beside the player so their body does not cover a small clue.
    const playerAngle = Math.atan2(this.street.s.x - this.center.x, this.street.s.y - this.center.y);
    this.pitch = 0.42;
    for (const yaw of [playerAngle + Math.PI / 2, playerAngle - Math.PI / 2, playerAngle + Math.PI, this.street.s.camYaw + this.street.yawBias]) {
      this.yaw = yaw;
      this.baseDistance = this.fitDistance();
      this.distance = this.baseDistance;
      if (this.updateCamera(animate)) return;
    }
    // If a narrow alley has no clear orbit, preserve the existing street view.
    this.viewer.camera.setView({ destination: this.saved.position, orientation: { direction: this.saved.direction, up: this.saved.up } });
  }

  zoom(factor) {
    if (!this.active) return;
    const previous = this.distance;
    this.distance = Cesium.Math.clamp(this.distance * factor, Math.max(this.radius * 1.12, this.baseDistance * 0.28), this.baseDistance * 1.8);
    if (!this.updateCamera()) this.distance = previous;
  }

  rotate(dx, dy) {
    const previous = [this.yaw, this.pitch];
    this.yaw -= dx * 0.009;
    this.pitch = Cesium.Math.clamp(this.pitch + dy * 0.007, 0.14, 1.25);
    if (!this.updateCamera()) [this.yaw, this.pitch] = previous;
  }

  updateCamera(animate = false) {
    if (!this.active) return false;
    const eye = this.eye();
    if (!this.clearView(eye)) return false;
    const camera = this.viewer.camera;
    camera.cancelFlight();
    if (animate && !REDUCED) {
      const destination = this.street.localPoint(eye);
      const target = this.street.localPoint(this.center);
      const direction = Cesium.Cartesian3.normalize(Cesium.Cartesian3.subtract(target, destination, new Cesium.Cartesian3()), new Cesium.Cartesian3());
      const up = Cesium.Matrix4.multiplyByPointAsVector(this.street.frame, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3());
      camera.flyTo({ destination, orientation: { direction, up }, duration: 0.45, easingFunction: Cesium.EasingFunction.CUBIC_OUT });
    } else this.street.setCameraPose(this.center, eye);
    this.viewer.scene.requestRender();
    return true;
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.street.inspecting = false;
    this.pointers.clear();
    this.viewer.camera.cancelFlight();
    this.viewer.camera.frustum.near = this.saved.near;
    this.viewer.camera.setView({ destination: this.saved.position, orientation: { direction: this.saved.direction, up: this.saved.up } });
    this.el.hidden = true;
    this.onClose();
    if (this.saved.focus?.isConnected && !this.saved.focus.closest('[hidden]')) this.saved.focus.focus({ preventScroll: true });
    else this.stage.focus({ preventScroll: true });
    this.saved = null;
    this.item = null;
  }

  bind() {
    document.getElementById('inspectClose').addEventListener('click', () => this.close());
    document.getElementById('inspectZoomIn').addEventListener('click', () => this.zoom(0.8));
    document.getElementById('inspectZoomOut').addEventListener('click', () => this.zoom(1.25));
    document.getElementById('inspectReset').addEventListener('click', () => this.reset(true));
    this.stage.addEventListener('pointerdown', (e) => {
      if (!this.active || e.button > 0) return;
      this.stage.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.stage.focus({ preventScroll: true });
      e.preventDefault();
    });
    this.stage.addEventListener('pointermove', (e) => {
      const point = this.pointers.get(e.pointerId);
      if (!this.active || !point) return;
      const old = [...this.pointers.values()];
      const previousDistance = old.length === 2 ? Math.hypot(old[0].x - old[1].x, old[0].y - old[1].y) : 0;
      const dx = e.clientX - point.x, dy = e.clientY - point.y;
      point.x = e.clientX; point.y = e.clientY;
      if (this.pointers.size === 1) this.rotate(dx, dy);
      else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const next = Math.hypot(a.x - b.x, a.y - b.y);
        if (previousDistance > 0 && next > 0) this.zoom(previousDistance / next);
      }
    });
    const end = (e) => this.pointers.delete(e.pointerId);
    this.stage.addEventListener('pointerup', end);
    this.stage.addEventListener('pointercancel', end);
    this.stage.addEventListener('lostpointercapture', end);
    this.stage.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.zoom(Math.exp(Cesium.Math.clamp(e.deltaY, -150, 150) * 0.003));
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === '+' || e.key === '=') this.zoom(0.8);
      else if (e.key === '-') this.zoom(1.25);
      else if (e.key === 'ArrowLeft') this.rotate(-16, 0);
      else if (e.key === 'ArrowRight') this.rotate(16, 0);
      else if (e.key === 'ArrowUp') this.rotate(0, -16);
      else if (e.key === 'ArrowDown') this.rotate(0, 16);
      else return;
      e.preventDefault(); e.stopPropagation();
    });
    window.addEventListener('resize', () => {
      if (!this.active) return;
      const ratio = this.distance / this.baseDistance;
      this.baseDistance = this.fitDistance(); this.distance = this.baseDistance * ratio;
      this.zoom(1);
    });
    window.addEventListener('blur', () => this.pointers.clear());
  }
}
