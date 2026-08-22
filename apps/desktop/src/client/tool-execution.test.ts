import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  BuiltinTool,
  BuiltinToolCallResponse,
  Thread,
} from "@llm-space/core";

interface BuiltinCallInput {
  name: string;
  arguments: Record<string, unknown>;
  config?: Record<string, unknown>;
}

const BUILTIN_CALLS: BuiltinCallInput[] = [];
let builtinCallCount = 0;

await mock.module("@/client/built-in-tools", () => ({
  callBuiltInTool(input: BuiltinCallInput): Promise<BuiltinToolCallResponse> {
    BUILTIN_CALLS.push(input);
    builtinCallCount += 1;
    return Promise.resolve({
      content: [{ type: "text", text: "执行成功" }],
      ...(builtinCallCount === 1
        ? {
            effects: [
              {
                type: "working-directory" as const,
                workingDirectory: "C:\\项目\\下一步",
              },
            ],
          }
        : {}),
    });
  },
}));

await mock.module("@/client/mcp", () => ({
  callMcpTool: () => Promise.reject(new Error("测试不应调用 MCP 工具")),
}));

await mock.module("@/client/plugins", () => ({
  executePluginTool: () =>
    Promise.reject(new Error("测试不应调用 Plugin 工具")),
}));

const { executeTool } = await import("./tool-execution");

const BASH_TOOL: BuiltinTool = {
  type: "builtin",
  name: "bash",
  description: "执行命令",
  parameters: { type: "object" },
};

describe("executeTool 工作目录接续", () => {
  beforeEach(() => {
    BUILTIN_CALLS.length = 0;
    builtinCallCount = 0;
  });

  test("解析变量为空时从 Thread 读取目录并接续 working-directory effect", async () => {
    const firstThread = _threadWithWorkingDirectory("C:\\项目");
    const firstResult = await executeTool(
      BASH_TOOL,
      { command: "cd 下一步" },
      {
        thread: firstThread,
        variables: {},
      }
    );
    const nextWorkingDirectory = firstResult.effects?.find(
      (effect) => effect.type === "working-directory"
    )?.workingDirectory;
    expect(nextWorkingDirectory).toBe("C:\\项目\\下一步");

    await executeTool(
      BASH_TOOL,
      { command: "pwd" },
      {
        thread: _threadWithWorkingDirectory(nextWorkingDirectory ?? ""),
        variables: {},
      }
    );

    expect(BUILTIN_CALLS.map((call) => call.config?.workingDirectory)).toEqual([
      "C:\\项目",
      "C:\\项目\\下一步",
    ]);
  });
});

function _threadWithWorkingDirectory(workingDirectory: string): Thread {
  return {
    context: {
      variables: {
        current_working_directory: {
          type: "workingDirectory",
          value: workingDirectory,
        },
      },
    },
  };
}
