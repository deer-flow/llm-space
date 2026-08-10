import { describe, expect, test } from "bun:test";

import { findCenteredVirtualItemIndex } from "../../../../src/components/thread-playground/message/virtual-item-center";

describe("findCenteredVirtualItemIndex", () => {
  test("uses measured variable-height bounds instead of an estimated row", () => {
    const items = [
      { index: 7, start: 700, end: 760 },
      { index: 8, start: 760, end: 1160 },
      { index: 9, start: 1160, end: 1220 },
    ];

    expect(findCenteredVirtualItemIndex(items, 820, 300)).toBe(8);
    expect(findCenteredVirtualItemIndex(items, 1070, 260)).toBe(9);
  });

  test("returns null without a visible viewport or rendered rows", () => {
    expect(findCenteredVirtualItemIndex([], 0, 100)).toBeNull();
    expect(
      findCenteredVirtualItemIndex([{ index: 1, start: 0, end: 10 }], 0, 0)
    ).toBeNull();
  });
});
