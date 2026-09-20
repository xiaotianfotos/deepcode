# Android Codex backend

Wraps the pinned Relay Codex session adapter using a native Android App Server
and the existing DSH UI. Login uses App Server's managed ChatGPT browser flow.
No OAuth credentials are parsed by this plugin.

The runtime is pinned in `runtime-lock.json`; `scripts/prepare-codex-runtime.py`
checks both SHA-256 and npm SHA-512 integrity. Code and native library notices are
packaged into the APK. Relay's source and license receipts are under `vendor/`.

Build: `node build.mjs`. Test: `node --test tests/*.test.mjs`.
The repository's `--codex` build selects this ARM64 variant.

Important platform boundary: the tested Android fork does not implement the
Linux workspace/read-only sandbox. Execution is rejected unless the session
explicitly selects full access. Android app permissions still apply.

Integration progress and device evidence: [Codex milestone](../../../docs/CODEX-BACKEND-MILESTONE.md).

Account management is under Settings → Plugins → Configurable plugins → Codex.
The standard plugin card is paired with the host `android-codex` settings namespace;
account actions remain on the authenticated API. That API returns a masked email.

Choose the Codex Harness in the new-session preset menu before sending a first
message. DSH fixes the preset after a turn starts; the existing-chat header is a
read-only label. Selecting a model alone does not change the Harness.

While enabled, activating the Codex relay boots the shared App Server
immediately — an explicit enable also pre-boots it — so the first session
request works without waiting for a settings poll. One App Server is shared by
independent session threads. Turning the enabled switch off terminates the
idle process and gates every later boot, status poll and account action until
Codex is re-enabled; the account API never starts the process while disabled,
and active turns, pending session work or an in-flight boot reject the stop
without changing configuration.
An explicit enable releases the gate and eagerly boots the shared process (one
child per cycle) so the next session request works without waiting for a
settings poll; a failed boot tears the rejected child down, keeps Codex enabled
with a retryable error, and a retry after repair boots one child ready for
immediate use. If a stop cannot confirm the child actually terminated, the
disable returns an explicit cleanup error and stays disabled rather than
pretending the process was released.
Unmounting the plugin closes its owned process permanently without deleting CODEX_HOME,
settings, session links or authorization files.

Recovery boundary: the pinned Relay host normally caches its initial
activation promise, but the Android mount opts into the vendor's documented
activation recovery (see
`android-shell/vendor/relay-dsh-plugin-codex/ANDROID-PATCHES.md`). After a
failed first activation, disabling stays fully gated — model/status queries
never retry, boot or spawn background loops — and an explicit enable after
correcting the startup problem retries the activation in a bounded, deduped
way, so the same Relay `whenReady`, model listing/resolve, workspace thread
listing/read and terminal/session paths recover without restarting the host.
Disabling and re-enabling an already initialized Relay refreshes the actual
connection state and model catalog while keeping session links, settings and
active-turn stop refusals. Without the opt-in the vendored host keeps the
upstream one-shot semantics unchanged.

Native context: the Codex build adds an optional context-delegation boundary to
the pinned DSH loop. Only Codex sessions bypass DSH system prompt assembly and
pre-step injections. Codex loads its own built-in instructions, AGENTS.md and
native Skills (including project `.agents/skills/<name>/SKILL.md`). Use `$name`
to explicitly request a native skill. DSH-only skill tools, plugin instructions
and remote skill providers are not automatically exported to Codex. Portable
skills should live in the shared `.agents/skills` format; skills requiring DSH
tools need a separate capability adapter, not a copied system prompt.

Image previews use the explicitly supplied private CODEX_HOME. Existing preview
failure text is historical; no conversation records are rewritten by an upgrade.
The Codex APK also bounds Android attachment-store directory fsync to canonical
app filesDir: syncing OS-owned `/data/data` ancestors is not allowed on Android.
