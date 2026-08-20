import { describe, expect, test } from "bun:test";

import {
  AGENT_STATUS_TODO_TOOLS,
  ALL_AGENT_STATUS_COMPONENTS,
  applyAgentStatusConfiguration,
  backfillAgentStatusUserTimestamps,
  DEFAULT_AGENT_STATUS_COMPONENTS,
  normalizeAgentStatusThread,
  resolveAgentStatusWorkingDirectory,
} from "../../src/agent-status";
import type { Thread, ThreadContext } from "../../src/types/threads";
import type { BuiltinTool } from "../../src/types/tools";

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

describe("Agent Status thread helpers", () => {
  test("publishes the canonical component order and preserves unconfigured threads", () => {
    expect(ALL_AGENT_STATUS_COMPONENTS).toEqual([
      "timestamps",
      "tool-counter",
      "todos",
      "detailed-errors",
      "system",
    ]);
    expect(DEFAULT_AGENT_STATUS_COMPONENTS).toEqual([]);
    const empty: Thread = {};
    const withUnrelatedTool: Thread = {
      context: { tools: [READ_TOOL] },
    };

    expect(normalizeAgentStatusThread(empty)).toBe(empty);
    expect(normalizeAgentStatusThread(withUnrelatedTool)).toBe(
      withUnrelatedTool
    );
  });

  test("removes feature TODO tools from an unconfigured thread without creating settings", () => {
    const thread: Thread = {
      context: {
        tools: [READ_TOOL, ...AGENT_STATUS_TODO_TOOLS],
      },
    };

    const normalized = normalizeAgentStatusThread(thread);

    expect(normalized).not.toBe(thread);
    expect(normalized.context?.agentStatus).toBeUndefined();
    expect(normalized.context?.tools).toEqual([READ_TOOL]);
    expect(normalizeAgentStatusThread(normalized)).toBe(normalized);
  });

  test("normalizes configured subsets, offsets, and TODO tools", () => {
    const canonicalRewrite = AGENT_STATUS_TODO_TOOLS[0];
    if (!canonicalRewrite) {
      throw new Error("缺少 rewrite_todo_list 的标准工具定义。");
    }
    const staleRewrite = {
      ...canonicalRewrite,
      description: "过期的工具定义。",
    } satisfies BuiltinTool;
    const thread: Thread = {
      context: {
        agentStatus: {
          components: ["todos", "timestamps", "todos"],
          simulatedTimeOffsetMs: Number.NaN,
        },
        tools: [READ_TOOL, staleRewrite, staleRewrite],
      },
    };

    const normalized = normalizeAgentStatusThread(thread);

    expect(normalized.context?.agentStatus).toEqual({
      components: ["timestamps", "todos"],
      simulatedTimeOffsetMs: 0,
    });
    expect(normalized.context?.tools).toEqual([
      READ_TOOL,
      ...AGENT_STATUS_TODO_TOOLS,
    ]);
    expect(normalizeAgentStatusThread(normalized)).toBe(normalized);
  });

  test("applies explicit configuration and keeps repeated application idempotent", () => {
    const thread: Thread = {
      context: {
        tools: [READ_TOOL],
      },
    };

    const enabled = applyAgentStatusConfiguration(thread, {
      components: ["todos", "timestamps", "todos"],
      simulatedTimeOffsetMs: Number.POSITIVE_INFINITY,
    });

    expect(enabled.context?.agentStatus).toEqual({
      components: ["timestamps", "todos"],
      simulatedTimeOffsetMs: 0,
    });
    expect(enabled.context?.tools).toEqual([
      READ_TOOL,
      ...AGENT_STATUS_TODO_TOOLS,
    ]);
    expect(
      applyAgentStatusConfiguration(enabled, {
        components: ["timestamps", "todos"],
        simulatedTimeOffsetMs: 0,
      })
    ).toBe(enabled);

    const disabled = applyAgentStatusConfiguration(enabled, {
      components: [],
      simulatedTimeOffsetMs: 0,
    });
    expect(disabled.context?.agentStatus).toEqual({
      components: [],
      simulatedTimeOffsetMs: 0,
    });
    expect(disabled.context?.tools).toEqual([READ_TOOL]);
    expect(
      applyAgentStatusConfiguration(disabled, {
        components: [],
        simulatedTimeOffsetMs: 0,
      })
    ).toBe(disabled);
  });

  test("clears simulated time when timestamp tracking is disabled", () => {
    const configured = applyAgentStatusConfiguration(
      {
        context: {
          agentStatus: {
            components: ["timestamps", "system"],
            simulatedTimeOffsetMs: -86_400_000,
          },
        },
      },
      {
        components: ["system"],
        simulatedTimeOffsetMs: -86_400_000,
      }
    );

    expect(configured.context?.agentStatus).toEqual({
      components: ["system"],
      simulatedTimeOffsetMs: 0,
    });
  });

  test("does not backfill user timestamps while the component is disabled", () => {
    let observed = false;
    const thread: Thread = {
      context: {
        messages: [
          {
            id: "legacy-user",
            role: "user",
            content: [{ type: "text", text: "legacy" }],
          },
        ],
      },
    };

    expect(
      backfillAgentStatusUserTimestamps(thread, () => {
        observed = true;
        return 1_234;
      })
    ).toBe(thread);
    expect(observed).toBe(false);
  });

  test("backfills all legacy users from one stable observation", () => {
    let observations = 0;
    const thread: Thread = {
      context: {
        agentStatus: { components: ["timestamps"] },
        messages: [
          {
            id: "user-1",
            role: "user",
            content: [{ type: "text", text: "first" }],
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "answer" }],
          },
          {
            id: "user-2",
            role: "user",
            content: [{ type: "text", text: "second" }],
          },
          {
            id: "user-3",
            role: "user",
            content: [{ type: "text", text: "already observed" }],
            agentStatus: { timestamp: 42 },
          },
        ],
      },
    };

    const backfilled = backfillAgentStatusUserTimestamps(thread, () => {
      observations += 1;
      return 1_234;
    });
    const userTimestamps =
      backfilled.context?.messages
        ?.filter((message) => message.role === "user")
        .map((message) => message.agentStatus?.timestamp) ?? [];

    expect(observations).toBe(1);
    expect(userTimestamps).toEqual([1_234, 1_234, 42]);
    expect(
      backfillAgentStatusUserTimestamps(backfilled, () => {
        throw new Error("已有时间戳时不应再次读取时钟。");
      })
    ).toBe(backfilled);
  });

  test("resolves the named working directory before other variables", () => {
    const context: ThreadContext = {
      variables: {
        project_root: {
          type: "workingDirectory",
          value: "C:\\raw-project",
        },
        current_working_directory: {
          type: "workingDirectory",
          value: "C:\\raw-current",
        },
      },
    };

    expect(
      resolveAgentStatusWorkingDirectory(context, {
        project_root: "D:\\resolved-project",
        current_working_directory: "D:\\resolved-current",
      })
    ).toBe("D:\\resolved-current");
    expect(
      resolveAgentStatusWorkingDirectory(context, {
        project_root: "D:\\resolved-project",
      })
    ).toBe("C:\\raw-current");
    expect(
      resolveAgentStatusWorkingDirectory(
        {
          variables: {
            project_root: {
              type: "workingDirectory",
              value: "C:\\raw-project",
            },
          },
        },
        { project_root: "D:\\resolved-project" }
      )
    ).toBe("D:\\resolved-project");
    expect(resolveAgentStatusWorkingDirectory(undefined)).toBeUndefined();
  });
});
