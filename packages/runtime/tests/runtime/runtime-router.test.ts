import { describe, expect, test } from "bun:test";

import { RuntimeRouter } from "../../src/runtime/runtime-router";
import type { RuntimeClient } from "../../src/runtime/types";

function runtime(name: string): RuntimeClient {
  return {
    info: () => ({
      id: name === "Local" ? "local" : "remote:test",
      kind: name === "Local" ? "local" : "remote",
      name,
      status: "connected",
      capabilities: [],
    }),
  } as unknown as RuntimeClient;
}

describe("RuntimeRouter", () => {
  test("uses local as the default runtime", () => {
    const local = runtime("Local");
    const router = new RuntimeRouter(local);
    expect(router.get()).toBe(local);
    expect(router.getDefaultRuntimeId()).toBe("local");
  });

  test("can set a registered remote runtime as default", () => {
    const local = runtime("Local");
    const remote = runtime("Remote");
    const router = new RuntimeRouter(local);
    router.register("remote:test", remote);
    router.setDefaultRuntime("remote:test");
    expect(router.get()).toBe(remote);
    expect(router.get("local")).toBe(local);
  });

  test("rejects missing or default unregisters", () => {
    const router = new RuntimeRouter(runtime("Local"));
    expect(() => router.setDefaultRuntime("remote:missing")).toThrow(
      "Runtime not found"
    );
    expect(() => router.unregister("local")).toThrow(
      "Cannot unregister the local runtime."
    );
    const remote = runtime("Remote");
    router.register("remote:test", remote);
    router.setDefaultRuntime("remote:test");
    expect(() => router.unregister("remote:test")).toThrow(
      "Cannot unregister the default runtime."
    );
  });
});
