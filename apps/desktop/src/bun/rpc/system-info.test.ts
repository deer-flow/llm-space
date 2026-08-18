import { describe, expect, test } from "bun:test";

import { readSystemInfo } from "./system-info";

describe("readSystemInfo", () => {
  test("returns the local total physical memory as an integer", () => {
    expect(readSystemInfo(() => 32 * 2 ** 30 + 0.75)).toEqual({
      totalMemoryBytes: 32 * 2 ** 30,
    });
  });

  test("normalizes an invalid host reading to zero", () => {
    expect(readSystemInfo(() => Number.NaN)).toEqual({
      totalMemoryBytes: 0,
    });
  });
});
