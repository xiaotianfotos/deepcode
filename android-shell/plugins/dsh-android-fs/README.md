# Android filesystem adapter

Replaces the host `ctx.fs` provider with a subclass of upstream `SandboxedFileSystem`.
Only `internals.linkFile` changes. Private storage uses the existing Python to call
libc `renameat2(..., RENAME_NOREPLACE)`: atomic publication without replacement.
Android shared-volume paths use exclusive `open("wx")`, copy the completed staging
bytes, and sync. Android shared-storage FUSE rejected RENAME_NOREPLACE with EINVAL
in the actual Agent test. This is an explicit path-specific strategy, not a silent
fallback after an unexpected error. Neither strategy overwrites an existing target.

Shared creation is **not atomic to readers**: a process crash, unplug, or write error
can leave a partial file. On failure it is retained, not unlinked, to avoid deleting
another app's concurrent replacement/edit. Report failure and let the user inspect
that path. Shared files also obey the volume's permissions, not private POSIX modes.

All read, edit, version guards, per-target serialization, sandbox policy checks,
staging, sync and cleanup remain upstream code. Existing replacements
continue to use the upstream rename path. A failed helper fails the write closed.
Abort is honored by upstream before publication; once publication starts, we await
its result instead of killing the helper and losing the commit outcome. As with
the upstream path, abrupt process/device death can require ordinary filesystem
recovery; this does not add a power-loss durability guarantee.

The exposed `internals` field is described as a test hook upstream, not a stable
plugin ABI. Exact peer versions and archive gates pin 0.1.2-rc.1. Re-audit the hook
and rerun tests before upgrading Harness. This is an explicit compatibility seam.

Python/ctypes are already shipped in the paired snapshot; no additional runtime
binary is downloaded. `TERMUX__PREFIX/bin/python3` is the default helper executable;
`pythonPath` permits an absolute deployment override (host tests use /usr/bin/python3).
Missing Python, ctypes, libc renameat2 or filesystem support fails closed. Runtime
claims cover the x86_64 emulator; ARM64 and HyperOS still require physical testing.

Build: `npm ci --legacy-peer-deps && npm run build`. Test: `npm test`.
The same tests run in the APK's actual Node environment using the root device probe.
Ten private-publication cases cover Unicode create/read/edit, existing files, a competitor at the commit
boundary, 12 independent publication processes, read-only/workspace restrictions,
symlink escape, cancellation, failure cleanup, missing helper and dangling symlinks.

References: [renameat2 semantics](https://man7.org/linux/man-pages/man2/rename.2.html),
[ctypes errno handling](https://docs.python.org/3.12/library/ctypes.html).

Four additional tests cover shared exclusive publication, concurrent creators, missing inputs/dangling destinations, and Android-only strategy selection. Actual shared-volume tests must run through the app engine: adb run-as lacks the app mount namespace on the tested Android 15 emulator.
