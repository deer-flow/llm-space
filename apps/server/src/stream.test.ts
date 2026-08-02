import { expect, test } from "bun:test";

import type { AgentStreamRequest } from "@llm-space/core";
import type {
  RuntimeClient,
  RuntimeStreamRequestPayload,
} from "@llm-space/runtime/runtime";

import { createStreamResponse } from "./stream";

test("stream endpoint forwards the provider connection to the runtime", async () => {
  const request = {
    model: { provider: "openai", id: "gpt-5" },
    context: { messages: [], tools: [] },
  } as AgentStreamRequest;
  let received: RuntimeStreamRequestPayload | undefined;
  const runtime = {
    streamThread: (payload: RuntimeStreamRequestPayload) => {
      received = payload;
      return Promise.resolve();
    },
  } as unknown as RuntimeClient;

  const response = createStreamResponse(runtime, {
    request,
    connection: { providerId: "openai", profileId: "profile-work" },
  });
  await response.text();

  expect(received).toMatchObject({
    request,
    connection: { providerId: "openai", profileId: "profile-work" },
  });
});
