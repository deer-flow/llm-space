import { describe, expect, test } from "bun:test";

import * as messageListViewModule from "../../../../src/components/thread-playground/message/message-list-view";

interface ScrollAnchorMeasurement {
  id: string;
  top: number;
  bottom: number;
}

interface ThreadScrollSnapshot {
  messageId: string;
}

function createFrameHarness() {
  let nextId = 1;
  const frames = new Map<number, FrameRequestCallback>();
  return {
    requestFrame: (callback: FrameRequestCallback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id: number) => {
      frames.delete(id);
    },
    step: () => {
      const pending = [...frames.entries()];
      frames.clear();
      for (const [, callback] of pending) callback(0);
    },
    get pendingCount() {
      return frames.size;
    },
  };
}

const scrollHelpers = messageListViewModule as unknown as {
  NON_VIRTUAL_MESSAGE_LIST_STYLE?: {
    height?: string;
  };
  NON_VIRTUAL_MESSAGE_ROW_STYLE?: {
    left?: string;
    top?: string;
    transform?: string;
  };
  captureThreadScrollSnapshotFromMeasurements?: (
    viewportTop: number,
    viewportBottom: number,
    anchors: ScrollAnchorMeasurement[]
  ) => ThreadScrollSnapshot | null;
  resolveThreadScrollEndDelta?: (
    snapshot: ThreadScrollSnapshot,
    viewportBottom: number,
    anchors: ScrollAnchorMeasurement[]
  ) => number | null;
  resolveThreadScrollSnapshotMessageIndex?: (
    snapshot: ThreadScrollSnapshot,
    messageIds: readonly string[]
  ) => number;
  createThreadScrollRestorationScheduler?: (options: {
    cancelFrame: (handle: number) => void;
    isRestored: () => boolean;
    maxFrames?: number;
    onRestored: () => void;
    requestFrame: (callback: FrameRequestCallback) => number;
    restore: () => void;
  }) => { dispose(): void };
};

describe("thread message scroll snapshots", () => {
  test("clears direct virtualizer layout styles when virtualization turns off", () => {
    expect(scrollHelpers.NON_VIRTUAL_MESSAGE_LIST_STYLE).toEqual({
      height: "auto",
    });
    expect(scrollHelpers.NON_VIRTUAL_MESSAGE_ROW_STYLE).toEqual({
      left: "auto",
      top: "auto",
      transform: "none",
    });
  });

  test("captures the bottom-most visible message and restores its end edge", () => {
    expect(
      typeof scrollHelpers.captureThreadScrollSnapshotFromMeasurements
    ).toBe("function");
    expect(typeof scrollHelpers.resolveThreadScrollEndDelta).toBe("function");
    const capture = scrollHelpers.captureThreadScrollSnapshotFromMeasurements;
    const resolve = scrollHelpers.resolveThreadScrollEndDelta;
    if (!capture || !resolve) return;

    const snapshot = capture(100, 200, [
      { id: "above", top: 50, bottom: 90 },
      { id: "visible", top: 96, bottom: 140 },
      { id: "bottom-visible", top: 160, bottom: 240 },
      { id: "below", top: 240, bottom: 280 },
    ]);

    expect(snapshot).toEqual({ messageId: "bottom-visible" });
    if (!snapshot) return;
    expect(
      resolve(snapshot, 200, [
        { id: "bottom-visible", top: 180, bottom: 260 },
      ])
    ).toBe(60);
    expect(resolve(snapshot, 200, [])).toBeNull();
  });

  test("returns no snapshot when no message intersects the viewport", () => {
    const capture = scrollHelpers.captureThreadScrollSnapshotFromMeasurements;
    if (!capture) return;

    expect(
      capture(100, 200, [
        { id: "above", top: 20, bottom: 80 },
        { id: "below", top: 220, bottom: 260 },
      ])
    ).toBeNull();
  });

  test("resolves the saved ID against the latest message order", () => {
    const resolveIndex =
      scrollHelpers.resolveThreadScrollSnapshotMessageIndex;
    expect(typeof resolveIndex).toBe("function");
    if (!resolveIndex) return;

    const snapshot = { messageId: "saved" };
    expect(resolveIndex(snapshot, ["before", "saved", "after"])).toBe(1);
    expect(
      resolveIndex(snapshot, ["new-1", "new-2", "before", "saved", "after"])
    ).toBe(3);
    expect(resolveIndex(snapshot, ["before", "after"])).toBe(-1);
  });

  test("retries a reset restoration and consumes it only after two stable frames", () => {
    const createScheduler =
      scrollHelpers.createThreadScrollRestorationScheduler;
    expect(typeof createScheduler).toBe("function");
    if (!createScheduler) return;

    const frames = createFrameHarness();
    let restored = false;
    let restoreCount = 0;
    let settledCount = 0;
    createScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      isRestored: () => restored,
      restore: () => {
        restoreCount += 1;
      },
      onRestored: () => {
        settledCount += 1;
      },
    });

    frames.step();
    expect(restoreCount).toBe(1);
    expect(settledCount).toBe(0);

    restored = true;
    frames.step();
    expect(settledCount).toBe(0);

    restored = false;
    frames.step();
    expect(restoreCount).toBe(2);
    expect(settledCount).toBe(0);

    restored = true;
    frames.step();
    frames.step();
    expect(settledCount).toBe(1);
    expect(frames.pendingCount).toBe(0);
  });

  test("stops retrying when restoration never becomes possible", () => {
    const createScheduler =
      scrollHelpers.createThreadScrollRestorationScheduler;
    if (!createScheduler) return;

    const frames = createFrameHarness();
    let restoreCount = 0;
    createScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      isRestored: () => false,
      restore: () => {
        restoreCount += 1;
      },
      onRestored: () => {
        throw new Error("an impossible restoration must not settle");
      },
      maxFrames: 3,
    });

    frames.step();
    frames.step();
    frames.step();
    expect(restoreCount).toBe(3);
    expect(frames.pendingCount).toBe(0);
  });
});
