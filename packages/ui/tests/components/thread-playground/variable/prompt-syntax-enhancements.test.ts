import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";

import {
  collectStaticDecorations,
  type EditorEnhancement,
} from "../../../../src/components/code-editor/editor-enhancement";
import {
  createPromptSyntaxEditingEnhancement,
  PROMPT_TEMPLATE_TAG_HIGHLIGHT,
  PROMPT_VARIABLE_HIGHLIGHT,
} from "../../../../src/components/thread-playground/variable/prompt-syntax-enhancements";
import { createPromptCompletionSource } from "../../../../src/components/thread-playground/variable/prompt-variable-extension";

const originalDocument = globalThis.document;

beforeEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { body: {} },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

describe("prompt syntax enhancements", () => {
  test("declares variables and template tags as independent visual rules", () => {
    expect(PROMPT_VARIABLE_HIGHLIGHT).toMatchObject({
      kind: "regex-highlight",
      id: "prompt-variable-highlight",
      className: "cm-prompt-variable",
      priority: 10,
    });
    expect(PROMPT_TEMPLATE_TAG_HIGHLIGHT).toMatchObject({
      kind: "regex-highlight",
      id: "prompt-template-tag-highlight",
      className: "cm-template-tag",
      priority: 20,
    });

    const source = "{{current_date}} {% if enabled %}";
    expect(
      collectStaticDecorations(source, [
        PROMPT_VARIABLE_HIGHLIGHT,
        PROMPT_TEMPLATE_TAG_HIGHLIGHT,
      ])
    ).toEqual([
      {
        from: 0,
        to: 16,
        priority: 10,
        style: { color: "var(--cm-variable)", fontWeight: "500" },
      },
      {
        from: 17,
        to: source.length,
        priority: 20,
        style: { color: "var(--cm-template-tag)", fontWeight: "500" },
      },
    ]);
  });

  test("keeps hover and completion extensions out of Static decorations", () => {
    let resolverCalls = 0;
    let listerCalls = 0;
    const editing = createPromptSyntaxEditingEnhancement({
      resolve: () => {
        resolverCalls += 1;
        return { status: "ok", value: "2026-08-11" };
      },
      listVariables: () => {
        listerCalls += 1;
        return [];
      },
    });
    const enhancements: EditorEnhancement[] = [
      PROMPT_VARIABLE_HIGHLIGHT,
      PROMPT_TEMPLATE_TAG_HIGHLIGHT,
      editing,
    ];

    expect(editing.kind).toBe("code-mirror-only");
    if (editing.kind !== "code-mirror-only") {
      throw new Error("Expected a CodeMirror-only enhancement");
    }
    expect(editing.extensions).toHaveLength(4);
    expect(collectStaticDecorations("{{current_date}}", enhancements)).toEqual([
      {
        from: 0,
        to: 16,
        priority: 10,
        style: { color: "var(--cm-variable)", fontWeight: "500" },
      },
    ]);
    expect(resolverCalls).toBe(0);
    expect(listerCalls).toBe(0);
  });

  test.each([
    ["{{", ["current_date", "@include"]],
    ["{{@", ["@include"]],
    [
      "{%",
      ["if", "elif", "else", "endif", "for", "endfor", "set", "raw", "endraw"],
    ],
  ])("offers the expected completions after %s", async (doc, labels) => {
    const source = createPromptCompletionSource(() => [
      { name: "current_date", hint: "Current date" },
    ]);
    const state = EditorState.create({
      doc,
      selection: { anchor: doc.length },
    });
    const result = await source(
      new CompletionContext(state, state.selection.main.head, true)
    );

    expect(result?.options.map((option) => option.label)).toEqual(labels);
  });
});
