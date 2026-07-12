import { describe, expect, test } from "bun:test";

import {
  createShutdownCoordinator,
  type BeforeQuitEvent,
} from "./shutdown-coordinator";

describe("createShutdownCoordinator", () => {
  test("cancels quit until asynchronous cleanup completes", async () => {
    let finishStop: (() => void) | undefined;
    const stop = new Promise<void>((resolve) => {
      finishStop = resolve;
    });
    const events: string[] = [];
    const handleBeforeQuit = createShutdownCoordinator({
      quit: () => events.push("quit"),
      stop: () => {
        events.push("stop");
        return stop;
      },
    });
    const firstQuit: BeforeQuitEvent = {};

    handleBeforeQuit(firstQuit);
    expect(firstQuit.response).toEqual({ allow: false });
    expect(events).toEqual(["stop"]);

    finishStop?.();
    await stop;
    await Promise.resolve();
    expect(events).toEqual(["stop", "quit"]);

    const secondQuit: BeforeQuitEvent = {};
    handleBeforeQuit(secondQuit);
    expect(secondQuit.response).toBeUndefined();
  });

  test("prevents repeated quits during cleanup and exits after an error", async () => {
    const errors: string[] = [];
    const events: string[] = [];
    const handleBeforeQuit = createShutdownCoordinator({
      quit: () => events.push("quit"),
      stop: () => {
        events.push("stop");
        return Promise.reject(new Error("cleanup failed"));
      },
      onStopError: (error) => errors.push(error.message),
    });
    const firstQuit: BeforeQuitEvent = {};
    const repeatedQuit: BeforeQuitEvent = {};

    handleBeforeQuit(firstQuit);
    handleBeforeQuit(repeatedQuit);
    expect(firstQuit.response).toEqual({ allow: false });
    expect(repeatedQuit.response).toEqual({ allow: false });

    await Promise.resolve();
    await Promise.resolve();
    expect(events).toEqual(["stop", "quit"]);
    expect(errors).toEqual(["cleanup failed"]);
  });
});
