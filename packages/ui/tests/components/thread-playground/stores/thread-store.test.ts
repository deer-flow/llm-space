import { describe, expect, test } from "bun:test";

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type {
  AgentStatusEnvironment,
  AgentStreamEvent,
  AgentStreamRequest,
  AgentTransport,
  ProviderHostedTool,
  Thread,
} from "@llm-space/core";
import {
  AGENT_STATUS_TODO_TOOLS,
  createAgentStatusRuntime,
} from "@llm-space/core";

import { createThreadStore } from "../../../../src/components/thread-playground/stores";

globalThis.requestAnimationFrame = (callback: FrameRequestCallback): number =>
  setTimeout(() => callback(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (handle: number): void => {
  clearTimeout(handle);
};

const INVALID_THREAD: Thread = {
  context: {
    messages: [
      {
        content: [{ text: "Question", type: "text" }],
        id: "user-one",
        role: "user",
      },
      {
        content: [{ text: "Answer", type: "text" }],
        id: "assistant-one",
        role: "assistant",
      },
    ],
  },
  model: { id: "model", provider: "fake" },
};

describe("working-directory normalization", () => {
  test("stores an absolute path and invalidates legacy frozen values", async () => {
    const store = createThreadStore(
      {
        context: {
          variables: {
            current_working_directory: {
              type: "workingDirectory",
              value: "~/Desktop/llm-space-project",
            },
          },
          snapshot: {
            variables: {
              systemPrompt: {
                current_working_directory: "~/Desktop/llm-space-project",
              },
            },
          },
        },
      },
      {
        resolvePath: (value) =>
          Promise.resolve(value.replace("~", "/Users/tester")),
      }
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      store.getState().thread.context?.variables?.current_working_directory
    ).toEqual({
      type: "workingDirectory",
      value: "/Users/tester/Desktop/llm-space-project",
    });
    expect(
      store.getState().thread.context?.snapshot?.variables?.systemPrompt
        ?.current_working_directory
    ).toBeUndefined();
  });
});

describe("inline run validation", () => {
  test("scopes feedback to the blocking message", async () => {
    let transportCalls = 0;
    const store = createThreadStore(INVALID_THREAD, {
      resolveModel: (saved) => saved ?? null,
      transport: () => {
        transportCalls += 1;
        throw new Error("Transport should not run for invalid input");
      },
    });

    await store.getState().run();

    expect(store.getState().runValidationIssue).toMatchObject({
      code: "lastAssistantMessage",
      level: "warning",
      messageId: "assistant-one",
      resolution: { type: "appendUserMessage" },
    });
    expect(transportCalls).toBe(0);

    store.getState().updateMessageTextContent("assistant-one", "Edited answer");
    expect(store.getState().runValidationIssue?.messageId).toBe(
      "assistant-one"
    );

    store.getState().resolveRunValidationIssue();
    const messages = store.getState().thread.context?.messages ?? [];
    expect(store.getState().runValidationIssue).toBeNull();
    expect(messages.at(-1)?.role).toBe("user");
    expect(store.getState().autoFocusMessageId).toBe(
      messages.at(-1)?.id ?? null
    );
  });

  test("clears feedback when the blocking role becomes runnable", async () => {
    const store = createThreadStore(INVALID_THREAD, {
      resolveModel: (saved) => saved ?? null,
      transport: () => {
        throw new Error("Transport should not run for invalid input");
      },
    });

    await store.getState().run();
    store.getState().toggleMessageRole("assistant-one");

    expect(store.getState().runValidationIssue).toBeNull();
  });
});

describe("provider-hosted tools", () => {
  const providerHostedTool: ProviderHostedTool = {
    type: "provider-hosted",
    config: { type: "web_search", search_context_size: "high" },
  };

  test("uses provider-hosted identity for add, duplicate, update, and removal", () => {
    const store = createThreadStore({});

    expect(store.getState().addTool(providerHostedTool)).toBe(true);
    expect(store.getState().addTool(providerHostedTool)).toBe(false);
    expect(
      store.getState().addTool({
        type: "function",
        name: "web_search",
        description: "Client function",
        parameters: { type: "object" },
      })
    ).toBe(true);
    expect(
      store.getState().updateTool("provider-hosted:web_search", {
        type: "provider-hosted",
        config: { type: "file_search", vector_store_ids: ["vs_1"] },
      })
    ).toBe(true);

    const updatedTools = store.getState().thread.context?.tools ?? [];
    expect(
      updatedTools.some(
        (tool) =>
          tool.type === "provider-hosted" && tool.config.type === "file_search"
      )
    ).toBe(true);
    expect(
      updatedTools.some(
        (tool) => tool.type === "function" && tool.name === "web_search"
      )
    ).toBe(true);
    store.getState().removeTool("provider-hosted:file_search");
    expect(
      store
        .getState()
        .thread.context?.tools?.some(
          (tool) =>
            tool.type === "provider-hosted" &&
            tool.config.type === "file_search"
        )
    ).toBe(false);
    expect(
      store
        .getState()
        .thread.context?.tools?.some(
          (tool) => tool.type === "function" && tool.name === "web_search"
        )
    ).toBe(true);
  });

  test("forwards provider-hosted config and retains an activity-only final message", async () => {
    let capturedRequest: AgentStreamRequest | undefined;
    const finalAssistant = {
      role: "assistant",
      content: [],
      nativeToolActivities: [
        {
          id: "ws_1",
          type: "web_search_call",
          status: "completed",
          raw: { id: "ws_1", type: "web_search_call" },
        },
      ],
      responseOutputItems: [{ id: "ws_1", type: "web_search_call" }],
      api: "openai-responses",
      provider: "openai",
      model: "gpt-test",
      usage: {
        input: 1,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: Date.now(),
    } as const;
    const events = [
      {
        type: "message_start",
        message: finalAssistant,
      } as unknown as AgentEvent,
      {
        type: "message_end",
        message: finalAssistant,
      } as unknown as AgentEvent,
    ];
    const transport: AgentTransport = async function* (request) {
      capturedRequest = request;
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      yield* events;
    };
    const store = createThreadStore(
      {
        model: { id: "gpt-test", provider: "openai" },
        context: {
          tools: [providerHostedTool],
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Search" }],
            },
          ],
        },
      },
      {
        resolveModel: (saved) => saved ?? null,
        transport,
      }
    );

    await store.getState().run();

    expect(capturedRequest?.context.responseApiNativeTools).toEqual([
      providerHostedTool.config,
    ]);
    const assistant = store.getState().thread.context?.messages?.at(-1);
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") throw new Error("Expected assistant");
    expect(assistant.providerHostedToolActivities).toHaveLength(1);
    expect(assistant.responseOutputItems).toHaveLength(1);
  });
});

describe("agent status configuration", () => {
  test("starts a new thread with no status components or TODO tools", () => {
    const store = createThreadStore({});

    expect(
      store.getState().thread.context?.agentStatus?.components ?? []
    ).toEqual([]);
    expect(
      store
        .getState()
        .thread.context?.tools?.some(
          (tool) =>
            tool.type === "builtin" &&
            (tool.name === "rewrite_todo_list" ||
              tool.name === "update_todo_status")
        ) ?? false
    ).toBe(false);
  });

  test("persists only the selected components in canonical order", () => {
    const store = createThreadStore({});

    store.getState().setAgentStatusComponent("system", true);
    store.getState().setAgentStatusComponent("timestamps", true);

    const persistedThread = store.getState().thread;
    expect(persistedThread.context?.agentStatus?.components).toEqual([
      "timestamps",
      "system",
    ]);

    const restoredStore = createThreadStore(persistedThread);
    expect(
      restoredStore.getState().thread.context?.agentStatus?.components
    ).toEqual(["timestamps", "system"]);
  });

  test("adds and removes the dedicated TODO tools with the TODO component", () => {
    const store = createThreadStore({});
    store.getState().setAgentStatusComponent("todos", true);
    const toolNames =
      store
        .getState()
        .thread.context?.tools?.map((tool) =>
          tool.type === "builtin" ? tool.name : undefined
        ) ?? [];

    expect(toolNames).toContain("rewrite_todo_list");
    expect(toolNames).toContain("update_todo_status");

    store.getState().setAgentStatusComponent("todos", false);
    const remainingToolNames =
      store
        .getState()
        .thread.context?.tools?.map((tool) =>
          tool.type === "builtin" ? tool.name : undefined
        ) ?? [];
    expect(remainingToolNames).not.toContain("rewrite_todo_list");
    expect(remainingToolNames).not.toContain("update_todo_status");
  });

  test("persists the selected simulated-time offset", () => {
    const store = createThreadStore({});

    store.getState().setAgentStatusComponent("timestamps", true);
    store.getState().setAgentStatusTimeOffset(-86_400_000);

    const persistedThread = store.getState().thread;
    expect(persistedThread.context?.agentStatus?.simulatedTimeOffsetMs).toBe(
      -86_400_000
    );
    const restoredStore = createThreadStore(persistedThread);
    expect(
      restoredStore.getState().thread.context?.agentStatus
        ?.simulatedTimeOffsetMs
    ).toBe(-86_400_000);
  });

  test("clears the simulated-time offset when timestamps are disabled", () => {
    const store = createThreadStore({});

    store.getState().setAgentStatusComponent("timestamps", true);
    store.getState().setAgentStatusTimeOffset(-86_400_000);
    store.getState().setAgentStatusComponent("timestamps", false);

    expect(
      store.getState().thread.context?.agentStatus?.simulatedTimeOffsetMs
    ).toBe(0);
  });

  test("keeps TODO tools owned by the TODO status component", () => {
    const store = createThreadStore({});
    store.getState().setAgentStatusComponent("todos", true);

    store.getState().removeTool("rewrite_todo_list");
    expect(
      store
        .getState()
        .thread.context?.tools?.flatMap((tool) =>
          tool.type === "builtin" &&
          (tool.name === "rewrite_todo_list" ||
            tool.name === "update_todo_status")
            ? [tool.name]
            : []
        )
    ).toEqual(["rewrite_todo_list", "update_todo_status"]);

    const todoTool = AGENT_STATUS_TODO_TOOLS[0];
    if (!todoTool) {
      throw new Error("缺少 Agent Status TODO 工具定义。");
    }
    store.getState().setAgentStatusComponent("todos", false);
    expect(store.getState().addTool(todoTool)).toBe(false);
    expect(
      store
        .getState()
        .thread.context?.tools?.some(
          (tool) => tool.type === "builtin" && tool.name === todoTool.name
        ) ?? false
    ).toBe(false);
  });

  test("rejects component and time selections while a run is active", () => {
    const now = Date.UTC(2026, 7, 19, 6, 10, 20, 123);
    const store = createThreadStore({}, { wallClock: () => now });
    const initialThread = store.getState().thread;
    const initialSnapshot = store.getState().agentStatusSnapshot;
    store.setState({ status: "running" });

    store.getState().setAgentStatusComponent("todos", false);
    expect(store.getState().thread).toBe(initialThread);
    expect(store.getState().agentStatusSnapshot).toBe(initialSnapshot);

    store.setState({ status: "preparing" });
    store.getState().setAgentStatusTimeOffset(-86_400_000);
    expect(store.getState().thread).toBe(initialThread);
    expect(store.getState().agentStatusSnapshot).toBe(initialSnapshot);
  });

  test("does not timestamp messages until timestamp tracking is selected", () => {
    const now = Date.UTC(2026, 7, 19, 6, 10, 20, 123);
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "legacy-user-without-status",
              role: "user",
              content: [{ type: "text", text: "旧消息" }],
            },
          ],
        },
      },
      { wallClock: () => now }
    );

    store.getState().appendMessage();
    const usersBeforeEnabling =
      store
        .getState()
        .thread.context?.messages?.filter(
          (message) => message.role === "user"
        ) ?? [];
    expect(
      usersBeforeEnabling.map((message) => message.agentStatus?.timestamp)
    ).toEqual([undefined, undefined]);

    store.getState().setAgentStatusComponent("timestamps", true);
    store.getState().appendMessage();
    const latest = store.getState().thread.context?.messages?.at(-1);
    expect(latest?.role).toBe("user");
    if (latest?.role !== "user") {
      throw new Error("预期得到 user 消息");
    }
    expect(latest.agentStatus?.timestamp).toBe(now);
  });
});

describe("agent status environment stream", () => {
  test("caches the latest probed environment without persisting it", async () => {
    const environment: AgentStatusEnvironment = {
      currentTime: "2026-08-19T06:10:20.123Z",
      workingDirectory: "C:\\runtime",
      platform: "win32",
      arch: "x64",
      shell: "PowerShell 7",
      pythonVersion: "Python 3.12.8",
    };
    const transport: AgentTransport = async function* () {
      yield {
        type: "agent_status_environment",
        environment,
      } satisfies AgentStreamEvent;
    };
    const store = createThreadStore(
      {
        model: { id: "model", provider: "fake" },
        context: {
          variables: {
            current_working_directory: {
              type: "workingDirectory",
              value: "C:\\runtime",
            },
          },
          messages: [
            {
              id: "user-environment",
              role: "user",
              content: [{ type: "text", text: "检查环境" }],
            },
          ],
        },
      },
      {
        resolveModel: (saved) => saved ?? null,
        transport,
        wallClock: () => Date.UTC(2026, 7, 19, 6, 10, 20, 123),
      }
    );

    await store.getState().run();

    expect(store.getState().agentStatusEnvironment).toEqual(environment);
    expect(store.getState().agentStatusSnapshot.environment).toEqual(
      environment
    );
    expect(
      createThreadStore(store.getState().thread).getState()
        .agentStatusEnvironment
    ).toBeUndefined();
  });
});

describe("agent status tool completion", () => {
  const wallClockNow = Date.UTC(2026, 7, 19, 6, 10, 20, 123);

  test("records stable per-tool ordinals and wall-clock timestamps", async () => {
    const store = createThreadStore(
      {
        context: {
          agentStatus: {
            components: ["timestamps", "tool-counter"],
          },
          messages: [
            {
              id: "assistant-status",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "read-1",
                  input: { name: "read", arguments: { path: "one.ts" } },
                },
                {
                  id: "read-2",
                  input: { name: "read", arguments: { path: "two.ts" } },
                },
              ],
            },
          ],
        },
      },
      { wallClock: () => wallClockNow }
    );

    await store.getState().recordToolCallResult("assistant-status", "read-1", {
      content: [{ type: "text", text: "one" }],
      isError: false,
    });
    await store.getState().recordToolCallResult("assistant-status", "read-2", {
      content: [{ type: "text", text: "two" }],
      isError: false,
    });

    const assistant = store.getState().thread.context?.messages?.[0];
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") {
      throw new Error("预期得到 assistant 消息");
    }
    expect(
      assistant.toolCalls?.map((toolCall) => toolCall.output?.agentStatus)
    ).toEqual([
      expect.objectContaining({ ordinal: 1, timestamp: wallClockNow }),
      expect.objectContaining({ ordinal: 2, timestamp: wallClockNow }),
    ]);
  });

  test("serializes concurrent result commits without serializing tool execution", async () => {
    const store = createThreadStore(
      {
        context: {
          agentStatus: { components: ["tool-counter"] },
          messages: [
            {
              id: "assistant-concurrent",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "read-concurrent-1",
                  input: { name: "read", arguments: { path: "one.ts" } },
                },
                {
                  id: "read-concurrent-2",
                  input: { name: "read", arguments: { path: "two.ts" } },
                },
              ],
            },
          ],
        },
      },
      { wallClock: () => wallClockNow }
    );

    await Promise.all([
      store
        .getState()
        .recordToolCallResult("assistant-concurrent", "read-concurrent-1", {
          content: [{ type: "text", text: "one" }],
          isError: false,
        }),
      store
        .getState()
        .recordToolCallResult("assistant-concurrent", "read-concurrent-2", {
          content: [{ type: "text", text: "two" }],
          isError: false,
        }),
    ]);

    const assistant = store.getState().thread.context?.messages?.[0];
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") {
      throw new Error("预期得到 assistant 消息");
    }
    expect(
      assistant.toolCalls?.map(
        (toolCall) => toolCall.output?.agentStatus?.ordinal
      )
    ).toEqual([1, 2]);
  });

  test("persists todo metadata so a fresh runtime can rebuild the list", async () => {
    const store = createThreadStore(
      {
        context: {
          agentStatus: { components: ["todos"] },
          messages: [
            {
              id: "assistant-todo",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "rewrite-1",
                  input: {
                    name: "rewrite_todo_list",
                    arguments: {
                      todos: [
                        { content: "补测试", status: "in_progress" },
                        { content: "做验收", status: "pending" },
                      ],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      { wallClock: () => wallClockNow }
    );

    await store.getState().recordToolCallResult("assistant-todo", "rewrite-1", {
      content: [{ type: "text", text: "OK" }],
      isError: false,
    });

    const context = store.getState().thread.context ?? {};
    const assistant = context.messages?.[0];
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") {
      throw new Error("预期得到 assistant 消息");
    }
    const persistedTodos = assistant.toolCalls?.[0]?.output?.agentStatus?.todos;
    expect(persistedTodos).toHaveLength(2);
    if (!persistedTodos) {
      throw new Error("预期持久化 TODO 元数据");
    }

    const rebuilt = createAgentStatusRuntime({
      now: () => wallClockNow + 60_000,
      environment: {
        currentTime: "2026-08-19T06:11:20.123Z",
        workingDirectory: "C:\\repo",
        platform: "win32",
        arch: "x64",
        shell: "PowerShell",
        pythonVersion: "Python 3.12.8",
      },
    }).snapshot(context);
    expect(rebuilt.todos).toEqual(persistedTodos);
  });

  test("applies a working-directory effect to the thread variable", async () => {
    const store = createThreadStore(
      {
        context: {
          variables: {
            current_working_directory: {
              type: "workingDirectory",
              value: "C:\\repo",
            },
          },
          messages: [
            {
              id: "assistant-cwd",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "bash-1",
                  input: { name: "bash", arguments: { command: "cd next" } },
                },
              ],
            },
          ],
        },
      },
      { wallClock: () => wallClockNow }
    );

    await store.getState().recordToolCallResult("assistant-cwd", "bash-1", {
      content: [{ type: "text", text: "OK" }],
      isError: false,
      effects: [
        {
          type: "working-directory",
          workingDirectory: "C:\\repo\\next",
        },
      ],
    });

    expect(
      store.getState().thread.context?.variables?.current_working_directory
    ).toEqual({
      type: "workingDirectory",
      value: "C:\\repo\\next",
    });
  });

  test("backfills legacy user timestamps once and timestamps new users separately", () => {
    let currentTime = wallClockNow;
    const store = createThreadStore(
      {
        context: {
          agentStatus: { components: ["timestamps"] },
          messages: [
            {
              id: "legacy-user",
              role: "user",
              content: [{ type: "text", text: "旧消息" }],
            },
          ],
        },
      },
      { wallClock: () => currentTime }
    );

    const legacyUser = store.getState().thread.context?.messages?.[0];
    expect(legacyUser?.role).toBe("user");
    if (legacyUser?.role !== "user") {
      throw new Error("预期得到 user 消息");
    }
    expect(legacyUser.agentStatus?.timestamp).toBe(wallClockNow);

    currentTime += 1_000;
    store.getState().appendMessage();
    const messages = store.getState().thread.context?.messages ?? [];
    const appendedUser = messages.at(-1);
    expect(appendedUser?.role).toBe("user");
    if (appendedUser?.role !== "user") {
      throw new Error("预期得到新建 user 消息");
    }
    expect(appendedUser.agentStatus?.timestamp).toBe(wallClockNow + 1_000);
    const persistedLegacyUser = messages[0];
    if (persistedLegacyUser?.role !== "user") {
      throw new Error("预期保留旧 user 消息");
    }
    expect(persistedLegacyUser.agentStatus?.timestamp).toBe(wallClockNow);
  });

  test("persists each user message at the simulated time observed when created", () => {
    let currentTime = wallClockNow;
    const oneDayMs = 86_400_000;
    const store = createThreadStore(
      {
        context: {
          agentStatus: {
            components: ["timestamps"],
            simulatedTimeOffsetMs: -oneDayMs,
          },
          messages: [
            {
              id: "legacy-yesterday",
              role: "user",
              content: [{ type: "text", text: "昨天的文件" }],
            },
          ],
        },
      },
      { wallClock: () => currentTime }
    );

    store.getState().appendMessage();
    currentTime += 1_000;
    store.getState().setAgentStatusTimeOffset(0);
    store.getState().appendMessage();

    const users = (store.getState().thread.context?.messages ?? []).filter(
      (message) => message.role === "user"
    );
    expect(users.map((message) => message.agentStatus?.timestamp)).toEqual([
      wallClockNow - oneDayMs,
      wallClockNow - oneDayMs,
      wallClockNow + 1_000,
    ]);
  });

  test("refreshes the cached snapshot for edits, completion, history, and restore", async () => {
    let currentTime = wallClockNow;
    const store = createThreadStore(
      {
        context: {
          agentStatus: {
            components: [
              "timestamps",
              "tool-counter",
              "todos",
              "detailed-errors",
              "system",
            ],
          },
          messages: [
            {
              id: "assistant-snapshot",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "read-snapshot",
                  input: { name: "read", arguments: { path: "snapshot.ts" } },
                },
              ],
            },
          ],
        },
      },
      { wallClock: () => currentTime }
    );

    const initialSnapshot = store.getState().agentStatusSnapshot;
    expect(initialSnapshot.now).toBe(wallClockNow);
    expect(initialSnapshot.toolCounts).toEqual({});

    currentTime += 1_000;
    store.getState().setAgentStatusComponent("todos", false);
    const editedSnapshot = store.getState().agentStatusSnapshot;
    expect(editedSnapshot).not.toBe(initialSnapshot);
    expect(editedSnapshot.now).toBe(wallClockNow + 1_000);
    expect(editedSnapshot.components).not.toContain("todos");

    await store
      .getState()
      .recordToolCallResult("assistant-snapshot", "read-snapshot", {
        content: [{ type: "text", text: "done" }],
        isError: false,
      });
    expect(store.getState().agentStatusSnapshot.toolCounts).toEqual({
      read: 1,
    });

    store.getState().undo();
    expect(store.getState().agentStatusSnapshot.toolCounts).toEqual({});
    store.getState().redo();
    expect(store.getState().agentStatusSnapshot.toolCounts).toEqual({
      read: 1,
    });

    store.getState().restoreThread({
      context: {
        agentStatus: { components: ["timestamps"] },
        variables: {
          current_working_directory: {
            type: "workingDirectory",
            value: "C:\\restored",
          },
        },
        messages: [],
      },
    });
    expect(store.getState().agentStatusSnapshot.components).toEqual([
      "timestamps",
    ]);
    expect(store.getState().agentStatusSnapshot.toolCounts).toEqual({});
    expect(store.getState().agentStatusSnapshot.workingDirectory).toBe(
      "C:\\restored"
    );
  });

  test("keeps the cached snapshot across text edits and refreshes semantic changes", () => {
    let wallClockCalls = 0;
    const _todo = (id: string, content: string) => ({
      id,
      content,
      status: "completed" as const,
      timestamp: wallClockNow,
    });
    const store = createThreadStore(
      {
        context: {
          agentStatus: {
            components: ["tool-counter", "todos", "system"],
          },
          messages: [
            {
              id: "user-performance",
              role: "user",
              content: [{ type: "text", text: "旧文本" }],
              agentStatus: { timestamp: wallClockNow },
            },
            {
              id: "assistant-performance-a",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "todo-performance-a",
                  input: { name: "rewrite_todo_list", arguments: {} },
                  output: {
                    content: [{ type: "text", text: "A" }],
                    agentStatus: {
                      ordinal: 1,
                      todos: [_todo("todo-a", "A")],
                    },
                  },
                },
              ],
            },
            {
              id: "assistant-performance-b",
              role: "assistant",
              content: [],
              toolCalls: [
                {
                  id: "todo-performance-b",
                  input: { name: "rewrite_todo_list", arguments: {} },
                  output: {
                    content: [{ type: "text", text: "B" }],
                    agentStatus: {
                      ordinal: 2,
                      todos: [_todo("todo-b", "B")],
                    },
                  },
                },
              ],
            },
          ],
        },
      },
      {
        wallClock: () => {
          wallClockCalls += 1;
          return wallClockNow;
        },
      }
    );

    const initialSnapshot = store.getState().agentStatusSnapshot;
    const initialWallClockCalls = wallClockCalls;
    store
      .getState()
      .updateMessageTextContent("user-performance", "逐字输入的新文本");
    expect(store.getState().agentStatusSnapshot).toBe(initialSnapshot);
    expect(wallClockCalls).toBe(initialWallClockCalls);

    store.getState().updatePromptVariable("current_working_directory", {
      type: "workingDirectory",
      value: "C:\\semantic",
    });
    const workingDirectorySnapshot = store.getState().agentStatusSnapshot;
    expect(workingDirectorySnapshot).not.toBe(initialSnapshot);
    expect(workingDirectorySnapshot.workingDirectory).toBe("C:\\semantic");

    store.getState().moveMessage(1, 2);
    const movedSnapshot = store.getState().agentStatusSnapshot;
    expect(movedSnapshot).not.toBe(workingDirectorySnapshot);
    expect(movedSnapshot.todos.map((todo) => todo.id)).toEqual(["todo-a"]);

    store.getState().removeMessage("assistant-performance-a");
    const removedSnapshot = store.getState().agentStatusSnapshot;
    expect(removedSnapshot).not.toBe(movedSnapshot);
    expect(removedSnapshot.toolCounts.rewrite_todo_list).toBe(2);
    expect(removedSnapshot.todos.map((todo) => todo.id)).toEqual(["todo-b"]);
  });
});
