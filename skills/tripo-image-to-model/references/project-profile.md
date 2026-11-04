# 《环球寻物》约定

仅在本项目使用。清单以 `资产生产手册.md` 为准，进度以 `资产处理进度.md`、实际 GLB 与 manifest 为准，本文件不保存会变化的完成数量。

| 内容 | 路径 |
| --- | --- |
| 参考图、贴图、头像、预览 | `assets/ref/` |
| 原始 GLB 和记录 | `assets/models/raw/` |
| 游戏最终模型 | `public/assets/models/` |
| 游戏模型路径 | `src/config.js` 的 `ASSETS` |

`ASSETS.*.glb` 为空表示游戏仍用程序占位。仅完成下载时不自动修改游戏路径。

| 资产 | 输入文件 | 原始 GLB 文件名 | 最终三角面预算 | 贴图 |
| --- | --- | --- | --- | --- |
| 吉拿 | 同设计多视图；失败时 `jina_front34.png` | `dog_jina_tripo.glb` | 5,000–8,000 | 2K |
| 小年 | `xiaonian_front.png`、`xiaonian_side.png`、`xiaonian_back.png`，右槽可空 | `hero_xiaonian_tripo.glb`、`hero_xiaonian_rigged_tripo.glb` | 8,000–15,000 | 2K |
| 房屋 | `house_base.png` | `house_base_tripo.glb` | 每栋 2,000–4,000 | 1K |
| 摊位 | `stall.png`，空台面 | `stall_tripo.glb` | 2,000 | 1K |
| 小吃车 | `cart.png` | `cart_tripo.glb` | 3,000 | 1K |
| 皮纳塔 | `pinata.png`，七尖角 | `pinata_tripo.glb` | 1,500 | 1K |
| 仙人掌 | `cactus.png`，刺在贴图上 | `cactus_tripo.glb` | 1,000 | 1K |
| 路灯 | `lamp.png` | `lamp_tripo.glb` | 1,500 | 1K |

历史四边面输入目标：角色约 7,000，房屋 1,800，摊位 800，小吃车 1,300，皮纳塔 600。这些只是历史参数，不保证三角面达标，也不是其他项目的固定默认值。

- 吉拿多视图与免费重试出现颈侧多余卷尾，换 3/4 单图后消失；不重复错误版本。
- 小年用 Humanoid/Mixamo 自动绑定，检查 skins、关节、权重；`idle`、`walk`、`crouch` 另行制作验证。
- 房屋最终做洋红/青绿/金盏黄三材质版本，不能只改 Cesium 染色。
- 两摊位共用基础几何，围巾/帽子后加为独立道具，布面可用 `awning_stripe.png`。
- 小吃车展示窗用不透明浅蓝灰色，灯泡单独发光，不生成透明玻璃与悬空电线。
- 皮纳塔绳后加，仙人掌不做几何刺，路灯灯罩后续配置发光。
- `style_street.png` 为风格图，`flags_atlas.png`/`awning_stripe.png` 为贴图，`portrait_*.png` 为 UI，都不进 Tripo。
- `dog_card_preview.png` 非正式卡片，需最终吉拿模型渲染。
- 足球、木箱、纸旗/串灯组合走 Blender 几何体，不计 Tripo 任务。

后续按手册第 4 章做米制尺寸、Blender 正面 -Y、底部原点、网格、材质、动画、碰撞、Cesium 实测。本技能只交接待办，不自动扩大为整款游戏交付。
