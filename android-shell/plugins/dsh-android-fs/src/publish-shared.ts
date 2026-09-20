import { open, readFile } from 'node:fs/promises'

/** Android shared-storage FUSE rejects RENAME_NOREPLACE (EINVAL).
 * Claim the name exclusively: never overwrite a pre-existing file. Unlike private
 * publication this is not atomic to observers; interruption can leave a partial
 * file. Preserve that file on error rather than risk deleting another app's edit.
 */
export async function publishSharedExclusive(source: string, destination: string): Promise<void> {
  // Read the completed staging file before claiming the destination.
  const data = await readFile(source)
  const output = await open(destination, 'wx', 0o600)
  try {
    await output.writeFile(data)
    await output.sync()
  } catch (cause) {
    throw Object.assign(new Error('Shared-storage write failed; a partial file may remain at ' + destination, { cause }),
      { code: 'EIO', path: destination })
  } finally {
    await output.close()
  }
}

export function isAndroidSharedPath(path: string, platform: string = process.platform): boolean {
  return platform === 'android' && /^\/storage\/(?:emulated\/\d+|[a-f\d]{4}-[a-f\d]{4}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})\//i.test(path)
}
