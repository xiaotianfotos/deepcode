// Disclosed mocked DSH peer for local vendor pinning. CodexDshAdapter extends
// LlmAdapter at module-evaluation time, so this stub only stands in for the
// two peer specifiers the vendored bundle imports; no vendor behavior lives
// here and nothing is shared with the real @deepseek-ai packages.
export class LlmAdapter {}
export class LlmError extends Error {
  constructor(message, code) { super(message); this.code = code }
}
export const MessageId = value => value
export const ToolCallId = value => value
export const CallId = value => value
export function createMessage(input) { return { ...input } }
export function freezeMessage(message) { return Object.freeze(message) }
export default { LlmAdapter, LlmError, MessageId, ToolCallId, CallId, createMessage, freezeMessage }
