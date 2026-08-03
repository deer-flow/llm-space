import { describe, expect, test } from "bun:test";

import type { AgentStreamRequest } from "@llm-space/core";
import type { RuntimeClient } from "@llm-space/runtime/runtime";

import type { StreamThreadResponsePayload } from "@/shared/rpc";

import { RemoteRuntimeClient } from "../remote/remote-runtime-client";

import { forwardStreamThread } from "./stream-thread-request";

const REQUEST: AgentStreamRequest = {
  model: { provider: "test", id: "test" },
  context: { messages: [], tools: [], responseApiNativeTools: [] },
};

function _createRuntime(error: Error): Pick<RuntimeClient, "streamThread"> {
  return { streamThread: () => Promise.reject(error) };
}

describe("forwardStreamThread", () => {
  test("emits a terminal error when runtime lookup fails", async () => {
    const responses: StreamThreadResponsePayload[] = [];
    await forwardStreamThread(
      () => {
        throw new Error("Runtime not found: remote:stale");
      },
      { streamId: "stream-1", request: REQUEST },
      (message) => responses.push(message)
    );

    expect(responses).toEqual([
      {
        streamId: "stream-1",
        type: "error",
        message: "Runtime not found: remote:stale",
      },
    ]);
  });

  test.each([
    ["network rejection", new Error("fetch failed")],
    ["malformed SSE JSON", new SyntaxError("Unexpected token '<'")],
  ])("emits one terminal error for a %s", async (_kind, error) => {
    const responses: StreamThreadResponsePayload[] = [];
    await forwardStreamThread(
      () => _createRuntime(error) as RuntimeClient,
      { streamId: "stream-1", request: REQUEST },
      (message) => responses.push(message)
    );

    expect(responses).toEqual([
      { streamId: "stream-1", type: "error", message: error.message },
    ]);
  });

  test("emits an error when a remote stream ends before done", async () => {
    const responses: StreamThreadResponsePayload[] = [];
    await _withLiveSseServer(
      async ({ baseUrl, closeStream, streamStarted }) => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl,
          token: "secret",
        });
        const completion = forwardStreamThread(
          () => client,
          { streamId: "stream-1", request: REQUEST },
          (message) => responses.push(message)
        );
        await streamStarted;

        closeStream();
        await completion;
      }
    );

    expect(responses).toEqual([
      {
        streamId: "stream-1",
        type: "error",
        message: "Remote runtime stream ended before [DONE].",
      },
    ]);
  });

  test("aborts a live remote stream without emitting a response", async () => {
    const responses: StreamThreadResponsePayload[] = [];
    await _withLiveSseServer(
      async ({ baseUrl, closeStream, streamStarted }) => {
        const client = new RemoteRuntimeClient({
          id: "remote:test",
          name: "Test Remote",
          baseUrl,
          token: "secret",
        });
        const completion = forwardStreamThread(
          () => client,
          { streamId: "stream-1", request: REQUEST },
          (message) => responses.push(message)
        );
        await streamStarted;

        client.abortStream({ streamId: "stream-1" });
        try {
          await _withTimeout(completion, 500);
        } finally {
          closeStream();
          await completion;
        }
      }
    );

    expect(responses).toEqual([]);
  });
});

interface LiveSseServer {
  baseUrl: string;
  closeStream: () => void;
  streamStarted: Promise<void>;
}

async function _withLiveSseServer(
  run: (server: LiveSseServer) => Promise<void>
): Promise<void> {
  let closeStream = () => undefined;
  let markStreamStarted: () => void = () => undefined;
  const streamStarted = new Promise<void>((resolve) => {
    markStreamStarted = resolve;
  });
  const server = Bun.serve({
    port: 0,
    fetch() {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: [START]\n\n"));
          closeStream = () => {
            try {
              controller.close();
            } catch {
              // The client abort can close the server-side body first.
            }
          };
          markStreamStarted();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    },
  });
  try {
    await run({
      baseUrl: `http://127.0.0.1:${server.port}`,
      closeStream: () => closeStream(),
      streamStarted,
    });
  } finally {
    closeStream();
    await server.stop(true);
  }
}

async function _withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Timed out waiting for live stream abort")),
          timeoutMs
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
