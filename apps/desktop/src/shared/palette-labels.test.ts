import { describe, expect, test } from "bun:test";

import { matchesCommandText } from "../components/plugin-command-input";
import { MESSAGES } from "../i18n/messages";

import { paletteLabels } from "./palette-labels";

describe("paletteLabels", () => {
  test("returns the en and zh labels for palette matching", () => {
    expect(paletteLabels("saveTo")).toEqual([
      MESSAGES.en.palette.saveTo,
      MESSAGES.zh.palette.saveTo,
    ]);
    expect(paletteLabels("importFrom")).toEqual([
      MESSAGES.en.palette.importFrom,
      MESSAGES.zh.palette.importFrom,
    ]);
  });

  test("both labels are non-empty", () => {
    for (const key of ["saveTo", "importFrom"] as const) {
      for (const label of paletteLabels(key)) {
        expect(label.length).toBeGreaterThan(0);
      }
    }
  });

  test("a query in either language matches the same palette entry", () => {
    // The palette renders the localized label but must also answer the
    // other language's query (e.g. "保存" under the Chinese UI, "save to"
    // under the English one).
    expect(paletteLabels("saveTo").some((l) => matchesCommandText(l, "保存"))).toBe(true);
    expect(paletteLabels("saveTo").some((l) => matchesCommandText(l, "save to"))).toBe(true);
    expect(paletteLabels("importFrom").some((l) => matchesCommandText(l, "导入"))).toBe(true);
    expect(paletteLabels("importFrom").some((l) => matchesCommandText(l, "import from"))).toBe(true);
  });
});
