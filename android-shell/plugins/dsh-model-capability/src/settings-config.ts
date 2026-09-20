/**
 * Reads one user-declared provider route out of the llm-pi-ai settings section.
 * Kept dependency-free so the mapping is unit-testable without the engine.
 */
import type { ProviderConfig } from './capability-probe.js'

export interface SettingsDescriptorLike {
  ns: string
  value: unknown
  revision: number
}

export interface SettingsLike {
  describe(options?: { namespaces?: readonly string[] }): SettingsDescriptorLike[]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

/** Model ids may be declared as strings or as objects carrying `id`. */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    if (typeof item === 'string') return item
    const id = record(item).id
    return typeof id === 'string' ? id : ''
  }).filter((id) => id !== '')
}

function stringMap(value: unknown): Record<string, string> | undefined {
  const source = record(value)
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(source)) {
    if (typeof item === 'string') out[key] = item
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/**
 * Returns the provider configuration, or undefined when the route (or its
 * baseURL) is absent — the caller reports that instead of guessing a target.
 */
export function providerFromSettings(settings: SettingsLike | undefined, route: string): ProviderConfig | undefined {
  if (!settings) return undefined
  let section: unknown
  try {
    // 注意：settings.describe(options) 的 options 当前被实现忽略（返回全部命名空间），
    // 所以必须按 ns 查找——不能用 [0]（实测踩坑：拿到的可能是 llm-deepseek）。
    section = settings.describe({ namespaces: ['llm-pi-ai'] }).find((d) => d.ns === 'llm-pi-ai')?.value
  } catch {
    return undefined
  }
  const entry = record(record(section).providers ? record(record(section).providers)[route] : undefined)
  const baseURL = typeof entry.baseURL === 'string' && entry.baseURL !== '' ? entry.baseURL : undefined
  if (!baseURL) return undefined
  const models = stringList(entry.models)
  const overrideIds = Object.keys(record(entry.modelOverrides))
  const apiKeyEnv = typeof entry.apiKeyEnv === 'string' && entry.apiKeyEnv !== '' ? entry.apiKeyEnv : undefined
  return {
    route,
    api: typeof entry.api === 'string' ? entry.api : undefined,
    baseURL,
    apiKey: typeof entry.apiKey === 'string' ? entry.apiKey : undefined,
    ...(apiKeyEnv === undefined ? {} : { apiKeyEnv }),
    headers: stringMap(entry.headers),
    models: models.length > 0 ? models : overrideIds,
  }
}
