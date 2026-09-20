import test from 'node:test'
import assert from 'node:assert/strict'
import { isLocalWorkspacePath } from '../lib/workspace-path.js'
test('accepts current-user shared storage and removable volume paths', () => {
  for (const path of ['/storage/emulated/0/Documents/我的 项目', '/storage/emulated/10/Documents', '/storage/86FB-1E11/项目', '/storage/86FB-1E11', '/storage/12345678-1234-1234-1234-123456789abc/code']) assert.equal(isLocalWorkspacePath(path), true, path)
})
test('rejects URI, private/system paths, traversal, control bytes and unknown mount names', () => {
  for (const path of [null, '', 'content://com.android.externalstorage.documents/tree/primary:Docs', '/data/user/0/pkg', '/storage/self/primary', '/storage/emulated/0/../10', '/storage/ABCD-1234/./x', '/storage/emulated/0/x\0', '/storage/random/x', '/storage/emulated/0evil/x']) assert.equal(isLocalWorkspacePath(path), false, String(path))
})
