---
name: say
description: Check desktop voice availability at the start of each task. When DeepCode's desktop companion is active, use say to acknowledge the task before working, report meaningful progress, and always speak a concise outcome before the final text reply. Do not read entire answers or tool output aloud.
---

# Say

At the start of each task, check whether this session has an active desktop voice companion. In this mode the user may not be looking at a chat window: silent work and a text-only ending are insufficient.

Use the current session's native `say` tool if available. In Codex, resolve `scripts/say.py` relative to this skill's actual location and run it with the app's Python:

```bash
python /absolute/path/to/this/skill/scripts/say.py --status
```

When `available` is true:

1. Before substantive work, call `say` with `phase=ack`: one short acknowledgement and what you will do. Do not claim it is already done.
2. During long tasks, use `phase=progress` for meaningful new progress, verified milestones or a blocker. Leave at least 30 seconds between progress updates and the preceding speech. Continue working; do not wait just to satisfy the interval. Do not narrate tool calls or repeat unchanged status.
3. Before ending EVERY task, call `phase=result` with a concise outcome, including failure, unfinished work, or a question requiring user input. Then leave a short text reply. A short task still needs this result, even if fewer than 30 seconds have passed since acknowledgement.

```bash
python /absolute/path/to/this/skill/scripts/say.py --phase ack --text '收到，我先检查设置。'
python /absolute/path/to/this/skill/scripts/say.py --phase progress --text '问题已经找到，正在验证修复。'
python /absolute/path/to/this/skill/scripts/say.py --phase result --text '设置已修好，验证通过，可以使用了。'
```

For the native tool use the same `phase` and `text` fields; availability is queried with `phase=status`. Acknowledgement and result are each allowed once per turn and are exempt from progress pacing. Choose truthful words appropriate to the actual task; these examples are not scripts to repeat. Usually speak one sentence, at most 160 characters. Keep details, lists, links, code, reasoning and tool results in the conversation; never split a long answer across speech calls.

The helper resolves the caller from `CODEX_THREAD_ID`. Do not select another session or infer identity from desktop focus. It uses existing local authentication and configured TTS, never a separate key. `queued` means accepted, not proof the user heard it. If unavailable, disabled, locked, disconnected or refused, continue with text; do not loop, enable settings or call a provider directly. Changing session or closing the companion cancels queued speech. TTS remains optional.
