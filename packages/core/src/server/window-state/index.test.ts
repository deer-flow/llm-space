import { describe, expect, test } from "bun:test";

import {
  clampWindowFrameToWorkArea,
  DEFAULT_WINDOW_FRAME,
  getWindowScaleFactor,
  resolveInitialWindowFrame,
} from "./index";

const WORK_AREA = { x: 0, y: 0, width: 3840, height: 2160 };

describe("resolveInitialWindowFrame", () => {
  test("scales the default frame by the current display scale", () => {
    expect(
      resolveInitialWindowFrame({ currentScaleFactor: 2, workArea: WORK_AREA })
    ).toEqual({ x: 160, y: 160, width: 2560, height: 1600 });
  });

  test("is the identity on the default frame at scale 1", () => {
    expect(
      resolveInitialWindowFrame({ currentScaleFactor: 1, workArea: WORK_AREA })
    ).toEqual(DEFAULT_WINDOW_FRAME);
  });

  test("keeps a saved frame untouched when the scale did not change", () => {
    const savedFrame = { x: 101, y: 51, width: 999, height: 601 };
    expect(
      resolveInitialWindowFrame({
        savedFrame,
        savedScaleFactor: 1.5,
        currentScaleFactor: 1.5,
        workArea: WORK_AREA,
      })
    ).toEqual(savedFrame);
  });

  test("rescales a saved frame by currentScale / savedScale", () => {
    expect(
      resolveInitialWindowFrame({
        savedFrame: { x: 150, y: 150, width: 1500, height: 900 },
        savedScaleFactor: 1.5,
        currentScaleFactor: 2,
        workArea: WORK_AREA,
      })
    ).toEqual({ x: 200, y: 200, width: 2000, height: 1200 });
  });

  test("treats a saved frame with no recorded scale as recorded at 1 (pre-scale-tracking builds)", () => {
    expect(
      resolveInitialWindowFrame({
        savedFrame: { x: 80, y: 80, width: 1280, height: 800 },
        currentScaleFactor: 2,
        workArea: WORK_AREA,
      })
    ).toEqual({ x: 160, y: 160, width: 2560, height: 1600 });
  });

  test("clamps the scaled frame into the work area", () => {
    expect(
      resolveInitialWindowFrame({
        currentScaleFactor: 2,
        workArea: { x: 0, y: 0, width: 1920, height: 1080 },
      })
    ).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  test("ignores an all-zero work area (native display info unavailable)", () => {
    expect(
      resolveInitialWindowFrame({
        currentScaleFactor: 2,
        workArea: { x: 0, y: 0, width: 0, height: 0 },
      })
    ).toEqual({ x: 160, y: 160, width: 2560, height: 1600 });
  });

  test("falls back to scale 1 for invalid current scale factors", () => {
    for (const factor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        resolveInitialWindowFrame({
          currentScaleFactor: factor,
          workArea: WORK_AREA,
        })
      ).toEqual(DEFAULT_WINDOW_FRAME);
    }
  });

  test("passes fractional frames through unrounded when the ratio is 1", () => {
    const savedFrame = { x: 10.5, y: 20.25, width: 800.75, height: 600.5 };
    expect(
      resolveInitialWindowFrame({ savedFrame, currentScaleFactor: 1 })
    ).toEqual(savedFrame);
  });
});

describe("clampWindowFrameToWorkArea", () => {
  test("leaves a fitting frame alone", () => {
    const frame = { x: 100, y: 100, width: 1280, height: 800 };
    expect(clampWindowFrameToWorkArea(frame, WORK_AREA)).toEqual(frame);
  });

  test("moves an off-screen frame back into the work area", () => {
    expect(
      clampWindowFrameToWorkArea(
        { x: -5000, y: -5000, width: 1280, height: 800 },
        WORK_AREA
      )
    ).toEqual({ x: 0, y: 0, width: 1280, height: 800 });
  });

  test("shrinks an oversized frame to the work area", () => {
    expect(
      clampWindowFrameToWorkArea(
        { x: 500, y: 500, width: 9000, height: 9000 },
        WORK_AREA
      )
    ).toEqual(WORK_AREA);
  });

  test("respects a work area with a non-zero origin (docked taskbar)", () => {
    expect(
      clampWindowFrameToWorkArea(
        { x: 0, y: 0, width: 1280, height: 800 },
        { x: 64, y: 32, width: 1856, height: 1048 }
      )
    ).toEqual({ x: 64, y: 32, width: 1280, height: 800 });
  });
});

describe("getWindowScaleFactor", () => {
  test("returns a recorded positive finite factor", () => {
    expect(getWindowScaleFactor({ scaleFactor: 1.5 })).toBe(1.5);
  });

  test("returns undefined when absent or invalid", () => {
    expect(getWindowScaleFactor({})).toBeUndefined();
    for (const factor of [0, -2, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getWindowScaleFactor({ scaleFactor: factor })).toBeUndefined();
    }
    expect(
      getWindowScaleFactor({ scaleFactor: "2" as unknown as number })
    ).toBeUndefined();
  });
});
