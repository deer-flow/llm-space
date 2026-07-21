import { describe, expect, test } from "bun:test";

import type { ThreadContext } from "../../types";

import { buildContextExports, isMetaUserMessage } from "./context-export";

function userMessage(text: string) {
  return {
    id: "m1",
    role: "user" as const,
    content: [{ type: "text" as const, text }],
  };
}

describe("isMetaUserMessage", () => {
  test("true for a leading <system-reminder> user turn", () => {
    expect(
      isMetaUserMessage(userMessage("<system-reminder>date</system-reminder>"))
    ).toBe(true);
    expect(
      isMetaUserMessage(userMessage("  \n<system-reminder>x</system-reminder>"))
    ).toBe(true);
  });

  test("false for a real question or an assistant message", () => {
    expect(isMetaUserMessage(userMessage("what is 2+2?"))).toBe(false);
    expect(
      isMetaUserMessage({
        id: "a1",
        role: "assistant",
        content: [{ type: "text", text: "<system-reminder>" }],
      })
    ).toBe(false);
    expect(isMetaUserMessage(undefined)).toBe(false);
  });
});

describe("buildContextExports", () => {
  test("exports rendered prompt, per-tool JSON, messages, and variables", () => {
    const context: ThreadContext = {
      tools: [
        { type: "function", name: "do_thing", description: "d", parameters: {} },
        {
          type: "mcp",
          name: "mcp__srv__fetch",
          description: "m",
          parameters: {},
          serverId: "s1",
          serverName: "srv",
          toolName: "fetch",
        },
        // Built-in tools are copied in as real code, not exported to references.
        { type: "builtin", name: "read", description: "b", parameters: {} },
      ],
      variables: { current_date: { type: "currentDate", format: "iso-date" } },
    };
    const rendered: ThreadContext = {
      systemPrompt: "You are helpful.",
      messages: [
        userMessage("<system-reminder>ctx</system-reminder>"),
        { id: "m2", role: "user", content: [{ type: "text", text: "hi" }] },
      ],
    };

    const files = buildContextExports(context, rendered);
    const byPath = new Map(files.map((f) => [f.path, f.contents]));

    expect(byPath.get("references/system-prompt.md")).toContain("You are helpful.");
    expect(byPath.has("references/tools/do_thing.json")).toBe(true);
    // The MCP metadata is preserved so a plan can wire real access.
    expect(byPath.get("references/tools/mcp__srv__fetch.json")).toContain("\"fetch\"");
    // Built-in tools are NOT exported to references (they're copied as code).
    expect(byPath.has("references/tools/read.json")).toBe(false);
    // The first message is flagged meta.
    expect(byPath.get("references/messages/01-user.md")).toContain("(meta)");
    expect(byPath.get("references/messages/02-user.md")).toContain("hi");
    expect(byPath.get("references/variables.json")).toContain("current_date");
  });
});
