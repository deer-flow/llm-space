export type RuntimeId = "local" | `remote:${string}`;

export interface RuntimeScopedParams {
  runtimeId?: RuntimeId;
}

export interface RuntimeView {
  id: RuntimeId;
  kind: "local" | "remote";
  name: string;
  status: "connected" | "connecting" | "disconnected" | "error";
  capabilities: string[];
}
