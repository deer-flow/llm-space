import { describe, expect, test } from "bun:test";

import { DeerFlowJsonlThreadParser } from "./deerflow-jsonl-thread-parser";

function _jsonl(...rows: unknown[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

describe("DeerFlowJsonlThreadParser", () => {
  test("imports visible human, assistant, and tool messages", async () => {
    const result = await new DeerFlowJsonlThreadParser().parseDetailed(
      [
        "not json",
        _jsonl(
          {
            event_type: "run.start",
            category: "trace",
            content: { chain: "LangGraph" },
          },
          {
            event_type: "llm.human.input",
            category: "message",
            content: { type: "human", id: "human-1", content: "Search" },
          },
          {
            event_type: "llm.ai.response",
            category: "message",
            content: {
              type: "ai",
              id: "ai-1",
              content: "",
              tool_calls: [
                {
                  id: "call-1",
                  name: "web_search",
                  args: { query: "DeerFlow" },
                },
              ],
            },
            metadata: { caller: "lead_agent" },
          },
          {
            event_type: "llm.tool.result",
            category: "message",
            content: {
              type: "tool",
              id: "tool-1",
              tool_call_id: "call-1",
              content: "Search result",
            },
          },
          {
            event_type: "llm.ai.response",
            category: "message",
            content: { type: "ai", id: "ai-2", content: "Done" },
            metadata: { caller: "lead_agent" },
          }
        ),
      ].join("\n")
    );

    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.thread.context?.messages).toEqual([
        {
          id: "human-1",
          role: "user",
          content: [{ type: "text", text: "Search" }],
        },
        {
          id: "ai-1",
          role: "assistant",
          content: [],
          toolCalls: [
            {
              id: "call-1",
              input: {
                name: "web_search",
                arguments: { query: "DeerFlow" },
              },
              output: {
                content: [{ type: "text", text: "Search result" }],
              },
            },
          ],
        },
        {
          id: "ai-2",
          role: "assistant",
          content: [{ type: "text", text: "Done" }],
        },
      ]);
    }
  });

  test("skips internal DeerFlow messages", async () => {
    const result = await new DeerFlowJsonlThreadParser().parseDetailed(
      _jsonl(
        {
          event_type: "llm.human.input",
          category: "message",
          content: { type: "human", content: "Visible" },
        },
        {
          event_type: "llm.ai.response",
          category: "message",
          content: { type: "ai", content: "Title" },
          metadata: { caller: "middleware:title" },
        },
        {
          event_type: "llm.ai.response",
          category: "message",
          content: { type: "ai", content: "Subagent result" },
          metadata: { caller: "subagent:research" },
        },
        {
          event_type: "llm.ai.response",
          category: "message",
          content: {
            type: "ai",
            content: "Hidden",
            additional_kwargs: { hide_from_ui: true },
          },
        }
      )
    );

    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.thread.context?.messages).toHaveLength(1);
      expect(result.thread.context?.messages?.[0]).toMatchObject({
        role: "user",
        content: [{ type: "text", text: "Visible" }],
      });
    }
  });

  test("accepts missing optional envelope fields and the legacy AI alias", async () => {
    const result = await new DeerFlowJsonlThreadParser().parseDetailed(
      _jsonl(
        {
          category: "message",
          content: { type: "human", content: "Hello" },
        },
        {
          event_type: "ai_message",
          content: { content: "Hi" },
        }
      )
    );

    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(
        result.thread.context?.messages?.map((message) => message.role)
      ).toEqual(["user", "assistant"]);
    }
  });

  test("rejects files without valid JSON rows", async () => {
    const result = await new DeerFlowJsonlThreadParser().parseDetailed(
      "not json\n{unfinished"
    );

    expect(result.status).toBe("invalid-json");
  });

  test("rejects valid JSONL without DeerFlow messages", async () => {
    const result = await new DeerFlowJsonlThreadParser().parseDetailed(
      _jsonl({ event_type: "run.start", category: "trace", content: {} })
    );

    expect(result.status).toBe("invalid-shape");
  });
});
