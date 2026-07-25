import { envApiKeyAuth } from "@earendil-works/pi-ai";
import { openaiCodexProvider as _openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";

/**
 * Keep the upstream Codex OAuth provider, while accepting the access token
 * that ModelManager reads from the Codex CLI's auth.json as a per-run API-key
 * override. pi-ai 0.80.10 rejects explicit API-key overrides for OAuth-only
 * providers, so without this compatibility auth method the token is ignored.
 */
export function openaiCodexProvider(): ReturnType<
  typeof _openaiCodexProvider
> {
  const provider = _openaiCodexProvider();
  return {
    ...provider,
    auth: {
      ...provider.auth,
      apiKey: envApiKeyAuth("OpenAI Codex access token", []),
    },
  };
}
