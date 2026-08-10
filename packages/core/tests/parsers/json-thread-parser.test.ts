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
});
