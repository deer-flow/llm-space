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
