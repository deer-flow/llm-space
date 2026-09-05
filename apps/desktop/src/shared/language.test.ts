import { describe, expect, test } from "bun:test";

import { detectAppLanguage, isAppLanguage } from "./language";

describe("detectAppLanguage", () => {
  test("an explicit past choice wins", () => {
    expect(detectAppLanguage("zh", ["en-US"])).toBe("zh");
    expect(detectAppLanguage("en", ["zh-CN"])).toBe("en");
  });

  test("any Chinese variant of the preferred languages picks zh", () => {
    expect(detectAppLanguage(null, ["zh"])).toBe("zh");
    expect(detectAppLanguage(null, ["zh-CN"])).toBe("zh");
    expect(detectAppLanguage(undefined, ["zh-Hant-TW"])).toBe("zh");
    expect(detectAppLanguage(null, ["en-US", "zh"])).toBe("zh");
  });

  test("everything else falls back to en", () => {
    expect(detectAppLanguage(null, ["en-US"])).toBe("en");
    expect(detectAppLanguage(null, ["ja-JP"])).toBe("en");
    expect(detectAppLanguage(null, [])).toBe("en");
    expect(detectAppLanguage(null)).toBe("en");
  });

  test("ignores stored values that are not shipped languages", () => {
    expect(detectAppLanguage("fr", ["en-US"])).toBe("en");
  });
});

describe("isAppLanguage", () => {
  test("accepts only shipped codes", () => {
    expect(isAppLanguage("en")).toBe(true);
    expect(isAppLanguage("zh")).toBe(true);
    expect(isAppLanguage("zh-CN")).toBe(false);
    expect(isAppLanguage(null)).toBe(false);
    expect(isAppLanguage(undefined)).toBe(false);
  });
});
