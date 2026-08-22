import { describe, expect, test } from "bun:test";

import { AGENT_STATUS_TODO_TOOLS, type BuiltinTool } from "@llm-space/core";

import { getUserConfigurableTools } from "../../../../src/components/thread-playground/tool/tool-visibility";

const READ_TOOL = {
  type: "builtin",
  name: "read",
  description: "读取文件。",
  parameters: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
} satisfies BuiltinTool;

describe("tool visibility", () => {
  test("hides Agent Status-owned TODO tools from generic configuration", () => {
    expect(
      getUserConfigurableTools([READ_TOOL, ...AGENT_STATUS_TODO_TOOLS])
    ).toEqual([READ_TOOL]);
  });
});
