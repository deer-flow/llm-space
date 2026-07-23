import nunjucks from "nunjucks";

/**
 * Jinja2-style template rendering (via Nunjucks) layered on top of the flat
 * `{{variable}}` substitution in {@link ./prompt-variables}. Only text that the
 * dispatcher has already identified as template-bearing (see
 * {@link TEMPLATE_MARKER_RE}) reaches this module; plain variable text keeps the
 * cheaper, literal-safe path.
 *
 * `@include(path)` inlines a file's contents (read through an injected async
 * `loadFile`), rendering the result recursively so an included file can itself
 * use variables, logic, and nested includes. `exists(path)` can guard optional
 * readable files. Missing includes resolve to `""`.
 */

/**
 * A text is treated as a template when it contains a block tag (`{% … %}`), the
 * `@`-macro form (`{{@ … }}`), or a `{{ … }}` expression using member access,
 * indexing, a filter, or a call (`.`, `[`, `|`, `(`) — e.g. `{{ user.name }}`,
 * `{{ items[0] }}`, `{{ x | round }}`. Plain `{{name}}` placeholders and
 * unrelated braces (including stray `{{…}}` in untrusted tool/web output) stay
 * on the literal-safe simple path so they are never mangled or blanked.
 */
export const TEMPLATE_MARKER_RE = /\{%|\{\{\s*@|\{\{[^{}]*[.[|(]/;

/** Max nesting for recursive `@include` (cycle / runaway guard). */
export const MAX_INCLUDE_DEPTH = 10;

/** Max total `@include` reads per render (fan-out guard). */
export const MAX_INCLUDE_COUNT = 100;

/** `{{@include(<args>)}}` → `{{ (<args>) | __include }}` (a native async filter). */
const INCLUDE_MACRO_RE = /\{\{\s*@include\(([\s\S]*?)\)\s*\}\}/g;

/** Template tags in which `exists(path)` function sugar may be rewritten. */
const TEMPLATE_TAG_RE = /\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g;

/** Identifiers referenced inside a `{{…}}` output or `{%…%}` tag. */
const EXPRESSION_RE = /\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g;
const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/g;
const STRING_LITERAL_RE = /"[^"]*"|'[^']*'/g;

/**
 * Nunjucks keywords, literals, built-in globals, and the loop variable — names
 * that must never be shadowed by a literal sentinel (below).
 */
const RESERVED_NAMES = new Set([
  "if",
  "elif",
  "else",
  "endif",
  "for",
  "endfor",
  "in",
  "and",
  "or",
  "not",
  "is",
  "true",
  "false",
  "none",
  "null",
  "set",
  "endset",
  "macro",
  "endmacro",
  "call",
  "endcall",
  "filter",
  "endfilter",
  "block",
  "endblock",
  "extends",
  "include",
  "import",
  "from",
  "as",
  "do",
  "with",
  "without",
  "raw",
  "endraw",
  "asyncEach",
  "asyncAll",
  "loop",
  "super",
  "range",
  "cycler",
  "joiner",
]);

export interface RenderTemplateInput {
  text: string;
  /**
   * Pre-resolved variables. Values are strings (e.g. `current_date`), except
   * JSON variables, which are the parsed object/array so templates can access
   * fields and iterate.
   */
  knownVars: Record<string, unknown>;
  /** Reads a file's UTF-8 contents; returns `""` when missing. */
  loadFile: (path: string) => Promise<string>;
  /** Whether a path points to a readable regular file. */
  fileExists?: (path: string) => Promise<boolean>;
}

/**
 * Rewrite the `@include(...)` macro sugar into an ordinary Nunjucks filter
 * pipeline so the rest is standard Nunjucks. `@` is not a valid Nunjucks
 * identifier char, so this must happen before compilation.
 */
function _rewriteMacros(text: string): string {
  const includesRewritten = text.replace(
    INCLUDE_MACRO_RE,
    (_match, args: string) => {
      const expr = args.trim();
      return expr.length === 0 ? "" : `{{ ${expr} | __include }}`;
    }
  );
  return includesRewritten.replace(TEMPLATE_TAG_RE, _rewriteExistsCalls);
}

/** Rewrite balanced `exists(...)` calls while leaving quoted text untouched. */
function _rewriteExistsCalls(tag: string): string {
  let output = "";
  let cursor = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  while (cursor < tag.length) {
    const char = tag[cursor]!;
    if (quote) {
      output += char;
      cursor++;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      output += char;
      cursor++;
      continue;
    }
    if (
      tag.startsWith("exists", cursor) &&
      !/[A-Za-z0-9_]/.test(tag[cursor - 1] ?? "") &&
      !/[A-Za-z0-9_]/.test(tag[cursor + 6] ?? "")
    ) {
      let open = cursor + 6;
      while (/\s/.test(tag[open] ?? "")) open++;
      if (tag[open] === "(") {
        const close = _findClosingParen(tag, open);
        if (close !== -1) {
          const expr = tag.slice(open + 1, close).trim();
          output += expr.length === 0 ? "false" : `((${expr}) | __exists)`;
          cursor = close + 1;
          continue;
        }
      }
    }
    output += char;
    cursor++;
  }
  return output;
}

function _findClosingParen(source: string, open: number): number {
  let depth = 1;
  let quote: '"' | "'" | null = null;
  let escaped = false;
  for (let index = open + 1; index < source.length; index++) {
    const char = source[index]!;
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")" && --depth === 0) {
      return index;
    }
  }
  return -1;
}

/**
 * Build the Nunjucks context for one source: the known variables plus a literal
 * sentinel (`{{name}}`) for every other identifier the template references. The
 * sentinels re-emit an unknown placeholder verbatim instead of blanking it —
 * preserving the simple path's "leave unknown `{{…}}` untouched" guarantee even
 * inside opted-in template text. A plain object is required because Nunjucks
 * copies the context (a Proxy's traps would be discarded). Loop / `{% set %}`
 * locals resolve from the Nunjucks frame first, so a same-named sentinel never
 * shadows them.
 */
function _buildRenderContext(
  rewritten: string,
  knownVars: Record<string, unknown>
): Record<string, unknown> {
  const context: Record<string, unknown> = { ...knownVars };
  for (const match of rewritten.matchAll(EXPRESSION_RE)) {
    const inner = (match[1] ?? match[2] ?? "").replace(STRING_LITERAL_RE, " ");
    for (const idMatch of inner.matchAll(IDENTIFIER_RE)) {
      const name = idMatch[0];
      if (
        name.startsWith("__") ||
        RESERVED_NAMES.has(name) ||
        Object.prototype.hasOwnProperty.call(context, name)
      ) {
        continue;
      }
      context[name] = `{{${name}}}`;
    }
  }
  return context;
}

/**
 * Render template-bearing text. Throws on parse/render failure — the caller is
 * expected to fall back to the original text (silent fallback).
 */
export async function renderTemplateText({
  text,
  knownVars,
  loadFile,
  fileExists = () => Promise.resolve(false),
}: RenderTemplateInput): Promise<string> {
  const env = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: false,
  });

  // Nesting depth + total count guard recursion. Async filters run to
  // completion before the compiled template proceeds, so a depth-first include
  // chain increments on the way down and restores on the way up; siblings see
  // depth back at their parent level.
  let depth = 0;
  let includeCount = 0;
  const existenceCache = new Map<string, Promise<boolean>>();

  const render = (source: string): Promise<string> => {
    const rewritten = _rewriteMacros(source);
    const context = _buildRenderContext(rewritten, knownVars);
    return new Promise((resolve, reject) => {
      env.renderString(rewritten, context, (err, result) => {
        if (err) {
          reject(err);
        } else {
          resolve(result ?? "");
        }
      });
    });
  };

  env.addFilter(
    "__include",
    (pathArg: unknown, callback: (err: unknown, result: string) => void) => {
      void (async (): Promise<string> => {
        try {
          if (typeof pathArg !== "string" || pathArg.length === 0) {
            return "";
          }
          if (depth >= MAX_INCLUDE_DEPTH || includeCount >= MAX_INCLUDE_COUNT) {
            return "";
          }
          includeCount++;
          const content = await loadFile(pathArg);
          if (!content) {
            return "";
          }
          depth++;
          try {
            try {
              return await render(content);
            } catch {
              // The file was read successfully but is not itself a valid
              // template (for example, documentation containing literal
              // `{% if %}` snippets). Preserve the complete source instead of
              // silently erasing a readable include.
              return content;
            }
          } finally {
            depth--;
          }
        } catch {
          // A missing/unreadable include is localized to "" rather than failing
          // the whole surrounding text.
          return "";
        }
      })().then(
        (result) => callback(null, result),
        () => callback(null, "")
      );
    },
    true
  );

  env.addFilter(
    "__exists",
    (pathArg: unknown, callback: (err: unknown, result: boolean) => void) => {
      if (typeof pathArg !== "string" || pathArg.length === 0) {
        callback(null, false);
        return;
      }
      let pending = existenceCache.get(pathArg);
      if (!pending) {
        pending = Promise.resolve()
          .then(() => fileExists(pathArg))
          .catch(() => false);
        existenceCache.set(pathArg, pending);
      }
      void pending.then(
        (result) => callback(null, result),
        () => callback(null, false)
      );
    },
    true
  );

  return render(text);
}
