import {
  autocompletion,
  type Completion,
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
} from "./prompt-variable-display";

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
  /**
   * Opens the Variables dialog focused on `name`. When provided, the hover
   * tooltip shows a header button (for defined variables only) that calls it.
   */
  onInspect?: (name: string) => void;
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
    minWidth: "260px",
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
  ".cm-prompt-variable-tooltip .cm-pv-header": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginBottom: "5px",
    paddingBottom: "5px",
    borderBottom: "1px solid var(--border)",
  },
  ".cm-prompt-variable-tooltip .cm-pv-label": {
    flex: "1 1 auto",
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    color: "var(--cm-variable)",
    fontFamily: "var(--font-mono)",
    fontSize: "13px",
    fontWeight: "600",
  },
  ".cm-prompt-variable-tooltip .cm-pv-inspect": {
    display: "inline-flex",
    flexShrink: "0",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    padding: "0",
    border: "none",
    borderRadius: "4px",
    background: "transparent",
    color: "var(--muted-foreground)",
    cursor: "pointer",
  },
  ".cm-prompt-variable-tooltip .cm-pv-inspect:hover": {
    background: "var(--accent)",
    color: "var(--foreground)",
  },
  ".cm-prompt-variable-tooltip .cm-pv-inspect svg": {
    width: "14px",
    height: "14px",
  },
  ".cm-prompt-variable-tooltip .cm-pv-value": {
    fontFamily: "var(--font-mono)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  ".cm-prompt-variable-tooltip .cm-pv-warning": {
    color: "var(--destructive)",
  },
  // `{{`-triggered variable completion dropdown — match the app popover. Not
  // scoped under `.cm-editor`: with tooltips parented to document.body their
  // container only carries the theme scope class, not `.cm-editor`.
  ".cm-tooltip-autocomplete": {
    background: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 8px 24px oklch(0 0 0 / 0.35)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": {
    fontFamily: "var(--font-mono)",
    // At least ~5 rows tall so the popup has presence with few variables.
    minHeight: "5rem",
    maxHeight: "10rem",
    padding: "3px",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 10px",
    borderRadius: "5px",
    fontSize: "13px",
    lineHeight: "1.5",
    color: "var(--popover-foreground)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    background: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  ".cm-pv-completion-icon": {
    display: "inline-flex",
    flexShrink: "0",
    color: "var(--cm-variable)",
  },
  ".cm-pv-completion-icon svg": {
    width: "14px",
    height: "14px",
  },
  ".cm-tooltip-autocomplete .cm-completionLabel": {
    fontWeight: "500",
  },
  ".cm-tooltip-autocomplete .cm-completionDetail": {
    marginLeft: "auto",
    paddingLeft: "12px",
    fontStyle: "normal",
    color: "var(--muted-foreground)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: "18rem",
  },
  // Keep the icon and value readable on the primary-colored selected row.
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-pv-completion-icon": {
    color: "var(--primary-foreground)",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail": {
    color: "var(--primary-foreground)",
    opacity: "0.8",
  },
});

// Curly-braces glyph (lucide "braces") marking each option as a variable.
// Static, trusted markup — never interpolates user data.
function variableIconDom(): HTMLElement {
  const wrap = document.createElement("span");
  wrap.className = "cm-pv-completion-icon";
  wrap.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/></svg>';
  return wrap;
}

function renderTooltipDom(
  name: string,
  resolution: VariableResolution,
  onInspect?: (name: string) => void
): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-prompt-variable-tooltip";

  // Header: the variable name (in the highlight color) + an optional button to
  // open the Variables dialog focused on this variable.
  const header = document.createElement("div");
  header.className = "cm-pv-header";
  const label = document.createElement("div");
  label.className = "cm-pv-label";
  label.textContent = name;
  header.appendChild(label);
  const defined = resolution.status === "ok" || resolution.status === "empty";
  if (onInspect && defined) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cm-pv-inspect";
    button.title = "View variable details";
    button.setAttribute("aria-label", "View variable details");
    button.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>';
    // Keep editor focus/selection so opening the dialog doesn't disturb it.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onInspect(name);
    });
    header.appendChild(button);
  }
  root.appendChild(header);

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

function createHoverTooltip(
  resolve: PromptVariableResolver,
  onInspect?: (name: string) => void
): Extension {
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
          create: () => ({ dom: renderTooltipDom(name, resolution, onInspect) }),
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
    const options: Completion[] = list().map((variable) => ({
      label: variable.name,
      detail: truncate(variable.hint, HINT_MAX_CHARS),
      type: "variable",
      // Insert just the name; add the closing `}}` only if it isn't already
      // there (bracket auto-close usually supplies it), then place the caret
      // after the closing braces.
      apply: (view, _completion, applyFrom, applyTo) => {
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
  return autocompletion({
    override: [source],
    // Replace the default icon column with our own variable (braces) icon.
    icons: false,
    addToOptions: [{ render: () => variableIconDom(), position: 20 }],
  });
}

export function createPromptVariableExtension({
  resolve,
  listVariables,
  onInspect,
}: PromptVariableExtensionOptions): Extension[] {
  return [
    placeholderHighlighter,
    createHoverTooltip(resolve, onInspect),
    createVariableCompletion(listVariables),
    // Render tooltips (hover + the completion dropdown) under document.body so
    // the editor's own overflow clipping (scroll containers) can't cut them off.
    tooltips({ parent: document.body }),
    theme,
  ];
}
