# Codex GPT Live

DeepSeek Harness Cordis plugin for the Android shell. `codex-live` is both its Host settings namespace and `settings.plugin.item` key. Enable it under Settings → Plugins, then click the waveform in a Codex conversation to start; click again to end. Permission requests continue that explicit gesture. The local transcription plugin remains independent.

The Host requires `settings` and `webServer`, and optionally consumes `androidCodexRuntime` from the Android Codex plugin. That service supplies the existing client and the Relay thread preparation/observation hook. Missing dependencies make voice unavailable without removing ordinary chat. The client requires `slots`, `sessions` and `settingsScope`; durable preferences use the standard revision protocol. Credentials remain in the existing Codex account flow.

Disabled instances own no Live event listeners or polling timers. Active disable is rejected before persisting settings. Cordis unload and dependency loss close voice without interrupting already submitted tasks; explicit user End still interrupts the current voice task. Native microphone permission, WebRTC transport, audio focus, notification and background service are Android responsibilities. Hiding the WebView does not unload the plugin or end voice.

Voice uses the selected chat's Codex thread, with IDs visible in the details control. Startup does not play test samples. The startup developer item asks GPT Live to wait for user speech; model behavior and account availability depend on the upstream service. Completed user/assistant speech segments from the bound thread's rollout are projected into standard durable DSH chat messages. Stable IDs prevent duplicate replay after reconnect/restart. Active native polling and opening a Codex chat catch up history; partial segments never submit a new task. Native voice tool-execution details are not yet fully projected. Backfilled messages use insertion timestamps and one completed message turn per segment.

Build and check from this directory with `npm ci && npm test`. Tests include real Cordis unload/reinstall, optional dependency loss/recovery, active-disable rejection, React entry controls, settings migration and protocol ownership races. APK packaging and physical-device checks are documented in `../../docs/AGENTS/background-voice.md`. Build both this plugin and `dsh-android-voice-input` before packaging the experimental APK; use the verified donor host workflow to preserve installed independent changes.

## Foreground task progress

The same GPT Live settings card owns `showCommentary` (default on) and
`speakCommentary` (default off). These work during ordinary Codex text / ASR
turns; they do not start a realtime call. The input dock shows the latest public
commentary in a compact scrollable area. Standard chat history is unchanged.

The existing App Server listener projects only `agentMessage` items explicitly
labelled `commentary`. Thread identity comes from the Android Codex plugin's
atomic `session-links.json`; lookup is read-only and rejects ambiguous bindings.
Turn IDs reject stale notifications; reasoning, tools, final answers and
unlabelled text never enter this progress feed. No historical speech is replayed.
The authenticated `/api/android/codex/live` `progress` action requires the same
CSRF token as other Live actions and does not acquire/resume a Codex thread.

Optional foreground speech uses the speech-services plugin's selected TTS and
requires its independent TTS switch. Complete commentary items are shortened to
160 characters, deduplicated, spaced at least 15 seconds apart, and discarded
after 20 seconds. There is no accumulating narration queue. Playback uses the
WebView audio context and the existing authenticated HTTP/PCM streaming API;
provider credentials remain on Host. This does not require the whale overlay to
be running. Only the selected chat/active lane speaks. Leaving the foreground,
opening the companion, starting recording or realtime voice, changing settings,
finishing a turn, switching sessions or unloading cancels playback and requests.
Desktop companion speech stays under `say` rather than auto-reading commentary.
Old shells without `speechPlaybackContext` can display progress but fail closed
for automatic speech. Loading history or enabling speech never reads old text.

Use `scripts/stage-codex-live.py` after building the plugin to overlay these four
plugin resources onto a verified runtime; it preserves the Codex binary, native
libraries, snapshot and unrelated vendor patches.


### Upgrading snapshot-bundled plugins

Some 0.1.5 snapshots contain these plugins without per-file installer receipts.
The shell recognizes only the pinned source hashes in
`app/src/main/assets/bundled-plugin-baselines.json` for that first upgrade, then
records normal receipts. Unknown modified files and explicitly removed plugins
remain protected. The Live asset list contains package, license and two bundles;
it must not request an absent third-party notice and silently skip every update.
