# 开发环境入口

新 checkout 请从 [Android 构建环境](ANDROID-BUILD-ENVIRONMENT.md) 开始。该文档分别说明电脑上构建 DeepCode、设备内编译 Android 小应用的依赖和安装前提。

当前来源以 [source-provenance.json](source-provenance.json) 和 [上游集成规则](UPSTREAM-INTEGRATION.md) 为准。历史 0.13.3 基线脚本仅供旧版本维护，不是当前首次构建入口。

- 插件职责与测试：[模块导航](MODULES.md)。
- 完整运行时及新增原生能力：[运行时边界](RUNTIME-BOUNDARY.md)、[上游集成规则](UPSTREAM-INTEGRATION.md)。
- 设备连接与安装保护：[设备调试规则](../android-shell/docs/AGENTS/devices-and-debugging.md)。
- 本机数据与提交规则：[仓库边界](REPOSITORY-HYGIENE.md)。

SDK、模型、签名、授权、缓存与运行回执由操作者自行准备，不随源码分发。当前增量 APK 脚本要求已验证的 snapshot/回执；工具链安装和单元测试通过并不等于从零完整 APK 构建已完成。
