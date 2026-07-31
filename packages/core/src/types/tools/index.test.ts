import { describe, expect, test } from "bun:test";

import { Compile } from "typebox/compile";

import type { BuiltinTool } from "./index";
import { isExecutableTool, normalizeTool, Tool as ToolSchema } from "./index";

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

describe("built-in tool configuration", () => {
  test("preserves Thread-owned configuration during normalization", () => {
    const tool: BuiltinTool = {
      type: "builtin",
      name: "generate_image",
      description: "Generate an image.",
      parameters: { type: "object", properties: {} },
      config: { model: "seedream-fixture", size: "2K", watermark: true },
    };

    expect(Compile(ToolSchema).Check(tool)).toBe(true);
    expect(normalizeTool(tool)).toEqual(tool);
  });
});
