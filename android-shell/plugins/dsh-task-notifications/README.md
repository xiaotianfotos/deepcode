# Task notifications

Optional DeepCode plugin: `task-notifications` settings namespace and matching `settings.plugin.item` card. Requires the Android notification bridge for session-aware presentation; Host events and settings continue without the WebView.

- `enabled` (default true): task notifications only, not the engine's foreground-service notification.
- `progress` (default true): silent per-session progress.
- `quietWhenVisible` (default true): retain a silent record when the user is already viewing that conversation.

The existing Android bridge owns final reports and interactive decisions. This plugin only adds initial progress and owns the atomic native policy cache. Disposal disables that cache without canceling agents or deleting session data. The native watcher withdraws notifications when disabled. Speech and desktop overlay are independent optional features.

`npm ci && npm test && npm run build`. Bundle through `scripts/stage-task-notifications.py`; the guarded installer respects user-modified packages and removal. Full presentation rules: [Task notifications](../../../docs/development/TASK-NOTIFICATIONS.md).
