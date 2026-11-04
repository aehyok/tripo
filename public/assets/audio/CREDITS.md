# 环球寻物 · 已接入音频来源

整理日期：2026-11-04。游戏运行时只读取本目录的静态文件，不调用在线生成接口。

## 真实录音与脚步

- `dog-bark.mp3`：Joseph SARDIN 的 [Small dog barking](https://bigsoundbank.com/small-dog-barking-s0612.html)，CC0。裁取原录音 0.13～0.85 秒，做高通、响度与淡入淡出处理。
- `market-loop.mp3`：Joseph SARDIN 的 [Outdoor market #2](https://bigsoundbank.com/outdoor-market-2-s2729.html)，CC0。原录音来自法国市场，仅作为模糊的人群底层质感；裁取 32～58 秒，滤波并交叉淡化为 24 秒循环。
- `footstep_concrete_000`～`004`：Kenney [Impact Sounds](https://kenney.nl/assets/impact-sounds)，CC0。通过附带原来源与授权元数据的 [公开镜像](https://github.com/GeorgeQLe/assets-sfx-combat)取得单条 OGG，转为手机兼容的 MP3。原链接见 `footsteps-sources.json`。

CC0 授权：[Creative Commons Zero 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。

## 角色对白

`voice/*.mp3` 为本项目台词的本地合成录音，使用工作站已有的 Kokoro v1.0 ONNX 模型、Misaki 中文前端：

- 莫馆长：Kokoro `zm_yunyang`，速度 0.94。
- 卢佩：Kokoro `zf_xiaoxiao`，速度 1.0。
- 小年：Kokoro `zm_yunxi`，速度 1.07。

这是 Kokoro 模型的音色标识，**不是 Azure 服务生成的音频**。没有克隆用户或第三方个人声音，没有将台词发送到云端。

模型：[hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)，模型权重采用 Apache-2.0；推理工具 [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) 采用 MIT。模型与推理软件均不随游戏分发。19 条对白对应关系见 `voice/lines.json`。

## 原创音乐与程序音效

- `guitar-loop.mp3`：为本项目编写的原创 16 小节、108 BPM 合成拨弦循环，代码见 `scripts/prepare_audio.py`，不包含外部音乐采样。
- 按钮、跃迁、落地与通关乐句：由 `src/core/audio.js` 在浏览器中合成。

前期候选中的 Pixabay 音乐与 Kenney 整包预览均未打包进游戏。

## 重建

项目根目录运行 `python3 scripts/prepare_audio.py --voices`。需要本地 Python 音频依赖与已经缓存的 Kokoro 模型；默认缓存位置为 `~/.cache/hyperframes/tts`，可用 `--cache` 指定位置。此步骤只在开发时执行，玩家无需安装模型。
