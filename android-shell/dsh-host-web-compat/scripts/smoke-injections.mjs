// smoke-injections.mjs — boot the plugin against a stubbed cordis, run its real tapIndex
// transform, and parse-check every inline <script> it injects.
//
// Why this exists (2026-09-10, WebView 110 / MuMu): the polyfill snippets used to be joined with
// '' — the Set-methods snippet ends with an expression (`})()`) and the next one starts with
// `if (`, so the parser rejected the WHOLE element and every polyfill died silently. The served
// HTML still contained the shim text, so grep-style checks passed while the page reported
// "Iterator is not defined". Only parsing the assembled markup catches that class of defect.
//
// Usage: node scripts/smoke-injections.mjs
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-web-compat-smoke-'))
const failures = []

/** Assert one condition, recording the failure instead of throwing so all checks report. */
function check(label, ok, detail) {
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + (ok || detail === undefined ? '' : ' -> ' + detail))
  if (!ok) failures.push(label)
}

try {
  // The plugin imports @deepseek-ai/cordis; the smoke test supplies a Service stub so the package
  // needs no install (the plugin ships lib/ only).
  const stub = join(scratch, 'node_modules', '@deepseek-ai', 'cordis')
  mkdirSync(stub, { recursive: true })
  writeFileSync(join(stub, 'package.json'), JSON.stringify({ name: '@deepseek-ai/cordis', version: '0.0.0-stub', type: 'module', main: 'index.js' }))
  writeFileSync(join(stub, 'index.js'), 'export class Service { constructor(ctx, name) { this.ctx = ctx; this.name = name } }\n')
  const pluginCopy = join(scratch, 'plugin.mjs')
  copyFileSync(join(pluginRoot, 'lib', 'index.js'), pluginCopy)

  const mod = await import(pathToFileURL(pluginCopy).href)
  const transforms = []
  const ctx = {
    webServer: {
      tapIndex: (fn) => { transforms.push(fn) },
      register: () => () => {},
    },
    effect: () => () => {},
    get: () => undefined,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  }
  mod.apply(ctx)
  check('plugin exports name/inject/apply', mod.name === 'host-web-compat' && Array.isArray(mod.inject) && typeof mod.apply === 'function')
  check('registers exactly one index transform', transforms.length === 1, String(transforms.length))

  const html = transforms[0]('<html><head><title>t</title></head><body></body></html>')
  check('injects before </head>', html.includes('</head>') && html.indexOf('Promise.withResolvers') < html.indexOf('</head>'))

  const bodies = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  check('injects at least 4 script elements', bodies.length >= 4, String(bodies.length))
  for (const [index, body] of bodies.entries()) {
    try {
      new Function(body)
      check('script #' + (index + 1) + ' parses (' + body.length + ' bytes)', true)
    } catch (error) {
      check('script #' + (index + 1) + ' parses (' + body.length + ' bytes)', false, error.message)
    }
  }

  // Live-page markers: the polyfills must be reachable from the served text, not merely present in
  // the plugin source (the failure mode this gate exists for).
  for (const [label, needle] of [
    ['Promise.withResolvers polyfill', 'Promise.withResolvers=function'],
    ['Iterator global shim', "Object.defineProperty(globalThis,'Iterator'"],
    ['Iterator constructor shape (Iterator.prototype)', 'Object.defineProperty(IteratorCtor,\'prototype\''],
    ['Object.groupBy shim', 'Object.groupBy=function'],
    ['Set.prototype.union shim', "def('union'"],
    ['Array.fromAsync shim', 'Array.fromAsync=async function'],
    ['AbortSignal.any polyfill', 'AbortSignal.any=function'],
    ['directory-picker bridge', 'x-dsh-pick-token'],
    ['theme bridge', '__dshThemeBridge'],
  ]) check('served markup carries ' + label, html.includes(needle))

  // Behavioural proof for the shape of the Iterator shim: run the real polyfill script inside a
  // realm with Iterator deleted (the WebView 110 situation) and then evaluate pdfjs's own guard.
  // A bare {from} object passes every text check above and still throws here.
  const { createContext, runInContext } = await import('node:vm')
  const realm = createContext({ console })
  const polyfillBody = bodies.find((body) => body.includes("typeof Iterator==='undefined'"))
  check('polyfill script located for the realm probe', typeof polyfillBody === 'string')
  if (typeof polyfillBody === 'string') {
    // Chromium 110 has neither the Iterator global nor the helper methods; deleting only the global
    // would let the realm's native helpers answer the probe and hide a broken wrapper.
    runInContext(`(() => {
      const proto = Object.getPrototypeOf(Object.getPrototypeOf([][Symbol.iterator]()))
      for (const name of ['map', 'filter', 'take', 'drop', 'flatMap', 'toArray', 'forEach', 'some', 'every', 'find', 'reduce']) {
        try { delete proto[name] } catch { /* non-configurable: leave it, the probe would then be weaker */ }
      }
      delete globalThis.Iterator
    })()`, realm)
    try {
      runInContext(polyfillBody, realm)
      check('polyfill script executes with Iterator absent', true)
    } catch (error) {
      check('polyfill script executes with Iterator absent', false, error.message)
    }
    const probe = runInContext(`(() => {
      const report = { iterator: typeof Iterator, prototype: typeof Iterator.prototype, withResolvers: typeof Promise.withResolvers }
      // pdfjs (bundled by ui-sidebar-documentpreview) runs exactly this at module init.
      if (typeof Iterator.prototype.join !== 'function') Iterator.prototype.join = function (separator) { return [...this].join(separator) }
      report.join = [3, 1, 2].values().join('-')
      report.toArray = Iterator.from([1, 2]).map((v) => v * 2).toArray().join(',')
      return report
    })()`, realm)
    check('pdfjs Iterator.prototype.join guard survives', typeof probe.prototype === 'string' || probe.prototype === 'object', JSON.stringify(probe))
    check('iterator helpers answer through the shim', probe.join === '3-1-2' && probe.toArray === '2,4', JSON.stringify(probe))
    check('Promise.withResolvers installed by the same script', probe.withResolvers === 'function', JSON.stringify(probe))
  }

  const guarded = transforms[0]('<html><head>x-dsh-pick-token</head><body></body></html>')
  check('idempotent guard skips a page that already carries the injection', guarded === '<html><head>x-dsh-pick-token</head><body></body></html>')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}

if (failures.length > 0) {
  console.error('\nsmoke-injections: ' + failures.length + ' check(s) failed: ' + failures.join('; '))
  process.exit(1)
}
console.log('\nsmoke-injections: all checks passed')
