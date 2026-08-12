import { describe, expect, test } from "bun:test";

import { EditorState } from "@codemirror/state";

import {
  collectStaticDecorations,
  createRangeHighlightEnhancement,
  createRegexHighlightEnhancement,
  type CodeMirrorOnlyEnhancement,
} from "../../../src/components/code-editor/editor-enhancement";
import { compileCodeMirrorEnhancements } from "../../../src/components/code-editor/editor-enhancement-codemirror";

const VARIABLE = createRegexHighlightEnhancement({
  id: "prompt-variable-highlight",
  pattern: String.raw`\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}`,
  className: "cm-prompt-variable",
  style: { color: "var(--cm-variable)", fontWeight: "500" },
  priority: 10,
});

const TEMPLATE_TAG = createRegexHighlightEnhancement({
  id: "prompt-template-tag-highlight",
  pattern: String.raw`\{%[-+]?[\s\S]*?[-+]?%\}`,
  className: "cm-template-tag",
  style: { color: "var(--cm-template-tag)", fontWeight: "500" },
  priority: 20,
});

describe("editor enhancements", () => {
  test("collects prompt variables and multiline template tags from one declaration", () => {
    const source = "{{ name }}\n{% if enabled\n  and ready %}";

    expect(collectStaticDecorations(source, [VARIABLE, TEMPLATE_TAG])).toEqual([
      { from: 0, to: 10, style: VARIABLE.style, priority: 10 },
      {
        from: 11,
        to: source.length,
        style: TEMPLATE_TAG.style,
        priority: 20,
      },
    ]);
  });

  test("collects, clamps, drops, and orders explicit ranges", () => {
    const ranges = createRangeHighlightEnhancement({
      id: "known-ranges",
      className: "cm-known-range",
      style: { textDecoration: "underline" },
      priority: 30,
      getRanges: () => [
        { from: 5, to: 20 },
        { from: -4, to: 2 },
        { from: 4, to: 4 },
      ],
    });

    expect(collectStaticDecorations("abcdef", [ranges])).toEqual([
      { from: 0, to: 2, style: ranges.style, priority: 30 },
      { from: 5, to: 6, style: ranges.style, priority: 30 },
    ]);
  });

  test("rejects invalid declarations and duplicate ids", () => {
    expect(() =>
      createRegexHighlightEnhancement({
        id: "empty-match",
        pattern: ".*",
        className: "cm-empty",
        style: {},
        priority: 0,
      })
    ).toThrow("must not match empty text");
    expect(() =>
      collectStaticDecorations("{{name}}", [VARIABLE, VARIABLE])
    ).toThrow('Duplicate editor enhancement id "prompt-variable-highlight"');
  });

  test("compiles visual declarations once and flattens CodeMirror-only extensions", () => {
    const editorOnlyExtension = EditorState.readOnly.of(true);
    const editorOnly: CodeMirrorOnlyEnhancement = {
      kind: "code-mirror-only",
      id: "editor-only",
      extensions: [editorOnlyExtension],
    };

    const first = compileCodeMirrorEnhancements([
      VARIABLE,
      TEMPLATE_TAG,
      editorOnly,
    ]);
    const second = compileCodeMirrorEnhancements([
      VARIABLE,
      TEMPLATE_TAG,
      editorOnly,
    ]);

    expect(first).toHaveLength(5);
    expect(first[0]).toBe(second[0]);
    expect(first[1]).toBe(second[1]);
    expect(first.at(-1)).toBe(editorOnlyExtension);
    expect(collectStaticDecorations("{{name}}", [editorOnly])).toEqual([]);
  });

  test("orders CodeMirror visual rules by the same priority used by Static View", () => {
    const low = createRegexHighlightEnhancement({
      id: "low-priority",
      pattern: "value",
      className: "cm-low-priority",
      style: { color: "blue" },
      priority: 1,
    });
    const high = createRegexHighlightEnhancement({
      id: "high-priority",
      pattern: "value",
      className: "cm-high-priority",
      style: { color: "red" },
      priority: 100,
    });
    const lowCompiled = compileCodeMirrorEnhancements([low]);
    const highCompiled = compileCodeMirrorEnhancements([high]);
    const reversedInput = compileCodeMirrorEnhancements([high, low]);

    expect(reversedInput[0]).toBe(lowCompiled[0]);
    expect(reversedInput[1]).toBe(lowCompiled[1]);
    expect(reversedInput[2]).toBe(highCompiled[0]);
    expect(reversedInput[3]).toBe(highCompiled[1]);
  });
});
