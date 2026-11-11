import type { Extension } from "@codemirror/state";
import type { CSSProperties } from "react";

export interface RegexHighlightEnhancement {
  kind: "regex-highlight";
  id: string;
  pattern: string;
  className: string;
  style: Readonly<CSSProperties>;
  priority: number;
}

export interface RangeHighlightEnhancement {
  kind: "range-highlight";
  id: string;
  className: string;
  style: Readonly<CSSProperties>;
  priority: number;
  getRanges(source: string): readonly { from: number; to: number }[];
}

export interface CodeMirrorOnlyEnhancement {
  kind: "code-mirror-only";
  id: string;
  extensions: readonly Extension[];
}

export type VisualEditorEnhancement =
  | RegexHighlightEnhancement
  | RangeHighlightEnhancement;

export type EditorEnhancement =
  | VisualEditorEnhancement
  | CodeMirrorOnlyEnhancement;

export interface StaticDecorationRange {
  from: number;
  to: number;
  style: Readonly<CSSProperties>;
  priority: number;
}

export interface RegexHighlightEnhancementOptions {
  id: string;
  pattern: string;
  className: string;
  style: Readonly<CSSProperties>;
  priority: number;
}

export interface RangeHighlightEnhancementOptions {
  id: string;
  className: string;
  style: Readonly<CSSProperties>;
  priority: number;
  getRanges(source: string): readonly { from: number; to: number }[];
}

function _assertCommonOptions(id: string, className: string) {
  if (!id.trim()) throw new Error("Editor enhancement id must not be empty");
  if (!className.trim()) {
    throw new Error("Editor enhancement className must not be empty");
  }
}

export function createRegexHighlightEnhancement(
  options: RegexHighlightEnhancementOptions
): RegexHighlightEnhancement {
  _assertCommonOptions(options.id, options.className);
  let regexp: RegExp;
  try {
    regexp = new RegExp(options.pattern);
  } catch (error) {
    throw new Error(`Invalid editor enhancement pattern: ${String(error)}`, {
      cause: error,
    });
  }
  if (regexp.test("")) {
    throw new Error("Editor enhancement pattern must not match empty text");
  }
  return Object.freeze({ kind: "regex-highlight" as const, ...options });
}

export function createRangeHighlightEnhancement(
  options: RangeHighlightEnhancementOptions
): RangeHighlightEnhancement {
  _assertCommonOptions(options.id, options.className);
  return Object.freeze({ kind: "range-highlight" as const, ...options });
}

export function assertUniqueEditorEnhancementIds(
  enhancements: readonly EditorEnhancement[]
) {
  const ids = new Set<string>();
  for (const enhancement of enhancements) {
    if (ids.has(enhancement.id)) {
      throw new Error(`Duplicate editor enhancement id "${enhancement.id}"`);
    }
    ids.add(enhancement.id);
  }
}

function _toStaticRange(
  sourceLength: number,
  from: number,
  to: number,
  enhancement: VisualEditorEnhancement
): StaticDecorationRange | null {
  const clampedFrom = Math.max(0, Math.min(sourceLength, from));
  const clampedTo = Math.max(0, Math.min(sourceLength, to));
  if (clampedTo <= clampedFrom) return null;
  return {
    from: clampedFrom,
    to: clampedTo,
    style: enhancement.style,
    priority: enhancement.priority,
  };
}

export function collectStaticDecorations(
  source: string,
  enhancements: readonly EditorEnhancement[]
): StaticDecorationRange[] {
  assertUniqueEditorEnhancementIds(enhancements);
  const ranges: StaticDecorationRange[] = [];
  for (const enhancement of enhancements) {
    if (enhancement.kind === "code-mirror-only") continue;
    if (enhancement.kind === "regex-highlight") {
      for (const match of source.matchAll(new RegExp(enhancement.pattern, "g"))) {
        const range = _toStaticRange(
          source.length,
          match.index,
          match.index + match[0].length,
          enhancement
        );
        if (range) ranges.push(range);
      }
      continue;
    }
    for (const candidate of enhancement.getRanges(source)) {
      const range = _toStaticRange(
        source.length,
        candidate.from,
        candidate.to,
        enhancement
      );
      if (range) ranges.push(range);
    }
  }
  return ranges.sort(
    (left, right) =>
      left.from - right.from ||
      left.priority - right.priority ||
      left.to - right.to
  );
}
