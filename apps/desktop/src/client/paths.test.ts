import { beforeEach, describe, expect, mock, test } from "bun:test";

const REQUESTS: { method: string; params: unknown }[] = [];

await mock.module("@/lib/electrobun", () => ({
  electrobun: {
    rpc: {
      request: {
        fsReadText: (params: { path: string; runtimeId?: string }) => {
          REQUESTS.push({ method: "fsReadText", params });
          return Promise.resolve({
            text:
              params.runtimeId === "remote:test"
                ? "REMOTE CONTENT"
                : "LOCAL CONTENT",
          });
        },
        fsTextFileExists: (params: {
          path: string;
          runtimeId?: string;
        }) => {
          REQUESTS.push({ method: "fsTextFileExists", params });
          return Promise.resolve({ exists: params.runtimeId === "remote:test" });
        },
      },
    },
  },
}));

const { readTextFile, textFileExists } = await import("./paths");

describe("runtime-scoped prompt files", () => {
  beforeEach(() => {
    REQUESTS.length = 0;
  });

  test("forwards the owning runtime through desktop RPC", async () => {
    const read = readTextFile as (
      path: string,
      runtimeId?: string
    ) => Promise<string>;
    const exists = textFileExists as (
      path: string,
      runtimeId?: string
    ) => Promise<boolean>;

    expect(await read("/same/path.md", "remote:test")).toBe("REMOTE CONTENT");
    expect(await exists("/remote-only.md", "remote:test")).toBe(true);
    expect(REQUESTS).toEqual([
      {
        method: "fsReadText",
        params: { path: "/same/path.md", runtimeId: "remote:test" },
      },
      {
        method: "fsTextFileExists",
        params: { path: "/remote-only.md", runtimeId: "remote:test" },
      },
    ]);
  });

  test("rejects an omitted owning runtime instead of using a default", async () => {
    let rejection: unknown;
    try {
      await (readTextFile as (path: string, runtimeId?: string) => Promise<string>)(
        "/same/path.md"
      );
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(Error);
    expect((rejection as Error).message).toContain("runtimeId");
    expect(REQUESTS).toEqual([]);
  });
});
