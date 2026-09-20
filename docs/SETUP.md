# 开发环境入口

新 checkout 请从 [首次构建与部署](FIRST-DEPLOY.md) 开始，使用 `scripts/bootstrap-android-host.py` 准备工具链、`scripts/first-build.py` 装配当前 ARM64 APK。[Android 构建环境](ANDROID-BUILD-ENVIRONMENT.md) 分别说明电脑构建 DeepCode、设备内编译 Android 小应用的依赖和安装前提。

当前来源以 [source-provenance.json](source-provenance.json) 和 [上游集成规则](UPSTREAM-INTEGRATION.md) 为准。历史 0.13.3 基线脚本仅供旧版本维护，不是当前首次构建入口。

- 插件职责与测试：[模块导航](MODULES.md)。
- 完整运行时及新增原生能力：[运行时边界](RUNTIME-BOUNDARY.md)、[上游集成规则](UPSTREAM-INTEGRATION.md)。
- 设备连接与安装保护：[设备调试规则](../android-shell/docs/AGENTS/devices-and-debugging.md)。
- 本机数据与提交规则：[仓库边界](REPOSITORY-HYGIENE.md)。

SDK 许可、模型和账号授权由操作者自行处理；首次构建会下载公开固定输入并生成自己的 `artifacts/first-build.json`，无需维护者已有回执。源码不分发签名密钥，新 checkout 使用本机调试签名；能首装不代表能覆盖另一签名的已有应用。部署先运行 `scripts/deploy-source.py --check --serial <完整serial>`，全部预检通过且获得目标设备更新授权后再显式 `--install`。构建、安装、引擎就绪和功能验收分别报告。
