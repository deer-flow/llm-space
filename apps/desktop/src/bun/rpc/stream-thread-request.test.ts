import { describe, expect, test } from "bun:test";

import type { AgentStreamRequest } from "@llm-space/core";
import type { RuntimeClient } from "@llm-space/runtime/runtime";

import type {
  StreamThreadResponsePayload,
} from "@/shared/rpc";

import { forwardStreamThread } from "./stream-thread-request";

const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test" },
  context: { messages: [], tools: [] },
};

function _createRuntime(error: Error): Pick<RuntimeClient, "streamThread"> {
  return { streamThread: () => Promise.reject(error) };
}

describe("forwardStreamThread", () => {
  test.each([
    ["network rejection", new Error("fetch failed")],
    ["malformed SSE JSON", new SyntaxError("Unexpected token '<'")],
  ])("emits one terminal error for a %s", async (_kind, error) => {
    const responses: StreamThreadResponsePayload[] = [];
    await forwardStreamThread(
      _createRuntime(error) as RuntimeClient,
      { streamId: "stream-1", request: REQUEST },
      (message) => responses.push(message)
    );

    expect(responses).toEqual([
      { streamId: "stream-1", type: "error", message: error.message },
    ]);
  });

  test("does not emit an error for an explicit abort", async () => {
    const responses: StreamThreadResponsePayload[] = [];
    await forwardStreamThread(
      _createRuntime(new DOMException("Aborted", "AbortError")) as RuntimeClient,
      { streamId: "stream-1", request: REQUEST },
      (message) => responses.push(message)
    );

    expect(responses).toEqual([]);
  });
});
