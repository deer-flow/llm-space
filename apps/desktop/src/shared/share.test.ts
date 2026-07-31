import { describe, expect, test } from "bun:test";

import { buildShareThreadCommand } from "./share";

describe("buildShareThreadCommand", () => {
  test("keeps the remote owner beside the path", () => {
    expect(
      buildShareThreadCommand("threads/same.json", "remote:server-1")
    ).toEqual({
      type: "shareThread",
      args: {
        path: "threads/same.json",
        runtimeId: "remote:server-1",
      },
    });
  });

  test("keeps explicit local ownership", () => {
    expect(buildShareThreadCommand("threads/local.json", "local")).toEqual({
      type: "shareThread",
      args: { path: "threads/local.json", runtimeId: "local" },
    });
  });
});
