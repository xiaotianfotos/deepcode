# 模块与提交导航

从公开上游 `c7746e89d38462bd695ca3d72c8874dc5278958d` 开始，下游初次导入按以下七个连续提交组织。它们不是私有开发历史的合并，也没有把某次修复拆成多个补丁提交。

| 模块 | 完整职责与主要目录 | 前置依赖 |
|---|---|---|
| M01 来源与提交边界 | 上游工程移入 `android-shell/`；许可证、忽略规则、隐私审计；移除内置 model-sync 及其构建挂载 | 上游公开基线 |
| M02 Android 宿主与移动界面 | `android-shell/app/`、responsive、bridge、manage、model-capability；生命周期、原生能力接口、移动布局、共享设置协议 | M01 |
| M03 本机运行环境与 Codex | fs、Debian、Android Codex 插件，固定 Relay 适配层，账户／模型／进程恢复，运行时准备与兼容补丁 | M02 |
| M04 语音服务 | speech-services、voice-input、Codex Live、performance，`asr-lab/` 引擎／对齐源码，`codex-skills/say/` 与对应脚本 | M02；Codex Live 另需 M03 |
| M05 会话工作台与输入设备 | voice-deck、input-gamepad、xiaomi-remote 与配套前端手势、焦点、路由测试 | M02；语音动作另需 M04 |
| M06 外观与通知 | fold-transition、startup-appearance、task-notifications、启动素材与折叠验证工具 | M02；会话反馈复用前述模块 |
| M07 开发交付与维护入口 | 其余 Android／媒体／会话技能、整体装配、部署与验收工具、维护文档和本导航 | 前述模块 |

原生 Activity、Service、桥和多窗口控制存在直接依赖，集中在 M02 提供共同宿主，避免每个功能提交反复修改同一套接口。功能配置与设置卡片由后续插件各自持有。不能据此推断所有插件都能直接安装到未经适配的 DSH；依赖 Android 桥的插件需要对应宿主。

功能模块的源码、配置、必要构建文件、配套技能与测试一起导入。跨插件集成测试随依赖最晚出现的模块加入。M01 为目录／许可准备提交，M07 为整体交付入口；中间五个提交覆盖产品功能。查看准确提交和归属：

```bash
git log --reverse --oneline c7746e89d38462bd695ca3d72c8874dc5278958d..HEAD
git log --follow -- android-shell/plugins/dsh-speech-services/src/index.mjs
```

## 可复用的本地验证

插件在自己的目录执行以下命令；使用锁文件安装，不依赖作者机器的 node_modules：

```bash
npm ci --legacy-peer-deps --ignore-scripts --no-audit --no-fund
npm run build
npm test  # 仅对 package.json 声明了 test 的包执行
```

历史 DSH 插件的 peer 版本要求存在交叉，当前开发安装采用 `--legacy-peer-deps`；Host 注入和实际运行时版本仍必须符合来源清单。桥接、Android 管理、模型能力插件的开发依赖按当前 0.1.5 接口锁定；这不替代运行时集成验收。

- M02：`android-shell/` 内运行 `./gradlew :app:testDebugUnitTest`；responsive、bridge、manage、model-capability 分别运行其测试。
- M03：fs、Debian、Codex 各自测试。Codex recovery suite 使用真实固定 Relay 包与显式 DSH 服务／App Server fixtures；不是云模型或设备验收。
- M04：speech-services、voice-input、Codex Live、performance 的本地测试。不会下载模型、启动 ASR 推理或联系真实语音服务。
- M05：三个输入／工作台插件测试，并重跑 responsive 测试验证跨模块手势。
- M06：三个插件均构建，startup-appearance、task-notifications 运行各自测试；折叠显示和系统权限需另外做设备验收。
- M07：`python3 scripts/test-repository-audit.py`、`python3 -m unittest discover -s android-shell/scripts -p test_retired_plugins.py`，以及提交边界检查。

完整 APK 仍需已验证快照、平台二进制和工具链；模块构建与 JVM 测试不能当作全新 APK、模型推理或实机通过。运行产生的日志、扫描报告、截图和回执不提交。

## 上游同步

`upstream` 指向原作者公开仓库；当前默认下游分支保留上述基线祖先。后续集成用来源清单记录新的上游基线，并按模块验证。不得把私有开发仓库的分支、备份 refs 或 `.git` 合入本仓。对上游贡献时，以对应模块及其宿主依赖为边界重新审查 PR 范围。
