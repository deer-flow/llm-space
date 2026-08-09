import { describe, expect, test } from "bun:test";

import { outputTokensPerSecond } from "../../src/thread/response-performance";
import type { ModelUsage } from "../../src/types";


const USAGE: ModelUsage = {
  input: 350,
  output: 1133,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 1483,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
};

describe("outputTokensPerSecond", () => {
  test("excludes time to first token from the throughput window", () => {
    expect(
      outputTokensPerSecond(USAGE, {
        firstTokenMs: 500,
        durationMs: 2500,
      })
    ).toBeCloseTo(566.5);
  });

  test("omits throughput without a positive post-first-token window", () => {
    expect(outputTokensPerSecond(USAGE, { durationMs: 2500 })).toBeNull();
    expect(
      outputTokensPerSecond(USAGE, {
        firstTokenMs: 2500,
        durationMs: 2500,
      })
    ).toBeNull();
  });
});
