English | [中文](./variables-and-templates.zh-CN.md)

---

# Variables and Templates

Variables and templates let you keep prompts DRY and dynamic: pull out content that changes or is reused, reference it by name, and add logic such as conditionals, loops, and file includes. Everything here works in every text surface — the **System Prompt**, **messages**, and **tool results** — and the stored Thread template stays untouched; substitution happens only at run time.

> This page builds on the [Variables](./core-concepts.md#variables) section in Core Concepts. Read that first for the basics of `{{variable_name}}`.

# Variables (recap)

You write `{{variable_name}}` in the text, and at run time LLM Space replaces it with the variable's value.

- **Built-in variables** compute their value automatically: `{{current_date}}` and `{{available_skills}}`.
- **Custom (text) variables** are a `name → value` text pair you define once and reuse anywhere.
- **JSON variables** hold a JSON object or array that you can drill into and loop over in templates — see [JSON variables](#json-variables) below.
- **File content variables** hold a file path and inline that file's contents at run time — the named-variable form of `@include`. See [File content variables](#file-content-variables) below.
- A variable name must start with a letter or underscore and contain only letters, digits, and underscores.
- Any `{{...}}` that isn't a known variable is **left untouched**, so arbitrary braces in tool or web-search results are never mangled.

You manage all of these in the **Variables** dialog (open it from the variables chips above the prompt, or the editor's hover "inspect" button). Built-ins are seeded for you; use **Add ▸ Text** or **Add ▸ JSON** to create your own.

# Templates

On top of plain variables, LLM Space supports a **Jinja2-style template language** (powered by Nunjucks). This adds macros (starting with `@include`), conditionals, and loops, so you can assemble a prompt from smaller pieces and adapt it to context.

## When a template is rendered

To keep untrusted tool output safe, template rendering only kicks in for text that contains one of:

- a **block tag** — `{% … %}` (e.g. `{% if %}`, `{% for %}`);
- the **macro form** — `{{@ … }}` (e.g. `{{@include(...)}}`);
- a **`{{ … }}` expression** using member access, indexing, a filter, or a call — i.e. containing `.`, `[`, `|`, or `(` (e.g. `{{ user.name }}`, `{{ items[0] }}`, `{{ price | round }}`).

Everything else — a plain `{{variable}}` placeholder, or unrelated braces — uses the simpler variable substitution and is never parsed as a template. This is why a stray `{{a.b}}` in a pasted tool result is the one edge case that *does* get template-processed (an unknown value there renders empty rather than staying literal); it's rare and the trade-off buys standalone field access like `{{ user.name }}`.

If a template can't be parsed (for example a stray `{%` inside a pasted tool result, or a missing `{% endfor %}`), that text is **left unchanged** — a broken template never fails your run.

## The `@include` macro

`@include` inlines the contents of a file into your prompt:

```text
{{@include("~/notes/writing-style.md")}}
```

- The path may be **any absolute path**, and a leading `~` expands to your home directory.
- If the file doesn't exist (or can't be read), it is replaced with an **empty string** — no error.
- The included content is **rendered recursively**: it can itself use `{{variables}}`, control flow, and even nested `@include` (bounded by a depth limit to prevent cycles).

**Editor autocomplete:** in any prompt editor, type `{{` and pick **`@include`** from the suggestions (it appears alongside the variables) — or type `{{@`. The app inserts `@include("path/to/your/file")` with the placeholder path **selected**, so you can type the real path right away.

Prefer a reusable, named version? Use a [File content variable](#file-content-variables) instead of repeating the path.

## Conditionals

```text
{% if company_name %}
You represent {{company_name}}.
{% elif region %}
Operate under {{region}} guidelines.
{% else %}
Use the default policy.
{% endif %}
```

An empty or missing value is falsy, so `{% if company_name %}` is a handy way to include a block only when a variable is set.

Conditions are real expressions. You can combine them with `and` / `or` / `not`, compare with `==` `!=` `>` `<` `>=` `<=`, test membership with `in`, and use an inline `if/else`:

```text
{% if tier == "pro" and not trial %}Full access.{% endif %}
{% if tags and "urgent" in tags %}Escalate immediately.{% endif %}

Mode: {{ "verbose" if debug else "concise" }}
```

## Loops

```text
{% for item in ["research", "draft", "review"] %}
{{ loop.index }}. {{ item }}
{% endfor %}
```

Inside a loop these are available: `loop.index` (1-based), `loop.index0` (0-based), `loop.first`, `loop.last`, `loop.length`.

A `{% for %}` can also take an `{% else %}` that runs when the collection is empty, and you can iterate an object's `key, value` pairs:

```text
{% for doc in documents %}
### {{ loop.index }}. {{ doc.title }}
{{ doc.body }}
{% else %}
No documents provided.
{% endfor %}

{% for key, value in settings %}
- {{ key }}: {{ value }}
{% endfor %}
```

The lists/objects you loop over usually come from a **JSON variable** (below), a literal list like the first example, or an included file. Plain text variables can't be iterated as data.

## Using variables inside templates

Defined variables (built-in and custom) are available by name inside templates, and unknown names stay literal:

```text
{% if true %}Today is {{current_date}}. {{unknown_name}}{% endif %}
```

renders to something like `Today is 2026-07-20. {{unknown_name}}` — the known variable is resolved, and the unknown placeholder is preserved verbatim.

## JSON variables

A **JSON variable** holds a JSON object or array instead of plain text. At run time it is parsed into a real value, so templates can read fields, branch on them, and loop over them.

Create one in the **Variables** dialog with **Add ▸ JSON**, give it a name (say `profile`), and enter JSON in the editor (it's validated as you type):

```json
{
  "user": { "name": "Ada", "plan": "pro" },
  "features": ["search", "code", "vision"],
  "limits": { "maxTokens": 4096 }
}
```

Now use it by name. **Field access** drills in with `.`:

```text
Hello {{ profile.user.name }} — you're on the {{ profile.user.plan }} plan.
```

**Conditionals** read nested values:

```text
{% if profile.user.plan == "pro" %}
You have full access ({{ profile.limits.maxTokens }} tokens).
{% else %}
You are on the free plan.
{% endif %}
```

**Loops** iterate arrays (and `key, value` for objects):

```text
Enabled features:
{% for feature in profile.features %}
- {{ loop.index }}. {{ feature }}
{% endfor %}
```

Referencing the **whole variable** as `{{ profile }}` prints it as **pretty-printed JSON** — handy for dumping structured context to the model:

```text
Context:
{{ profile }}
```

Notes:

- Field access works **standalone** — `{{ profile.user.name }}` renders even in text with no `{% %}` tags (that's what the `.` / `[` / `|` / `(` trigger in [When a template is rendered](#when-a-template-is-rendered) is for).
- A **missing** field renders empty (`{{ profile.nope }}` → ``), so guard with `{% if %}` when a field may be absent.
- If the JSON is **invalid**, the editor shows the parse error and the variable is left unresolved at run time (its placeholders stay literal) rather than failing the run.

## File content variables

A **File content variable** holds a file **path**, and at run time it is replaced by that file's **contents** — the same capability as `@include`, but as a reusable named variable instead of an inline macro.

Create one in the **Variables** dialog with **Add ▸ File content**, then set the path either by clicking **Browse…** (which opens the native OS file picker) or by typing it directly — a leading `~` expands to your home directory, and the path is **not** checked for existence.

Reference it by name to inline the file:

```text
{{ writing_style }}

Follow the style guide above.
```

- A **missing or unreadable** file inlines an **empty string** — no error.
- An **empty path** leaves the placeholder literal (like an unset variable).
- Contents are inlined **raw** — variables and template tags inside the file are **not** re-rendered. If you need the file's own `{{variables}}` / `{% … %}` to render, use [`@include`](#the-include-macro) instead (it renders recursively).
- In the display-only web viewer there is no filesystem, so a File content variable inlines nothing.

Use a File content variable when the same external file is referenced from several prompts/threads and you'd rather manage the path in one place than repeat `@include("…")`.

## Filters

Filters transform a value with `|`. A few useful ones:

```text
{{ name | default("there") }}          {# fallback when empty/undefined #}
{{ profile.features | length }}         {# 3 #}
{{ profile.features | join(", ") }}     {# search, code, vision #}
{{ profile.user.name | upper }}         {# ADA #}
{{ notes | truncate(200) }}
```

Filters chain left to right: `{{ items | sort | join(", ") }}`.

## A fuller example

Combining an `@include` persona, a JSON variable `brief`, and control flow:

```text
{{@include("~/prompts/persona.md")}}

## Task
{% if brief.audience %}Write for: {{ brief.audience }}.{% else %}Write for a general audience.{% endif %}
Tone: {{ brief.tone | default("neutral") }}.

## Sources ({{ brief.sources | length }})
{% for src in brief.sources %}
- [{{ loop.index }}] {{ src.title }} — {{ src.url }}
{% else %}
(none provided)
{% endfor %}

## Checklist
{% for step in ["outline", "draft", "cite sources", "proofread"] %}
- [ ] {{ loop.index }}. {{ step }}
{% endfor %}

Current date: {{current_date}}
```

…where `brief` is a JSON variable such as:

```json
{
  "audience": "engineers",
  "tone": "concise",
  "sources": [{ "title": "RFC 9110", "url": "https://www.rfc-editor.org/rfc/rfc9110" }]
}
```

# Editor support

The prompt editors (System Prompt, messages, and tool results) understand template syntax:

- **Highlighting** — `{{variable}}` placeholders are highlighted in amber, and `{% … %}` tags in violet, so template structure stands out from the surrounding text. Highlighting is purely syntactic; it never validates names.
- **Variable / `@include` completion** — type `{{` to get a list of the available variables plus **`@include`**. Selecting `@include` inserts `@include("path/to/your/file")` with the placeholder path selected, ready to type over. (Typing `{{@` narrows straight to `@include`.)
- **Tag completion** — type `{%` to get the block tags: `if`, `elif`, `else`, `endif`, `for`, `endfor`, `set`, `raw`, `endraw`. Each inserts a complete `{% … %}` tag with the cursor placed where you continue typing (for example `{% for ‸ in  %}`).

# Rendering, storage, and run history

- Substitution runs at **run time**; the saved Thread keeps the original `{{...}}` and `{% ... %}` source.
- Once a message or tool result has been run, its rendered output is **frozen for that run's history**, so replays and comparisons stay byte-stable even if an included file or the clock later changes. Editing the source text re-renders it on the next run.
- In the display-only web viewer there is no filesystem, so `@include` resolves to an empty string.

# Tips

- Keep reusable blocks (personas, tone-of-voice, shared constraints) in Markdown files and pull them in with `@include`, or store short snippets as custom text variables.
- Put structured, reused data (config, records, feature flags) in a **JSON variable** and drive `{% if %}` / `{% for %}` from it, instead of hand-editing many prompts.
- Use `{% if %}` to toggle optional sections without maintaining multiple prompts.
- Guard fields that may be missing with `{% if data.field %}` or `| default(...)` — a missing field renders empty.
- If a template surface renders unexpectedly as plain text, check that its tags are balanced — an unparseable template silently falls back to the original text.

---

See also:

- [Core Concepts › Variables](./core-concepts.md#variables)
- [Quick Start](./get-started.md)
- [Settings › Skills](./settings.md)
