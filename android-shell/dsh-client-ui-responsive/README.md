# dsh-client-ui-responsive

[🌐 中文说明 / 中文 README](README.zh.md)

> **dsh-mobile 生态** · [dsh-mobile-apk](https://github.com/kelai141/dsh-mobile-apk)（壳 APK）· [dsh-shell-termux](https://github.com/kelai141/dsh-shell-termux)（shell）· [dsh-host-web-compat](https://github.com/kelai141/dsh-host-web-compat)（浏览器兼容）· [dsh-mobile](https://github.com/kelai141/dsh-mobile)（协调仓库，private）

Android mobile adaptation layer for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
web UI.

**0.2.0 de-forked the plugin.** Up to 0.1.14 it replaced the upstream `ui-layout`
frame with a mobile fork of its own. Upstream 0.1.5 turned `ui-layout` into the
layout service hub (`ctx.layout`, the keyed `main` panel seat, the right column's
track/fullscreen reporting) that ui-conversation, ui-sidebar and ui-sidebar-right
all compose against — reproducing that surface meant re-forking it every release.
The plugin now keeps upstream's frame and adds only what a phone needs.

## What it does

| Area | Contribution |
|---|---|
| Phone form (<768px) | CSS over the upstream frame: the left sidebar becomes an off-canvas drawer, the centre column spans the frame, the right Sidebar keeps upstream's own fullscreen slide-over (same 768px threshold), touch drag handles step aside |
| Drawer entry | `shell.overlay` top bar with one toggle (the rail sits off-canvas on a phone, and no control is added to the composer row) |
| Native "open with" | Session-header action (opens the workspace directory) and an `extension`-band tab type for archives/binaries — both raise the shell's chooser (MT Manager, system files) |
| Composer | Insets (system bars + IME), narrow-screen control-row cap, popup width/height/shift guard, mobile Enter guard |
| Shell surfaces | Developer options section, Android general settings row, export-result dialog, external-file delivery consumer, theme bridge, keyboard boundary |
| Retired with 0.1.5 | The frame fork, the duplicated theme presenter, the injected 「上传图片」/「导出调试日志」 menu items, the image-pick bridge, and the CSS that hid upstream's own attachment buttons |

## Install and mount

**1. Package** into the web profile's `node_modules` (see dsh-shell-termux for the pattern).

**2. Insert** in the profile's `cordis.patch.yml` — `ui-layout` stays ENABLED:

```yaml
- insert:
    - id: ui-responsive
      name: '@dsh-android/dsh-client-ui-responsive'
- id: open-in-app
  disabled: true
- id: ui-open-in-app
  disabled: true
```

**3. Restart** and verify the browser roster (`window.__DSH_BOOT__` entries contain
both `ui-layout` and `@dsh-android/dsh-client-ui-responsive`).

## Contract anchors

The narrow form keys on DOM facts, never on CSS-Module class names, and the facts
themselves are published by this plugin:

| Fact | Written by | Consumed by |
|---|---|---|
| `html[data-dsh-mobile-form]` | `mobile/form-marker.ts` (mirrors `(max-width: 767px)`) | every injected stylesheet |
| `[data-dsh-frame]` | same (tagged from upstream's `[data-rightbar-col]`) | `mobile-form.css.ts`, keyboard boundary |
| `html[data-dsh-modal-open]`, `[data-dsh-settings-dialog]` | same | settings-panel reflow |
| `[data-dsh-mobile-topbar]` | `mobile/MobileChrome.tsx` | composer popup guard |

Upstream attributes the sheet relies on: `data-sidebar-collapsed`,
`data-rightbar-col`, `data-rightbar-panel="fullscreen"`,
`data-sidebar-right-toggle`, `data-conversation-header-corner`.

## Build

```sh
npm install          # @deepseek-ai/* pinned to 0.1.5-rc.1
npm run typecheck
npm run build        # tsc (lib/types) + tsdown (lib/client.js browser bundle)
npx vitest run
```

The browser bundle uses the `__ModuleLoader__.load` contract; rebuild before probing
a live server (the registry serves `lib/client.js`, not sources).

## License

MIT. Derived from `@deepseek-ai/dsh-client-ui-layout` (MIT, © 2026 DeepSeek) — see NOTICE.
Design rationale: `docs/design.md`.
