import { describe, expect, test } from "bun:test";

import { createRegexHighlightEnhancement } from "../../../src/components/code-editor/editor-enhancement";
import { createHighlightSegments } from "../../../src/components/code-editor/static-highlight";

const PROMPT_VARIABLE_HIGHLIGHT = createRegexHighlightEnhancement({
  id: "prompt-variable-highlight",
  pattern: String.raw`\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}`,
  className: "cm-prompt-variable",
  style: { color: "var(--cm-variable)", fontWeight: "500" },
  priority: 10,
});
const PROMPT_TEMPLATE_TAG_HIGHLIGHT = createRegexHighlightEnhancement({
  id: "prompt-template-tag-highlight",
  pattern: String.raw`\{%[-+]?[\s\S]*?[-+]?%\}`,
  className: "cm-template-tag",
  style: { color: "var(--cm-template-tag)", fontWeight: "500" },
  priority: 20,
});
const PROMPT_HIGHLIGHTS = [
  PROMPT_VARIABLE_HIGHLIGHT,
  PROMPT_TEMPLATE_TAG_HIGHLIGHT,
] as const;

describe("static syntax highlighting", () => {
  test("preserves Markdown exactly while producing highlighted ranges", () => {
    const source = "**bold** and `code`";
    const segments = createHighlightSegments(source, "markdown", "dark");

    expect(segments.some((segment) => segment.style)).toBe(true);
    expect(segments.map((segment) => segment.text).join("")).toBe(source);
  });

  test("uses CodeMirror's exported GitHub styles for XML and Markdown", () => {
    const source =
      '# Heading\n\n**bold**\n\n<system-reminder format="iso">text</system-reminder>';
    const segments = createHighlightSegments(source, "markdown", "dark");

    expect(segments.map((segment) => segment.text).join("")).toBe(source);
    expect(
      segments.find((segment) => segment.text === "system-reminder")?.style
    ).toEqual({ color: "#7ee787" });
    expect(
      segments.find((segment) => segment.text.startsWith("format"))?.style
    ).toEqual({ color: "#79c0ff" });
    expect(
      segments.find((segment) => segment.text.includes("Heading"))?.style
    ).toEqual({ color: "#d2a8ff", fontWeight: "bold" });
    expect(
      segments.find((segment) => segment.text.includes("bold"))?.style
    ).toEqual({ color: "#d2a8ff", fontWeight: "bold" });

    const lightSegments = createHighlightSegments(source, "markdown", "light");
    expect(
      lightSegments.find((segment) => segment.text === "system-reminder")?.style
    ).toEqual({ color: "#116329" });
    expect(
      lightSegments.find((segment) => segment.text.includes("Heading"))?.style
    ).toEqual({ color: "#24292e", fontWeight: "bold" });
  });

  test("layers prompt variable and template-tag styles over GitHub syntax", () => {
    const source =
      '<workspace path="{{current_working_directory}}">\n{% if enabled %}{{current_date}}{% endif %}\n</workspace>';
    const segments = createHighlightSegments(
      source,
      "markdown",
      "dark",
      PROMPT_HIGHLIGHTS
    );

    expect(segments.map((segment) => segment.text).join("")).toBe(source);
    expect(
      segments.find(
        (segment) => segment.text === "{{current_working_directory}}"
      )?.style
    ).toEqual({ color: "var(--cm-variable)", fontWeight: "500" });
    expect(
      segments.find((segment) => segment.text === "{{current_date}}")?.style
    ).toEqual({ color: "var(--cm-variable)", fontWeight: "500" });
    for (const text of ["{% if enabled %}", "{% endif %}"]) {
      expect(segments.find((segment) => segment.text === text)?.style).toEqual({
        color: "var(--cm-template-tag)",
        fontWeight: "500",
      });
    }
  });

  test("preserves JSON as text so React remains responsible for escaping", () => {
    const source = '{"unsafe":"<script>"}';
    const segments = createHighlightSegments(source, "json", "dark");

    expect(segments.some((segment) => segment.style)).toBe(true);
    expect(segments.map((segment) => segment.text).join("")).toBe(source);
  });

  test("handles empty and malformed inputs", () => {
    expect(createHighlightSegments("", "markdown", "dark")).toEqual([]);
    const malformed = '{"still": [1, 2}';
    expect(
      createHighlightSegments(malformed, "json", "dark")
        .map((segment) => segment.text)
        .join("")
    ).toBe(malformed);
  });

  test("fills unstyled gaps in multiline Markdown", () => {
    const source = "# Heading\n\nplain words\n\n- **bold**";
    const segments = createHighlightSegments(source, "markdown", "dark");

    expect(segments.map((segment) => segment.text).join("")).toBe(source);
    expect(segments.some((segment) => !segment.style)).toBe(true);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index - 1]?.style).not.toEqual(segments[index]?.style);
    }
  });
});
