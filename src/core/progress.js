/**
 * 本地存档：只保存完成状态、历史最高星级与声音开关。
 * 存储不可用或数据损坏时回落到默认值，不阻止开局。
 */
const KEY = 'hq-progress-v1';

const DEFAULTS = { done: false, stars: 0, sound: true };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const data = JSON.parse(raw);
    return {
      done: data?.done === true,
      stars: Math.max(0, Math.min(3, Number(data?.stars) || 0)),
      sound: data?.sound !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = read();

export function getProgress() {
  return { ...state };
}

export function updateProgress(patch) {
  state = { ...state, ...patch };
  if (typeof state.stars === 'number') state.stars = Math.max(0, Math.min(3, state.stars));
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时仅保留在内存中 */
  }
  return { ...state };
}

/** 通关记录：完成状态置真，星级只提高不降低 */
export function recordClear(stars) {
  return updateProgress({
    done: true,
    stars: Math.max(state.stars || 0, stars),
  });
}
