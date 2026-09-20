/** Format gate after the native picker; never treat content URIs as filesystem paths. */
export function isLocalWorkspacePath(path) {
  if (typeof path !== 'string' || path.includes('\0')) return false
  if (path.split('/').some(x => x === '..' || x === '.')) return false
  return /^\/storage\/(?:emulated\/\d+|[a-f\d]{4}-[a-f\d]{4}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})(?:\/[^\0]*)?$/i.test(path)
}
