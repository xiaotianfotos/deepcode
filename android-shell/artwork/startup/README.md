# 海底启动素材

下游维护者 xiaotianfotos 提供并确认源视频为其 AI 生成素材，允许随本项目开源分发、修改和再分发。在维护者可授权的权利范围内，下列资源按仓库根 [MIT License](../../../LICENSE) 提供；不要求额外授权确认，不主张对 AI 输出拥有超出适用法律的专有权利。

| 文件（相对本目录） | 用途 |
|---|---|
| `ocean-source.mp4` | 维护者提供的生成视频，保留来源元数据 |
| `../../app/src/main/res/raw/startup_ocean_loop.mp4` | 去除音轨并裁出循环片段的应用资源 |
| `../../app/src/main/res/drawable-nodpi/startup_ocean.png` | 循环视频首帧与播放器兜底资源 |

源视频带 MiniMax AIGC 生成标识。该标识与数字签名是来源信息，不是访问服务的密钥，也不应为通过凭据扫描而删除。

重建参数和源文件 SHA-256 位于 `loop.json`；仓库根 `scripts/prepare-startup-loop.py` 生成循环视频及首帧。哈希用于确认素材身份，许可来自上述维护者授权。应用播放契约见 [启动页文档](../../docs/AGENTS/startup-screen.md)。

这份说明仅覆盖表内的海底启动素材，不覆盖应用图标、第三方商标或用户工作区内容。
