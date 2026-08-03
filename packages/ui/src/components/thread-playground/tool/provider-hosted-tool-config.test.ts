import { describe, expect, test } from "bun:test";

import { parseProviderHostedToolConfig } from "./provider-hosted-tool-config";

describe("parseProviderHostedToolConfig", () => {
  test("preserves tool-specific fields", () => {
    expect(
      parseProviderHostedToolConfig(`{
        "type": "web_search",
        "search_context_size": "high",
        "user_location": { "type": "approximate", "country": "CN" }
      }`)
    ).toEqual({
      type: "web_search",
      search_context_size: "high",
      user_location: { type: "approximate", country: "CN" },
    });
  });

  test.each([
    ["{", "Invalid JSON."],
    ["[]", "Provider-hosted tool configuration must be a JSON object."],
    ["{}", 'Provider-hosted tool "type" must be a non-empty string.'],
    [
      '{"type":"   "}',
      'Provider-hosted tool "type" must be a non-empty string.',
    ],
    [
      '{"type":"function"}',
      'Use Add Custom Function Tool for "function" or "custom" tools.',
    ],
    [
      '{"type":"custom"}',
      'Use Add Custom Function Tool for "function" or "custom" tools.',
    ],
  ])("rejects invalid config %s", (source, message) => {
    expect(() => parseProviderHostedToolConfig(source)).toThrow(message);
  });
});
