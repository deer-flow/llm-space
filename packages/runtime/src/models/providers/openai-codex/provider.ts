import {
  createProvider,
  type ApiKeyAuth,
  type AuthResult,
  type Provider,
  type ProviderStreams,
} from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { openaiCodexProvider as _openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";

import type { CustomProviderApi } from "../../types";

import type { CodexCredentials } from "./codex-credentials";
import { getCodexCredentials } from "./config";

const API_IMPLEMENTATIONS: Record<CustomProviderApi, () => ProviderStreams> = {
  "anthropic-messages": anthropicMessagesApi,
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
};

/**
 * Create an OpenAI Codex provider for OAuth or API key CLI credentials.
 *
 * @param credentials The resolved Codex CLI credentials.
 */
export function openaiCodexProvider(
  credentials: CodexCredentials | null = getCodexCredentials() ?? null
): Provider {
  const codex = _openaiCodexProvider();
  if (credentials?.mode === "apiKey") {
    const models = codex.getModels().map((model) => ({
      ...model,
      api: credentials.api,
      baseUrl: credentials.baseUrl,
    }));
    return createProvider({
      api: API_IMPLEMENTATIONS[credentials.api](),
      auth: { apiKey: _getCodexApiKeyAuth(credentials) },
      baseUrl: credentials.baseUrl,
      id: codex.id,
      models,
      name: codex.name,
    });
  }

  return {
    ...codex,
    auth: {
      ...codex.auth,
      apiKey: _getCodexApiKeyAuth(credentials),
    },
  };
}

function _getCodexApiKeyAuth(credentials: CodexCredentials | null): ApiKeyAuth {
  return {
    name: "Codex CLI credentials",
    resolve({ credential }): Promise<AuthResult | undefined> {
      if (credential?.key) {
        return Promise.resolve({
          auth: { apiKey: credential.key },
          env: credential.env,
          source: "stored credential",
        });
      }
      return Promise.resolve(
        credentials
          ? {
              auth: { apiKey: credentials.apiKey },
              source:
                credentials.mode === "oauth"
                  ? "Codex CLI OAuth"
                  : "Codex CLI API key",
            }
          : undefined
      );
    },
  };
}
