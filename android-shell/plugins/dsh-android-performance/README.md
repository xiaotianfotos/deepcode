# Android 性能调试插件

通过官方 `shell.overlay` 显示右上角浮层，`settings.section` 提供“性能调试”开关。默认关闭，本机持久保存；每秒更新一次，关闭或卸载后停止采样，页面不可见时暂停。

不采集、也不显示 CPU 占用。内存是本应用同 UID 可读取进程的 RSS 总和，共享页可能重复计数。

GPU 只接受真实驱动百分比；系统不开放时明确显示“不可用”。不使用频率、FPS 或推测值冒充利用率。当前小米 M367FC / O3 平板属于不可用情形。

```sh
npm ci --legacy-peer-deps
npm test
```

安装：本地总仓 `--voice-debug`，或独立加入 web profile patch。壳须提供 performanceSample/performanceReset；缺失时明确显示指标不可用。
