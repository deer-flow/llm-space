import { describe, expect, test } from "bun:test";

import * as messageListViewModule from "./message-list-view";

interface ScrollAnchorMeasurement {
  id: string;
  top: number;
  bottom: number;
}

interface ThreadScrollSnapshot {
  messageId: string | null;
  offset: number;
  scrollTop: number;
}

const scrollHelpers = messageListViewModule as unknown as {
  captureThreadScrollSnapshotFromMeasurements?: (
    scrollTop: number,
    viewportTop: number,
    anchors: ScrollAnchorMeasurement[]
  ) => ThreadScrollSnapshot;
  resolveThreadScrollTop?: (
    snapshot: ThreadScrollSnapshot,
    currentScrollTop: number,
    viewportTop: number,
    anchors: ScrollAnchorMeasurement[]
  ) => number;
};

describe("thread message scroll snapshots", () => {
  test("restores the first visible message anchor and falls back to scrollTop", () => {
    expect(
      typeof scrollHelpers.captureThreadScrollSnapshotFromMeasurements
    ).toBe("function");
    expect(typeof scrollHelpers.resolveThreadScrollTop).toBe("function");
    const capture = scrollHelpers.captureThreadScrollSnapshotFromMeasurements;
    const resolve = scrollHelpers.resolveThreadScrollTop;
    if (!capture || !resolve) return;

    const snapshot = capture(640, 100, [
      { id: "above", top: 50, bottom: 90 },
      { id: "visible", top: 96, bottom: 140 },
      { id: "below", top: 160, bottom: 200 },
    ]);

    expect(snapshot).toEqual({
      messageId: "visible",
      offset: -4,
      scrollTop: 640,
    });
    expect(
      resolve(snapshot, 700, 100, [
        { id: "visible", top: 120, bottom: 164 },
      ])
    ).toBe(724);
    expect(resolve(snapshot, 700, 100, [])).toBe(640);
  });
});
