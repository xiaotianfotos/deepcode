/** Android catalog presentation policy, audited for DSH 0.1.2-rc.1 / 0.1.5-rc.1.
 * Keep routing, saved selections, and the settings provider directory intact.
 * No credentials leave the host; an auth check is not a network health test.
 */
async function androidModelProviderConfigured(ctx, provider, declarations, namespaces) {
  const entry = declarations.find(item => item.provider === provider);
  // Plugins such as Relay/Codex own their catalog and authentication lifecycle.
  if (!entry) return true;
  const namespace = namespaces.find(item => item.ns === entry.settingsNs);
  let profile = namespace?.value;
  for (const key of entry.settingsPath) profile = profile?.[key];
  if (!profile || typeof profile !== 'object') return false;

  if (entry.settingsNs === 'llm-pi-ai') {
    // The pinned adapter already owns explicit refs, OAuth records, ambient
    // credentials and keyless endpoints. Reuse it instead of guessing env names.
    // registration/current are internal seams: version + SHA guarded on install.
    const adapter = ctx.llm.registration(provider).adapter;
    const snapshot = adapter.current();
    const resolved = adapter.profileOf(snapshot, provider);
    if (resolved.apiKeyEnv !== undefined) {
      try {
        return Boolean(await adapter.config.resolveApiKey(provider, resolved));
      } catch (error) {
        if (error?.code === 'MISSING_CREDENTIAL') return false;
        throw error;
      }
    }
    return (await snapshot.models.checkAuth(provider)) !== undefined;
  }

  const ref = profile.apiKeyEnv;
  if (typeof ref !== 'string' || ref.length === 0) return true;
  const credentials = ctx.get('credentials');
  // Unknown status must surface as a catalog failure, not masquerade as absent.
  if (!credentials) throw new Error('Provider configuration status is unavailable');
  return (await credentials.describe(ref)).configured === true;
}
