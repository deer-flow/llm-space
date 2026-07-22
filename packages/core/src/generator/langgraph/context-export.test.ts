import { describe, expect, test } from "bun:test";

import type { ThreadContext } from "../../types";

import {
  buildContextExports,
  isMetaUserMessage,
  scoreMetaUserMessage,
} from "./context-export";

function userMessage(text: string) {
  return {
    id: "m1",
    role: "user" as const,
    content: [{ type: "text" as const, text }],
  };
}

describe("isMetaUserMessage", () => {
  test("scores a complete system-reminder at the >= 3 threshold", () => {
    const context = {
      messages: [userMessage("  \n<system-reminder>date</system-reminder>  ")],
    };
    expect(scoreMetaUserMessage(context)).toEqual({ score: 3, isMeta: true });
    expect(isMetaUserMessage(context)).toBe(true);
  });

  test("does not qualify an opening tag alone without another signal", () => {
    expect(
      scoreMetaUserMessage({
        messages: [userMessage("<system-reminder>unfinished")],
      })
    ).toEqual({ score: 2, isMeta: false });
  });

  test("combines consecutive-user and known-variable signals", () => {
    const context: ThreadContext = {
      messages: [userMessage("Runtime: {{ topic }}"), userMessage("Question")],
      variableVariants: {
        active: "default",
        variants: { default: { topic: "agents" } },
      },
    };
    expect(scoreMetaUserMessage(context)).toEqual({ score: 3, isMeta: true });
  });

  test("adds skills and current-date signal weights by variable type", () => {
    const context: ThreadContext = {
      messages: [
        userMessage("{{ available_skills }} / {{ today }}"),
        userMessage("Question"),
      ],
      variables: {
        available_skills: {
          type: "skills",
          format: "xml",
          skillNames: [],
          indent: 0,
        },
        today: { type: "currentDate", format: "iso-date" },
      },
    };
    expect(scoreMetaUserMessage(context)).toEqual({ score: 5, isMeta: true });
  });

  test("returns false for a real question or an assistant first message", () => {
    expect(isMetaUserMessage({ messages: [userMessage("what is 2+2?")] })).toBe(
      false
    );
    expect(
      isMetaUserMessage({
        messages: [
          {
            id: "a1",
            role: "assistant",
            content: [{ type: "text", text: "<system-reminder>" }],
          },
        ],
      })
    ).toBe(false);
    expect(isMetaUserMessage(undefined)).toBe(false);
  });
});

describe("buildContextExports", () => {
  test("exports rendered prompt, per-tool JSON, messages, and variables", () => {
    const context: ThreadContext = {
      tools: [
        {
          type: "function",
          name: "do_thing",
          description: "d",
          parameters: {},
        },
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
      messages: [
        userMessage("<system-reminder>ctx</system-reminder>"),
        { id: "m2", role: "user", content: [{ type: "text", text: "hi" }] },
      ],
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

    expect(byPath.get("references/system-prompt.md")).toContain(
      "You are helpful."
    );
    expect(byPath.has("references/tools/do_thing.json")).toBe(true);
    // The MCP metadata is preserved so a plan can wire real access.
    expect(byPath.get("references/tools/mcp__srv__fetch.json")).toContain(
      '"fetch"'
    );
    // Built-in tools are NOT exported to references (they're copied as code).
    expect(byPath.has("references/tools/read.json")).toBe(false);
    // The first message is flagged meta.
    expect(byPath.get("references/messages/01-user.md")).toContain("(meta)");
    expect(byPath.get("references/messages/02-user.md")).toContain("hi");
    expect(byPath.get("references/variables.json")).toContain("current_date");
  });
});
