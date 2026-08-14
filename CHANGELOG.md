# Changelog

All notable changes to LLM Space are documented here. This project follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.12.1] - 2026-08-14

### Fixed

- The Performance edition once again loads its packaged renderer at startup.
  Appearance preferences are hydrated from disk before React mounts without
  adding an unsupported query string to Electrobun's `views://` URL.

## [4.12.0] - 2026-08-14

This release makes generated media durable, improves update visibility and
model-provider management, and stabilizes long streaming conversations.

### Added

- Generated images and other media are persisted to an output directory so
  results remain available after the generating Tool call finishes.
- The update dialog reports download progress while a new desktop build is
  being fetched.

### Changed

- Model-provider connection profiles use a clearer nested management layout
  with more consistent editing controls.
- Renderer preferences, including the selected theme, are persisted through a
  single disk-backed local-storage service in `settings/local-storage.json`.

### Fixed

- Long Assistant messages no longer cause the conversation to jump when
  streaming ends, and the message ruler selects the item containing the
  viewport center instead of a nearby shorter message.
- Provider editor spacing and Plugin directory actions are more consistent.

## [4.11.0] - 2026-08-11

This release makes local Plugins installable as ZIP packages, streamlines
Plugin, MCP server, and model-provider management, and improves desktop
responsiveness and interaction details.

### Added

- Plugin ZIP packages can be installed or updated by dragging them onto the
  desktop window. Archives are validated and extracted with size, entry-count,
  and path-safety limits before atomically replacing the installed package.
- Installed Plugins can be revealed, reloaded, or uninstalled directly from
  the Plugin list, with persistent Plugin data kept outside the replaceable
  installation directory.

### Changed

- Model-provider connection profiles appear as nested sidebar items, making it
  faster to switch, add, configure, and remove individual connections.
- Plugin and MCP server rows expose contextual management menus, including
  connection testing and removal without first opening the detail editor.
- The bilingual Plugin guide now documents ZIP packaging, drag-and-drop
  installation, archive safety limits, upgrades, and persistent data storage.
- Sidebar resizing and onboarding transitions are smoother, while closed
  Thread workspaces release retained state more aggressively.

### Fixed

- Update actions remain visible above the Settings dialog.
- Selecting text in an expandable Tool-call argument no longer toggles the
  argument open or closed when the pointer is released.

## [4.10.0] - 2026-08-09

This release adds preview-first progressive conversation compaction, makes long
Threads easier to navigate, and connects major Thread workflows to expanded
bilingual documentation.

### Added

- Threads can compact older turns into a structured, progressively updated
  checkpoint while keeping a configurable number of recent turns verbatim.
  Compaction renders prompt variables before summarizing, supports reusable
  per-Thread instructions, previews the result before applying, and creates a
  numbered `-compact-N.json` clone instead of overwriting the source Thread.
- User and Assistant messages expose navigation anchors for moving quickly
  through long conversations.
- A complete Atlas Plugin example demonstrates multiple Skills, MCP servers,
  model providers, Plugin Tools, Commands, Thread Storages, and Settings fields.

### Changed

- Compaction, Sharing, Generate Project, and Variables dialogs provide localized
  Help links to new or expanded English and Chinese guides.
- Sharing, project generation, compaction, and variables documentation is linked
  from the user manual, quick start, core concepts, and repository guides.
- The bundled pi packages are upgraded to `0.84.1`.

### Fixed

- HTML previews allow their embedded scripts to run as intended.
- Bash tools start from the owning workspace root rather than an unrelated
  process directory.
- Message navigation controls stay below menus and dialogs instead of covering
  higher-priority UI.

## [4.9.0] - 2026-08-07

This release adds Seedream image generation and provider connection profiles,
makes local Plugin commands more transparent, and turns Plugin and MCP settings
into clearer, more informative management surfaces.

### Added

- Volcengine Ark providers can configure Seedream image models and use the new
  `generate_image` built-in Tool to create images with provider credentials.
- Model providers support multiple named connection profiles, with profile-aware
  model selection, connection testing, streaming, and built-in Tool execution.
- Plugin commands can publish progress, success, and failure feedback while
  they run, with lifecycle handling shared across the command palette and
  desktop runtime.
- Plugin settings group Commands, Tools, and MCP Servers into expandable
  sections with type-specific icons and extension descriptions.
- MCP settings expose the Plugin that owns each bundled server and cache Plugin
  tool discovery to avoid repeated subprocess work.

### Changed

- Settings empty states use a reusable animated layout across Plugins, MCP
  Servers, and Remote Servers, with refined selection, contrast, spacing, and
  artwork treatment.
- The onboarding experience has a smaller image payload and more polished
  layout and interaction details.
- The desktop and web builds now use Vite 8, alongside refreshed React,
  Tailwind CSS, CodeMirror, MCP SDK, and UI dependencies.
- Plugin development documentation now covers command feedback APIs.

### Fixed

- Opening a shared deep link reliably activates the desktop window before
  navigating to its content.
- Plugin artwork preserves native icon shapes, and long extension descriptions
  stay within their settings rows.

## [4.8.5] - 2026-08-06

This patch release restores tool-call continuation for OpenAI Responses-compatible
providers in packaged desktop builds.

### Fixed

- Tool results replay the provider's original call ID without the internal
  response-item suffix, preventing `No tool call found for tool output` errors.
- The local `pi-ai` patch now applies correctly during clean dependency installs,
  matching development and release builds.

## [4.8.4] - 2026-08-05

This release expands local Plugins into first-class agent capabilities and
refreshes the most important setup, sharing, and generation experiences.

### Added

- Local Plugins can contribute executable Tools that users add to Threads and
  models invoke like built-in Tools, with stable identities, package icons,
  lifecycle isolation, structured results, and owning-Thread variable context.
- Plugin Commands accept quoted Command Palette arguments and can inspect the
  active tab, filename, and Thread through an explicit context API.
- Plugin development guides now document Commands and Tools in English and
  Chinese, including discovery, context, variables, local-runtime limits, and
  error behavior.

### Changed

- The new-Thread gallery, runnable-agent generator, and Thread-sharing flow now
  use clearer, more focused layouts with polished Light and Dark appearances.
- Account, Plugins, Skills, Models, MCP Servers, and Remote Servers settings now
  have stronger navigation, purposeful empty states, and consistent list
  headings.
- Working-directory controls, Plugin discovery, and Tool selection provide more
  direct feedback and actions, including revealing existing folders in Finder.

### Fixed

- Opening the local Plugins folder uses the native filesystem reveal path
  instead of spawning an unavailable shell command.
- Plugin Tool execution remains bound to the Thread that owns the call, even
  when tabs change or multiple calls run concurrently.
- Unsupported local Plugin Tools are rejected clearly on remote runtimes and
  during LangGraph export instead of producing unusable output.

## [4.8.3] - 2026-08-05

This patch release streamlines the generated LangGraph project setup on macOS.

### Changed

- After explicitly creating a generated project's `.env`, macOS users now get
  a Terminal window that starts the development server with `make dev`.
- Other platforms, cancelled setup, and launch failures continue to reveal the
  generated project without starting a process.

### Fixed

- Generated project paths with spaces or shell-special characters are safely
  passed to Terminal, and only user-authorized generator directories can be
  launched.

## [4.8.2] - 2026-08-05

This patch release makes filesystem tools handle home-relative paths reliably
and improves the generated LangGraph development workflow.

### Added

- Generated LangGraph projects include a `Makefile`; run `make dev` to start
  `uv run langgraph dev`.

### Changed

- Filesystem tool schemas and generated Python implementations consistently
  document and expand leading `~/` paths.
- MCP stdio commands and working directories expand home-relative paths in both
  the desktop runtime and generated LangGraph projects.

### Fixed

- `write`, `edit`, `read`, `ls`, `tree`, `grep`, `glob`, and `present_files` no
  longer interpret `~/...` relative to the desktop app bundle.
- Home-relative artifact paths can be revealed from tool calls, including a
  `glob` target directory.

## [4.8.1] - 2026-08-05

This patch release polishes Settings layout and makes Plugin documentation
easier to reach.

### Changed

- Settings pages use consistent header dividers, content spacing, and concise
  descriptions, while compact form rows retain their intended density.
- Experimental settings now share the same labeled toggle layout as Network
  settings.
- Plugin settings link directly to the Plugin development guide.

### Fixed

- Remote Servers content aligns flush with its header, while other split-pane
  Settings pages keep the correct top spacing.

## [4.8.0] - 2026-08-05

This release introduces trusted local Plugins that can extend LLM Space with
agent capabilities, commands, model integrations, and custom Thread storage.

### Added

- Discover trusted local Plugins from `LLM_SPACE_HOME/plugins/`, with metadata,
  settings, lifecycle controls, compatibility checks, and isolated diagnostics.
- Plugins can contribute Skills, MCP servers, model providers, Command Palette
  commands, and Thread Storages.
- Plugin Skills are available to agents on local and remote runtimes and can be
  enabled individually or per Plugin without modifying Plugin files.
- Added English and Chinese Plugin development guides covering package layout,
  Extensions, settings, lifecycle, diagnostics, and examples.

### Changed

- Settings navigation is grouped into App, Agent, and Connections, with clearer
  names for Remote Servers, MCP Servers, and Web Search.
- Plugin-provided MCP servers and Skills are identified separately in Settings,
  and Plugin diagnostics can reveal the source of each Extension.
- Imported Thread folders have a distinct treatment in the workspace tree.

### Fixed

- Replayed tool-call IDs are normalized correctly for non-OpenAI providers that
  use the Responses API.
- Plugin Skill conflicts identify every file involved, and long diagnostic paths
  no longer overflow the Plugin settings panel.

## [4.7.1] - 2026-08-04

This release adds provider-hosted tools and makes MCP tool naming configurable.

### Added

- Configure provider-hosted tools, including provider-native search, and show
  their activity and citations in the thread.
- Optionally expose MCP tools with their original names instead of the
  `mcp__{serverName}__` prefix.

## [4.7.0] - 2026-08-03

Remote runtimes get a thorough correctness pass — every thread operation now
stays bound to the runtime that owns it — plus DeerFlow run-event imports and
two security fixes.

### Added

- Import DeerFlow run-event JSONL files as threads.

### Changed

- Sharing, prompt-file resolution, and auxiliary generation are each scoped to
  the runtime that owns the thread, instead of falling back to the local one.
- Switching runtimes preserves thread state, and retained runtime panes no
  longer re-render unnecessarily.

### Fixed

- SSH trust is bound to the approved host key, so a changed key no longer
  silently passes.
- Runtime bearer tokens are no longer passed through `argv`, where other local
  processes could read them.
- Stale-port recovery is ownership-aware and awaits its async cleanup, so it
  can't reclaim a port that another runtime still holds.
- Failed remote streams terminate cleanly instead of hanging the thread.
- Cancelling GitHub Device Flow authentication is now authoritative — a
  cancelled attempt can no longer complete in the background.
- Disabled buttons apply their dimmed style based on status.

## [4.6.3] - 2026-07-31

A maintenance release with clipboard and tool-response improvements, refreshed
MiniMax models, and a steadier streaming UI.

### Added

- Copy a file reference to the OS clipboard directly from a thread tab's context
  menu.
- Tool responses can now carry image content.

### Changed

- MiniMax providers now target their OpenAI-compatible chat endpoints. MiniMax-M3
  is refreshed with updated pricing, a 1M-token context window, text/image/video
  input, and adaptive/disabled thinking; MiniMax-M2.7 stays an always-on
  reasoning model.
- Codex CLI now supports API-key mode, with inline run-validation guidance and a
  more explicit desktop startup order.

### Fixed

- `todo_write` rendering stays stable while streaming: incomplete items are kept
  out of the preview, cancelled states are preserved, and its parsing is isolated
  from generic tool-call rendering.

## [4.6.2] - 2026-07-29

A small quality-of-life release for inspecting tool calls.

### Added

- A preview button on tool call items opens all tool call arguments as
  formatted JSON in a single view, alongside the existing "Copy arguments"
  action.

## [4.6.1] - 2026-07-28

A patch release that makes remote server configuration changes safer and more
predictable.

### Fixed

- Connected servers and servers waiting for host-key trust can no longer be
  edited or removed until they are disconnected, preventing an active remote
  workspace from being torn down unexpectedly.
- Removing a disconnected or failed server now updates connection state and
  selects an available fallback server cleanly.

## [4.6.0] - 2026-07-27

Run LLM Space agents and manage their workspaces on remote machines over SSH,
while keeping the desktop experience local.

### Added

- **SSH remote runtimes.** Connect to a remote server from Settings, install and
  start the matching headless LLM Space runtime, and work with remote threads,
  files, models, tools, skills, traces, and generated projects from the desktop
  app.
- Remote runtime status, host-key verification, connection progress, package
  transfer fallback, stale-process recovery, and runtime-scoped tabs keep
  remote sessions visible and isolated.
- Release builds now publish signed remote runtime server artifacts alongside
  the desktop installers.

### Changed

- Shared runtime services now live in a reusable `@llm-space/runtime` package,
  used by both the desktop app and the new headless server.
- Shared threads preserve a resolvable model configuration so viewers can use
  the saved model when available and fall back predictably when it is not.

### Fixed

- Skill discovery and reading now support multiline YAML literal descriptions;
  generated Python agents preserve the same frontmatter behavior.

## [4.4.5] - 2026-07-24

Response performance is now visible at a glance, with safer filesystem actions
and more predictable controls while a thread is running.

### Added

- Assistant messages now report total response time, time to first token,
  generation throughput, and a detailed token breakdown.
- Prompt directory variables validate that their configured directory exists.

### Changed

- Message statistics can switch between timing and token summaries, with the
  preferred view remembered across sessions.
- Opening files, directories, generated projects, and skill locations now uses
  one validated filesystem action with clearer failures.
- Header actions that could mutate or export a thread are disabled while it is
  running; run settings remain available next to the Stop button.
- Updated the model runtime dependencies and aligned Ark's maximum output-token
  setting with the provider's 128,000-token limit.

### Fixed

- `ask_user_question` always terminates the active agent turn, including for
  older saved threads, so ReAct mode cannot continue before the user answers.

## [4.4.4] - 2026-07-23

A maintenance release that makes local lint validation match CI before a
release is pushed.

### Changed

- Lint now fails on any warning, and the release checklist requires a clean
  zero-warning, zero-error lint run.

### Fixed

- ESLint now consistently classifies `bun:test` as a built-in module under both
  Bun and Node, preventing environment-dependent import ordering failures.
- The ESLint configuration uses an explicit ESM extension, eliminating Node's
  module-type warning.

## [4.4.3] - 2026-07-23

A focused fix for generated LangGraph projects using workspace-aware prompt
templates.

### Fixed

- Generated Python prompt runtimes now expose the built-in
  `current_working_directory` variable to system and meta user prompts.
- Generated projects now support LLM Space's `@include(...)` macro, including
  recursive rendering, missing files, invalid nested templates, and a depth
  guard.

## [4.4.2] - 2026-07-23

A prompt-template maintenance release focused on workspace-aware agents,
conditional file inclusion, and more predictable skill selection.

### Added

- **Current working directory variable.** Threads now include the built-in
  `current_working_directory` variable, editable by hand or through a native
  directory picker. General Agent uses it to describe its workspace.
- **Conditional file inclusion.** Prompt templates can call `exists(path)` to
  guard optional files such as `AGENTS.md`.
- Skill directories can be opened directly from the skills settings page.

### Changed

- Skill selection now distinguishes “include all enabled skills” from an
  intentionally empty selection.

### Fixed

- Recursive `@include(...)` rendering preserves readable file content when the
  included text is not itself a valid template.
- Updated include snapshots are invalidated when include-rendering semantics
  change, preventing stale empty output from surviving the fix.

## [4.4.1] - 2026-07-22

A maintenance release focused on carrying meta user prompts into generated
LangGraph projects, plus fixes for live skills and project setup.

### Added

- **Generate meta user prompts.** When a thread starts with contextual user
  content, generated LangGraph projects can preserve it as a rendered meta user
  prompt and inject it into model calls at run time.

### Fixed

- Available skills now update live instead of remaining stuck on an earlier
  resolved selection; generated projects also treat an empty skill selection as
  all currently enabled skills.
- Generated project dependency installation now has a bounded timeout, clearer
  recovery guidance, and no longer leaves an orphaned `uv` process when it times
  out.
- Generated `pyproject.toml` files declare supported dependency versions
  directly and include optional mainland China package-mirror guidance.

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
