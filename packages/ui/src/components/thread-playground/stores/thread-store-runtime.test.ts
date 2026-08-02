import { describe, expect, test } from "bun:test";

import type { Thread } from "@llm-space/core";

import { createThreadStore } from "./thread-store";

const EMPTY_THREAD: Thread = { context: { messages: [] } };

describe("thread runtime ownership", () => {
  test.each(["local", "remote:auxiliary-generation"])(
    "captures the owning %s runtime in store state",
    (runtimeId) => {
      const store = createThreadStore(EMPTY_THREAD, { runtimeId });

      expect(store.getState().runtimeId).toBe(runtimeId);
    }
  );

  test("does not follow a changed options object after creation", () => {
    const options: { runtimeId?: string } = {
      runtimeId: "remote:auxiliary-generation",
    };
    const store = createThreadStore(EMPTY_THREAD, options);

    options.runtimeId = "local";

    expect(store.getState().runtimeId).toBe("remote:auxiliary-generation");
  });
});
