import { describe, expect, test } from "bun:test";

import type { ModelUsage, ThreadSnapshot } from "../types";

import {
  addModelUsage,
  emptyModelUsage,
  isModelUsage,
  usageForRun,
} from "./usage";

const BASE_USAGE: ModelUsage = {
  input: 10,
  output: 5,
  cacheRead: 2,
  cacheWrite: 1,
  totalTokens: 18,
  cost: {
    input: 0.1,
    output: 0.2,
    cacheRead: 0.01,
    cacheWrite: 0.02,
    total: 0.33,
  },
};

describe("model usage compatibility", () => {
  test("rejects malformed persisted usage", () => {
    expect(isModelUsage(BASE_USAGE)).toBe(true);
    expect(isModelUsage({ ...BASE_USAGE, input: -1 })).toBe(false);
    expect(isModelUsage({ ...BASE_USAGE, cost: { total: 1 } })).toBe(false);
    expect(isModelUsage({ ...BASE_USAGE, reasoning: Number.NaN })).toBe(false);
  });

  test("adds provider usage without mutating either input", () => {
    const left = structuredClone(BASE_USAGE);
    const right: ModelUsage = {
      ...BASE_USAGE,
      input: 1,
      output: 2,
      reasoning: 3,
      totalTokens: 0,
    };
    const total = addModelUsage(left, right);

    expect(total).toMatchObject({
      input: 11,
      output: 7,
      cacheRead: 4,
      cacheWrite: 2,
      reasoning: 3,
      totalTokens: 24,
      cost: { total: 0.66 },
    });
    expect(left).toEqual(BASE_USAGE);
  });

  test("falls back only for legacy runs without a usage field", () => {
    const thread: ThreadSnapshot = {
      context: {
        messages: [
          {
            id: "assistant-1",
            role: "assistant",
            content: [{ type: "text", text: "Done" }],
            usage: BASE_USAGE,
          },
        ],
      },
    };

    expect(usageForRun({ thread })).toEqual(BASE_USAGE);
    expect(usageForRun({ thread, usage: emptyModelUsage() })).toBeNull();
  });
});
