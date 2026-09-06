import { describe, expect, test } from "bun:test";

import { DEFAULT_PLAYGROUND_LABELS } from "@llm-space/ui/components/thread-playground/playground-labels";

import { PLAYGROUND_LABELS } from "./playground-labels";

describe("PLAYGROUND_LABELS", () => {
  test("covers both languages with the full label set", () => {
    expect(Object.keys(PLAYGROUND_LABELS).sort()).toEqual(["en", "zh"]);
    for (const labels of Object.values(PLAYGROUND_LABELS)) {
      expect(Object.keys(labels).sort()).toEqual(
        Object.keys(DEFAULT_PLAYGROUND_LABELS).sort()
      );
    }
  });

  test("every label is a non-empty string in every language", () => {
    for (const labels of Object.values(PLAYGROUND_LABELS)) {
      _assertTextLeaves(labels);
    }
  });

  test("the en values stay in sync with the packages/ui defaults", () => {
    // The web viewer renders the defaults, so English must not drift between
    // the two definitions.
    expect(_serializableLabels(PLAYGROUND_LABELS.en)).toEqual(
      _serializableLabels(DEFAULT_PLAYGROUND_LABELS)
    );
  });

  test("zh actually translates the label set", () => {
    const translated = Object.entries(PLAYGROUND_LABELS.zh).filter(
      ([key, value]) =>
        value !== PLAYGROUND_LABELS.en[key as keyof typeof PLAYGROUND_LABELS.en]
    );
    // Proper nouns like "Beta" may stay identical; the rest must localize.
    expect(translated.length).toBeGreaterThan(
      Object.keys(PLAYGROUND_LABELS.en).length / 2
    );
  });
});

function _assertTextLeaves(value: unknown): void {
  if (typeof value === "string") {
    expect(value.length).toBeGreaterThan(0);
    return;
  }
  if (typeof value === "function") return;
  expect(typeof value).toBe("object");
  for (const child of Object.values(value as Record<string, unknown>)) {
    _assertTextLeaves(child);
  }
}

function _serializableLabels(value: unknown): unknown {
  if (typeof value === "function") return value.toString();
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => [
      key,
      _serializableLabels(child),
    ])
  );
}
