# Atlas Plugin

[English](./README.md) | [简体中文](./README.zh-CN.md)

Atlas is a complete LLM Space Plugin example for project knowledge, operations,
and Thread workflows. It is intentionally larger than a minimal scaffold: every
currently supported Extension point is represented, and every repeatable type
has at least two contributions.

## Included Extensions

| Type | Contributions | What it demonstrates |
| --- | ---: | --- |
| Settings | 1 schema, 7 fields | defaults, validation, descriptions, interpolation |
| Skills | 2 | frontmatter, references, bounded workflows |
| MCP servers | 2 | bundled stdio servers, Settings-to-environment interpolation |
| MCP Tools | 4 | Zod input schemas, normal results, controlled errors |
| Model providers | 2 | OpenAI Responses and Anthropic Messages adapters |
| Models | 4 | multiple models per Plugin provider |
| Plugin Tools | 2 | typed parameters, Thread/variable context, workspace reads |
| Commands | 2 | palette arguments, progress, results, workspace and Thread writes |
| Thread Storages | 2 | durable workspace storage and process-lifetime memory storage |

`config.schema.json` is the only singleton in this list: LLM Space discovers at
most one Settings schema per Plugin. Atlas therefore uses one schema with
multiple independent fields. All other Extension types are contributed more
than once.

## Layout

```text
atlas-plugin/
├── package.json
├── tsconfig.json
├── config.schema.json
├── mcp.json
├── models.json
├── README.md
├── README.zh-CN.md
├── commands/
│   ├── create-project-brief.ts
│   └── rename-active-thread.ts
├── tools/
│   ├── project-context.ts
│   └── read-workspace-note.ts
├── thread-storages/
│   ├── memory-shelf.ts
│   └── workspace-library.ts
├── servers/
│   ├── catalog-server.ts
│   └── metrics-server.ts
└── skills/
    ├── incident-brief/
    │   ├── SKILL.md
    │   └── references/template.md
    └── release-readiness/
        ├── SKILL.md
        └── references/checklist.md
```

## Install locally

Plugin roots must be real directories, so copy the example instead of creating
a symlink. LLM Space does not install Plugin dependencies automatically. Run
`bun install` in the copied directory because the two bundled MCP servers use
the MCP SDK.

```sh
mkdir -p ~/.llm-space/plugins
cp -R ./examples/atlas-plugin ~/.llm-space/plugins/atlas-plugin
cd ~/.llm-space/plugins/atlas-plugin
bun install --production
```

Then open Settings → Plugins and select **Refresh plugins**. Atlas requires LLM
Space 4.9.0 or later.

## Configure

In the Atlas Settings tab:

1. Set **MCP server directory** to the absolute installed path, normally
   `~/.llm-space/plugins/atlas-plugin` with `~` expanded to your home path.
2. Adjust the team, project, notes directory, or model base URLs if desired.
3. Export `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` before launching LLM Space
   if you want to use the example model providers.

The model catalog entries demonstrate configuration shape. Replace their IDs,
limits, and cost metadata with values verified for the provider you actually
use. Never place API keys in `models.json`.

## Try the examples

### Commands

Open the Command Palette and try:

```text
Rename active Thread Release 4.9
rename-active-thread "Release 4.9"
Create project brief Atlas Web
create-project-brief "Atlas Website"
```

The rename Command stages a whole-Thread update and returns explicit terminal
feedback. The brief Command writes `atlas/<name>-brief.md` and refreshes the
workspace tree.

### Plugin Tools

Add these Tools to a local Thread:

- `atlas_project_context` reads Plugin Settings, the owning Thread, and resolved
  Prompt Variables.
- `atlas_read_workspace_note` safely reads a note below the configured Atlas
  notes directory and applies an output-size limit.

### MCP

Open Settings → MCP under **MCPs in Plugins**, then test both Atlas servers:

- **Atlas Catalog** exposes `list_resources` and `get_resource`.
- **Atlas Metrics** exposes `get_project_health` and `compare_metric`.

The data is deterministic and local, so these servers need no credentials or
network access.

### Model providers

Atlas contributes one OpenAI Responses-compatible provider and one Anthropic
Messages-compatible provider, each with two illustrative models. Export the
corresponding API key, verify the base URL, and replace the example model IDs
and metadata before trying a Run.

### Thread Storages

- **Atlas Workspace Library** persists JSON below
  `<notesDirectory>/thread-library/` and supports import, save, and
  `llm-space://threads/atlas-library/<id>` deep links.
- **Atlas Memory Shelf** demonstrates the same read/write contract with
  process-lifetime state. Its contents disappear when the Plugin reloads or the
  app exits.

### Skills

The two Skills demonstrate different bounded workflows and local reference
files: release evidence review and incident-brief writing. Enable them from
Settings → Skills and ask the Agent to perform the matching task.

## Production notes

This directory is an educational example, not a production integration. Before
shipping a derivative Plugin:

- replace illustrative model metadata and test every configured provider;
- validate complete Thread payloads in external Thread Storages;
- add request timeouts and cancellation to network operations;
- keep secrets out of files, results, reports, and logs;
- add automated tests for Commands, Tools, MCP servers, and Storage behavior;
- ship installed runtime dependencies with the Plugin directory.
