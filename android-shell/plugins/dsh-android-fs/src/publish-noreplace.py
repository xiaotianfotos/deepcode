"""Publish a completed staging file atomically, without replacing any target.

No path pre-check, ordinary rename, copy, or hard-link fallback is permitted.
Runs in the existing app UID via the runtime's Python, never through a shell.
"""
import ctypes
import errno
import json
import os
import sys


def publish(source, destination):
    libc = ctypes.CDLL(None, use_errno=True)
    try:
        renameat2 = libc.renameat2
    except AttributeError:
        return {"ok": False, "code": "ENOSYS", "errno": errno.ENOSYS}
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int,
                         ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    # AT_FDCWD = -100; RENAME_NOREPLACE = 1. libc translates syscall errors.
    result = renameat2(-100, os.fsencode(source), -100, os.fsencode(destination), 1)
    if result == 0:
        return {"ok": True}
    code = ctypes.get_errno()
    return {"ok": False, "code": errno.errorcode.get(code, "EIO"), "errno": code}


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("expected source and destination")
    print(json.dumps(publish(sys.argv[1], sys.argv[2])))
