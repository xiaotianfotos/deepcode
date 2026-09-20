"""Pinned client selection repair: retain a selection masked by a reconnect gap."""
import hashlib

BASE_SHA = '181e4162bb1f533926854223fb5552ac88b39a7b2c8233a9bc51d4a20385524e'
OLD = 'if (persisted !== void 0) this.selection.set({});'
NEW = 'if (this.manager.selected === void 0 && persisted !== void 0) this.selection.set({});'


def patch_session_selection(raw: bytes) -> bytes:
    if hashlib.sha256(raw).hexdigest() != BASE_SHA:
        raise ValueError('Unknown session-controller client; review upstream selection semantics first')
    text = raw.decode()
    if text.count(OLD) != 1:
        raise ValueError('Session selection patch anchor mismatch')
    return text.replace(OLD, NEW).encode()
