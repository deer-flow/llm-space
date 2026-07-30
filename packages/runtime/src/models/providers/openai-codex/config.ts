import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CustomProviderApi } from "../../types";

import type { CodexCredentials } from "./codex-credentials";

const WIRE_API_MAP: Record<string, CustomProviderApi> = {
  completions: "openai-completions",
  messages: "anthropic-messages",
  responses: "openai-responses",
};

/**
 * Read Codex CLI credentials and the active API key provider configuration.
 *
 * @param codexDir The Codex CLI configuration directory.
 */
export function getCodexCredentials(
  codexDir = path.join(os.homedir(), ".codex")
): CodexCredentials | undefined {
  const auth = _readAuthJSON(path.join(codexDir, "auth.json"));
  if (!auth) {
    return undefined;
  }

  if (auth.oauthToken) {
    return { apiKey: auth.oauthToken, mode: "oauth" };
  }

  if (!auth.apiKey) {
    return undefined;
  }

  const config = _readConfigToml(path.join(codexDir, "config.toml"));
  return {
    api: config?.api ?? "openai-responses",
    apiKey: auth.apiKey,
    baseUrl: config?.baseUrl ?? "",
    mode: "apiKey",
  };
}

function _readAuthJSON(
  authPath: string
): { apiKey?: string; oauthToken?: string } | undefined {
  if (!existsSync(authPath)) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(readFileSync(authPath, "utf8")) as Record<
      string,
      unknown
    >;
    const tokens = parsed.tokens as { access_token?: unknown } | undefined;
    const oauthToken =
      typeof tokens?.access_token === "string"
        ? tokens.access_token
        : undefined;
    const apiKey =
      typeof parsed.OPENAI_API_KEY === "string"
        ? parsed.OPENAI_API_KEY
        : undefined;

    return oauthToken || apiKey ? { apiKey, oauthToken } : undefined;
  } catch {
    return undefined;
  }
}

function _readConfigToml(
  configPath: string
): { api: CustomProviderApi; baseUrl: string } | undefined {
  if (!existsSync(configPath)) {
    return undefined;
  }
  try {
    const lines = readFileSync(configPath, "utf8").split("\n");
    const activeProvider = lines
      .map((line) => /^\s*model_provider\s*=\s*"([^"]+)"/.exec(line)?.[1])
      .find((value) => value !== undefined);
    if (!activeProvider) {
      return undefined;
    }

    const sectionHeader = `[model_providers.${activeProvider}]`;
    let inSection = false;
    let baseUrl: string | undefined;
    let wireApi: string | undefined;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === sectionHeader) {
        inSection = true;
        continue;
      }
      if (inSection && trimmed.startsWith("[")) {
        break;
      }
      if (!inSection) {
        continue;
      }
      const match = /^(\w+)\s*=\s*"([^"]*)"/.exec(trimmed);
      if (!match) {
        continue;
      }
      const [, key, value] = match;
      if (key === "base_url") {
        baseUrl = value;
      } else if (key === "wire_api") {
        wireApi = value;
      }
    }

    if (!baseUrl) {
      return undefined;
    }
    return {
      api: (wireApi ? WIRE_API_MAP[wireApi] : undefined) ?? "openai-responses",
      baseUrl,
    };
  } catch {
    return undefined;
  }
}
