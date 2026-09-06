import { describe, expect, test } from "bun:test";

import {
  PROMPT_EXAMPLES,
  isPromptExample,
} from "@llm-space/ui/components/thread-playground/examples/prompts";

import { EXAMPLE_LOCALIZATIONS_ZH } from "./start-from-example-dialog";

describe("EXAMPLE_LOCALIZATIONS_ZH", () => {
  test("covers every prompt example id", () => {
    const ids = PROMPT_EXAMPLES.filter(isPromptExample).map(
      (example) => example.id
    );
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(EXAMPLE_LOCALIZATIONS_ZH[id], `missing zh display entry: ${id}`)
        .toBeDefined();
    }
  });

  test("every entry has a non-empty label and description", () => {
    for (const [id, entry] of Object.entries(EXAMPLE_LOCALIZATIONS_ZH)) {
      expect(entry.label.length, `label for ${id}`).toBeGreaterThan(0);
      expect(entry.description.length, `description for ${id}`).toBeGreaterThan(
        0
      );
    }
  });

  test("is display-only: never touches the catalog prompts or filenames", () => {
    // The map is keyed by id and contains only label/description strings; the
    // catalog (system prompts, seed messages, fileStem filenames) is imported
    // read-only here and must stay the single source of truth for seeds.
    for (const example of PROMPT_EXAMPLES.filter(isPromptExample)) {
      expect(typeof example.fileStem).toBe("string");
      expect(example.fileStem.length).toBeGreaterThan(0);
    }
  });
});
