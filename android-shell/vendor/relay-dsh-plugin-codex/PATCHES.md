# Android patch against npm 0.2.3-rc.1

`lib/host-plugin.js`: `apply()` returns early only with `androidClientOnly: true`.
DSH discovers client bundles from mounted rows, not dependencies alone. The row
publishes the original client and its dependencies, while dsh-android-codex calls
the original host apply with its owned Android client. This avoids two App Servers
and duplicated model/session handlers. No upstream Agent behavior is replaced.

`resumeSession()` also forwards the current DSH sandbox choice as the matching
Codex permissions profile. Without this field the Android fail-closed boundary
cannot validate a resumed thread. No missing/default choice is upgraded.

`lib/client.js`: omit the AdvancedDebugGuard slot registration. Its upstream
MutationObserver clicks the chat tab whenever any other view is selected, even
for ordinary DSH sessions, preventing Voice Deck and trajectory views opening.
Android retains the existing DSH view switcher.

Android permission/disabled errors retain their actionable message through the
persisted-thread resume wrapper, rather than being mislabeled as a connection
failure. Other upstream recovery behavior is unchanged.

Native mode also consumes the optional `agent/context-delegation` boundary before
DSH prompt assembly/pre-step middleware. Only actual user messages enter a Codex
turn; DSH plugin wakeups cannot replay the previous user message. Native mode
rejects auxiliary DSH prompt transformations. The scheduler, user messages,
permissions adapter and result projection remain in DSH. The matching pinned
agent-loop overlay is in `scripts/lib/codex_context_patch.py` (repository root).

`codexHome` is supplied explicitly to the adapter. Image previews authorize the
workspace and that runtime's `generated_images` directory, with canonical-path
checks still rejecting sibling paths and symlink escapes. The Android process
has a private CODEX_HOME, different from the host Node process's default.

Restore the package in SOURCE.json and reapply these changes. The packaged
source maps remain upstream provenance and do not include these changes.

Native delegation also snapshots `modelSelection.pending ?? lastUsed` per Agent (falling back to the
configured model for a fresh session)
and applies it in the outer `agent/request` listener. Skipping assembly must not
skip model/effort routing. Missing/non-Codex selections fail explicitly; an absent
effort clears any inherited DSH effort. Snapshot copies isolate an in-flight step
from later selection mutations, without reintroducing prompt assembly. The host
now declares the `sessionProjections` and `agentDefaultModel` dependencies used
for this capture.

Android input-image cache: persistContentAddressedImage falls back from rejected hard links (EACCES/EPERM/ENOTSUP/EOPNOTSUPP) to same-directory rename of a complete temporary file. Existing cache entries are still checked for regular-file type and SHA-256; corruption and symlinks fail closed. Concurrent same-digest publishers write identical verified bytes. Temporary files are cleaned on either publication route. Reproduce with scripts/prepare-image-cache-test.py and the generated .tools/image-cache-test.mjs; the real Fold user's 668137-byte image passed without changing the original attachment.

ImageView preview roots also include codexInputImageRoot(), the exact same host-side directory used to materialize verified input images. This is intentionally distinct from the App Server's private CODEX_HOME/generated_images. Canonical path / sibling / symlink escape guards stay in place. Regression: scripts/test-codex-preview-roots.mjs.

## Native Live runtime binding

An optional `codex.onLiveRuntime` callback exposes a narrowly scoped prepare/observe/interrupt/sync/history interface to the Android Codex plugin. It resolves a real Codex DSH session, applies that session's existing model and permission policy, acquires an interaction lifetime, and returns the actual Codex thread identity. Live does not silently create a second thread or substitute another session's thread. Non-Codex sessions and busy turns are rejected. The callback is omitted by ordinary callers.

The optional history seam resolves an existing binding, acquires its DSH session through the existing import target, and supplies the private Codex HOME to the voice plugin projector. It flushes appended standard surface messages and updates the projection cache without creating or replacing a session or replaying a prompt. Voice filtering and stable segment IDs belong to the independent Live plugin.

## DSH 0.1.5 settlement contract

Synthetic assistant messages produced by live tool activity and imported history carry `stream: []`. They have no DSH model stream, but the current session/query/token-meter contract requires an array. Omitting it makes turn completion fail and the persisted session impossible to resume. Standard model-stream settlement remains owned by the host loop.

- 0.1.5 历史导入预留空 system head：仅格式初始化，无 DSH 提示词注入；现有会话已有 system head 时不重复创建。真实 current-format 重读回归见 `scripts/test-legacy-session-migration.mjs`。
