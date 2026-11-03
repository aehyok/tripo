/** 轻量补间：由主循环按帧驱动，供相机、遮罩与反馈动画共用 */
const list = [];
export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * @param {number} ms 时长（毫秒），开启“减少动态效果”时压缩到极短
 * @param {(eased:number, raw:number)=>void} fn
 * @param {()=>void} [done]
 * @returns {()=>void} 取消函数
 */
export function tween(ms, fn, done) {
  const dur = REDUCED ? Math.min(ms, 1) : ms;
  const item = { t: 0, ms: Math.max(1, dur), fn, done, dead: false };
  list.push(item);
  return () => {
    item.dead = true;
    const i = list.indexOf(item);
    if (i >= 0) list.splice(i, 1);
  };
}

export function runTweens(dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (w.dead) {
      list.splice(i, 1);
      continue;
    }
    w.t += dt * 1000;
    const k = Math.min(1, w.t / w.ms);
    try {
      w.fn(easeInOut(k), k);
    } catch (err) {
      console.warn('补间回调异常', err);
    }
    if (k >= 1) {
      list.splice(i, 1);
      w.done?.();
    }
  }
}

export function clearTweens() {
  list.length = 0;
}

export const wait = (ms) => new Promise((r) => setTimeout(r, REDUCED ? Math.min(ms, 40) : ms));
