import { describe, expect, test } from "bun:test";

import {
  buildSubagentThread,
  filterSubagentTools,
  parseSpawnAgentArgs,
  SPAWN_AGENT_TOOL,
} from "../../src/thread/spawn-agent";
import {
  getMessageText,
  isExecutableTool,
  normalizeTool,
  type Thread,
  type Tool,
} from "../../src/types";

const args = {
  description: "Review the storage code",
  task_name: "review",
  prompt: "Inspect src/storage.ts and report bugs.",
};
const tools: Tool[] = [
  "read",
  "write",
  "bash",
  "exec_code",
  "spawn_agent",
  "future_tool",
].map((name) => ({ type: "builtin", name, description: name, parameters: {} }));
tools.push(
  { type: "function", name: "write", description: "Custom", parameters: {} },
  {
    type: "mcp",
    name: "mcp_write",
    description: "MCP",
    parameters: {},
    serverId: "s",
    serverName: "s",
    toolName: "write",
  },
  {
    type: "plugin",
    name: "plugin_write",
    description: "Plugin",
    parameters: {},
    pluginId: "p",
    toolId: "t",
  },
  { type: "provider-hosted", config: { type: "web_search" } }
);

describe("spawn_agent", () => {
  test("copies raw templates, variables and model with fresh messages only", () => {
    const parent: Thread = {
      title: "Old title",
      model: { provider: "test", id: "model" },
      runtimeId: "remote:alpha",
      originalURL: "old",
      runHistory: [],
      evaluations: [],
      meta: { compactionInstructions: "old" },
      context: {
        systemPrompt: "System {{current_date}}",
        variables: {
          current_date: { type: "currentDate", format: "iso-date" },
        },
        variableVariants: {
          active: "default",
          variants: { default: { topic: "raw" } },
        },
        snapshot: {
          variables: { systemPrompt: { current_date: "yesterday" } },
        },
        tools,
        messages: [
          {
            id: "meta",
            role: "user",
            content: [
              {
                type: "text",
                text: "<system-reminder>{{current_date}}</system-reminder>",
              },
            ],
          },
          {
            id: "question",
            role: "user",
            content: [{ type: "text", text: "Private parent history" }],
          },
        ],
      },
    };
    const before = structuredClone(parent);
    const child = buildSubagentThread(parent, "parent", args);
    expect(child.model).toEqual(parent.model);
    expect(child.runtimeId).toBe("remote:alpha");
    expect(child.context?.systemPrompt).toBe(parent.context?.systemPrompt);
    expect(child.context?.variables).toEqual(parent.context?.variables);
    expect(child.context?.variableVariants).toEqual(
      parent.context?.variableVariants
    );
    expect(child.context?.snapshot).toBeUndefined();
    expect(child.runHistory).toBeUndefined();
    expect(child.meta).toBeUndefined();
    expect(child.originalURL).toBeUndefined();
    const messages = child.context!.messages!;
    expect(messages).toHaveLength(2);
    expect(messages[0]!.id).not.toBe("meta");
    expect(getMessageText(messages[0]!)).toBe(
      getMessageText(parent.context!.messages![0]!)
    );
    expect(getMessageText(messages[1]!)).toContain(
      "Parent task: parent\nTask: review"
    );
    expect(getMessageText(messages[1]!)).toContain(args.prompt);
    expect(JSON.stringify(messages)).not.toContain("Private parent history");
    messages[0]!.content = [];
    expect(parent).toEqual(before);
  });

  test("ordinary parent questions are not inherited", () => {
    const child = buildSubagentThread(
      {
        context: {
          messages: [
            {
              id: "u",
              role: "user",
              content: [{ type: "text", text: "Ordinary request" }],
            },
          ],
        },
      },
      "parent",
      args
    );
    expect(child.context?.messages).toHaveLength(1);
  });

  test.each([
    ["general-purpose", ["read", "write", "bash", "exec_code", "future_tool"]],
    ["researcher", ["read"]],
    ["code-reviewer", ["read", "bash", "exec_code"]],
  ] as const)("%s only filters existing built-ins", (role, expected) => {
    const filtered = filterSubagentTools(tools, role);
    expect(
      filtered
        .filter((tool) => tool.type === "builtin")
        .map((tool) => tool.name)
    ).toEqual([...expected]);
    expect(filtered.filter((tool) => tool.type !== "builtin")).toEqual(
      tools.filter((tool) => tool.type !== "builtin")
    );
    expect(filterSubagentTools([], role)).toEqual([]);
    const child = buildSubagentThread({}, "parent", {
      ...args,
      subagent_type: role,
    });
    expect(getMessageText(child.context!.messages![0]!)).toContain(
      `Role: ${role}`
    );
  });

  test.each(["../escape", "a/b", "a\\b", "CON", "", "..", "name.json", "end."])(
    "rejects invalid task name %s",
    (task_name) => {
      expect(() => parseSpawnAgentArgs({ ...args, task_name })).toThrow();
    }
  );
  test("validates roles and never permits automatic execution", () => {
    expect(() =>
      parseSpawnAgentArgs({ ...args, subagent_type: "unknown" })
    ).toThrow();
    expect(() =>
      parseSpawnAgentArgs({ ...args, run_in_background: true })
    ).toThrow();
    expect(isExecutableTool({ ...SPAWN_AGENT_TOOL, terminate: false })).toBe(
      false
    );
    expect(
      normalizeTool({ ...SPAWN_AGENT_TOOL, terminate: false })
    ).toMatchObject({ terminate: true });
  });
});
