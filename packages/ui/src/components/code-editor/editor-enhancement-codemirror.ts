import type { Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import {
  assertUniqueEditorEnhancementIds,
  type EditorEnhancement,
  type RangeHighlightEnhancement,
  type RegexHighlightEnhancement,
  type VisualEditorEnhancement,
} from "./editor-enhancement";

const COMPILED_VISUAL_EXTENSIONS = new WeakMap<
  VisualEditorEnhancement,
  Extension[]
>();

function _theme(enhancement: VisualEditorEnhancement): Extension {
  return EditorView.theme({
    [`.${enhancement.className}`]: { ...enhancement.style },
  });
}

function _compileRegex(
  enhancement: RegexHighlightEnhancement
): Extension[] {
  const decorator = new MatchDecorator({
    regexp: new RegExp(enhancement.pattern, "g"),
    decoration: Decoration.mark({ class: enhancement.className }),
  });
  const highlighter = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
  return [highlighter, _theme(enhancement)];
}

function _rangeDecorations(
  view: EditorView,
  enhancement: RangeHighlightEnhancement
): DecorationSet {
  const source = view.state.doc.toString();
  return Decoration.set(
    enhancement
      .getRanges(source)
      .map(({ from, to }) => ({
        from: Math.max(0, Math.min(source.length, from)),
        to: Math.max(0, Math.min(source.length, to)),
      }))
      .filter(({ from, to }) => to > from)
      .sort((left, right) => left.from - right.from || left.to - right.to)
      .map(({ from, to }) =>
        Decoration.mark({ class: enhancement.className }).range(from, to)
      ),
    true
  );
}

function _compileRange(
  enhancement: RangeHighlightEnhancement
): Extension[] {
  const highlighter = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = _rangeDecorations(view, enhancement);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) {
          this.decorations = _rangeDecorations(update.view, enhancement);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  );
  return [highlighter, _theme(enhancement)];
}

function _compileVisual(enhancement: VisualEditorEnhancement): Extension[] {
  const cached = COMPILED_VISUAL_EXTENSIONS.get(enhancement);
  if (cached) return cached;
  const compiled =
    enhancement.kind === "regex-highlight"
      ? _compileRegex(enhancement)
      : _compileRange(enhancement);
  COMPILED_VISUAL_EXTENSIONS.set(enhancement, compiled);
  return compiled;
}

export function compileCodeMirrorEnhancements(
  enhancements: readonly EditorEnhancement[]
): Extension[] {
  assertUniqueEditorEnhancementIds(enhancements);
  const visual = enhancements
    .filter(
      (enhancement): enhancement is VisualEditorEnhancement =>
        enhancement.kind !== "code-mirror-only"
    )
    .sort((left, right) => left.priority - right.priority)
    .flatMap(_compileVisual);
  const codeMirrorOnly = enhancements
    .filter((enhancement) => enhancement.kind === "code-mirror-only")
    .flatMap((enhancement) => enhancement.extensions);
  return [...visual, ...codeMirrorOnly];
}
