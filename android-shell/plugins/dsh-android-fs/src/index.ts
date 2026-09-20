import { SandboxedFileSystem } from '@deepseek-ai/dsh-fs-sandbox'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import type { Context } from '@deepseek-ai/cordis'
import { isAbsolute, join } from 'node:path'
import { publishNoReplace } from './publish.js'
import { publishSharedExclusive, isAndroidSharedPath } from './publish-shared.js'

export interface Config extends LocalConfig {
  /** Deployment setting, never a model-provided command. */
  pythonPath?: string
}

/**
 * Replace the ctx.fs provider, retaining all upstream sandbox/read/edit/version logic.
 * The pinned 0.1.5-rc.1 public internals.linkFile seam is marked as a test hook
 * upstream: treat it as a version-locked adapter contract, not a stable API.
 */
export class AndroidFileSystem extends SandboxedFileSystem {
  constructor(ctx: Context, config: Config) {
    super(ctx, config)
    const prefix = process.env.TERMUX__PREFIX
    const python = config.pythonPath ?? (prefix ? join(prefix, 'bin/python3') : '')
    if (!isAbsolute(python)) throw new Error('android-fs: an absolute pythonPath or TERMUX__PREFIX is required')
    if (!this.internals || typeof this.internals !== 'object') {
      throw new Error('android-fs: unsupported upstream atomic-publication contract')
    }
    this.internals = { ...this.internals,
      linkFile: (source, destination) => isAndroidSharedPath(destination)
        ? publishSharedExclusive(source, destination)
        : publishNoReplace(python, source, destination) }
  }
}

export default AndroidFileSystem
