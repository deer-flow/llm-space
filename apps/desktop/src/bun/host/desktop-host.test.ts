import { describe, expect, test } from "bun:test";

import { DesktopHost } from "./desktop-host";

describe("DesktopHost", () => {
  test("registers and starts modules before stopping them in reverse order", async () => {
    const events: string[] = [];
    const host = new DesktopHost({
      modules: [
        {
          id: "fixture.first",
          register: () => events.push("register:first"),
          start: () => {
            events.push("start:first");
            return () => {
              events.push("stop:first");
            };
          },
        },
        {
          id: "fixture.second",
          register: () => events.push("register:second"),
          start: () => {
            events.push("start:second");
            return () => {
              events.push("stop:second");
            };
          },
        },
      ],
    });

    await host.start();
    await host.stop();

    expect(events).toEqual([
      "register:first",
      "register:second",
      "start:first",
      "start:second",
      "stop:second",
      "stop:first",
    ]);
  });

  test("rejects duplicate module ids before registration", async () => {
    const events: string[] = [];
    const host = new DesktopHost({
      modules: [
        { id: "fixture.duplicate", register: () => events.push("first") },
        { id: "fixture.duplicate", register: () => events.push("second") },
      ],
    });

    expect((await _rejectionOf(host.start())).message).toBe(
      'Duplicate desktop module id "fixture.duplicate".'
    );
    expect(events).toEqual([]);
  });

  test("reports the failing module and cleans up prior starts", async () => {
    const events: string[] = [];
    const host = new DesktopHost({
      modules: [
        {
          id: "fixture.first",
          register: () => undefined,
          start: () => () => {
            events.push("stop:first");
          },
        },
        {
          id: "fixture.second",
          register: () => undefined,
          start: () => {
            throw new Error("boom");
          },
        },
      ],
    });

    expect((await _rejectionOf(host.start())).message).toBe(
      'Failed to start desktop module "fixture.second": boom'
    );
    expect(events).toEqual(["stop:first"]);
  });

  test("reports cleanup failures and continues stopping other modules", async () => {
    const events: string[] = [];
    const errors: string[] = [];
    const host = new DesktopHost({
      modules: [
        {
          id: "fixture.first",
          register: () => undefined,
          start: () => () => {
            events.push("stop:first");
          },
        },
        {
          id: "fixture.second",
          register: () => undefined,
          start: () => () => {
            events.push("stop:second");
            throw new Error("cleanup failed");
          },
        },
      ],
      onShutdownError: (moduleId, error) =>
        errors.push(`${moduleId}:${error.message}`),
    });

    await host.start();
    await host.stop();

    expect(events).toEqual(["stop:second", "stop:first"]);
    expect(errors).toEqual(["fixture.second:cleanup failed"]);
  });

  test("reports the module that fails registration", async () => {
    const host = new DesktopHost({
      modules: [
        {
          id: "fixture.broken",
          register: () => {
            throw new Error("bad contribution");
          },
        },
      ],
    });

    expect((await _rejectionOf(host.start())).message).toBe(
      'Failed to register desktop module "fixture.broken": bad contribution'
    );
  });

  test("can restart without registering contributions twice", async () => {
    const events: string[] = [];
    const host = new DesktopHost({
      modules: [
        {
          id: "fixture.restartable",
          register: () => events.push("register"),
          start: () => {
            events.push("start");
            return () => {
              events.push("stop");
            };
          },
        },
      ],
    });

    await host.start();
    await host.stop();
    await host.start();
    await host.stop();

    expect(events).toEqual(["register", "start", "stop", "start", "stop"]);
  });
});

async function _rejectionOf(promise: Promise<void>): Promise<Error> {
  let rejection: unknown;
  try {
    await promise;
  } catch (error) {
    rejection = error;
  }
  if (!(rejection instanceof Error)) {
    throw new Error("Expected promise to reject with an Error.");
  }
  return rejection;
}
