# Android vendor patches — relay-dsh-plugin-codex

Upstream package: relay-dsh-plugin-codex 0.2.3-rc.1 (see SOURCE.json, upstream
tarball sha512/shasum and LICENSE unchanged). Only lib/host-plugin.js is
modified; the upstream source receipt, presets and license files are untouched.

## Patch: Android activation recovery (opt-in)

Problem: the host cached a single activation promise (`const ready =
runtime.initialize()`) into the execution/terminal capabilities and passed
`runtime.whenReady()` once into CodexDshAdapter. A failed first activation
(live model/list rejection after a successful protocol initialize, or a spawn
ENOENT) permanently poisoned whenReady, listWorkspaceThreads, readThread,
terminal readiness and the adapter's listModels/resolveModel/session paths even
after AndroidCodexClient was repaired and the user explicitly re-enabled the
backend. Recovery required a host restart.

Changes (all inside lib/host-plugin.js):

1. createCodexExecutionPlugin accepts a new optional
   `config.activationRecovery = { enabled(): boolean, attach(api) }`. When
   present, activation keeps a single-flight attempt record; capabilities and
   the DSH adapter observe the CURRENT attempt instead of a frozen promise,
   and `api.refresh()` (handed to the Android plugin via attach) may retry
   initialize. refresh is bounded and deduped: it never starts a second attempt
   while one is in flight and never runs when `enabled()` is false, so
   status/model queries while disabled or after a failure cannot hot-retry,
   hidden-boot or spawn background loops. The Android plugin calls refresh only
   from the explicit enable action after the shared client boot resolved.
2. CodexDshAdapter readiness accepts a function-or-promise (`readiness()`);
   createDshCodexPlugin passes a live accessor only when
   `config.codexActivationRecovery` is set.
3. CodexSessionRuntime.initialize carries an activation epoch guard so a stale
   attempt's completion cannot overwrite a newer attempt's models, session
   upserts or connection status.

Default (non-Android) behavior: without `activationRecovery` the eager attempt
is the only value ever returned through whenReady/await sites, matching
upstream one-shot semantics; the epoch guard is inert for a single initialize.

## Sourcemap note

lib/host-plugin.js.map is intentionally untouched and no longer corresponds to
the patched lib/host-plugin.js bytes. Do not regenerate or trust it for the
patched file.

## Verification

Pinned consumer suite: android-shell/plugins/dsh-android-codex/tests/
vendor-recovery.test.mjs loads this exact file (source identity sha256 guard +
structural anchors, fail-closed) with disclosed mocked DSH peers and exercises
failing first activation, repair + explicit enable recovery, disable gating,
disable->enable state refresh, unmount lifecycle and the untouched default
one-shot semantics.

## Follow-up: plugin-side failed-boot polling latch

Hardening recorded for completeness. lib/host-plugin.js stays byte-identical
(pinned sha256 0fd071003a1fa7afc79ac3d06cf45a2ac1d67db8149464ef938894c84858adbc);
this change lives entirely in the Android plugin layer
(android-shell/plugins/dsh-android-codex/src/client.mjs and src/account.mjs).
A failed boot (spawn ENOENT, initialize rejection or initialize timeout with
no surviving process) now latches AndroidCodexClient.bootFailure. The plugin's
read-only account status()/GET polling answers the honest disconnected
retryable error from that latch instead of re-awaiting start() and re-spawning
a dead backend forever, while every non-deduped boot (explicit enable, login,
direct retry) clears the latch and boots exactly once as before. The
activation-recovery contract above is unchanged: refresh() remains reachable
only from the explicit enable. The pinned consumer suite gained the R6
failed-spawn polling case and the R7 initial-disabled/cycle case against this
exact file.
