export type RuntimeId = "local" | `remote:${string}`;

export interface RuntimeScopedParams {
  runtimeId?: RuntimeId;
}
