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
  /* 西北部补充光点：蓝紫配色，与原始地球一致 */
  sparkle: { lon: -109.0, lat: 27.0 },
  /* 进入关卡时镜头飞向的区域中心 */
  focus: { lon: -101.0, lat: 20.4 },
};

/* 模型配置：glb 填 public/assets/models/ 下的相对路径即可替换占位模型。
   约定文件名见《资产生产手册》4.11：
   hero_xiaonian / dog_jina / house_a|b|c / stall / cart / pinata / ball / cactus / crate / lamp / bunting_unit
   模型按米制、底部贴地、正面朝 -Y 制作，因此 scale 默认 1。 */
export const ASSETS = {
  hero: { glb: 'assets/models/hero_xiaonian.glb', height: 1.55 },
  dog: { glb: 'assets/models/dog_jina.glb', height: 0.5, minimumPixelSize: 0, card: 'assets/ui/dog_card.png' },
  house: {
    glb: 'assets/models/house_a.glb',
    variants: { a: 'assets/models/house_a.glb', b: 'assets/models/house_b.glb', c: 'assets/models/house_c.glb' },
    height: 4.5, minimumPixelSize: 0,
    collider: { footprint: [-2.53, 2.53, -2.07, 2.07], height: 4.2 },
  },
  stall: {
    glb: 'assets/models/stall.glb', height: 2.2, minimumPixelSize: 0,
    accessories: {
      scarf: { glb: 'assets/models/stall_scarf.glb', z: 0.51, minimumPixelSize: 0, fallback: 'stallGoods' },
      caps: { glb: 'assets/models/stall_caps.glb', z: 0.85, minimumPixelSize: 0, fallback: 'stallGoods' },
    },
    collider: { footprint: [-1.0764, 1.0764, -0.4876, 0.4876], height: 0.85 },
  },
  cart: {
    glb: 'assets/models/cart.glb', height: 2.4, minimumPixelSize: 0,
    collider: { footprint: [-0.92, 0.92, -0.46, 0.23], height: 2.15 },
  },
  pinata: {
    glb: 'assets/models/pinata_hanger.glb', height: 3.7, minimumPixelSize: 0,
    // The star hangs from the arm tip: x is along the arm, z is the body's lowest tips.
    accessories: { body: { glb: 'assets/models/pinata.glb', x: 1.15, z: 1.9, minimumPixelSize: 0, fallback: 'pinataBody' } },
    collider: { footprint: [-0.2, 1.67, -0.26, 0.26], height: 3.7 },
  },
  ball: {
    glb: 'assets/models/ball.glb', height: 0.4, minimumPixelSize: 0, // 真实足球0.22米，放大以便俯视可读
    collider: { footprint: [-0.2, 0.2, -0.2, 0.2], height: 0.4 },
  },
  cactus: {
    glb: 'assets/models/cactus.glb', height: 1.1, minimumPixelSize: 0,
    collider: { footprint: [-0.343, 0.343, -0.317, 0.317], height: 1.1 },
  },
  crate: {
    glb: 'assets/models/crate.glb', height: 0.6, minimumPixelSize: 0,
    collider: { footprint: [-0.276, 0.276, -0.276, 0.276], height: 0.6 },
  },
  lamp: {
    glb: 'assets/models/lamp.glb', height: 3.2, minimumPixelSize: 0,
    collider: { footprint: [-0.333, 0.333, -0.337, 0.337], height: 3.2 },
  },
  bunting: { glb: 'assets/models/bunting.glb', height: 4.74, minimumPixelSize: 0 },
};

/* 场景物件：14 个实例，9 类模型。say 是走近时显示的提示；z 为 0.04 的物件立在 4 厘米街道铺装上 */
export const LAYOUT = [
  { key: 'house', variant: 'a', x: -6, y: -5, ry: 0, tint: '#e5127d', say: '窗户里的人都在看球回放。' },
  { key: 'house', variant: 'b', x: 0, y: -5, ry: 0, tint: '#1cc0c9', say: '门锁着，吉拿进不去。' },
  { key: 'house', variant: 'c', x: 6, y: -5, ry: 0, tint: '#ffb31a', say: '屋里传来电视的声音，没有狗叫。' },
  { key: 'stall', accessory: 'scarf', x: 4.6, y: 3.8, ry: Math.PI, tint: '#e5127d', say: '摊位上只有一条围巾。' },
  { key: 'stall', accessory: 'caps', x: -8.4, y: -0.2, z: 0.04, ry: Math.PI / 2, tint: '#12a66a', say: '这里卖球迷帽，没看见吉拿。' },
  { key: 'cart', x: -3.6, y: 3.6, ry: 0.25, say: '玉米很香，可吉拿不在这儿。' },
  { key: 'pinata', accessory: 'body', x: 1.2, y: -1.2, z: 0.04, ry: 0.4, say: '皮纳塔里只有糖果。' },
  { key: 'ball', x: 2.2, y: 1.4, z: 0.04, ry: 0, say: '一个足球，皮面被啃得坑坑洼洼。' },
  { key: 'ball', x: -1.6, y: 6.0, ry: 1, say: '又一个足球，上面还有小狗牙印。' },
  { key: 'cactus', x: 8.8, y: -1.0, z: 0.04, ry: 0, say: '小心扎手。' },
  { key: 'cactus', x: -8.4, y: 5.0, ry: 2, say: '一盆仙人掌，什么也藏不住。' },
  { key: 'crate', x: 8.2, y: 2.2, z: 0.04, ry: 0.4, say: '箱子是空的。' },
  { key: 'lamp', x: -2.4, y: -1.6, z: 0.04, ry: 0, say: '灯下什么也没有。' },
  { key: 'bunting', x: 0, y: 0.4, z: 0.04, ry: 0 },
];

/* 吉拿的 3 个藏点：开局视角都被挡住，均可从出生点正常走到 */
export const DOG_SPOTS = [
  { x: -5.6, y: 2.6, z: 0.04, ry: 0.8, note: '小吃车后' },
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
  walkSpeed: 2.2, // 步行速度（米/秒）；与小年 walk 动画步幅匹配，改动需同步 heroAvatar.js
  runSpeed: 4.4, // 双击方向键后的奔跑速度（米/秒）；与 run 动画匹配，改动需同步 heroAvatar.js
  doubleTapMs: 300, // 同一方向键两次按下的最大间隔（毫秒）
  crouchSpeedFactor: 0.6, // 下蹲后速度比例（PRD 6.4）
  crouchDrop: 0.7, // 下蹲相机下降高度（米）
  nearObject: 1.3, // 普通物件提示距离（米，到可交互边界）
  nearDog: 2.2, // 吉拿确认距离（米，中心水平距离）
  hintsPerRound: 2,
  hintHighlightMs: 2800,
  camDist: 18,
  camPitch: 0.55,
  overviewPitch: 0.8,
  overviewYaw: 0.35,
  camFocusHeight: 1.2,
  camMinDist: 4,
  camMaxDist: 26,
  star3: { time: 60000, hints: 0 },
  star2: { time: 120000, hints: 1 },
};

/* 主要实体：参与碰撞与视线判定；装饰物（围巾、纸旗、串灯）不参与 */
export const SOLID_KEYS = new Set(['house', 'stall', 'cart']);
/* 小物件用固定半径碰撞盒，避免视觉包围盒过大堵住通路 */
export const SMALL_COLLIDER = { pinata: 0.25, lamp: 0.22, ball: 0.18, cactus: 0.3 }; // 足球/仙人掌/路灯：球/盆外/底座半径收缩8%
