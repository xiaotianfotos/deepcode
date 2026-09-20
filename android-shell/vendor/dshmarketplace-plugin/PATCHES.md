# dshmarketplace-plugin（vendored，已固化修复）

本目录是第三方插件 **dshmarketplace-plugin@0.1.5** 的 vendored 副本（上游：
<https://github.com/DshMarketPlace/dsh-plugins-store>，npm 包名 `dshmarketplace-plugin`，
MIT）。来源为 npm 发布的 `dshmarketplace-plugin-0.1.5.tgz`（解包即本目录，除
`lib/index.js` 一处修复外与上游逐字节一致）。

## 为什么 vendor（而非直接依赖 npm 版本）

版本 0.1.5 存在一个**全工具崩溃级缺陷**（设备实测，详见
`docs/review-0.13.0-20260823.md`）：

- 插件向 `tools/pre-execute` 注册的 listener 形如 `async t => { if(...) return; ... }`，
  即对**非安装调用、fullName 为空、安装完成**三条路径都直接 `return undefined` 且
  **不调用 waterfall 的 `next()`**。
- 结果：任何非 `dshmarketplace_install` 工具调用经 pre-execute 后
  gate=`undefined`，执行器读 `gate.kind` 抛
  `Cannot read properties of undefined (reading 'kind')` —— **全部工具全灭**。

上游 0.1.6 尚未发布修复，故 0.13.0 快照 vendored 本修复版本。

## 与上游的差异（由 scripts/patch-marketplace.mjs 幂等施加，构建门禁自动执行）

| 补丁 | 面 | 内容 |
| --- | --- | --- |
| A（0.13.0） | `lib/index.js` | pre-execute listener 补 `next()`（上述崩溃修复） |
| B（0.13.1） | `lib/index.js` | 安装 runner execPath 安全化（linker64 回退污染 process.execPath → bad ELF magic；改 `TERMUX__PREFIX/bin/node`） |
| C（0.13.1） | `lib/client.js` | 不可安装条目（NO_COMMAND/需凭据/仅桌面）安装钮置灰 + title 说明 |
| D（0.13.2 W1） | `lib/index.js` + `lib/client.js` | **移动兼容性徽章 + mobile: 前缀过滤**：搜索响应逐条富化 `compat`/`compatNote`（内嵌兼容性 map，按 fullName 末段匹配；未登记=unknown）；`q` 以 `mobile:` 开头时滤除 desktop 条目；卡片 meta 行加徽章（移动可用/仅桌面/原生?/未验证），搜索框旁「仅移动端可用」复选框把前缀并入搜索词。工具面 schema（B 的 additionalProperties:false）不动——富化仅发生在 webServer 响应层 |

其余文件（`lib/client.js` 无 D 前形态、`package.json`、`cordis.patch.yml`、
`skills/dsh-plugin-store/SKILL.md`、README/LICENSE）与 0.1.5 逐字节一致（除上表补丁外）。
校验方式：

```powershell
node scripts/patch-marketplace.mjs vendor/dshmarketplace-plugin/lib
# 输出 "patch-marketplace: ALL OK" 且退出码 0 即为全部补丁在场
```

兼容性 map 数据源：dshmarketplace.dev 目录（6108 条目）+ 已知事实分类；D 补丁为幂等
施加（map 变更随时同步回已修补文件）。