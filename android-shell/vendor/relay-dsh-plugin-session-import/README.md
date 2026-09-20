# Relay DSH Session Import

> **Now supports DSH `0.1.2-rc.1` while retaining `0.1.2-alpha.3` compatibility.** Plugin `0.2.2` is verified on both releases. [Install it from npm](https://www.npmjs.com/package/relay-dsh-plugin-session-import) · [Compatibility evidence](https://github.com/yangbobo2021/Relay/tree/codex/relay-foundation/dsh-lab/dsh-0.1.2-rc.1-20260903).

> **Release channels:** `latest` → `0.2.2`; `next` → `0.2.1-rc.1`.

```bash
npx @deepseek-ai/dsh@0.1.2-rc.1 plugin --profile web add relay-dsh-plugin-session-import@0.2.2 relay-dsh-plugin-codex@0.2.2
npx @deepseek-ai/dsh@0.1.2-rc.1 web
```

[![DSH compatibility](https://img.shields.io/badge/DSH-0.1.1--rc.2%20%7C%200.1.2--alpha.2%20%7C%200.1.2--alpha.3-2f7d68)](https://github.com/deepseek-ai/deepseek-harness)

English | [中文](README.zh.md)

Provider-neutral session import hub for DeepSeek Harness. It contributes one
sidebar action and a typed provider slot; import implementations stay in their
provider plugins.

See [SPEC.md](./SPEC.md) and [delivery acceptance](./docs/spec/acceptance.md).

Verified in official DSH `0.1.1-rc.2` with Codex and Claude providers:
[wide sidebar](./docs/images/session-import-wide-menu.jpg) and
[collapsed sidebar](./docs/images/session-import-rail-menu.jpg).
