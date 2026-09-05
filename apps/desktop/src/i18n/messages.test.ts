import { describe, expect, test } from "bun:test";

import { formatMessage, MESSAGES } from "./messages";

/** Leaf key paths of a message tree, e.g. "general.themeHint". */
function _leafPaths(
  tree: Record<string, unknown>,
  prefix = ""
): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      return _leafPaths(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe("MESSAGES", () => {
  test("zh mirrors the en message tree exactly", () => {
    const en = _leafPaths(MESSAGES.en);
    const zh = _leafPaths(MESSAGES.zh);
    expect(zh.sort()).toEqual(en.sort());
  });

  test("every leaf is a non-empty string in every locale", () => {
    for (const tree of [MESSAGES.en, MESSAGES.zh]) {
      for (const path of _leafPaths(tree)) {
        const value = path
          .split(".")
          .reduce<unknown>(
            (node, key) => (node as Record<string, unknown>)[key],
            tree
          );
        expect(typeof value).toBe("string");
        expect(value as string).not.toBe("");
      }
    }
  });
});

describe("formatMessage", () => {
  test("substitutes named placeholders", () => {
    expect(formatMessage("Show {label} here", { label: "API key" })).toBe(
      "Show API key here"
    );
  });

  test("leaves unknown placeholders untouched", () => {
    expect(formatMessage("Show {label}", { other: "x" })).toBe("Show {label}");
  });
});
