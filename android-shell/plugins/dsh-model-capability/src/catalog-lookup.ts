/**
 * Engine-catalog capability source (0.13.5 W3, issue #125).
 *
 * The engine ships pi-ai's vendor catalogs (`dist/providers/data/*.json`). Those
 * files are a *vendor declaration* of what each model offers — `thinkingLevelMap`,
 * `input`, context limits, `compat` — so an exact model-id lookup is reading a
 * declaration, not inferring from a name. That is the only honest source for a
 * hand-declared route whose endpoint reports no capability metadata at all
 * (measured 2026-09-10: a generic OpenAI-compatible `/models` returns ids only,
 * and the gateway accepts any `reasoning_effort` value, so acceptance proves
 * nothing).
 *
 * Agreement rule: several catalogs may describe the same model id (different
 * gateways for the same upstream model). A field is reported only when every
 * declaring entry agrees; disagreement is reported as a conflict and never
 * applied. `reasoningEfforts` is derived from `thinkingLevelMap` by keeping the
 * levels whose wire value is a non-empty string (pi-ai semantics: `null` means
 * the level is not offered by that route).
 */
import { DIALECT_COMPAT_KEYS, THINKING_LEVELS, type Modality, type ReasoningEfforts } from './capability-probe.js'

export interface CatalogEntry {
  provider: string
  api?: string
  reasoning?: boolean
  thinkingLevelMap?: Record<string, string | null>
  input?: string[]
  contextWindow?: number
  maxTokens?: number
  compat?: Record<string, unknown>
}

export interface CatalogSnapshot {
  schema?: number
  source?: string
  generatedAt?: string
  modelCount?: number
  models: Record<string, CatalogEntry[]>
}

export interface CatalogCapabilities {
  reasoningEfforts?: ReasoningEfforts
  input?: Modality[]
  contextWindow?: number
  maxTokens?: number
  compat?: Record<string, unknown>
}

export interface CatalogMatch {
  id: string
  /** Provider ids whose catalog declares this exact model id. */
  providers: string[]
  /** Fields every declaring entry agrees on. */
  capabilities: CatalogCapabilities
  /** Human-readable disagreement notes; an empty list means unanimous. */
  conflicts: string[]
}

const KNOWN_MODALITIES: Modality[] = ['text', 'image', 'audio', 'pdf']

function toModality(value: unknown): Modality | undefined {
  if (typeof value !== 'string') return undefined
  const text = value.toLowerCase()
  if (text === 'text' || text === 'input_text') return 'text'
  if (text === 'image' || text === 'input_image' || text === 'vision') return 'image'
  if (text === 'audio' || text === 'input_audio') return 'audio'
  if (text === 'pdf' || text === 'file' || text === 'document') return 'pdf'
  return undefined
}

function modalitiesOf(entry: CatalogEntry): Modality[] | undefined {
  if (!Array.isArray(entry.input)) return undefined
  const mapped = entry.input.map(toModality).filter((m): m is Modality => m !== undefined)
  const unique = KNOWN_MODALITIES.filter((m) => mapped.includes(m))
  return unique.length > 0 ? unique : undefined
}

/**
 * Levels a catalog entry offers, taken from `thinkingLevelMap`.
 *
 * pi-ai semantics: a `null` (or absent) mapping means the route does not offer
 * that level, so only levels with a non-empty wire value are kept — and the wire
 * value is preserved verbatim (it need not equal the level name, e.g. `max: "ultra"`).
 */
export function effortsOf(entry: CatalogEntry): ReasoningEfforts | undefined {
  const map = entry.thinkingLevelMap
  if (!map || typeof map !== 'object') return undefined
  const efforts: ReasoningEfforts = {}
  for (const [level, wire] of Object.entries(map)) {
    if (!(THINKING_LEVELS as readonly string[]).includes(level)) continue
    if (typeof wire === 'string' && wire.length > 0) efforts[level as keyof ReasoningEfforts] = wire
  }
  return Object.keys(efforts).length > 0 ? efforts : undefined
}

function keyOf(value: unknown): string {
  return JSON.stringify(value ?? null)
}

/**
 * Looks one model id up across the snapshot. When [api] is given, only entries
 * for that wire family are considered (a hand-declared route may name its api).
 */
export function lookupCatalog(snapshot: CatalogSnapshot | undefined, id: string, api?: string): CatalogMatch {
  const match: CatalogMatch = { id, providers: [], capabilities: {}, conflicts: [] }
  if (!snapshot?.models) return match
  const entries = (snapshot.models[id] ?? []).filter((entry) => {
    if (!api) return true
    return entry.api === undefined || entry.api === api
  })
  if (entries.length === 0) return match
  match.providers = entries.map((entry) => entry.provider)

  const unanimous = <T>(values: Array<T | undefined>, label: string): T | undefined => {
    const declared = values.filter((value): value is T => value !== undefined)
    if (declared.length === 0) return undefined
    const distinct = new Set(declared.map((value) => keyOf(value)))
    if (distinct.size > 1) {
      match.conflicts.push(`${label}: 目录声明不一致（${[...distinct].join(' vs ')}）`)
      return undefined
    }
    return declared[0]
  }

  const efforts = unanimous(entries.map((entry) => effortsOf(entry)), 'reasoningEfforts')
  if (efforts) match.capabilities.reasoningEfforts = efforts
  const input = unanimous(entries.map((entry) => modalitiesOf(entry)), 'input')
  if (input) match.capabilities.input = input
  const contextWindow = unanimous(entries.map((entry) => entry.contextWindow), 'contextWindow')
  if (contextWindow) match.capabilities.contextWindow = contextWindow
  const maxTokens = unanimous(entries.map((entry) => entry.maxTokens), 'maxTokens')
  if (maxTokens) match.capabilities.maxTokens = maxTokens

  // compat: 逐键合并；同一键出现不同值时该键丢弃并记冲突。
  // 方言键（thinkingFormat / supportsReasoningEffort / maxTokensField）另加严格口径：
  // 只要有目录**声明了却另一些没声明**，方言就不算确定——缺失不能当成一致
  // （issue #134：opencode-go 只声明 maxTokensField、zai 才声明 thinkingFormat，
  //  宽松口径会拿 zai 的方言去配任意自定义网关）。
  const compat: Record<string, unknown> = {}
  const keys = new Set<string>()
  for (const entry of entries) for (const key of Object.keys(entry.compat ?? {})) keys.add(key)
  for (const key of keys) {
    const declared = entries.map((entry) => entry.compat?.[key])
    const isDialect = (DIALECT_COMPAT_KEYS as readonly string[]).includes(key)
    const missing = declared.filter((value) => value === undefined).length
    if (isDialect && missing > 0 && missing < declared.length) {
      match.conflicts.push(`compat.${key}: 仅部分目录声明（方言不明）`)
      continue
    }
    const value = unanimous(declared, `compat.${key}`)
    if (value !== undefined) compat[key] = value
  }
  if (Object.keys(compat).length > 0) match.capabilities.compat = compat

  return match
}

/** True when the match carries at least one applicable capability. */
export function hasCapabilities(match: CatalogMatch): boolean {
  return Object.keys(match.capabilities).length > 0
}
