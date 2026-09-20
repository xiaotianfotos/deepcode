# known-gaps.md — 待办与已知缺口（非本轮范围，防再探）

## 8. 待办与已知缺口（非本轮范围，记录防止再探）

- F2「T1 授权豁免自动升级」未落地（电池白名单仅引导 Intent；指数退避仅日志不改调度）——涉及系统策略写面，不自动执行。
- F1.10 引擎更新通道未实现；F0.3 引擎事件桥未实现。
- 子代理 PRD 评审完整清单见协调仓库 `docs/review-0.13.0-20260823.md §九` 与 `.deploy-tmp/prd-gap-review.md`（U4/U5、A4/A6/A8、B4/B5/B7、F4、P4 未修项）。
- **~~扫描/图片版 PDF → 页图渲染受限~~（0.13.1 已修，0.13.0 记录作废）**：原记录「`@napi-rs/canvas` 仅 glibc 预编译装不上」系**误判**——npm 有 `@napi-rs/canvas-android-arm64`（N-API/Bionic 预编译，os=android cpu=arm64，真机 createCanvas 实测可用）。0.13.1 起随出厂快照装配（profiles/web package.json 登记 + tarball 解入，仅 arm64；npm 无 android-x86_64 triple，x86_64 模拟器维持守卫降级）。构建脚本 7c2 段。
- **marketplace 惰性加载决策（0.13.0 D4）**：cordis 装配层无惰性概念；拆装配违反 F4「内置市场」。启动速度优化由 D2（快照瘦身）+ D3（NODE_COMPILE_CACHE）承担，marketplace 保持启动装配。
- **provider 命名混淆（0.13.0 C3 实锤）**：默认 pin 曾为 `opencode-go`（OpenCode Zen Go 网关，`opencode.ai/zen/go/v1`，实测 404）——用户误以为配了 OpenRouter。0.13.0 默认 pin 改 `deepseek-official`（壳注 DEEPSEEK_API_KEY），opencode-go/OpenRouter 需在「添加自定义供应商」显式配置；设置页文案与文档需持续提醒区分。

---
