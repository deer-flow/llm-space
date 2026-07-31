import { beforeEach, describe, expect, mock, test } from "bun:test";

import type { Thread } from "@llm-space/core";

const READS: { runtimeId?: string; path: string }[] = [];
const SHARES: {
  runtimeId?: string;
  path: string;
  title?: string;
  description?: string;
}[] = [];

const RPC = {
  request: {
    fsRead: (input: { runtimeId?: string; path: string }) => {
      READS.push(input);
      if (input.runtimeId === "remote:alpha") {
        return Promise.resolve({
          title: "Remote title",
          context: { systemPrompt: "REMOTE CONTENT" },
        } satisfies Thread);
      }
      if (input.path === "remote-only.json") {
        return Promise.reject(new Error("File not found: remote-only.json"));
      }
      return Promise.resolve({
        title: "Local title",
        context: { systemPrompt: "LOCAL CONTENT" },
      } satisfies Thread);
    },
    shareThread: (input: {
      runtimeId?: string;
      path: string;
      title?: string;
      description?: string;
    }) => {
      SHARES.push(input);
      return Promise.resolve({
        shareUrl: "https://example.test/shared",
        gistId: "gist-1",
      });
    },
  },
};

await mock.module("@/lib/electrobun", () => ({
  electrobun: { rpc: RPC },
}));

const { readShareThread, shareThread } = await import("./share");

describe("share client runtime scope", () => {
  beforeEach(() => {
    READS.length = 0;
    SHARES.length = 0;
  });

  test("reads the selected remote thread for title prefill at a colliding path", async () => {
    const remote = await readShareThread("remote:alpha", "threads/same.json");

    expect(remote).toMatchObject({
      title: "Remote title",
      context: { systemPrompt: "REMOTE CONTENT" },
    });
    expect(READS).toEqual([
      { runtimeId: "remote:alpha", path: "threads/same.json" },
    ]);
  });

  test("reads a remote-only path without a local fallback", async () => {
    const remote = await readShareThread("remote:alpha", "remote-only.json");

    expect(remote.title).toBe("Remote title");
    expect(READS).toEqual([
      { runtimeId: "remote:alpha", path: "remote-only.json" },
    ]);
  });

  test("preserves explicit local title reads", async () => {
    const local = await readShareThread("local", "threads/same.json");

    expect(local.title).toBe("Local title");
    expect(READS).toEqual([{ runtimeId: "local", path: "threads/same.json" }]);
  });

  test("sends runtime ownership in the final share RPC request", async () => {
    await shareThread("remote:alpha", "threads/same.json", {
      title: "Shared remote title",
      description: "Remote description",
    });

    expect(SHARES).toEqual([
      {
        runtimeId: "remote:alpha",
        path: "threads/same.json",
        title: "Shared remote title",
        description: "Remote description",
      },
    ]);
  });
});
