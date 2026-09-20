import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const helper = fileURLToPath(new URL('./publish-noreplace.py', import.meta.url))

/** The upstream hook expects Node errno codes, including EEXIST for stale guards. */
export function publishNoReplace(python: string, source: string, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // -I ignores PYTHONPATH, user site packages, and script-directory imports.
    // No shell interpolation; arbitrary Unicode/quotes in filenames remain argv.
    // Await child completion: killing it on cancellation could lose its commit outcome.
    execFile(python, ['-I', helper, source, destination], { maxBuffer: 16384 }, (error, stdout) => {
      if (error) {
        reject(Object.assign(new Error('Android atomic publication helper failed', { cause: error }),
          { code: 'EIO', syscall: 'renameat2' }))
        return
      }
      try {
        const result = JSON.parse(stdout) as { ok?: unknown; code?: unknown; errno?: unknown }
        if (result.ok === true) return resolve()
        if (result.ok !== false || typeof result.code !== 'string' || !/^E[A-Z0-9]+$/.test(result.code)
          || !Number.isInteger(result.errno)) throw new Error('invalid helper response')
        reject(Object.assign(new Error(`Android atomic publication failed: ${result.code}`),
          { code: result.code, errno: result.errno, syscall: 'renameat2', path: source, dest: destination }))
      } catch (cause) {
        reject(Object.assign(new Error('Invalid Android publication response', { cause }), { code: 'EIO' }))
      }
    })
  })
}
