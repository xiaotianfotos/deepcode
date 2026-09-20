// Public interface adapters shared by both supported DSH generations.
export function sessionPreset(session) {
  if (session?.projectionValues && Object.hasOwn(session.projectionValues, 'agentPreset')) {
    return session.projectionValues.agentPreset;
  }
  return session?.agentPreset;
}

const service = (ctx, name) => typeof ctx.get === 'function' ? ctx.get(name) : ctx[name];
export function modelDirectory(ctx, sessionId) {
  const directories = service(ctx, 'modelDirectories');
  if (directories) return directories.directoryFor(sessionId);
  const sessions = service(ctx, 'connection')?.api?.sessions;
  if (!sessions) throw new Error('DSH model selection interface is unavailable');
  return {
    async load() {
      const response = await sessions.models({ sessionId });
      if (!response.result.ok) throw new Error('DSH model discovery failed');
      return response.result.value;
    },
    async select(selection) {
      const response = await sessions.selectModel({ sessionId, ...selection });
      if (!response.result.ok) throw new Error('DSH model selection failed');
    },
  };
}
