/**
 * 第一关配置：换 Tripo 模型、调整藏点或数值只改这里。
 *
 * 坐标系约定（与 PRD 10.2 一致）：
 *   关卡使用以 ANCHOR 为原点的局部东-北-天（ENU）坐标系，
 *   x = 东（米），y = 北（米），z = 天（米，向上）。
 *   所有物件、藏点、碰撞代理、提示距离都用这一套米制坐标，
 *   不直接用经纬度做距离计算。
 */

/* 街区锚点：墨西哥城附近，固定地面高度，不随在线地形变化 */
export const ANCHOR = {
  lon: -99.1332,
  lat: 19.4326,
  height: 2240, // 街区地面海拔（米），第一版为固定平整地面
};

/* 墨西哥大致范围标记点（只表示区域，不泄露吉拿位置） */
export const REGION = {
  name: '墨西哥',
  dot: { lon: -101.5, lat: 21.2 },
  /* 进入关卡时镜头飞向的区域中心 */
  focus: { lon: -101.0, lat: 20.4 },
};

/* 模型配置：glb 填 public/assets/models/ 下的相对路径即可替换占位模型。
   约定文件名见《资产生产手册》4.11：
   hero_xiaonian / dog_jina / house_a|b|c / stall / cart / pinata / ball / cactus / crate / lamp / bunting_unit
   模型按米制、底部贴地、正面朝 -Y 制作，因此 scale 默认 1。 */
export const ASSETS = {
  hero: { glb: null, height: 1.9 },
  dog: { glb: null, height: 0.9 },
  house: { glb: null, height: 4.8 },
  stall: { glb: null, height: 2.9 },
  cart: { glb: null, height: 2.7 },
  pinata: { glb: null, height: 3.8 },
  ball: { glb: null, height: 0.55 },
  cactus: { glb: null, height: 1.7 },
  crate: { glb: null, height: 1.0 },
  lamp: { glb: null, height: 3.6 },
  bunting: { glb: null, height: 4.6 },
};

/* 场景物件：14 个实例，9 类模型。say 是走近时显示的提示 */
export const LAYOUT = [
  { key: 'house', x: -6, y: -5, ry: 0, tint: '#e5127d', say: '窗户里的人都在看球回放。' },
  { key: 'house', x: 0, y: -5, ry: 0, tint: '#1cc0c9', say: '门锁着，吉拿进不去。' },
  { key: 'house', x: 6, y: -5, ry: 0, tint: '#ffb31a', say: '屋里传来电视的声音，没有狗叫。' },
  { key: 'stall', x: 4.6, y: 3.8, ry: Math.PI, tint: '#e5127d', say: '摊位上只有一条围巾。' },
  { key: 'stall', x: -8.4, y: -0.2, ry: Math.PI / 2, tint: '#12a66a', say: '这里卖球迷帽，没看见吉拿。' },
  { key: 'cart', x: -3.6, y: 3.6, ry: 0.25, say: '玉米很香，可吉拿不在这儿。' },
  { key: 'pinata', x: 1.2, y: -1.2, ry: 0.4, say: '皮纳塔里只有糖果。' },
  { key: 'ball', x: 2.2, y: 1.4, ry: 0, say: '一个足球，皮面被啃得坑坑洼洼。' },
  { key: 'ball', x: -1.6, y: 6.0, ry: 1, say: '又一个足球，上面还有小狗牙印。' },
  { key: 'cactus', x: 8.8, y: -1.0, ry: 0, say: '小心扎手。' },
  { key: 'cactus', x: -8.4, y: 5.0, ry: 2, say: '一盆仙人掌，什么也藏不住。' },
  { key: 'crate', x: 8.2, y: 2.2, ry: 0.4, say: '箱子是空的。' },
  { key: 'lamp', x: -2.4, y: -1.6, ry: 0, say: '灯下什么也没有。' },
  { key: 'bunting', x: 0, y: 0.4, ry: 0 },
];

/* 吉拿的 3 个藏点：开局视角都被挡住，均可从出生点正常走到 */
export const DOG_SPOTS = [
  { x: -5.6, y: 2.6, ry: 0.8, note: '小吃车后' },
  { x: -6.0, y: -7.9, ry: 2.6, note: '粉色房屋后' },
  { x: 6.0, y: -7.9, ry: -0.6, note: '黄色房屋后' },
];

export const LEVELS = [
  { nation: '墨西哥', where: '世界杯球迷街', state: 'open' },
  { nation: '日本', where: '宇治茶屋', state: 'wip' },
  { nation: '韩国', where: '首尔甜品街', state: 'wip' },
  { nation: '意大利', where: '雪山缆车', state: 'wip' },
  { nation: '埃及', where: '法老陵墓', state: 'wip' },
  { nation: '阿联酋', where: '海底沉船', state: 'wip' },
];

/* 玩法数值：沿用原型工作默认值，试玩后按手感调整并同步 PRD */
export const TUNING = {
  spawn: { x: 0, y: 7.4 },
  walkRadius: 11.9, // 可行走边界半径（米）
  groundRadius: 12.6, // 地面石板半径（米）
  heroRadius: 0.3, // 角色碰撞半径（米）
  walkSpeed: 4.4, // 步行速度（米/秒）
  crouchSpeedFactor: 0.6, // 下蹲后速度比例（PRD 6.4）
  crouchDrop: 0.7, // 下蹲相机下降高度（米）
  nearObject: 1.3, // 普通物件提示距离（米，到可交互边界）
  nearDog: 2.2, // 吉拿确认距离（米，中心水平距离）
  hintsPerRound: 2,
  hintHighlightMs: 2800,
  camDist: 14.5,
  camPitch: 0.55,
  overviewPitch: 0.8,
  overviewYaw: 0.35,
  camFocusHeight: 1.2,
  camMinDist: 4,
  camMaxDist: 22,
  star3: { time: 60000, hints: 0 },
  star2: { time: 120000, hints: 1 },
};

/* 主要实体：参与碰撞与视线判定；装饰物（围巾、纸旗、串灯）不参与 */
export const SOLID_KEYS = new Set(['house', 'stall', 'cart']);
/* 小物件用固定半径碰撞盒，避免视觉包围盒过大堵住通路 */
export const SMALL_COLLIDER = { pinata: 0.25, lamp: 0.2, ball: 0.3, cactus: 0.4 };
