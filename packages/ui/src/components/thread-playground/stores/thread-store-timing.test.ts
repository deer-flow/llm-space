import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { AgentEvent, AgentTransport } from "@llm-space/core";

import { createThreadStore } from "./thread-store";

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

beforeAll(() => {
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(performance.now()), 0) as unknown as number;
  globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  globalThis.cancelAnimationFrame = originalCancelAnimationFrame;
});

function _event(value: unknown): AgentEvent {
  return value as AgentEvent;
}

describe("assistant message timing", () => {
  test("records first non-empty model delta and completed duration", async () => {
    const events = [
      _event({
        type: "message_start",
        message: { role: "assistant" },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: { type: "text_start", contentIndex: 0 },
      }),
      _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Hello",
        },
      }),
      _event({
        type: "message_end",
        message: { role: "assistant" },
      }),
    ];
    const transport: AgentTransport = async function* () {
      yield* events;
    };
    const clock = [100, 350, 600, 900, 1600];
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-1",
              role: "user",
              content: [{ type: "text", text: "Hi" }],
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
        now: () => clock.shift() ?? 1600,
      }
    );

    await store.getState().run();

    const messages = store.getState().thread.context?.messages ?? [];
    const assistant = messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    if (assistant?.role !== "assistant") {
      throw new Error("Expected an assistant message");
    }
    expect(assistant.timing).toEqual({
      firstTokenMs: 800,
      durationMs: 1500,
    });
    const savedRun = store.getState().runHistory[0];
    if (!savedRun?.thread) throw new Error("Expected inline run snapshot");
    expect(savedRun.thread.context?.messages?.at(-1)).toEqual(assistant);
  });

  test("archives a completed run before publishing idle state", async () => {
    const transport: AgentTransport = async function* () {
      yield _event({ type: "message_start", message: { role: "assistant" } });
      yield _event({
        type: "message_update",
        assistantMessageEvent: { type: "text_start", contentIndex: 0 },
      });
      yield _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Archived",
        },
      });
      yield _event({ type: "message_end", message: { role: "assistant" } });
    };
    const observedStatuses: string[] = [];
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-archive",
              role: "user",
              content: [{ type: "text", text: "Archive this" }],
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
        archiveRunSnapshot: async (run) => {
          observedStatuses.push(store.getState().status);
          return {
            id: run.id,
            timestamp: run.timestamp,
            usage: run.usage,
            snapshotRef: `${"a".repeat(64)}.json`,
            preview: {
              summary: "Archived",
              modelLabel: "test/test",
              messageCountLabel: "2 messages",
            },
          };
        },
      }
    );

    await store.getState().run();

    expect(observedStatuses).toEqual(["running"]);
    expect(store.getState().status).toBe("idle");
    expect(store.getState().runHistory[0]).toMatchObject({
      snapshotRef: `${"a".repeat(64)}.json`,
    });
    expect(store.getState().thread.runHistory).toBeUndefined();
    expect(store.getState().thread.runHistoryVersion).toBe(2);
  });

  test("keeps the complete inline snapshot when archival fails", async () => {
    const transport: AgentTransport = async function* () {
      yield _event({ type: "message_start", message: { role: "assistant" } });
      yield _event({
        type: "message_update",
        assistantMessageEvent: { type: "text_start", contentIndex: 0 },
      });
      yield _event({
        type: "message_update",
        assistantMessageEvent: {
          type: "text_delta",
          contentIndex: 0,
          delta: "Fallback",
        },
      });
      yield _event({ type: "message_end", message: { role: "assistant" } });
    };
    const store = createThreadStore(
      {
        context: {
          messages: [
            {
              id: "user-fallback",
              role: "user",
              content: [{ type: "text", text: "Keep this" }],
            },
          ],
        },
      },
      {
        transport,
        resolveModel: () => ({ provider: "test", id: "test" }),
        archiveRunSnapshot: () => Promise.reject(new Error("Disk unavailable")),
      }
    );

    await store.getState().run();

    const run = store.getState().runHistory[0];
    expect(run?.thread?.context?.messages).toHaveLength(2);
    expect(store.getState().thread.runHistory?.[0]?.thread).toEqual(
      run?.thread
    );
    expect(store.getState().status).toBe("idle");
  });
});
