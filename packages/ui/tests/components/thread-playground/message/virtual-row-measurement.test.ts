import { describe, expect, test } from "bun:test";

import { measureVirtualRowHeight } from "../../../../src/components/thread-playground/message/virtual-row-measurement";

describe("measureVirtualRowHeight", () => {
  test("uses layout height instead of a root-transform-scaled client rect", () => {
    const element = {
      offsetHeight: 340,
      getBoundingClientRect: () => ({ height: 374 }),
    } as unknown as HTMLElement;

    expect(measureVirtualRowHeight(element)).toBe(340);
  });

  test("prefers ResizeObserver border-box measurements", () => {
    const element = { offsetHeight: 340 } as HTMLElement;
    const entry = {
      borderBoxSize: [{ blockSize: 340.4 }],
    } as unknown as ResizeObserverEntry;

    expect(measureVirtualRowHeight(element, entry)).toBe(340);
  });
});
