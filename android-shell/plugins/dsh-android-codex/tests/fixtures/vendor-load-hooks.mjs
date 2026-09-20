// Resolve-hook pair that lets tests load the ACTUAL vendored host-plugin.js
// without the DSH host process: only the two optional peer specifiers are
// short-circuited to the disclosed stubs; every other import resolves normally.
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = fileURLToPath(new URL('.', import.meta.url))
const stubs = new Map([
  ['@deepseek-ai/dsh-llm', pathToFileURL(here + 'dsh-llm-stub.mjs').href],
  ['@deepseek-ai/dsh-session', pathToFileURL(here + 'dsh-session-stub.mjs').href]
])
export async function initialize() {}
export async function resolve(specifier, context, next) {
  const stub = stubs.get(specifier)
  if (stub) return { url: stub, shortCircuit: true }
  return next(specifier, context)
}
