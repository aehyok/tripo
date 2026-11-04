import * as Cesium from 'cesium';

const TRANSITION_SECONDS = 0.25;
// Reference speeds match the clips authored in scripts/prepare_hero.py; both share a 0.6 s cycle.
const WALK_REFERENCE_SPEED = 2.2;
const RUN_REFERENCE_SPEED = 4.4;
const GAITS = new Set(['walk', 'run']);
const UP = Cesium.Cartesian3.UNIT_Z;

/** Own the animated primitive so clips can be selected by name without relying
 * on ModelVisualizer internals or playing all clips at once. */
export class HeroAvatar {
  constructor(viewer, frame, frameQuaternion, getState, onFailure) {
    this.viewer = viewer;
    this.frame = frame;
    this.frameQuaternion = frameQuaternion;
    this.getState = getState;
    this.onFailure = onFailure;
    this.model = null;
    this.currentClip = null;
    this.elapsed = 0;
    this.crouched = false;
    this.failed = false;
  }

  modelMatrix() {
    const s = this.getState();
    // Street paving is 4 cm above the surrounding plaza.
    const ground = Math.abs(s.x) <= 10 && s.y >= -2.4 && s.y <= 2.8 ? 0.04 : 0;
    const position = Cesium.Matrix4.multiplyByPoint(
      this.frame, new Cesium.Cartesian3(s.x, s.y, ground), new Cesium.Cartesian3(),
    );
    // Cesium adapts glTF +Z forward to +X; the street's yaw 0 faces +Y.
    const yaw = Cesium.Quaternion.fromAxisAngle(UP, Math.PI / 2 - s.yaw);
    const q = Cesium.Quaternion.multiply(this.frameQuaternion, yaw, new Cesium.Quaternion());
    return Cesium.Matrix4.fromRotationTranslation(Cesium.Matrix3.fromQuaternion(q), position);
  }

  async load(url) {
    try {
      const model = await Cesium.Model.fromGltfAsync({
        url,
        modelMatrix: this.modelMatrix(),
        scale: 1,
        minimumPixelSize: 0,
        clampAnimations: false,
        shadows: Cesium.ShadowMode.ENABLED,
        environmentMapOptions: { enabled: false },
        id: { name: '小年', type: 'hero' },
      });
      this.model = this.viewer.scene.primitives.add(model);
      const ready = () => {
        try {
          model.activeAnimations.animateWhilePaused = true;
          this.play('idle');
        } catch (error) {
          this.fail(error);
        }
      };
      this.removeReady = model.readyEvent.addEventListener(ready);
      this.removeError = model.errorEvent.addEventListener((error) => this.fail(error));
      if (model.ready) ready();
      return true;
    } catch (error) {
      console.warn('[资产] 小年载入失败，改用占位模型：', error);
      return false;
    }
  }

  play(name, elapsed = 0) {
    if (!this.model?.ready || this.failed) return;
    this.model.activeAnimations.removeAll();
    this.currentClip = name;
    this.elapsed = elapsed;
    const transition = name === 'crouch_down' || name === 'crouch_up';
    this.model.activeAnimations.add({
      name,
      loop: transition ? Cesium.ModelAnimationLoop.NONE : Cesium.ModelAnimationLoop.REPEAT,
      animationTime: (duration) => transition
        ? Math.min(1, this.elapsed / duration)
        : this.elapsed / duration,
    });
  }

  update(dt, speed = 0) {
    if (!this.model || this.failed) return;
    this.model.modelMatrix = this.modelMatrix();
    if (!this.model.ready) return;
    const s = this.getState();
    const wantsCrouch = !!s.crouch;
    if (wantsCrouch !== this.crouched) {
      const wasTransition = this.currentClip === 'crouch_down' || this.currentClip === 'crouch_up';
      const offset = wasTransition ? Math.max(0, TRANSITION_SECONDS - this.elapsed) : 0;
      this.play(wantsCrouch ? 'crouch_down' : 'crouch_up', offset);
      this.crouched = wantsCrouch;
    }
    const transition = this.currentClip === 'crouch_down' || this.currentClip === 'crouch_up';
    const rate = this.currentClip === 'walk' ? speed / WALK_REFERENCE_SPEED
      : this.currentClip === 'run' ? speed / RUN_REFERENCE_SPEED : 1;
    this.elapsed += dt * rate;
    if (transition && this.elapsed < TRANSITION_SECONDS) return;
    const next = wantsCrouch ? 'crouch' : s.playing && speed > 0.02 ? (s.running ? 'run' : 'walk') : 'idle';
    // Walk and run share foot phase, so switching gait keeps the stride instead of restarting it.
    if (this.currentClip !== next) this.play(next, GAITS.has(this.currentClip) && GAITS.has(next) ? this.elapsed : 0);
  }

  fail(error) {
    if (this.failed) return;
    this.failed = true;
    console.warn('[资产] 小年渲染失败，改用占位模型：', error);
    this.dispose();
    this.onFailure?.();
  }

  dispose() {
    this.removeReady?.();
    this.removeError?.();
    if (this.model && !this.model.isDestroyed()) this.viewer.scene.primitives.remove(this.model);
    this.model = null;
  }
}
