export const CODEX_ACTIVITY_TOOL = "relay_codex_activity";

export function readActivityPayload(value) {
  if (!value || typeof value !== "object" || value.version !== 1
    || typeof value.threadId !== "string" || typeof value.turnId !== "string"
    || typeof value.itemId !== "string"
    || !["started", "completed"].includes(value.phase)) return null;
  const activity = value.activity;
  if (!activity || typeof activity !== "object"
    || typeof activity.type !== "string" || typeof activity.title !== "string"
    || !["running", "completed", "error"].includes(activity.status)) return null;
  for (const key of ["summary", "input", "output", "exitCode", "commandActions"]) {
    if (activity[key] !== undefined && typeof activity[key] !== "string") return null;
  }
  return value;
}
