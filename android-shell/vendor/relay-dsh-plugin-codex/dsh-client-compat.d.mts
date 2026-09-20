import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
export function sessionPreset(session: { agentPreset?: string | null; projectionValues?: { agentPreset?: string | null } } | undefined): string | null | undefined
export function modelDirectory(ctx: unknown, sessionId: string): Pick<ReturnType<Context['modelDirectories']['directoryFor']>, 'load' | 'select'>
