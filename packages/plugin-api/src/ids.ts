/**
 * Build a deterministic, path-safe context ID without exposing the full source
 * reference in routing metadata. The source itself remains in plugin-owned
 * context data when it is required after restart.
 */
export function createStablePluginContextId(
  prefix: string,
  sourceRef: string
): string {
  let hash = 2166136261;
  for (let index = 0; index < sourceRef.length; index += 1) {
    hash ^= sourceRef.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}
