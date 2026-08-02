import { expect, test } from "bun:test";

import type { AgentStreamRequest } from "../types/agent";

import { createHttpTransport } from "./transport";

test("HTTP transport forwards the selected provider connection profile", async () => {
  const request = {
    model: { provider: "openai", id: "gpt-5" },
    config: {},
    context: { messages: [], tools: [] },
  } as AgentStreamRequest;
  const originalFetch = globalThis.fetch;
  let requestBody: unknown;
  globalThis.fetch = ((_input, init) => {
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    requestBody = JSON.parse(init.body);
    return Promise.resolve(
      new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      })
    );
  }) as typeof fetch;

  try {
    const transport = createHttpTransport("https://runtime.example/stream");
    const result = await transport(request, {
      connection: { providerId: "openai", profileId: "profile-work" },
    })
      [Symbol.asyncIterator]()
      .next();
    expect(result.done).toBe(true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  expect(requestBody).toEqual({
    request,
    connection: { providerId: "openai", profileId: "profile-work" },
  });
});
