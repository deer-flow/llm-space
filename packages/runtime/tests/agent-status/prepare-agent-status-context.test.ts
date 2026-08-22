import { describe, expect, test } from "bun:test";

import type { PiThreadContext } from "@llm-space/core";

import { prepareAgentStatusContext } from "../../src/agent-status/prepare-agent-status-context";

describe("prepareAgentStatusContext", () => {
  test("在上下文末尾追加独立 user 状态消息并保持缓存前缀不变", async () => {
    const inspectedDirectories: string[] = [];
    const probe = {
      async inspect({ workingDirectory }: { workingDirectory: string }) {
        inspectedDirectories.push(workingDirectory);
        return {
          currentTime: "2026-08-19T06:10:20.123Z",
          workingDirectory,
          platform: "win32",
          arch: "x64",
          shell: "PowerShell 7",
          pythonVersion: "Python 3.12.4",
        };
      },
    };
    const systemPrompt =
      "Keep this system prompt byte-for-byte stable.\r\nCache boundary.";
    const context: PiThreadContext = {
      systemPrompt,
      agentStatus: {
        components: ["timestamps", "system"],
      },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Inspect the project." }],
          timestamp: Date.parse("2026-08-19T06:10:10.123Z"),
        },
      ],
      tools: [],
      responseApiNativeTools: [],
    };

    const prepared = await prepareAgentStatusContext(context, {
      probe,
      workingDirectory: "C:\\repo",
    });

    expect(inspectedDirectories).toEqual(["C:\\repo"]);
    expect(prepared.systemPrompt).toBe(systemPrompt);
    expect(context.systemPrompt).toBe(systemPrompt);
    expect(prepared.messages.slice(0, context.messages.length)).toEqual(
      context.messages
    );
    expect(prepared.messages).toHaveLength(context.messages.length + 1);
    const statusMessage = prepared.messages.at(-1);
    expect(statusMessage?.role).toBe("user");
    const statusContent = statusMessage?.content[0];
    if (
      typeof statusContent !== "object" ||
      statusContent === null ||
      !("type" in statusContent) ||
      statusContent.type !== "text" ||
      !("text" in statusContent) ||
      typeof statusContent.text !== "string"
    ) {
      throw new Error("Agent Status 必须作为末尾 user 文本消息注入。");
    }
    expect(statusContent.text.startsWith("<agent_status>\n")).toBe(true);
    expect(statusContent.text.endsWith("\n</agent_status>")).toBe(true);
    expect(statusContent.text).toContain("Working directory: C:\\repo");
    expect(statusContent.text).toContain("Platform: win32/x64");
    expect(statusContent.text).toContain("Shell: PowerShell 7");
    expect(statusContent.text).toContain("Python: Python 3.12.4");
    expect(context.messages[0]?.content).toEqual([
      { type: "text", text: "Inspect the project." },
    ]);
  });

  test("未选择状态组件时保持模型消息不变", async () => {
    const context: PiThreadContext = {
      systemPrompt: "保持不变",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "普通消息" }],
          timestamp: 0,
        },
      ],
      tools: [],
      responseApiNativeTools: [],
    };

    const prepared = await prepareAgentStatusContext(context, {
      probe: {
        inspect: () =>
          Promise.resolve({
            currentTime: "2026-08-19T06:10:20.123Z",
            workingDirectory: "C:\\repo",
            platform: "win32",
            arch: "x64",
            shell: "PowerShell 7",
            pythonVersion: "Python 3.12.4",
          }),
      },
      workingDirectory: "C:\\repo",
    });

    expect(prepared).toEqual(context);
  });
});
