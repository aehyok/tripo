# 模型目录

把 Blender 导出的 GLB 放在这里，然后在 `src/config.js` 的 `ASSETS` 里填相对路径：

```js
export const ASSETS = {
  dog: { glb: 'assets/models/dog_jina.glb', height: 0.5, minimumPixelSize: 0 },
  ...
};
```

命名与导出规范见仓库根目录《资产生产手册》第 4 章：按米制建模、底部贴 Z=0、正面朝 -Y、
不含相机与灯光、首批使用未压缩 GLB。未填写的资产会自动使用程序生成的占位模型，
GLB 载入失败时也会回退到占位模型，不会中断游戏。

当前已接入吉拿静态版：7,500三角面、三张2K纹理；尺寸0.35×0.55×0.50米，无骨骼动画。源工程和验收记录见 `assets/models/blender/`、`assets/models/review/dog_jina.manifest.json`。

小年动画版已接入：`hero_xiaonian.glb`，站姿标定1.55米，14,240三角面、三张2K、65关节；包含idle/walk/crouch与两段0.25秒过渡。动作通过独立primitive控制器按名称切换。详情见 `assets/models/review/hero_xiaonian.manifest.json`。

房屋三配色已接入：`house_a/b/c.glb`，每栋3,701三角面、三张1K，5.5×4.5×4.5米，三个独立材质文件。独立碰撞代理收缩8%，三藏点可达；源工程及回导后的局部非流形限制见 `assets/models/review/house_a.manifest.json` 与 `house-roundtrip.json`。

球迷摊位已接入两个实例：基础`stall.glb`为1,282三角面/三张1K/2.4×1.2×2.2米；独立`stall_scarf.glb`为60面、`stall_caps.glb`为414面。三颗暖色发光灯泡强度1.5；商品使用台面安装高度，碰撞只取柜台代理。详情见 `assets/models/review/stall.manifest.json`。

小吃车已接入：`cart.glb`，2,892三角面、三张1K、2.2×1.1×2.4米；四轮、折下台板、不透明展示窗与11颗强度2.5的固定发光灯泡。车身代理收缩8%，三藏点的出生遮挡/绕行/确认通过。详见 `assets/models/review/cart.manifest.json`。

皮纳塔已接入：星体`pinata.glb`为1,400三角面、三张1K，按总高1.0米保持参考图正七角比例（1.03×0.52×1.0米）；悬挂立柱/横臂/绳索为独立`pinata_hanger.glb`（260面、纯色）。星体作为`accessories.body`挂在横臂末端，最低尖角离地1.9米，可从下方通行；碰撞只取立柱。详见 `assets/models/review/pinata.manifest.json`。

盆栽仙人掌已接入：`cactus.glb`，928三角面、三张1K，按总高1.1米等比缩放（0.69×0.63×1.1米），两个实例共用。保留Tripo造型与贴图，封缝并重绘盆土后重新烘焙；移动碰撞取盆外半径收缩8%（0.3米）。详见 `assets/models/review/cactus.manifest.json`。

路灯已接入：`lamp.glb`，1,410三角面，原三张1K加一张1K发光贴图（灯罩#FFC46B、强度2.0，无实时灯），按总高3.2米等比缩放（0.67×0.67×3.2米）；移动碰撞取底座半径收缩8%（0.22米）。详见 `assets/models/review/lamp.manifest.json`。

小年走路动画已修订：步行速度2.2米/秒、步长0.66米、0.6秒/循环（约每秒3.3步），`TUNING.walkSpeed` 与 `heroAvatar.js` 的参考速度需保持一致。

手建道具已接入：`ball.glb`（180面、直径0.4米，按可读性放大，带牙印凹坑）、`crate.glb`（204面、0.6米立方）、`bunting.glb`（1,696面、跨度17.8米，60面0.18米纸旗与29盏强度3.0灯泡）。位于4厘米街道铺装上的物件在 `LAYOUT` 中使用 `z: 0.04`。详见 `assets/models/review/` 下对应 manifest。

小年新增奔跑动画 `run`：4.4米/秒、步长1.32米、0.6秒/循环（与walk相同，切换保持步伐），双击方向键触发；`TUNING.runSpeed` 与 `heroAvatar.js` 的 `RUN_REFERENCE_SPEED` 需保持一致。
