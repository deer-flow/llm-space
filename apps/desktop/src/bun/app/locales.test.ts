import { describe, expect, test } from "bun:test";

import {
  isAppLang,
  isChineseLocale,
  restoreAppLocale,
  setAppLocale,
} from "./locales";

describe("isAppLang", () => {
  test("accepts only the two shipped languages", () => {
    expect(isAppLang("en")).toBe(true);
    expect(isAppLang("zh")).toBe(true);
    expect(isAppLang("zh-cn")).toBe(false);
    expect(isAppLang("fr")).toBe(false);
    expect(isAppLang("")).toBe(false);
    expect(isAppLang(null)).toBe(false);
    expect(isAppLang(undefined)).toBe(false);
  });
});

describe("restoreAppLocale", () => {
  test("applies a persisted language to the effective locale", () => {
    setAppLocale("en");
    restoreAppLocale("zh");
    expect(isChineseLocale()).toBe(true);
  });

  test("ignores values outside the shipped languages", () => {
    setAppLocale("en");
    restoreAppLocale("ja");
    expect(isChineseLocale()).toBe(false);
    restoreAppLocale(null);
    expect(isChineseLocale()).toBe(false);
    restoreAppLocale(undefined);
    expect(isChineseLocale()).toBe(false);
  });

  test("restoring the same language is a no-op", () => {
    setAppLocale("zh");
    restoreAppLocale("zh");
    expect(isChineseLocale()).toBe(true);
  });
});
