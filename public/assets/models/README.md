# 模型目录

把 Blender 导出的 GLB 放在这里，然后在 `src/config.js` 的 `ASSETS` 里填相对路径：

```js
export const ASSETS = {
  dog: { glb: './assets/models/dog_jina.glb', height: 0.9 },
  ...
};
```

命名与导出规范见仓库根目录《资产生产手册》第 4 章：按米制建模、底部贴 Z=0、正面朝 -Y、
不含相机与灯光、首批使用未压缩 GLB。未填写的资产会自动使用程序生成的占位模型，
GLB 载入失败时也会回退到占位模型，不会中断游戏。
