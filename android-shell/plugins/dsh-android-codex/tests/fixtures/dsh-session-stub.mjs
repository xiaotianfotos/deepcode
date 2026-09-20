// Disclosed DSH peer fixture: match the 0.1.5 session format surface.
// Recovery tests do not exercise history projection or persistence.
export const SessionId = value => value
export const SESSION_FORMAT_VERSION = 3
export default { SessionId, SESSION_FORMAT_VERSION }
