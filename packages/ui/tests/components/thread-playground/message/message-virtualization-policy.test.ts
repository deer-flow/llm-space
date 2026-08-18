import { describe, expect, test } from "bun:test";

import {
  applyRenderingThreshold,
  DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD,
  GIB,
  MAX_AUTO_VIRTUALIZATION_THRESHOLD,
  MIN_AUTO_VIRTUALIZATION_THRESHOLD,
  parseCustomVirtualizationThreshold,
  parseMessageVirtualizationMode,
  resolveAutoVirtualizationThreshold,
  shouldVirtualizeMessages,
} from "../../../../src/components/thread-playground/message/message-virtualization-policy";

describe("message virtualization policy", () => {
  test("defaults invalid persisted modes and custom thresholds", () => {
    expect(parseMessageVirtualizationMode(null)).toBe("auto");
    expect(parseMessageVirtualizationMode("invalid")).toBe("auto");
    expect(parseCustomVirtualizationThreshold(null)).toBe(
      DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD
    );
    expect(parseCustomVirtualizationThreshold("0")).toBe(
      DEFAULT_CUSTOM_VIRTUALIZATION_THRESHOLD
    );
    expect(parseCustomVirtualizationThreshold("42")).toBe(42);
  });

  test("uses Full as the memory-tier baseline and applies rendering multipliers", () => {
    expect(
      resolveAutoVirtualizationThreshold({
        totalMemoryBytes: 16 * GIB,
        rendering: "rich",
      })
    ).toBe(15);
    expect(
      resolveAutoVirtualizationThreshold({
        totalMemoryBytes: 16 * GIB,
        rendering: "on-demand",
      })
    ).toBe(23);
    expect(
      resolveAutoVirtualizationThreshold({
        totalMemoryBytes: 16 * GIB,
        rendering: "lite",
      })
    ).toBe(30);
    expect(
      resolveAutoVirtualizationThreshold({
        totalMemoryBytes: 32 * GIB,
        rendering: "rich",
      })
    ).toBe(25);
    expect(
      resolveAutoVirtualizationThreshold({
        totalMemoryBytes: 32 * GIB,
        rendering: "on-demand",
      })
    ).toBe(38);
    expect(
      resolveAutoVirtualizationThreshold({
        totalMemoryBytes: 32 * GIB,
        rendering: "lite",
      })
    ).toBe(50);
  });

  test("clamps Auto thresholds to the approved 10-200 bounds", () => {
    expect(
      applyRenderingThreshold({
        fullBaseThreshold: 1,
        rendering: "rich",
      })
    ).toBe(MIN_AUTO_VIRTUALIZATION_THRESHOLD);
    expect(
      applyRenderingThreshold({
        fullBaseThreshold: 120,
        rendering: "lite",
      })
    ).toBe(MAX_AUTO_VIRTUALIZATION_THRESHOLD);
  });

  test("keeps Off, Auto, Custom, and On decisions independent", () => {
    expect(
      shouldVirtualizeMessages({ mode: "off", rowCount: 500 })
    ).toBe(false);
    expect(shouldVirtualizeMessages({ mode: "on", rowCount: 1 })).toBe(true);
    expect(
      shouldVirtualizeMessages({
        mode: "custom",
        customThreshold: 20,
        rowCount: 20,
      })
    ).toBe(false);
    expect(
      shouldVirtualizeMessages({
        mode: "custom",
        customThreshold: 20,
        rowCount: 21,
      })
    ).toBe(true);
    expect(
      shouldVirtualizeMessages({
        mode: "auto",
        autoThreshold: 40,
        rowCount: 41,
      })
    ).toBe(true);
  });
});
