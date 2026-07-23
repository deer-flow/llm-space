import { describe, expect, test } from "bun:test";

import {
  MAX_INCLUDE_DEPTH,
  renderTemplateText,
  TEMPLATE_MARKER_RE,
} from "./template-render";

const noFile = () => Promise.resolve("");

describe("TEMPLATE_MARKER_RE", () => {
  test("matches block tags and the @-macro", () => {
    expect(TEMPLATE_MARKER_RE.test("{% for x in y %}")).toBe(true);
    expect(TEMPLATE_MARKER_RE.test('{{@include("x")}}')).toBe(true);
    expect(TEMPLATE_MARKER_RE.test("{{ @include(x) }}")).toBe(true);
  });

  test("ignores plain variables and stray braces", () => {
    expect(TEMPLATE_MARKER_RE.test("{{ current_date }}")).toBe(false);
    expect(TEMPLATE_MARKER_RE.test("a { b } {{c}} text")).toBe(false);
    // A JSON-ish tool result with double braces is NOT a template.
    expect(TEMPLATE_MARKER_RE.test('{"a": {{ "nested" }} }')).toBe(false);
  });

  test("matches member access, indexing, filters, and calls in {{ }}", () => {
    expect(TEMPLATE_MARKER_RE.test("{{ user.name }}")).toBe(true);
    expect(TEMPLATE_MARKER_RE.test("{{ items[0] }}")).toBe(true);
    expect(TEMPLATE_MARKER_RE.test("{{ price | round }}")).toBe(true);
    expect(TEMPLATE_MARKER_RE.test("{{ include(x) }}")).toBe(true);
  });
});

describe("renderTemplateText", () => {
  test("renders {% if %} / {% else %}", async () => {
    const out = await renderTemplateText({
      text: "{% if pro %}PRO{% else %}FREE{% endif %}",
      knownVars: { pro: "" },
      loadFile: noFile,
    });
    // Empty string is falsy in Nunjucks (JS truthiness), so the else branch runs.
    expect(out).toBe("FREE");
  });

  test("renders {% for %} with loop.index over a literal list", async () => {
    const out = await renderTemplateText({
      text: '{% for t in ["a","b","c"] %}{{ loop.index }}:{{ t }} {% endfor %}',
      knownVars: {},
      loadFile: noFile,
    });
    expect(out).toBe("1:a 2:b 3:c ");
  });

  test("@include inlines file contents", async () => {
    const out = await renderTemplateText({
      text: 'before {{@include("~/x.md")}} after',
      knownVars: {},
      loadFile: (p) => Promise.resolve(p === "~/x.md" ? "FILE" : ""),
    });
    expect(out).toBe("before FILE after");
  });

  test("@include of a missing file yields empty string", async () => {
    const out = await renderTemplateText({
      text: 'a{{@include("nope.md")}}b',
      knownVars: {},
      loadFile: noFile,
    });
    expect(out).toBe("ab");
  });

  test("exists(path) guards a readable file, including an empty file", async () => {
    const source =
      '{% if exists(root ~ "/AGENTS.md") %}FOUND{% else %}MISSING{% endif %}';
    const paths: string[] = [];
    const out = await renderTemplateText({
      text: source,
      knownVars: { root: "/workspace" },
      loadFile: noFile,
      fileExists: (path) => {
        paths.push(path);
        return Promise.resolve(path === "/workspace/AGENTS.md");
      },
    });
    expect(out).toBe("FOUND");
    expect(paths).toEqual(["/workspace/AGENTS.md"]);
  });

  test("exists(path) renders the false branch when unavailable", async () => {
    const out = await renderTemplateText({
      text: '{% if exists("missing.md") %}FOUND{% else %}MISSING{% endif %}',
      knownVars: {},
      loadFile: noFile,
      fileExists: () => Promise.resolve(false),
    });
    expect(out).toBe("MISSING");
  });

  test("exists(path) memoizes repeated checks within one render", async () => {
    let checks = 0;
    const out = await renderTemplateText({
      text: '{% if exists("x") and exists("x") %}YES{% endif %}',
      knownVars: {},
      loadFile: noFile,
      fileExists: () => {
        checks++;
        return Promise.resolve(true);
      },
    });
    expect(out).toBe("YES");
    expect(checks).toBe(1);
  });

  test("exists(path) supports nested expressions and ignores quoted text", async () => {
    const paths: string[] = [];
    const out = await renderTemplateText({
      text: "{{ 'exists(fake)' }} {% if exists((root ~ '/a(b).md')) %}YES{% endif %}",
      knownVars: { root: "/workspace" },
      loadFile: noFile,
      fileExists: (path) => {
        paths.push(path);
        return Promise.resolve(true);
      },
    });
    expect(out).toBe("exists(fake) YES");
    expect(paths).toEqual(["/workspace/a(b).md"]);
  });

  test("@include renders included content recursively (vars + nested include)", async () => {
    const files: Record<string, string> = {
      "outer.md": 'Hi {{ name }} {{@include("inner.md")}}',
      "inner.md": "[nested]",
    };
    const out = await renderTemplateText({
      text: '{{@include("outer.md")}}',
      knownVars: { name: "Ada" },
      loadFile: (p) => Promise.resolve(files[p] ?? ""),
    });
    expect(out).toBe("Hi Ada [nested]");
  });

  test("@include preserves readable content that is not a valid template", async () => {
    const content =
      "Template examples: `{% if %}` / `{% for %}` and {{ literal }}.";
    const out = await renderTemplateText({
      text: '{{@include("AGENTS.md")}}',
      knownVars: {},
      loadFile: (path) => Promise.resolve(path === "AGENTS.md" ? content : ""),
    });
    expect(out).toBe(content);
  });

  test("self-including file terminates at the depth guard", async () => {
    let reads = 0;
    const out = await renderTemplateText({
      text: '{{@include("loop.md")}}',
      knownVars: {},
      loadFile: (p) => {
        if (p === "loop.md") {
          reads++;
          return Promise.resolve('x{{@include("loop.md")}}');
        }
        return Promise.resolve("");
      },
    });
    // Terminates (does not hang) and is bounded by the depth guard.
    expect(reads).toBeLessThanOrEqual(MAX_INCLUDE_DEPTH + 1);
    expect(out.startsWith("x")).toBe(true);
  });

  test("known variables substitute; unknown top-level names stay literal", async () => {
    const out = await renderTemplateText({
      text: "{% if true %}{{ current_date }} / {{ mystery }}{% endif %}",
      knownVars: { current_date: "2026-07-20" },
      loadFile: noFile,
    });
    expect(out).toBe("2026-07-20 / {{mystery}}");
  });

  test("does not HTML-escape output (autoescape off)", async () => {
    const out = await renderTemplateText({
      text: "{% if true %}{{ v }}{% endif %}",
      knownVars: { v: '<a> & "b"' },
      loadFile: noFile,
    });
    expect(out).toBe('<a> & "b"');
  });

  test("throws on malformed template so the caller can fall back", async () => {
    let threw = false;
    try {
      await renderTemplateText({
        text: "{% for x in y %}oops",
        knownVars: {},
        loadFile: noFile,
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});

describe("renderTemplateText — object (JSON) variables", () => {
  const knownVars = {
    user: { name: "Ada", active: true },
    items: ["a", "b", "c"],
    flags: { beta: true },
  };

  test("field access via {{ obj.field }}", async () => {
    const out = await renderTemplateText({
      text: "Hi {{ user.name }}",
      knownVars,
      loadFile: noFile,
    });
    expect(out).toBe("Hi Ada");
  });

  test("iterates an array field with {% for %}", async () => {
    const out = await renderTemplateText({
      text: "{% for i in items %}{{ i }}{% endfor %}",
      knownVars,
      loadFile: noFile,
    });
    expect(out).toBe("abc");
  });

  test("branches on a nested boolean with {% if %}", async () => {
    const out = await renderTemplateText({
      text: "{% if flags.beta %}beta{% else %}stable{% endif %}",
      knownVars,
      loadFile: noFile,
    });
    expect(out).toBe("beta");
  });

  test("missing field renders empty", async () => {
    const out = await renderTemplateText({
      text: "[{{ user.missing }}]",
      knownVars,
      loadFile: noFile,
    });
    expect(out).toBe("[]");
  });

  test("unknown top-level object name stays literal", async () => {
    const out = await renderTemplateText({
      text: "{% if true %}{{ user.name }} {{ stray }}{% endif %}",
      knownVars,
      loadFile: noFile,
    });
    expect(out).toBe("Ada {{stray}}");
  });
});
