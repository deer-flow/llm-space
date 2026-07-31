import { describe, expect, test } from "bun:test";

import { createShareThreadAction } from "./index";

describe("createShareThreadAction", () => {
  test("keeps a remote playground's owner in its host action", () => {
    expect(
      createShareThreadAction("threads/same.json", "remote:server-1")
    ).toEqual({
      path: "threads/same.json",
      runtimeId: "remote:server-1",
    });
  });

  test("defaults an unscoped legacy playground to local ownership", () => {
    expect(createShareThreadAction("threads/local.json")).toEqual({
      path: "threads/local.json",
      runtimeId: "local",
    });
  });
});
