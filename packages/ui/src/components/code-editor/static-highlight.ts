import { jsonLanguage } from "@codemirror/lang-json";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import {
  highlightTree,
  tagHighlighter,
  type Highlighter,
  type Tag,
} from "@lezer/highlight";
import {
  defaultSettingsGithubDark,
  defaultSettingsGithubLight,
  githubDarkStyle,
  githubLightStyle,
} from "@uiw/codemirror-theme-github";
import type { CSSProperties } from "react";

import type { ResolvedTheme } from "../theme-provider";

import {
  collectStaticDecorations,
  type EditorEnhancement,
  type StaticDecorationRange,
} from "./editor-enhancement";

export interface HighlightSegment {
  text: string;
  style?: CSSProperties;
}

export type HighlightLanguage = "markdown" | "json";

interface HighlightRange {
  from: number;
  to: number;
  style?: CSSProperties;
}

interface GithubTagStyle {
  tag: Tag | readonly Tag[];
  class?: string;
  [styleProperty: string]: unknown;
}

interface StaticGithubTheme {
  highlighter: Highlighter;
  resolve(classes: string): CSSProperties | undefined;
}

// `markdownLanguage.parser` only recognizes an HTML/XML-shaped span as one
// opaque Markdown node. The configured support installs Markdown's HTML
// sub-parser, matching the tags users see highlighted after activating the
// full CodeMirror editor. Editor-only support is disabled for this static path.
const STATIC_MARKDOWN_PARSER = markdown({
  addKeymap: false,
  base: markdownLanguage,
  completeHTMLTags: false,
  pasteURLAsLink: false,
}).language.parser;

/**
 * Adapt the package's original TagStyle list for non-CodeMirror rendering.
 *
 * HighlightStyle normally turns each entry into an anonymous CSS class. Static
 * React content cannot mount that private StyleModule, so this creates stable
 * internal class ids solely to let Lezer perform the same tag matching, then
 * resolves those ids back to the original declarations. Sorting by source
 * order preserves HighlightStyle's CSS-cascade behavior when a token has more
 * than one semantic tag.
 */
function _createStaticGithubTheme(
  specs: readonly GithubTagStyle[]
): StaticGithubTheme {
  const stylesByClass = new Map<
    string,
    { order: number; style: CSSProperties }
  >();
  const tagStyles = specs.map((spec, order) => {
    const declarations = Object.fromEntries(
      Object.entries(spec).filter(
        ([property]) => property !== "tag" && property !== "class"
      )
    );
    const className = `github-theme-rule-${order}`;
    stylesByClass.set(className, {
      order,
      style: declarations,
    });
    return { tag: spec.tag, class: className };
  });
  const resolvedStyles = new Map<string, CSSProperties>();

  return {
    highlighter: tagHighlighter(tagStyles),
    resolve(classes) {
      const cached = resolvedStyles.get(classes);
      if (cached) return cached;

      const matched = classes
        .split(/\s+/)
        .map((className) => stylesByClass.get(className))
        .filter(
          (
            entry
          ): entry is { order: number; style: CSSProperties } => entry != null
        )
        .sort((left, right) => left.order - right.order);
      if (matched.length === 0) return undefined;

      const style = Object.assign(
        {},
        ...matched.map((entry) => entry.style)
      ) as CSSProperties;
      resolvedStyles.set(classes, style);
      return style;
    },
  };
}

const STATIC_GITHUB_THEMES: Record<ResolvedTheme, StaticGithubTheme> = {
  dark: _createStaticGithubTheme(githubDarkStyle),
  light: _createStaticGithubTheme(githubLightStyle),
};

export function getGithubThemeForeground(
  theme: ResolvedTheme
): string | undefined {
  return theme === "dark"
    ? defaultSettingsGithubDark.foreground
    : defaultSettingsGithubLight.foreground;
}

function _sameStyle(left?: CSSProperties, right?: CSSProperties) {
  if (left === right) return true;
  if (!left || !right) return false;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(([property, value]) =>
      rightEntries.some(
        ([rightProperty, rightValue]) =>
          rightProperty === property && rightValue === value
      )
    )
  );
}

function _createSegments(
  source: string,
  syntaxRanges: readonly HighlightRange[],
  overlayRanges: readonly StaticDecorationRange[]
): HighlightSegment[] {
  const boundaries = new Set<number>([0, source.length]);
  for (const range of [...syntaxRanges, ...overlayRanges]) {
    boundaries.add(Math.max(0, Math.min(source.length, range.from)));
    boundaries.add(Math.max(0, Math.min(source.length, range.to)));
  }
  const offsets = [...boundaries].sort((left, right) => left - right);
  const segments: HighlightSegment[] = [];
  let syntaxIndex = 0;
  let overlayIndex = 0;
  let activeOverlays: StaticDecorationRange[] = [];

  const append = (text: string, style?: CSSProperties) => {
    if (!text) return;
    const previous = segments.at(-1);
    if (previous && _sameStyle(previous.style, style)) {
      previous.text += text;
    } else {
      segments.push({ text, style });
    }
  };

  for (let index = 0; index < offsets.length - 1; index += 1) {
    const from = offsets[index] ?? 0;
    const to = offsets[index + 1] ?? from;
    if (to <= from) continue;

    while (syntaxRanges[syntaxIndex]?.to <= from) syntaxIndex += 1;
    const syntaxRange = syntaxRanges[syntaxIndex];
    const syntaxStyle =
      syntaxRange && syntaxRange.from <= from && syntaxRange.to >= to
        ? syntaxRange.style
        : undefined;

    activeOverlays = activeOverlays.filter((range) => range.to > from);
    while (overlayRanges[overlayIndex]?.from <= from) {
      activeOverlays.push(overlayRanges[overlayIndex]);
      overlayIndex += 1;
    }
    const overlays = [...activeOverlays].sort(
      (left, right) => left.priority - right.priority
    );
    const style =
      overlays.length === 0
        ? syntaxStyle
        : (Object.assign(
            {},
            syntaxStyle ?? {},
            ...overlays.map((range) => range.style)
          ) as CSSProperties);
    append(source.slice(from, to), style);
  }
  return segments;
}

/** Parse text with Lezer and return React-safe text segments, including gaps. */
export function createHighlightSegments(
  source: string,
  language: HighlightLanguage,
  theme: ResolvedTheme,
  enhancements: readonly EditorEnhancement[] = []
): HighlightSegment[] {
  if (!source) return [];

  const parser =
    language === "json" ? jsonLanguage.parser : STATIC_MARKDOWN_PARSER;
  const staticTheme = STATIC_GITHUB_THEMES[theme];
  const ranges: HighlightRange[] = [];
  highlightTree(
    parser.parse(source),
    staticTheme.highlighter,
    (from, to, classes) => {
      if (to > from) {
        ranges.push({
          from,
          to,
          style: staticTheme.resolve(classes),
        });
      }
    }
  );
  ranges.sort((left, right) => left.from - right.from || left.to - right.to);

  const overlays = collectStaticDecorations(source, enhancements);
  return _createSegments(source, ranges, overlays);
}
