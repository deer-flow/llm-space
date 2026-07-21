# Changelog

All notable changes to LLM Space are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.4.0] - 2026-07-21

Turn any thread into a runnable agent.

### Added

- **Generate a runnable agent (Beta).** Export a thread as a runnable LangGraph
  (Python) project. A step-by-step wizard scaffolds a `uv` project with your
  model factory, the rendered prompt (variables stay live at run time), your
  built-in tools as real code, importable stubs for custom function tools, and
  an MCP scaffold — then writes a short `PLAN.md` for your coding agent to finish
  and opens the project. Ships with a local web UI and debugger via
  `uv run langgraph dev`.

## [4.3.0] - 2026-07-20

Prompt templates grow up: Jinja2 logic, richer variables, and in-app reminders
that point you to what's new.

### Added

- **Jinja2 prompt templates.** Prompts now support Jinja2 syntax — `{% if %}` /
  `{% for %}`, field access (`{{ user.name }}`), filters (`{{ x | upper }}`), and
  an `@include("path/to/file")` macro to inline another file's contents.
- **New variable types.** Alongside plain **Text**, add **JSON** variables
  (parsed at render into an object you can branch and iterate over; a bare
  `{{ data }}` prints pretty JSON) and **File content** variables (pick a file
  via the native OS picker or type a path; its contents are inlined at run time).

### Changed

- The model selector shows its parameter buttons by default and selects the model
  name on focus for quicker editing.

### Fixed

- External links are restricted to safe URL schemes.
- Root directory creation is confined to the expected location.
- Thread files are written atomically to avoid corruption on interrupted writes.

### Performance

- The trace sidebar is lazy-loaded.
- The RPC stream queue is now amortized O(1).

## [4.2.1] - 2026-07-20

A small maintenance release: a new model and a couple of fixes.

### Added

- **Kimi K3** is now available as a built-in model.

### Fixed

- Codex CLI authentication is restored.
- The tool and variable lists in the thread playground now scroll within a
  bounded height instead of pushing the layout.

## [4.2.0] - 2026-07-17

Share your threads with anyone via a link.

### Added

- **Share a thread.** Click the **share icon** in the thread toolbar (top-right,
  next to run history) — or use **File → Share…**, or right-click a thread in the
  file tree and choose **Share…** — to publish it as a link anyone can open in
  their browser. The thread is published as a **secret GitHub Gist** under your
  account; delete the gist to revoke access.
- **GitHub sign-in.** Sign in to GitHub from **Settings → Account**. Sharing
  needs it, so the Share dialog also walks you through signing in the first time.

## [4.1.1] - 2026-07-16

A small UX release focused on the tool import dialogs.

### Changed

- The built-in and MCP tool import dialogs now show per-category / per-server
  actions in the sidebar, including **Enable all** and **Disable all** for
  quickly toggling every tool in a group.
- The tools row in the thread playground now scrolls instead of pushing the
  layout when many tools are added.

## [4.1.0] - 2026-07-16

A maintenance release: no major new features, a handful of bug fixes, and three
new model/search providers.

### Added

- **VolcEngine Agent Plan** model provider, with its models available out of the
  box.
- **Brave Search** as a web-search provider, selectable in Settings → Search.
- A new model for the existing **Coding Plan** provider.

### Fixed

- Merging tabs correctly after a thread is overwritten.
- Renaming a thread no longer overwrites an existing thread with the same name.
- Deleting a prompt variable now asks for confirmation when the variable is
  referenced across multiple threads.
- Image content on assistant messages is ignored instead of causing errors.
- The active-tab ref is synced outside the render body, fixing a stale-reference
  edge case.
- Brave Search API errors are now surfaced to the user.
- Long skill descriptions no longer overflow their container.

## [4.0.1]

Baseline for this changelog. See the
[GitHub releases](https://github.com/deer-flow/llm-space/releases) for earlier
history.

[4.2.0]: https://github.com/deer-flow/llm-space/releases/tag/v4.2.0
[4.1.1]: https://github.com/deer-flow/llm-space/releases/tag/v4.1.1
[4.1.0]: https://github.com/deer-flow/llm-space/releases/tag/v4.1.0
[4.0.1]: https://github.com/deer-flow/llm-space/releases/tag/v4.0.1
