import { describe, expect, test } from "bun:test";

import { createHttpFetchHandler } from "./http-server";
import type { ServerRuntimeContext } from "./runtime-factory";

function _runtime(): ServerRuntimeContext {
  return {
    runtime: {
      info: () => ({
        id: "local",
        kind: "local",
        name: "Test",
        status: "connected",
        capabilities: [],
      }),
    } as unknown as ServerRuntimeContext["runtime"],
    homePath: "/tmp/llm-space-test",
    workspacePath: "/tmp/llm-space-test/workspace",
    stop: () => Promise.resolve(),
  };
}

describe("createHttpFetchHandler", () => {
  test("accepts authenticated shutdown requests", async () => {
    let shutdowns = 0;
    const fetchHandler = createHttpFetchHandler({
      host: "127.0.0.1",
      port: 39123,
      token: "secret",
      runtime: _runtime(),
      version: "0.0.0-test",
      onShutdown: () => {
        shutdowns += 1;
      },
    });

    const response = await fetchHandler(
      new Request("http://127.0.0.1:39123/shutdown", {
        method: "POST",
        headers: { Authorization: "Bearer secret" },
      })
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(shutdowns).toBe(1);
  });
});
