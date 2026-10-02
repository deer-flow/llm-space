import { describe, expect, test } from "bun:test";

import {
  createMessageAnchorTrackingScheduler,
  findClosestMessageRowIndex,
  findMessageRowIndexFromHitElements,
  getViewportCenterProbeYs,
} from "../../../../src/components/thread-playground/message/message-anchor-tracking";

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

describe("message anchor resolution", () => {
  test("finds the row containing viewport center and otherwise the nearest edge", () => {
    expect(
      findClosestMessageRowIndex(150, [
        { index: 2, top: 100, bottom: 180 },
        { index: 3, top: 220, bottom: 300 },
      ])
    ).toBe(2);
    expect(
      findClosestMessageRowIndex(210, [
        { index: 2, top: 100, bottom: 180 },
        { index: 3, top: 220, bottom: 300 },
      ])
    ).toBe(3);
  });

  test("preserves the earlier-row tie behavior", () => {
    expect(
      findClosestMessageRowIndex(200, [
        { index: 4, top: 100, bottom: 180 },
        { index: 5, top: 220, bottom: 300 },
      ])
    ).toBe(4);
  });

  test("resolves an owned message row from a center-point hit path", () => {
    const ownedRow = {
      dataset: { messageRowIndex: "7" },
    } as unknown as HTMLElement;
    const foreignRow = {
      dataset: { messageRowIndex: "8" },
    } as unknown as HTMLElement;
    const child = {
      closest: () => ownedRow,
    } as unknown as Element;
    const foreignChild = {
      closest: () => foreignRow,
    } as unknown as Element;
    const content = {
      contains: (element: Element) => element === ownedRow,
    } as unknown as HTMLElement;

    expect(
      findMessageRowIndexFromHitElements(
        [foreignChild, child],
        content
      )
    ).toBe(7);
  });

  test("probes symmetrically around the viewport center without leaving it", () => {
    expect(getViewportCenterProbeYs(100, 200, 16)).toEqual([
      200, 184, 216, 168, 232,
    ]);
    expect(getViewportCenterProbeYs(0, 20, 16)).toEqual([10]);
  });
});

describe("message anchor tracking scheduler", () => {
  test("updates progressively at most every two frames and settles exactly", () => {
    const frames = createFrameHarness();
    let signature = 0;
    let progressiveIndex = 1;
    let exactIndex = 2;
    const updates: { exact: boolean; index: number | null }[] = [];
    const scheduler = createMessageAnchorTrackingScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      readViewportSignature: () => signature,
      readProgressiveIndex: () => progressiveIndex,
      readExactIndex: () => exactIndex,
      onIndex: (index, exact) => updates.push({ exact, index }),
    });

    scheduler.notifyViewportChange();
    signature = 1;
    frames.step();
    scheduler.notifyViewportChange();
    signature = 2;
    frames.step();
    scheduler.notifyViewportChange();
    signature = 3;
    progressiveIndex = 3;
    frames.step();

    expect(updates).toEqual([
      { exact: false, index: 1 },
      { exact: false, index: 3 },
    ]);

    frames.step();
    exactIndex = 4;
    frames.step();

    expect(updates.at(-1)).toEqual({ exact: true, index: 4 });
    expect(frames.pendingCount).toBe(0);
  });

  test("coalesces an idle viewport change and cancels pending work", () => {
    const frames = createFrameHarness();
    const updates: { exact: boolean; index: number | null }[] = [];
    const scheduler = createMessageAnchorTrackingScheduler({
      requestFrame: frames.requestFrame,
      cancelFrame: frames.cancelFrame,
      readViewportSignature: () => "stable",
      readProgressiveIndex: () => 5,
      readExactIndex: () => 5,
      onIndex: (index, exact) => updates.push({ exact, index }),
    });

    scheduler.notifyViewportChange();
    scheduler.notifyViewportChange();
    expect(frames.pendingCount).toBe(1);
    frames.step();
    expect(updates).toEqual([{ exact: false, index: 5 }]);

    scheduler.dispose();
    expect(frames.pendingCount).toBe(0);
    frames.step();
    expect(updates).toHaveLength(1);
  });
});
