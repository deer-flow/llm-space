import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { type Extension } from "@codemirror/state";
import {
  EditorView,
  hoverTooltip,
  tooltips,
  type Tooltip,
} from "@codemirror/view";
import type {
  PromptVariableCompletion,
  VariableResolution,
} from "@llm-space/core/thread";

export const PROMPT_VARIABLE_PATTERN =
  String.raw`\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}`;
export const PROMPT_TEMPLATE_TAG_PATTERN = String.raw`\{%[-+]?[\s\S]*?[-+]?%\}`;

export const PROMPT_VARIABLE_STYLE = {
  color: "var(--cm-variable)",
  fontWeight: "500",
} as const;

export const PROMPT_TEMPLATE_TAG_STYLE = {
  color: "var(--cm-template-tag)",
  fontWeight: "500",
} as const;

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

export interface PromptSyntaxEditingOptions {
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

// Hover recognition is syntactic only — a well-formed `{{name}}` with optional
// inner whitespace. Visual matching is owned by the declarative enhancement.
const PLACEHOLDER_RE = new RegExp(PROMPT_VARIABLE_PATTERN, "g");

const theme = EditorView.theme({
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
    body.textContent = resolution.value;
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
// Match `{{@` + a partial macro name ending at the cursor (e.g. `{{@inc`).
const MACRO_TRIGGER_RE = /\{\{\s*@[A-Za-z]*$/;
// Inserted before the quoted path, e.g. `@include("`.
const INCLUDE_SNIPPET_PREFIX = '@include("';
// Placeholder path inserted (and pre-selected) so the user can type over it.
const INCLUDE_PLACEHOLDER = "path/to/your/file";

// The `@include` macro completion. Offered both after `{{@` and alongside the
// plain `{{` variable list, so it is discoverable without typing `@` first.
const includeCompletion: Completion = {
  label: "@include",
  detail: "Insert file contents",
  type: "function",
  apply: (view, _completion, applyFrom, applyTo) => {
    const hasClose = view.state.sliceDoc(applyTo, applyTo + 2) === "}}";
    const body = `${INCLUDE_SNIPPET_PREFIX}${INCLUDE_PLACEHOLDER}")`;
    const selectionStart = applyFrom + INCLUDE_SNIPPET_PREFIX.length;
    view.dispatch({
      changes: {
        from: applyFrom,
        to: applyTo,
        insert: hasClose ? body : `${body}}}`,
      },
      // Select the placeholder path so the user can type over it immediately.
      selection: {
        anchor: selectionStart,
        head: selectionStart + INCLUDE_PLACEHOLDER.length,
      },
    });
  },
};

// Match `{%` (optional whitespace-control + spaces) + a partial tag keyword.
const TAG_TRIGGER_RE = /\{%[-+]?\s*[a-zA-Z]*$/;
// Caret positions are encoded as numeric offsets in TEMPLATE_TAGS below.
// " ";
// The Jinja/Nunjucks block tags offered after `{%`. `insert` is a complete
// `{% … %}` tag; `caret` is the cursor offset within it after insertion.
const TEMPLATE_TAGS: {
  label: string;
  detail: string;
  insert: string;
  caret: number;
}[] = [
  { label: "if", detail: "Conditional", insert: "{% if  %}", caret: 6 },
  { label: "elif", detail: "Else-if branch", insert: "{% elif  %}", caret: 8 },
  { label: "else", detail: "Else branch", insert: "{% else %}", caret: 10 },
  { label: "endif", detail: "Close if", insert: "{% endif %}", caret: 11 },
  { label: "for", detail: "Loop", insert: "{% for  in  %}", caret: 7 },
  { label: "endfor", detail: "Close for", insert: "{% endfor %}", caret: 12 },
  { label: "set", detail: "Assign", insert: "{% set  =  %}", caret: 7 },
  {
    label: "raw",
    detail: "Literal block",
    insert: "{% raw %}{% endraw %}",
    caret: 9,
  },
  { label: "endraw", detail: "Close raw", insert: "{% endraw %}", caret: 12 },
];

export function createPromptCompletionSource(
  list: PromptVariableLister
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    // Macro completion: only `@include(path)` is offered, per design. The `@`
    // form can't match the variable trigger below, so the two never overlap.
    const macroBefore = context.matchBefore(MACRO_TRIGGER_RE);
    if (macroBefore) {
      const typedMacro = /@[A-Za-z]*$/.exec(macroBefore.text)?.[0] ?? "@";
      return {
        from: context.pos - typedMacro.length,
        filter: true,
        options: [includeCompletion],
      };
    }

    // Tag completion: after `{%`, offer the block tags (if/for/set/…). Each
    // inserts a complete `{% … %}` tag, rewriting from the `{%` and swallowing
    // whatever close already trails the cursor so we never double a brace.
    const tagBefore = context.matchBefore(TAG_TRIGGER_RE);
    if (tagBefore) {
      const typedTag = /[a-zA-Z]*$/.exec(tagBefore.text)?.[0] ?? "";
      const options: Completion[] = TEMPLATE_TAGS.map((tag) => ({
        label: tag.label,
        detail: tag.detail,
        type: "keyword",
        apply: (view, _completion, _applyFrom, applyTo) => {
          // Anchor the rewrite at the opening `{%` (robust to stale positions).
          const head = view.state.sliceDoc(Math.max(0, applyTo - 64), applyTo);
          const rel = head.lastIndexOf("{%");
          const start = rel === -1 ? applyTo : applyTo - (head.length - rel);
          // Swallow an existing close that bracket auto-close left behind — a
          // full `%}` OR a lone `}` (typing `{` inserts `}`, so `{%` → `{%}`).
          const after = view.state.sliceDoc(applyTo, applyTo + 16);
          const closeLen = /^\s*%?\}/.exec(after)?.[0].length ?? 0;
          view.dispatch({
            changes: { from: start, to: applyTo + closeLen, insert: tag.insert },
            selection: { anchor: start + tag.caret },
          });
        },
      }));
      return { from: context.pos - typedTag.length, options, filter: true };
    }

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
    // Also surface `@include` in the plain `{{` list so it's discoverable
    // without typing `@` first; fuzzy filtering hides it as the user narrows.
    options.push(includeCompletion);
    return { from, options, filter: true };
  };
}

function createVariableCompletion(list: PromptVariableLister): Extension {
  const source = createPromptCompletionSource(list);
  return autocompletion({
    override: [source],
    // Replace the default icon column with our own variable (braces) icon.
    icons: false,
    addToOptions: [{ render: () => variableIconDom(), position: 20 }],
  });
}

export function createPromptSyntaxEditingExtensions({
  resolve,
  listVariables,
  onInspect,
}: PromptSyntaxEditingOptions): Extension[] {
  return [
    createHoverTooltip(resolve, onInspect),
    createVariableCompletion(listVariables),
    // Render tooltips (hover + the completion dropdown) under document.body so
    // the editor's own overflow clipping (scroll containers) can't cut them off.
    tooltips({ parent: document.body }),
    theme,
  ];
}
