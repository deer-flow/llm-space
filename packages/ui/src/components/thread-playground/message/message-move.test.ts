import { describe, expect, test } from "bun:test";

import { resolveMessageMove } from "./message-move";

describe("resolveMessageMove", () => {
  test("maps stable IDs to forward and backward reorder indices", () => {
    const ids = ["a", "b", "c", "d"];
    expect(resolveMessageMove(ids, "a", "c")).toEqual({
      sourceIndex: 0,
      destinationIndex: 2,
    });
    expect(resolveMessageMove(ids, "d", "b")).toEqual({
      sourceIndex: 3,
      destinationIndex: 1,
    });
  });

  test("ignores cancellation, self-drop, and stale virtual rows", () => {
    const ids = ["a", "b"];
    expect(resolveMessageMove(ids, "a", null)).toBeNull();
    expect(resolveMessageMove(ids, "a", "a")).toBeNull();
    expect(resolveMessageMove(ids, "missing", "a")).toBeNull();
    expect(resolveMessageMove(ids, "a", "missing")).toBeNull();
  });
});
