import { describe, expect, test } from "bun:test";

import { Compile } from "typebox/compile";

import type { BuiltinTool } from "./index";
import {
  getToolDisplayName,
  getToolKey,
  isExecutableTool,
  isProviderHostedTool,
  normalizeTool,
  Tool,
} from "./index";

const ASK_USER_QUESTION_TOOL: BuiltinTool = {
  type: "builtin",
  name: "ask_user_question",
  description: "Ask the user a question.",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
};

describe("ask_user_question termination", () => {
  test("restores terminate=true on legacy persisted definitions", () => {
    expect(normalizeTool(ASK_USER_QUESTION_TOOL)).toEqual({
      ...ASK_USER_QUESTION_TOOL,
      terminate: true,
    });
  });

  test("is never executable automatically even before normalization", () => {
    expect(isExecutableTool(ASK_USER_QUESTION_TOOL)).toBe(false);
  });
});

describe("provider-hosted tools", () => {
  const validator = Compile(Tool);

  test("preserves raw config and stays non-executable", () => {
    const tool = {
      type: "provider-hosted",
      config: {
        type: "web_search",
        search_context_size: "high",
        user_location: { type: "approximate", country: "CN" },
      },
    } as const;

    expect(validator.Check(tool)).toBe(true);
    expect(normalizeTool(tool)).toEqual(tool);
    expect(isProviderHostedTool(tool)).toBe(true);
    expect(isExecutableTool(tool)).toBe(false);
    expect(getToolKey(tool)).toBe("provider-hosted:web_search");
    expect(getToolDisplayName(tool)).toBe("web_search");
  });

  test.each([
    { type: "provider-hosted", config: [] },
    { type: "provider-hosted", config: {} },
    { type: "provider-hosted", config: { type: "" } },
    { type: "provider-hosted", config: { type: "function" } },
    { type: "provider-hosted", config: { type: "custom" } },
  ])("rejects invalid provider-hosted config %#", (tool) => {
    expect(validator.Check(tool)).toBe(false);
  });

  test.each([
    {
      type: "provider-hosted",
      config: { type: "web_search", value: undefined },
    },
    {
      type: "provider-hosted",
      config: { type: "web_search", value: 1n },
    },
    {
      type: "provider-hosted",
      config: { type: "web_search", value: () => null },
    },
  ])("rejects non-JSON provider-hosted config values %#", (tool) => {
    expect(validator.Check(tool)).toBe(false);
  });

  test("normalizes the legacy Responses API discriminant", () => {
    expect(
      normalizeTool({
        type: "response-api-native",
        config: { type: "web_search", search_context_size: "high" },
      })
    ).toEqual({
      type: "provider-hosted",
      config: { type: "web_search", search_context_size: "high" },
    });
  });
});
