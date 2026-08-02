import { describe, expect, test } from "bun:test";

import type { RuntimeClient } from "@llm-space/runtime/runtime";

import { createPromptFileRpcHandlers } from "./prompt-files";

function _runtime(
  text: string,
  exists: boolean
): Pick<RuntimeClient, "readTextFile" | "textFileExists"> {
  return {
    readTextFile: () => Promise.resolve(text),
    textFileExists: () => Promise.resolve(exists),
  };
}

describe("desktop prompt-file RPC", () => {
  test("routes reads and existence checks to the requested runtime", async () => {
    const samePath = "/same/path.md";
    const local = _runtime("LOCAL RUNTIME", true);
    const remote = _runtime("REMOTE CONTENT", false);
    const requestedRuntimeIds: (string | undefined)[] = [];
    const requests = createPromptFileRpcHandlers((runtimeId) => {
      requestedRuntimeIds.push(runtimeId);
      return runtimeId === "remote:test" ? remote : local;
    });

    expect(
      await requests.fsReadText({
        runtimeId: "remote:test",
        path: samePath,
      })
    ).toEqual({ text: "REMOTE CONTENT" });
    expect(
      await requests.fsTextFileExists({
        runtimeId: "remote:test",
        path: samePath,
      })
    ).toEqual({ exists: false });
    expect(requestedRuntimeIds).toEqual(["remote:test", "remote:test"]);
  });

  test("rejects an omitted runtime instead of reading from the router default", async () => {
    const requestedRuntimeIds: (string | undefined)[] = [];
    const requests = createPromptFileRpcHandlers((runtimeId) => {
      requestedRuntimeIds.push(runtimeId);
      return _runtime("LOCAL DEFAULT", true);
    });

    let rejection: unknown;
    try {
      await (
        requests.fsReadText as (input: {
          runtimeId?: "local" | `remote:${string}`;
          path: string;
        }) => Promise<{ text: string }>
      )({ path: "/same/path.md" });
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain("runtimeId");
    expect(requestedRuntimeIds).toEqual([]);
  });
});
