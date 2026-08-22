import { describe, expect, test } from "bun:test";

import {
  followMessageViewportBottom,
  preserveScrollOffsetAfterLayout,
} from "../../../../src/components/thread-playground/message/message-scroll-stability";

class FakeViewport extends EventTarget {
  clientHeight = 200;
  scrollHeight = 1_000;
  private _scrollTop = 0;

  get scrollTop() {
    return this._scrollTop;
  }

  set scrollTop(value: number) {
    this._scrollTop = Math.max(
      0,
      Math.min(value, this.scrollHeight - this.clientHeight)
    );
  }
}

function _bottomFollowerHarness() {
  const viewport = new FakeViewport();
  const content = new EventTarget();
  const frames: FrameRequestCallback[] = [];
  const canceledFrames: number[] = [];
  let disconnected = false;
  let observed = false;
  let resize: ResizeObserverCallback = () => undefined;
  const cleanup = followMessageViewportBottom(
    viewport as unknown as HTMLElement,
    content as unknown as HTMLElement,
    {
      cancelFrame: (frameId) => canceledFrames.push(frameId),
      createResizeObserver: (callback) => {
        resize = callback;
        return {
          disconnect() {
            disconnected = true;
          },
          observe() {
            observed = true;
          },
        };
      },
      scheduleFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
    }
  );
  return {
    canceledFrames,
    cleanup,
    frames,
    resize,
    viewport,
    wasDisconnected: () => disconnected,
    wasObserved: () => observed,
  };
}

describe("followMessageViewportBottom", () => {
  test("keeps following streaming content growth after the run starts", () => {
    const { cleanup, frames, resize, viewport } = _bottomFollowerHarness();

    expect(viewport.scrollTop).toBe(800);
    viewport.scrollHeight = 1_200;
    resize([], {} as ResizeObserver);
    frames.shift()?.(0);

    expect(viewport.scrollTop).toBe(1_000);
    cleanup();
  });

  test("pauses on upward scrolling and resumes when the user returns", () => {
    const { cleanup, frames, resize, viewport } = _bottomFollowerHarness();

    viewport.scrollTop = 600;
    viewport.dispatchEvent(new Event("scroll"));
    viewport.scrollHeight = 1_200;
    resize([], {} as ResizeObserver);
    frames.shift()?.(0);
    expect(viewport.scrollTop).toBe(600);

    viewport.scrollTop = 1_000;
    viewport.dispatchEvent(new Event("scroll"));
    viewport.scrollHeight = 1_400;
    resize([], {} as ResizeObserver);
    frames.shift()?.(16);
    expect(viewport.scrollTop).toBe(1_200);
    cleanup();
  });

  test("cancels a pending follow-up when the run ends", () => {
    const {
      canceledFrames,
      cleanup,
      resize,
      wasDisconnected,
      wasObserved,
    } = _bottomFollowerHarness();

    expect(wasObserved()).toBe(true);
    resize([], {} as ResizeObserver);
    cleanup();

    expect(canceledFrames).toEqual([1]);
    expect(wasDisconnected()).toBe(true);
  });
});

describe("preserveScrollOffsetAfterLayout", () => {
  test("restores the pre-update offset across two layout frames", () => {
    const viewport = { scrollTop: 480 };
    const frames: FrameRequestCallback[] = [];
    const scheduleFrame = (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    };

    preserveScrollOffsetAfterLayout(
      viewport,
      () => {
        viewport.scrollTop = 720;
      },
      scheduleFrame
    );

    expect(viewport.scrollTop).toBe(720);
    expect(frames).toHaveLength(1);

    frames.shift()?.(0);
    expect(viewport.scrollTop).toBe(480);
    expect(frames).toHaveLength(1);

    viewport.scrollTop = 610;
    frames.shift()?.(16);
    expect(viewport.scrollTop).toBe(480);
  });

  test("still performs the update without a mounted viewport", () => {
    let updated = false;

    preserveScrollOffsetAfterLayout(null, () => {
      updated = true;
    });

    expect(updated).toBe(true);
  });
});
