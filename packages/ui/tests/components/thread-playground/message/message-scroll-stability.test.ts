import { describe, expect, test } from "bun:test";

import { preserveScrollOffsetAfterLayout } from "../../../../src/components/thread-playground/message/message-scroll-stability";

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
