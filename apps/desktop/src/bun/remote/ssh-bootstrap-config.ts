import os from "node:os";
import path from "node:path";

import type { RuntimeId } from "@llm-space/runtime/runtime";

export interface SshRemoteRuntimeConfig {
  id: RuntimeId;
  name: string;
  host: string;
  user?: string;
  port?: number;
  identityFile?: string;
  extraArgs: string[];
  remoteRepo: string;
  remoteInstallDir: string;
  remoteHome: string;
  remoteServerPort: number;
  localPort?: number;
  makeDefault: boolean;
}

export function readSshRemoteRuntimeConfig(
  env: NodeJS.ProcessEnv
): SshRemoteRuntimeConfig | null {
  if (!_isEnabled(env.LLM_SPACE_ENABLE_REMOTE_RUNTIME)) {
    return null;
  }
  if (env.LLM_SPACE_REMOTE_BOOTSTRAP !== "ssh") {
    return null;
  }

  const host = env.LLM_SPACE_REMOTE_SSH_HOST?.trim();
  if (!host) {
    throw new Error(
      "LLM_SPACE_REMOTE_SSH_HOST is required when SSH remote runtime is enabled."
    );
  }
  const remoteRepo = env.LLM_SPACE_REMOTE_REPO?.trim() || "";

  const id = (env.LLM_SPACE_REMOTE_RUNTIME_ID?.trim() ||
    "remote:ssh-manual") as RuntimeId;
  if (!id.startsWith("remote:")) {
    throw new Error("LLM_SPACE_REMOTE_RUNTIME_ID must start with 'remote:'.");
  }

  const active = env.LLM_SPACE_ACTIVE_RUNTIME_ID?.trim();
  return {
    id,
    name: env.LLM_SPACE_REMOTE_RUNTIME_NAME?.trim() || `SSH ${host}`,
    host,
    user: _optional(env.LLM_SPACE_REMOTE_SSH_USER),
    port: env.LLM_SPACE_REMOTE_SSH_PORT
      ? _parsePort(env.LLM_SPACE_REMOTE_SSH_PORT, "LLM_SPACE_REMOTE_SSH_PORT")
      : undefined,
    identityFile: _optionalPath(env.LLM_SPACE_REMOTE_SSH_IDENTITY_FILE),
    extraArgs: _splitExtraArgs(env.LLM_SPACE_REMOTE_SSH_EXTRA_ARGS),
    remoteRepo,
    remoteInstallDir:
      env.LLM_SPACE_REMOTE_INSTALL_DIR?.trim() || "~/.llm-space/remote-runtime",
    remoteHome: env.LLM_SPACE_REMOTE_HOME?.trim() || "~/.llm-space-server",
    remoteServerPort: _parsePortWithFallback(
      env.LLM_SPACE_REMOTE_SERVER_PORT,
      39123,
      "LLM_SPACE_REMOTE_SERVER_PORT"
    ),
    localPort: env.LLM_SPACE_REMOTE_LOCAL_PORT
      ? _parsePort(env.LLM_SPACE_REMOTE_LOCAL_PORT, "LLM_SPACE_REMOTE_LOCAL_PORT")
      : undefined,
    makeDefault: active === id,
  };
}

function _isEnabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function _optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function _optionalPath(value: string | undefined): string | undefined {
  const trimmed = _optional(value);
  return trimmed ? _expandHome(trimmed) : undefined;
}

function _expandHome(input: string): string {
  if (input === "~") {
    return os.homedir();
  }
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}

function _parsePort(
  value: string | undefined,
  name: string
): number {
  const raw = value?.trim();
  if (!raw) {
    throw new Error(`${name} is required.`);
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${name} must be an integer between 1 and 65535: ${raw}`);
  }
  return port;
}

function _parsePortWithFallback(
  value: string | undefined,
  fallback: number,
  name: string
): number {
  const raw = value?.trim();
  return raw ? _parsePort(raw, name) : fallback;
}

function _splitExtraArgs(value: string | undefined): string[] {
  const trimmed = value?.trim();
  return trimmed ? trimmed.split(/\s+/).filter(Boolean) : [];
}
