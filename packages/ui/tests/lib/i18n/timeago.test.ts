import { afterAll, describe, expect, test } from "bun:test";

import { format } from "timeago.js";

import { installReactTestDom } from "../../../../../apps/desktop/src/test/react-test-dom";
import { langToTimeago } from "../../../src/lib/i18n";

// Importing the i18n module runs its side-effect timeago locale registration
// (guarded on `document`, which bun's test runner lacks without this adapter).
// These tests pin the contract every `format(ts, langToTimeago(lang))` call
// site relies on: after the i18n module has loaded, BOTH mapped locale ids
// format without throwing. The run-history list renders on thread open, so a
// throw here unmounts the entire React tree — the white-screen bug class.
const TEST_DOM = installReactTestDom();

afterAll(() => {
  TEST_DOM.restore();
});

describe("timeago locale registration", () => {
  test("formats with the mapped zh locale id", () => {
    const label = format(Date.now() - 30_000, langToTimeago("zh"));
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });

  test("formats with the mapped en locale id", () => {
    const label = format(Date.now() - 30_000, langToTimeago("en"));
    expect(typeof label).toBe("string");
    expect(label.length).toBeGreaterThan(0);
  });
});
