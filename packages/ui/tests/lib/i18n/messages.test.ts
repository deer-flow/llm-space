import { describe, expect, test } from "bun:test";

import {
  formatString,
  isZhLocale,
  LANGUAGES,
  langToTimeago,
  MESSAGES,
  resolveInitialLang,
} from "../../../src/lib/i18n/messages";

describe("MESSAGES", () => {
  test("en and zh have identical key shapes", () => {
    const walk = (node: unknown): string[] =>
      typeof node === "string"
        ? [""]
        : Object.entries(node as Record<string, unknown>).flatMap(
            ([key, value]) => walk(value).map((suffix) => `${key}.${suffix}`)
          );
    const enKeys = walk(MESSAGES.en).sort();
    const zhKeys = walk(MESSAGES.zh).sort();
    expect(zhKeys).toEqual(enKeys);
  });

  test("LANGUAGES has exactly en and zh", () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(["en", "zh"]);
  });

  test("plural shapes resolve real one/other branches with formatting", () => {
    // The house pattern selects the branch at the call site:
    // `n === 1 ? t.x.one : t.x.other`, then `formatString` fills `{n}`.
    const enCount = (n: number) =>
      formatString(
        n === 1
          ? MESSAGES.en.desktop.startFromExample.templateCount.one
          : MESSAGES.en.desktop.startFromExample.templateCount.other,
        { n }
      );
    expect(enCount(1)).toBe("1 template");
    expect(enCount(2)).toBe("2 templates");
    expect(enCount(0)).toBe("0 templates");
    // Zero is plural in English; the `other` branch carries the {n} placeholder.
    expect(MESSAGES.en.desktop.startFromExample.templateCount.one).not.toContain(
      "{n}"
    );
    expect(
      MESSAGES.en.desktop.startFromExample.templateCount.other
    ).toContain("{n}");

    const zhCount = (n: number) =>
      formatString(
        n === 1
          ? MESSAGES.zh.desktop.startFromExample.templateCount.one
          : MESSAGES.zh.desktop.startFromExample.templateCount.other,
        { n }
      );
    expect(zhCount(1)).toBe("1 个模板");
    expect(zhCount(3)).toBe("3 个模板");
  });
});

describe("formatString", () => {
  test("replaces placeholders", () => {
    expect(formatString("Delete {name}?", { name: "report.md" })).toBe(
      "Delete report.md?"
    );
  });
  test("leaves a missing placeholder literal", () => {
    expect(formatString("Delete {name}?", {})).toBe("Delete {name}?");
  });
  test("ignores unused vars and handles numbers", () => {
    expect(formatString("{n} items", { n: 3, unused: "yes" })).toBe("3 items");
  });
  test("a braced value survives (single replacement, no triple braces)", () => {
    expect(formatString("Copy {token}", { token: "{{foo}}" })).toBe(
      "Copy {{foo}}"
    );
  });
  test("delete-variable confirmation renders {{name}} without triple braces", () => {
    expect(
      formatString(
        'This removes "{name}" and its value from this thread.',
        { name: "{{foo}}" }
      )
    ).toBe('This removes "{{foo}}" and its value from this thread.');
  });
});

describe("resolveInitialLang", () => {
  test("explicit stored choice wins", () => {
    expect(resolveInitialLang("zh", "", [])).toBe("zh");
    expect(resolveInitialLang("en", "zh-CN", ["zh-TW"])).toBe("en");
  });
  test("OS locale decides next", () => {
    expect(resolveInitialLang(null, "zh_cn", ["en-US"])).toBe("zh");
    expect(resolveInitialLang(null, "zh-Hans", ["en-US"])).toBe("zh");
    expect(resolveInitialLang(null, "en-US", ["en-US"])).toBe("en");
  });
  test("navigator languages are the last fallback", () => {
    expect(resolveInitialLang(null, "en-US", ["fr", "zh-CN"])).toBe("zh");
    expect(resolveInitialLang(null, "en-US", ["fr-FR"])).toBe("en");
    expect(resolveInitialLang(null, "", [])).toBe("en");
  });
});

describe("langToTimeago", () => {
  test("maps to timeago locale ids", () => {
    expect(langToTimeago("en")).toBe("en");
    expect(langToTimeago("zh")).toBe("zh_CN");
  });
});

describe("isZhLocale", () => {
  test("accepts all zh variants, rejects others", () => {
    for (const zh of ["zh", "zh-CN", "zh-TW", "ZH_HANS"]) {
      expect(isZhLocale(zh)).toBe(true);
    }
    for (const notZh of ["en", "en-US", "fr", ""]) {
      expect(isZhLocale(notZh)).toBe(false);
    }
  });
});
