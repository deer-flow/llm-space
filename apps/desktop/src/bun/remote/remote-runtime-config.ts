import type { RuntimeId } from "@llm-space/runtime/runtime";

export interface ManualRemoteRuntimeConfig {
  id: RuntimeId;
  name: string;
  baseUrl: string;
  token: string;
  makeDefault: boolean;
}

export function readManualRemoteRuntimeConfig(
  env: NodeJS.ProcessEnv
): ManualRemoteRuntimeConfig | null {
  if (!_isEnabled(env.LLM_SPACE_ENABLE_REMOTE_RUNTIME)) {
    return null;
  }
  const baseUrl = env.LLM_SPACE_REMOTE_RUNTIME_URL?.trim();
  if (!baseUrl) {
    throw new Error(
      "LLM_SPACE_REMOTE_RUNTIME_URL is required when remote runtime is enabled."
    );
  }
  const token = env.LLM_SPACE_REMOTE_RUNTIME_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "LLM_SPACE_REMOTE_RUNTIME_TOKEN is required when remote runtime is enabled."
    );
  }
  const id = (env.LLM_SPACE_REMOTE_RUNTIME_ID?.trim() ||
    "remote:manual") as RuntimeId;
  if (!id.startsWith("remote:")) {
    throw new Error("LLM_SPACE_REMOTE_RUNTIME_ID must start with 'remote:'.");
  }
  const active = env.LLM_SPACE_ACTIVE_RUNTIME_ID?.trim();
  return {
    id,
    name: env.LLM_SPACE_REMOTE_RUNTIME_NAME?.trim() || "Manual Remote",
    baseUrl,
    token,
    makeDefault: active === id,
  };
}

function _isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}
