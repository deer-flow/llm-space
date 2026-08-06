import {
  ProviderHostedToolConfig,
  type ProviderHostedToolConfig as ProviderHostedToolConfigType,
} from "@llm-space/core";
import { Compile } from "typebox/compile";

const PROVIDER_HOSTED_TOOL_CONFIG_VALIDATOR = Compile(
  ProviderHostedToolConfig
);

export function parseProviderHostedToolConfig(
  source: string
): ProviderHostedToolConfigType {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "Provider-hosted tool configuration must be a JSON object."
    );
  }
  const type = (parsed as { type?: unknown }).type;
  if (typeof type !== "string" || type.trim().length === 0) {
    throw new Error(
      'Provider-hosted tool "type" must be a non-empty string.'
    );
  }
  if (type === "function" || type === "custom") {
    throw new Error(
      'Use Add Custom Function Tool for "function" or "custom" tools.'
    );
  }
  if (!PROVIDER_HOSTED_TOOL_CONFIG_VALIDATOR.Check(parsed)) {
    throw new Error(
      "Provider-hosted tool configuration must contain JSON values only."
    );
  }
  return parsed;
}
