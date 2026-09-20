/**
 * Custom-provider capability discovery (issue #122 follow-up).
 *
 * A user-declared provider route has no capability metadata: the custom-provider
 * editor writes only id/name/contextWindow/maxTokens, so the composer has no
 * reasoning levels to render. This module discovers what the *configured endpoint*
 * actually declares — never what a URL or a model name suggests.
 *
 * Pipeline (strict order, each stage may leave a capability unknown):
 *   1. passive GET of metadata the endpoint actually returns (no request body,
 *      no spend, no side effects);
 *   2. vendor descriptor parsing, keyed on the *response shape*, for endpoints
 *      that expose an explicit capability schema;
 *   3. active probes — only when the caller passes explicit approval, because
 *      they send a real (minimal) completion request.
 *
 * Invariants:
 *   - a capability that no stage reported stays absent (never guessed);
 *   - every reported capability carries its `source`;
 *   - `reasoningEfforts` is a per-model value: this module never produces a
 *     provider-wide setting.
 */

export type Modality = 'text' | 'image' | 'audio' | 'pdf'

/** The thinking-level vocabulary the engine can offer (pi-ai canonical order). */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

export type ThinkingLevel = typeof THINKING_LEVELS[number]

/** Level -> wire spelling sent to the endpoint (null = supported, send nothing). */
export type ReasoningEfforts = Partial<Record<ThinkingLevel, string | null>>

export type CapabilitySource = 'endpoint-descriptor' | 'vendor-descriptor' | 'engine-catalog' | 'active-probe'

export type CapabilityKey = 'input' | 'contextWindow' | 'maxTokens' | 'reasoningEfforts'

/** pi-ai compat keys that decide how a reasoning level is serialized on the wire. */
export const DIALECT_COMPAT_KEYS = ['thinkingFormat', 'supportsReasoningEffort', 'maxTokensField'] as const

export interface ModelCapabilities {
  id: string
  input?: Modality[]
  contextWindow?: number
  maxTokens?: number
  /** Only levels the endpoint declared or accepted; unknown words are dropped. */
  reasoningEfforts?: ReasoningEfforts
  /**
   * Dialect keys (`thinkingFormat` / `supportsReasoningEffort` / `maxTokensField`)
   * that the catalog declares unanimously. Written beside `reasoningEfforts`:
   * pi-ai picks the wire dialect from these, so efforts without them are
   * serialized with a detected default and can be rejected by the real gateway
   * (issue #134).
   */
  compat?: Record<string, unknown>
  sources: Partial<Record<CapabilityKey, CapabilitySource>>
}

export interface ProviderConfig {
  /** Provider route id as it appears in llm-pi-ai settings. */
  route: string
  /** Wire protocol family; decides which passive endpoints are tried. */
  api?: string
  baseURL: string
  apiKey?: string
  /** Credential reference the route names (`apiKeyEnv`); resolved by the caller. */
  apiKeyEnv?: string
  headers?: Record<string, string>
  /** Model ids the user declared for this route (used to report unknowns). */
  models?: string[]
}

export interface ProbeReport {
  route: string
  /** Endpoints actually fetched (audit trail). */
  fetched: string[]
  models: ModelCapabilities[]
  /** Models with no explicit capability metadata from any stage. */
  unknown: string[]
  /** Human-readable observations, e.g. "generic /models reports no capabilities". */
  notes: string[]
}

export interface FetchResponseLike {
  ok: boolean
  status: number
  text(): Promise<string>
}

export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; method?: string; body?: string; signal?: AbortSignal },
) => Promise<FetchResponseLike>

const KNOWN_MODALITIES: Modality[] = ['text', 'image', 'audio', 'pdf']

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function strings(value: unknown): string[] {
  return asArray(value).filter((item): item is string => typeof item === 'string' && item !== '')
}

/** Maps an explicitly declared modality word; unknown words are dropped. */
function toModality(value: unknown): Modality | undefined {
  const text = asString(value)?.toLowerCase()
  if (!text) return undefined
  if (text === 'text' || text === 'input_text') return 'text'
  if (text === 'image' || text === 'input_image' || text === 'vision') return 'image'
  if (text === 'audio' || text === 'input_audio') return 'audio'
  if (text === 'pdf' || text === 'file' || text === 'document') return 'pdf'
  return undefined
}

function modalitiesFrom(value: unknown): Modality[] | undefined {
  const mapped = asArray(value).map(toModality).filter((m): m is Modality => m !== undefined)
  const unique = KNOWN_MODALITIES.filter((m) => mapped.includes(m))
  return unique.length > 0 ? unique : undefined
}

/**
 * Turns declared/accepted effort words into the engine's level vocabulary.
 * Words outside the vocabulary are dropped and reported — never mapped onto a
 * level the endpoint did not name.
 */
export function effortsFrom(declared: string[]): { efforts?: ReasoningEfforts; dropped: string[] } {
  const efforts: ReasoningEfforts = {}
  const dropped: string[] = []
  for (const word of declared) {
    const normalized = word.trim().toLowerCase()
    const level = THINKING_LEVELS.find((candidate) => candidate === normalized)
    if (level) efforts[level] = normalized
    else dropped.push(word)
  }
  return { efforts: Object.keys(efforts).length > 0 ? efforts : undefined, dropped }
}

/** Deduplicates by id; a later explicit value wins and re-tags its source. */
function mergeModel(
  target: Map<string, ModelCapabilities>,
  id: string,
  patch: Partial<ModelCapabilities>,
  source: CapabilitySource,
): void {
  const existing = target.get(id) ?? { id, sources: {} }
  const merged: ModelCapabilities = { ...existing, ...patch, id, sources: { ...existing.sources } }
  for (const key of Object.keys(patch) as CapabilityKey[]) {
    if (patch[key] !== undefined) merged.sources[key] = source
  }
  target.set(id, merged)
}

export interface DescriptorParse {
  models: Array<Partial<ModelCapabilities> & { id: string }>
  notes: string[]
}

/**
 * Vendor descriptor parsing keyed on the response *shape* (not on URL or model
 * names). Each branch returns only fields the payload explicitly carries.
 */
export function parseDescriptor(payload: unknown, url: string): DescriptorParse {
  const root = asRecord(payload)
  const notes: string[] = []

  // ── Google Generative Language: models[] with supportedGenerationMethods ──
  const googleEntries = asArray(root.models).filter((entry) => asRecord(entry).supportedGenerationMethods !== undefined)
  if (googleEntries.length > 0) {
    const models: Array<Partial<ModelCapabilities> & { id: string }> = []
    for (const entry of googleEntries) {
      const item = asRecord(entry)
      const name = asString(item.name)
      const id = name?.startsWith('models/') ? name.slice('models/'.length) : name
      if (!id) continue
      models.push({ id, contextWindow: asNumber(item.inputTokenLimit), maxTokens: asNumber(item.outputTokenLimit) })
    }
    return { models, notes }
  }

  // ── Ollama tags: models[] with name/model ──
  if (Array.isArray(root.models)) {
    const models: Array<Partial<ModelCapabilities> & { id: string }> = []
    for (const entry of asArray(root.models)) {
      const item = asRecord(entry)
      const id = asString(item.name) ?? asString(item.model)
      if (id) models.push({ id })
    }
    return { models, notes }
  }

  // ── OpenAI-compatible / OpenRouter: data[] ──
  if (Array.isArray(root.data)) {
    const models: Array<Partial<ModelCapabilities> & { id: string }> = []
    for (const entry of asArray(root.data)) {
      const item = asRecord(entry)
      const id = asString(item.id)
      if (!id) continue
      const architecture = asRecord(item.architecture)
      const supported = strings(item.supported_parameters)
      const { efforts, dropped } = effortsFrom(strings(item.reasoning_efforts))
      const input = modalitiesFrom(architecture.input_modalities) ?? modalitiesFrom(item.input_modalities)
      const contextWindow = asNumber(item.context_length) ?? asNumber(item.context_window) ?? asNumber(architecture.context_length)
      const maxTokens = asNumber(item.max_output_tokens) ?? asNumber(asRecord(item.top_provider).max_completion_tokens)
      if (dropped.length > 0) notes.push(`${id}: unrecognized reasoning effort words dropped: ${dropped.join(', ')}`)
      if (efforts === undefined && supported.some((p) => p === 'reasoning' || p === 'include_reasoning' || p === 'reasoning_effort')) {
        notes.push(`${id}: endpoint declares reasoning support but not the effort levels — levels stay unknown`)
      }
      models.push({ id, input, contextWindow, maxTokens, reasoningEfforts: efforts })
    }
    if (models.length > 0) {
      const barren = models.every((m) => m.input === undefined && m.contextWindow === undefined &&
        m.maxTokens === undefined && m.reasoningEfforts === undefined)
      if (barren) notes.push(`${url}: descriptor returned model ids only — no capability metadata to read`)
      return { models, notes }
    }
  }

  return { models: [], notes }
}

/** Ollama /api/show: capabilities[] such as ['completion','tools','vision','thinking']. */
export function parseOllamaShow(payload: unknown): DescriptorParse {
  const root = asRecord(payload)
  const capabilities = strings(root.capabilities).map((c) => c.toLowerCase())
  const notes: string[] = []
  const input: Modality[] = []
  if (capabilities.includes('vision')) input.push('image')
  if (capabilities.includes('thinking')) {
    notes.push('endpoint reports thinking support but not the effort vocabulary — levels stay unknown')
  }
  const info = asRecord(root.model_info)
  const patch: Partial<ModelCapabilities> = {}
  if (input.length > 0) patch.input = input
  const context = asNumber(info['llm.context_length']) ?? asNumber(info.context_length)
  if (context) patch.contextWindow = context
  const id = asString(root.model) ?? asString(root.name)
  return { models: id ? [{ id, ...patch }] : [], notes }
}

export interface ProbeOptions {
  /** Hard cap on requests; defaults to 8. */
  maxRequests?: number
  /** Milliseconds per request; defaults to 10s. */
  timeoutMs?: number
  fetchImpl?: FetchLike
}

function passiveEndpoints(config: ProviderConfig): string[] {
  const base = config.baseURL.replace(/\/+$/, '')
  const api = (config.api ?? '').toLowerCase()
  if (api.includes('ollama')) return [`${base}/api/tags`]
  if (api.includes('google') || api.includes('gemini')) {
    return [`${base}/models${config.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : ''}`]
  }
  // openai-completions / anthropic-messages / openrouter all answer GET /models.
  return [`${base}/models`]
}

function authHeaders(config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json', ...(config.headers ?? {}) }
  const api = (config.api ?? '').toLowerCase()
  if (config.apiKey && !Object.keys(headers).some((k) => k.toLowerCase() === 'authorization')) {
    if (api.includes('anthropic')) {
      headers['x-api-key'] = config.apiKey
      headers['anthropic-version'] = headers['anthropic-version'] ?? '2023-06-01'
    } else {
      headers.authorization = `Bearer ${config.apiKey}`
    }
  }
  return headers
}

async function getJson(
  fetchImpl: FetchLike,
  url: string,
  init: { headers: Record<string, string>; method: string; body?: string },
  timeoutMs: number,
  report: ProbeReport,
): Promise<unknown | undefined> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    report.fetched.push(init.method === 'GET' ? url : `${url} (${init.method})`)
    if (!response.ok) {
      report.notes.push(`${init.method} ${url} -> HTTP ${response.status}`)
      return undefined
    }
    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch {
      report.notes.push(`${init.method} ${url} returned a non-JSON body`)
      return undefined
    }
  } catch (error) {
    report.notes.push(`${init.method} ${url} failed: ${(error as Error)?.message ?? String(error)}`)
    return undefined
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Passive discovery: reads only what the configured endpoint returns. No model is
 * ever credited with a capability the endpoint did not state.
 */
export async function probePassive(config: ProviderConfig, options: ProbeOptions = {}): Promise<ProbeReport> {
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxRequests = options.maxRequests ?? 8
  const report: ProbeReport = { route: config.route, fetched: [], models: [], unknown: [], notes: [] }
  if (typeof fetchImpl !== 'function') {
    report.notes.push('no fetch implementation available — passive probe skipped')
    report.unknown = [...(config.models ?? [])]
    return report
  }
  const byId = new Map<string, ModelCapabilities>()
  const headers = authHeaders(config)
  const isOllama = (config.api ?? '').toLowerCase().includes('ollama')

  for (const url of passiveEndpoints(config)) {
    const payload = await getJson(fetchImpl, url, { headers, method: 'GET' }, timeoutMs, report)
    if (payload === undefined) continue
    const parsed = parseDescriptor(payload, url)
    report.notes.push(...parsed.notes)
    for (const model of parsed.models) {
      const { id, ...patch } = model
      mergeModel(byId, id, patch, isOllama ? 'vendor-descriptor' : 'endpoint-descriptor')
    }
  }

  // Ollama exposes per-model capability lists through a read-only POST; it is a
  // metadata query (no generation, no spend), so it stays in the passive stage.
  if (isOllama) {
    const base = config.baseURL.replace(/\/+$/, '')
    for (const id of (config.models ?? []).slice(0, Math.max(0, maxRequests - report.fetched.length))) {
      const payload = await getJson(
        fetchImpl, `${base}/api/show`, { headers, method: 'POST', body: JSON.stringify({ model: id }) }, timeoutMs, report,
      )
      if (payload === undefined) continue
      const parsed = parseOllamaShow(payload)
      report.notes.push(...parsed.notes)
      for (const model of parsed.models) {
        const { id: modelId, ...patch } = model
        mergeModel(byId, modelId === undefined ? id : modelId, patch, 'vendor-descriptor')
      }
    }
  }

  report.models = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  const declared = config.models ?? []
  report.unknown = declared.filter((id) => {
    const found = byId.get(id)
    return !found || Object.keys(found.sources).length === 0
  })
  return report
}

export interface ActiveProbeRequest {
  url: string
  headers: Record<string, string>
  /** Builds the minimal body for one candidate level. */
  body: (level: string) => unknown
  /** Candidate levels, e.g. ['low', 'medium', 'high']. */
  levels: string[]
  fetchImpl?: FetchLike
  timeoutMs?: number
}

export interface ActiveProbeResult {
  accepted: string[]
  rejected: Array<{ level: string; status: number }>
  inconclusive: Array<{ level: string; status?: number; reason: string }>
  /** Accepted levels translated into the engine vocabulary (unknown words dropped). */
  efforts?: ReasoningEfforts
  dropped: string[]
}

/**
 * Active probe: sends one minimal completion per candidate level. This spends API
 * quota, so it must only run after explicit user approval — the tool exposes
 * `confirm: true` for exactly that reason.
 */
export async function probeReasoningEfforts(request: ActiveProbeRequest): Promise<ActiveProbeResult> {
  const fetchImpl = request.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined)
  const timeoutMs = request.timeoutMs ?? 20_000
  const result: ActiveProbeResult = { accepted: [], rejected: [], inconclusive: [], dropped: [] }
  if (typeof fetchImpl !== 'function') {
    for (const level of request.levels) result.inconclusive.push({ level, reason: 'no fetch implementation available' })
    return result
  }
  for (const level of request.levels) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(request.url, {
        headers: request.headers,
        method: 'POST',
        body: JSON.stringify(request.body(level)),
        signal: controller.signal,
      })
      const body = await response.text().catch(() => '')
      if (response.ok) {
        result.accepted.push(level)
      } else if ((response.status === 400 || response.status === 422) && /reasoning|effort|unsupported|invalid/i.test(body)) {
        result.rejected.push({ level, status: response.status })
      } else {
        result.inconclusive.push({ level, status: response.status, reason: body.slice(0, 160) })
      }
    } catch (error) {
      result.inconclusive.push({ level, reason: (error as Error)?.message ?? String(error) })
    } finally {
      clearTimeout(timer)
    }
  }
  const { efforts, dropped } = effortsFrom(result.accepted)
  result.efforts = efforts
  result.dropped = dropped
  return result
}
