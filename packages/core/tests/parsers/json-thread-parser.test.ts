import { describe, expect, test } from "bun:test";

import { JsonThreadParser } from "../../src/parsers/json-thread-parser";

describe("JsonThreadParser", () => {
  test("reports recovery for a truncated native thread", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      '{"title":"Recovered","context":{"messages":[]}'
    );

    expect(result).toEqual({
      status: "parsed",
      recovered: true,
      thread: {
        title: "Recovered",
        context: { messages: [] },
      },
    });
  });

  test("rejects a recovered native thread with invalid fields", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      '{"context":{"messages":[{"role":"user"}]'
    );

    expect(result.status).toBe("invalid-shape");
  });

  test("does not turn an unrecognizable truncated object into an empty thread", async () => {
    const result = await new JsonThreadParser().parseDetailed('{"unfinished');

    expect(result.status).toBe("invalid-shape");
  });

  test("keeps strict foreign-chat normalization", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      JSON.stringify({
        messages: [{ role: "user", content: "Hello" }],
      })
    );

    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      expect(result.recovered).toBe(false);
      expect(result.thread.context?.messages?.[0]).toMatchObject({
        role: "user",
      });
    }
  });

  test("keeps the error flag of imported Anthropic tool results", async () => {
    const result = await new JsonThreadParser().parseDetailed(
      JSON.stringify({
        messages: [
          { role: "user", content: "Read both files" },
          {
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "toolu_ok",
                name: "read",
                input: { path: "notes.txt" },
              },
              {
                type: "tool_use",
                id: "toolu_error",
                name: "read",
                input: { path: "missing.txt" },
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_ok",
                content: "hello",
              },
              {
                type: "tool_result",
                tool_use_id: "toolu_error",
                content: "ENOENT: no such file",
                is_error: true,
              },
            ],
          },
        ],
      })
    );

    expect(result.status).toBe("parsed");
    if (result.status === "parsed") {
      const assistant = result.thread.context?.messages?.[1];
      expect(assistant?.role).toBe("assistant");
      if (assistant?.role === "assistant") {
        expect(assistant.toolCalls?.[0]?.output).toEqual({
          content: [{ type: "text", text: "hello" }],
        });
        expect(assistant.toolCalls?.[1]?.output).toEqual({
          content: [{ type: "text", text: "ENOENT: no such file" }],
          isError: true,
        });
      }
    }
  });
});
