import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  hoverTooltip,
  MatchDecorator,
  tooltips,
  ViewPlugin,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
} from "@codemirror/view";

import type {
  PromptVariableCompletion,
  VariableResolution,
} from "./prompt-variables";

/**
 * Resolves a `{{name}}` to its display value. May return synchronously (date /
 * custom variables) or a Promise (skills, which need an async load). Called
 * ONLY from the hover handler — never during highlighting.
 */
export type PromptVariableResolver = (
  name: string
) => VariableResolution | Promise<VariableResolution>;

/** Lists the variables offered by `{{`-triggered autocompletion. */
export type PromptVariableLister = () => PromptVariableCompletion[];

export interface PromptVariableExtensionOptions {
  resolve: PromptVariableResolver;
  listVariables: PromptVariableLister;
}

// How much of a variable's value preview to show in the dropdown before "…".
const HINT_MAX_CHARS = 72;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

// Syntactic only — a well-formed `{{name}}` with optional inner whitespace. The
// `g` flag is required by MatchDecorator. Highlighting never consults the
// variable table, so this stays a pure, viewport-bounded scan.
const PLACEHOLDER_RE = /\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}/g;
// Cap tooltip length so a large skills list can't produce a giant tooltip.
const MAX_VALUE_CHARS = 2000;

const placeholderMark = Decoration.mark({ class: "cm-prompt-variable" });

const matcher = new MatchDecorator({
  regexp: PLACEHOLDER_RE,
  decoration: placeholderMark,
});

// MatchDecorator only scans the visible ranges and maps existing decorations
// through edits, so highlighting cost never scales with document length.
const placeholderHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = matcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = matcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (plugin) => plugin.decorations }
);

const theme = EditorView.theme({
  ".cm-prompt-variable": {
    color: "var(--cm-variable)",
    fontWeight: "500",
  },
  ".cm-prompt-variable-tooltip": {
    maxWidth: "360px",
    maxHeight: "15rem",
    overflowY: "auto",
    overflowX: "hidden",
    overscrollBehavior: "contain",
    padding: "6px 8px",
    borderRadius: "6px",
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.35)",
    fontSize: "12px",
    // Explicit, visible scrollbar — the global translucent one is nearly
    // invisible on the dark popover, making overflow read as "cut off".
    scrollbarWidth: "thin",
    scrollbarColor:
      "color-mix(in oklab, var(--muted-foreground) 55%, transparent) transparent",
  },
  ".cm-prompt-variable-tooltip::-webkit-scrollbar": {
    width: "10px",
  },
  ".cm-prompt-variable-tooltip::-webkit-scrollbar-thumb": {
    backgroundColor:
      "color-mix(in oklab, var(--muted-foreground) 45%, transparent)",
    borderRadius: "9999px",
    border: "2px solid transparent",
    backgroundClip: "padding-box",
  },
  ".cm-prompt-variable-tooltip::-webkit-scrollbar-thumb:hover": {
    backgroundColor:
      "color-mix(in oklab, var(--muted-foreground) 70%, transparent)",
  },
  ".cm-prompt-variable-tooltip .cm-pv-label": {
    color: "var(--cm-variable)",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    fontWeight: "600",
    marginBottom: "5px",
    paddingBottom: "5px",
    borderBottom: "1px solid var(--border)",
  },
  ".cm-prompt-variable-tooltip .cm-pv-value": {
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  ".cm-prompt-variable-tooltip .cm-pv-warning": {
    color: "var(--destructive)",
  },
  // `{{`-triggered variable completion dropdown — match the app popover.
  "&.cm-editor .cm-tooltip.cm-tooltip-autocomplete": {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.35)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    maxHeight: "15rem",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
    padding: "3px 8px",
    color: "var(--popover-foreground)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    background: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-tooltip-autocomplete .cm-completionLabel": {
    fontWeight: "500",
  },
  ".cm-tooltip-autocomplete .cm-completionDetail": {
    fontStyle: "normal",
    color: "var(--muted-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "18rem",
  },
});

function renderTooltipDom(
  name: string,
  resolution: VariableResolution
): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-prompt-variable-tooltip";

  // Title: the variable name, shown in the same color as the editor highlight.
  const label = document.createElement("div");
  label.className = "cm-pv-label";
  label.textContent = name;
  root.appendChild(label);

  const body = document.createElement("div");
  if (resolution.status === "ok") {
    body.className = "cm-pv-value";
    // textContent (never innerHTML) — resolved values are user / skill data.
    body.textContent =
      resolution.value.length > MAX_VALUE_CHARS
        ? `${resolution.value.slice(0, MAX_VALUE_CHARS)}…`
        : resolution.value;
  } else {
    body.className = "cm-pv-warning";
    body.textContent =
      resolution.status === "empty"
        ? "This variable has no value yet."
        : resolution.status === "invalid"
          ? "Invalid variable name."
          : "Unknown variable — not defined in this thread.";
  }
  root.appendChild(body);
  return root;
}

function createHoverTooltip(resolve: PromptVariableResolver): Extension {
  return hoverTooltip(
    (view, pos) => {
      const line = view.state.doc.lineAt(pos);
      const rel = pos - line.from;
      // Fresh regex so lastIndex never leaks across calls; scans one line only.
      const re = new RegExp(PLACEHOLDER_RE.source, "g");
      for (let match = re.exec(line.text); match; match = re.exec(line.text)) {
        const start = match.index;
        const end = start + match[0].length;
        if (rel < start || rel > end) {
          continue;
        }
        const name = match[0].slice(2, -2).trim();
        const from = line.from + start;
        const to = line.from + end;
        const build = (resolution: VariableResolution): Tooltip => ({
          pos: from,
          end: to,
          above: true,
          create: () => ({ dom: renderTooltipDom(name, resolution) }),
        });
        const resolution = resolve(name);
        return resolution instanceof Promise
          ? resolution.then(build)
          : build(resolution);
      }
      return null;
    },
    { hoverTime: 120 }
  );
}

/**
 * Build the `{{variable}}` highlight + hover-resolve extension. Pure CodeMirror
 * — no React, no store coupling. The only variable-system link is the injected
 * `resolve`, which the caller wires to the thread's variable state.
 */
// Match `{{` (optional inner whitespace) + a partial name ending at the cursor.
const COMPLETION_TRIGGER_RE = /\{\{\s*[A-Za-z0-9_]*$/;

function createVariableCompletion(list: PromptVariableLister): Extension {
  const source = (context: CompletionContext): CompletionResult | null => {
    const before = context.matchBefore(COMPLETION_TRIGGER_RE);
    if (!before) {
      return null;
    }
    const typed = /[A-Za-z0-9_]*$/.exec(before.text)?.[0] ?? "";
    const from = context.pos - typed.length;
    const options = list().map((variable) => ({
      label: variable.name,
      detail: truncate(variable.hint, HINT_MAX_CHARS),
      type: "variable",
      // Insert just the name; add the closing `}}` only if it isn't already
      // there (bracket auto-close usually supplies it), then place the caret
      // after the closing braces.
      apply: (view: EditorView, _completion: unknown, applyFrom: number, applyTo: number) => {
        const hasClose = view.state.sliceDoc(applyTo, applyTo + 2) === "}}";
        view.dispatch({
          changes: {
            from: applyFrom,
            to: applyTo,
            insert: hasClose ? variable.name : `${variable.name}}}`,
          },
          selection: { anchor: applyFrom + variable.name.length + 2 },
        });
      },
    }));
    if (options.length === 0) {
      return null;
    }
    return { from, options, filter: true };
  };
  return autocompletion({ override: [source], icons: false });
}

export function createPromptVariableExtension({
  resolve,
  listVariables,
}: PromptVariableExtensionOptions): Extension[] {
  return [
    placeholderHighlighter,
    createHoverTooltip(resolve),
    createVariableCompletion(listVariables),
    // Render tooltips (hover + the completion dropdown) under document.body so
    // the editor's own overflow clipping (scroll containers) can't cut them off.
    tooltips({ parent: document.body }),
    theme,
  ];
}
