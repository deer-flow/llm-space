English | [中文](./plugins.zh-CN.md)

---

# Plugin Development Guide

An LLM Space Plugin is an npm-compatible package installed under `LLM_SPACE_HOME/plugins/`. A Plugin may contribute zero or more Extensions, including Skills, MCP servers, model providers, Tools, commands, and Thread Storages.

This guide describes the current Plugin system: package layout, metadata, Settings, supported Extensions, lifecycle, diagnostics, and development practices.

## 1. Concepts

A **Plugin** is the unit of distribution, versioning, configuration, reload, enablement, and disablement. An **Extension** is one capability contributed by a Plugin.

```text
Plugin
├── Metadata (package.json)
├── Settings (optional)
└── Extensions (zero or more)
    ├── Skill
    ├── MCP server
    ├── Model provider
    ├── Command
    ├── Plugin Tool
    └── Thread Storage
```

The main rules are:

- `package.json` is the only metadata file. Its `name` is also the stable Plugin ID.
- Extensions are discovered from conventional paths. They are not enumerated in `package.json`.
- A newly discovered Plugin is enabled by default.
- A Plugin can be enabled or disabled as a whole. Plugin Skills can also be enabled individually from Settings → Skills; other Extension types cannot currently be toggled individually.
- Plugin Settings are saved automatically. Changing Settings reloads the Plugin.
- Plugin files are read-only contributions. LLM Space does not rewrite `mcp.json`, `models.json`, Skill files, or executable Extension files.
- Local Plugins are fully trusted. Runtime process isolation is not a security sandbox.

## 2. Installation and discovery

`LLM_SPACE_HOME` defaults to `~/.llm-space`, so the default installation directory is:

```text
~/.llm-space/plugins/
```

Set `LLM_SPACE_HOME` before starting LLM Space to use a separate data directory.

### 2.1 Regular and scoped packages

The Plugin scanner recognizes these layouts:

```text
plugins/
├── weather-kit/
│   └── package.json
└── @example/
    └── team-tools/
        └── package.json
```

- Regular package: `plugins/<name>/package.json`
- Scoped package: `plugins/@<scope>/<name>/package.json`

Regular packages are scanned one level deep; scoped packages are scanned two levels deep. Discovery is not recursive and ignores `node_modules`.

The directory must match `package.json.name` exactly:

| Installation directory         | Required `name`       |
| ------------------------------ | --------------------- |
| `plugins/weather-kit/`         | `weather-kit`         |
| `plugins/@example/team-tools/` | `@example/team-tools` |

The Plugin root, Extension directories, and discovered files must be real directories or regular files. Symlinks are rejected, and discovered paths may not escape the Plugin root.

### 2.2 Extension discovery

LLM Space discovers Extensions only at these paths:

| Path                            | Extension                  |
| ------------------------------- | -------------------------- |
| `skills/*/SKILL.md`             | Skills                     |
| `mcp.json`                      | MCP servers and tools      |
| `models.json`                   | Model providers and models |
| `tools/*.{ts,js,mjs}`           | Executable Plugin Tools    |
| `commands/*.{ts,js,mjs}`        | Command Palette commands   |
| `thread-storages/*.{ts,js,mjs}` | Thread Storages            |
| `config.schema.json`            | Plugin Settings form       |

Except for the contents of each Skill directory, Extension discovery is not recursive. For example, `commands/open-dashboard.ts` is discovered, while `commands/admin/open-dashboard.ts` is not.

A complete Plugin might look like this:

```text
@example/team-tools/
├── package.json
├── icon.png
├── config.schema.json
├── mcp.json
├── models.json
├── tools/
│   └── project-info.ts
├── skills/
│   └── incident-review/
│       ├── SKILL.md
│       └── references/
├── commands/
│   └── open-dashboard.ts
└── thread-storages/
    └── team-library.ts
```

Do not create empty directories merely to satisfy the layout. A Skill-only Plugin needs only `package.json` and its Skill directory.

### 2.3 Persistent Plugin data

A Plugin **must** store downloaded files, caches, indexes, databases, and other
runtime-generated state outside its installation directory, under:

```text
~/.llm-space/data/plugins/<plugin-name>/
```

For a scoped Plugin, this becomes
`~/.llm-space/data/plugins/@scope/<plugin-name>/`. Respect `LLM_SPACE_HOME`
rather than hard-coding `~/.llm-space`:

```ts
const home = process.env.LLM_SPACE_HOME?.trim()
  || path.join(os.homedir(), ".llm-space");
const dataDirectory = path.join(
  home,
  "data",
  "plugins",
  ...pluginName.split("/"),
);
```

The ZIP installer replaces the Plugin installation directory during an update.
Therefore, any runtime data written under `LLM_SPACE_HOME/plugins/<name>/` can
be overwritten or deleted. The external `data/plugins/<name>/` directory is not
part of the package replacement and remains intact across install, update,
reload, and disable operations. Do not include runtime data in the Plugin ZIP.

### 2.4 Extensions in Settings

Settings → Plugins groups discovered Extensions by type, with an icon, count,
activation status, and any load diagnostic. Select an Extension to reveal its
source file or directory. Add concise descriptions so users can understand a
Plugin before enabling or running it:

| Extension | Description source |
| --- | --- |
| Skill | `description` in `SKILL.md` frontmatter |
| Settings | top-level `description` in `config.schema.json` |
| Command | class `description` property |
| Plugin Tool | class `description` property |
| Thread Storage | class `description` property |
| MCP server / Model provider | server or provider `name` |

Descriptions are UI copy, not identifiers. Stable IDs still come from the
Plugin package name and the declaring file or object ID.

### 2.4 Bundled default plugin

LLM Space ships one default Plugin, the Memory plugin
(`@llm-space/memory`), which gives the agent cross-project persistent
memory through the `memory_save`, `memory_search`, and `memory_forget`
Plugin Tools plus a `memory` Skill that tells the agent when to use them.

On startup, before plugins are discovered, the desktop app writes the
plugin into `<home>/plugins/@llm-space/memory/` if that directory does
not exist yet. Seeding is once-only and never overwrites: if you delete,
replace, or edit the plugin, your version is kept. The agent's memories
live in `LLM_SPACE_HOME/data/plugins/@llm-space/memory/memories.jsonl`,
which survives plugin updates and is shared by every workspace, making
the memory cross-project by design.

## 3. Metadata in `package.json`

Minimal metadata:

```json
{
  "name": "@example/team-tools",
  "version": "1.0.0",
  "displayName": "Team Tools",
  "description": "Example collaboration extensions for LLM Space.",
  "author": "Example Team",
  "license": "MIT",
  "homepage": "https://example.com/team-tools",
  "engines": {
    "llm-space": ">=4.7.1"
  }
}
```

Required fields:

- `name`: an npm-style package name and the Plugin ID. Use lowercase letters, digits, dots, underscores, and hyphens, optionally with a scope.
- `version`: a valid SemVer version.
- `engines["llm-space"]`: the supported LLM Space SemVer range.

`displayName`, `description`, `author`, `license`, and `homepage` are recommended. Other npm fields may remain in the file, but LLM Space does not execute code because a package declares `scripts`, `main`, `module`, `exports`, or `bin`.

Changing `name` creates a different Plugin identity. Settings and persisted references associated with the old name are not migrated automatically.

### 3.1 Icon

Place the icon at the Plugin root:

```text
icon.png
```

A 512 × 512 PNG is recommended. The file must be a valid PNG, no larger than 2 MiB, with neither dimension exceeding 4096 pixels. A missing or invalid icon falls back to the default Plugin icon and does not prevent loading.

## 4. Install, refresh, and reload

### 4.1 Package a Plugin ZIP

The installer accepts either of these archive layouts:

```text
weather-kit-1.2.3.zip          weather-kit-1.2.3.zip
├── package.json               └── weather-kit/
├── tools/                         ├── package.json
└── ...                            ├── tools/
                                   └── ...
```

In other words, `package.json` may be at the ZIP root or inside exactly one
top-level package directory. Its `name` determines the installation directory;
the ZIP filename and wrapper-directory name do not.

From the Plugin root, create a release archive with:

```sh
zip -r ../weather-kit-1.2.3.zip . \
  -x "data/*" ".git/*" ".DS_Store" "__MACOSX/*"
```

Write the ZIP outside the Plugin root so it cannot include itself. Do not ship
`data/`: installation-specific state belongs in
`LLM_SPACE_HOME/data/plugins/<plugin-name>/`. Include all Extension source files, assets, and runtime
dependencies needed by the Plugin. LLM Space does not run a package-manager
install after extraction.

Current archive limits are 50 MiB compressed, 200 MiB extracted, and 10,000
entries. Unsafe absolute paths, `..` traversal, backslash paths, and archives
with multiple package roots are rejected. Common macOS metadata is ignored.

### 4.2 Install or update by dragging the ZIP

1. Start LLM Space and drag one or more `.zip` files onto the main window.
2. Wait for the **Drop plugin ZIP to install** overlay, then release the files.
3. After installation, use the success notification's **View plugin** action,
   or open Settings → Plugins.

The success notification includes the Plugin ID and installed version. A ZIP
whose `package.json.name` matches an installed Plugin replaces that Plugin's
package files and reloads it. Data stored at
`LLM_SPACE_HOME/data/plugins/<plugin-name>/` remains untouched. A different
package name installs as a separate Plugin; changing `name` is not an upgrade
or migration and does not migrate the old Plugin's data.

### 4.3 Manual installation

To install an unpacked Plugin manually:

1. Copy the complete Plugin directory to the correct location under `LLM_SPACE_HOME/plugins/`.
2. Open Settings → Plugins.
3. Select **Refresh plugins** to discover added, removed, or renamed packages.
4. Select the Plugin and inspect compatibility, location, Extensions, and diagnostics on the General tab.

### 4.4 Refresh and reload

After editing files in an already discovered Plugin, select **Reload** on that Plugin.

- **Refresh plugins** rescans the installation directory. Use it for additions, removals, and renames.
- **Reload** reloads one existing Plugin. Use it after changing its metadata, schema, configuration, or Extension files.

LLM Space does not fetch Plugins from a registry, run `npm install`, resolve
dependencies, compare versions, or roll versions back. Any runtime dependencies
must be shipped inside the Plugin ZIP or directory.

## 5. Settings

Plugin enablement and configuration are stored in:

```text
LLM_SPACE_HOME/settings/plugins.json
```

```json
{
  "schemaVersion": 1,
  "plugins": {
    "@example/team-tools": {
      "enabled": true,
      "settings": {
        "endpoint": "https://api.example.com",
        "workspace": "demo"
      }
    }
  }
}
```

A Plugin without a stored entry behaves as if it had:

```json
{
  "enabled": true,
  "settings": {}
}
```

Settings are saved automatically. Disabling or removing a Plugin does not delete its Settings, so reinstalling or re-enabling the same Plugin restores them.

If the Settings file is corrupt and cannot be recovered, third-party Plugins are disabled for that startup. The application itself continues to start.

### 5.1 Settings forms with JSON Schema

Add `config.schema.json` to generate the Plugin's Settings tab. The current form renderer supports:

- nested objects;
- `string`, `number`, `integer`, and `boolean`;
- `enum`;
- arrays of primitive values;
- `required`, `default`, `title`, and `description`.

Example:

```json
{
  "type": "object",
  "required": ["endpoint"],
  "properties": {
    "endpoint": {
      "type": "string",
      "title": "Service endpoint",
      "description": "Base URL of the example service.",
      "default": "https://api.example.com"
    },
    "requestTimeout": {
      "type": "integer",
      "title": "Request timeout (seconds)",
      "default": 30
    },
    "mode": {
      "type": "string",
      "title": "Mode",
      "enum": ["standard", "strict"],
      "default": "standard"
    },
    "notifications": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean",
          "title": "Show notifications",
          "default": true
        }
      }
    }
  }
}
```

Defaults are merged with previously saved values. Code Extensions receive a read-only Settings snapshot for each invocation. An invalid schema disables the form and records an Extension error without overwriting existing Settings.

### 5.2 Environment variables and Settings interpolation

Strings in `mcp.json` and `models.json` support:

```json
{
  "token": "$EXAMPLE_API_TOKEN",
  "url": "${settings.endpoint}/v1",
  "label": "Workspace: ${settings.workspace}"
}
```

- A complete string in the form `$ENV_NAME` reads that environment variable. A missing variable resolves to an empty string.
- `${settings.key}` reads Plugin Settings and supports nested paths such as `${settings.network.endpoint}`.
- Non-string Settings values are JSON-serialized before interpolation.

Keep passwords, API keys, and tokens in environment variables. Do not commit them to the Plugin directory.

## 6. Skills

Plugin Skills use the Agent Skills directory format:

```text
skills/
└── release-checklist/
    ├── SKILL.md
    ├── references/
    │   └── checklist.md
    └── scripts/
        └── verify.ts
```

Minimal `SKILL.md`:

```md
---
name: release-checklist
description: Check a release candidate against the team's public checklist.
---

# Release checklist

1. Read `references/checklist.md`.
2. Compare every item with the supplied release notes.
3. Report missing evidence without changing external systems.
```

Plugin Skills appear as a Plugin source in Settings → Skills. The source cannot be removed, but its menu supports revealing the directory and enabling or disabling all of its Skills. Each Skill can also be enabled or disabled individually.

These choices are stored as user overrides in LLM Space's Skills Settings; Plugin files are never modified. Disabled Plugin Skills remain visible in Settings but are excluded from `available_skills` and cannot be loaded by the built-in `skill()` tool. Disabling the entire Plugin removes all of its Skills from new Agent Runs. Re-enabling the Plugin restores the previous per-Skill choices.

## 7. MCP servers

`mcp.json` may declare one or more MCP servers. They are shown in Settings → MCP under **MCPs in Plugins** and remain separate from user-managed servers.

### 7.1 Stdio example

```json
{
  "servers": [
    {
      "id": "weather",
      "name": "Example Weather",
      "transport": "stdio",
      "command": "bun",
      "args": ["run", "./servers/weather.mjs"],
      "cwd": "${settings.serverDirectory}",
      "env": {
        "WEATHER_API_TOKEN": "$EXAMPLE_WEATHER_TOKEN"
      }
    }
  ]
}
```

### 7.2 Streamable HTTP example

```json
{
  "servers": [
    {
      "id": "knowledge-base",
      "name": "Example Knowledge Base",
      "transport": "streamableHttp",
      "url": "${settings.endpoint}/mcp",
      "headers": {
        "Authorization": "$EXAMPLE_API_TOKEN"
      }
    }
  ]
}
```

Each server requires:

- `id`: a stable ID unique within the Plugin;
- `name`: the display name;
- `transport`: `stdio`, `streamableHttp`, or `sse`.

LLM Space derives the final ID by adding the Plugin namespace:

```text
plugin:@example/team-tools:mcp:knowledge-base
```

Do not include this prefix in `mcp.json`. Plugin MCP definitions cannot be edited or removed from the MCP page; configure them with Plugin Settings or environment variables. Disabling the Plugin closes its MCP connections and rejects new calls.

The MCP page identifies the owning Plugin and shows connection details,
readiness, discovered Tool count, and Tool names. LLM Space caches successful
readiness and Tool discovery results to avoid reconnecting during every UI
refresh. A Plugin configuration change marks that snapshot as stale; the next
connection test or Tool discovery refreshes it from the server.

Plugins can contribute local executable Tools through `tools/*.{ts,js,mjs}` or expose remote and shared tools through MCP.

## 8. Models

`models.json` can declare providers and models using an API adapter already supported by LLM Space:

- `anthropic-messages`
- `openai-completions`
- `openai-responses`

Example:

```json
{
  "providers": [
    {
      "id": "example-cloud",
      "name": "Example Cloud",
      "api": "openai-completions",
      "baseUrl": "${settings.modelEndpoint}",
      "apiKey": "$EXAMPLE_MODEL_API_KEY",
      "models": [
        {
          "id": "example-chat-1",
          "name": "Example Chat 1",
          "api": "openai-completions",
          "reasoning": false,
          "input": ["text"],
          "contextWindow": 128000,
          "maxTokens": 8192,
          "cost": {
            "input": 0,
            "output": 0,
            "cacheRead": 0,
            "cacheWrite": 0
          }
        }
      ]
    }
  ]
}
```

A Plugin can declare configuration but cannot load a custom provider implementation. Provider IDs are namespaced automatically. Plugin and user providers remain separate sources. Models from a disabled Plugin are unavailable to new Runs.

## 9. Plugin Tools

Plugin Tools are PI-compatible tools that the model can call in a local Thread.
Use them for repeatable, parameterized operations; use Commands when a person
should explicitly start an action from the Command Palette. Every direct
`tools/*.{ts,js,mjs}` file must default-export a zero-argument class. Importing
the optional contract catches definition errors while developing the Plugin:

```ts
import type {
  PluginToolContext,
  PluginToolExtension,
} from "@llm-space/core";

export default class ReadProjectFileTool implements PluginToolExtension {
  name = "read_project_file";
  description = "Read a UTF-8 file from the LLM Space workspace.";
  parameters = {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Workspace-relative path, for example docs/plan.md.",
      },
      maxChars: {
        type: "integer",
        minimum: 1,
        maximum: 50000,
        default: 12000,
      },
    },
    required: ["path"],
    additionalProperties: false,
  } as const;
  strict = true;

  async execute(
    context: PluginToolContext,
    args: Record<string, unknown>
  ) {
    const path = String(args.path ?? "");
    const requestedMaxChars = Number(args.maxChars ?? 12000);
    if (!path) throw new Error("path is required.");
    if (!Number.isInteger(requestedMaxChars) || requestedMaxChars < 1) {
      throw new Error("maxChars must be a positive integer.");
    }
    const maxChars = Math.min(requestedMaxChars, 50000);

    const content = await context.readWorkspaceFile(path);
    return {
      path,
      content: content.slice(0, maxChars),
      truncated: content.length > maxChars,
    };
  }
}
```

`name` is the model-facing Tool name and should be stable, descriptive, and
snake_case. `description` explains when to call it. `parameters` is its JSON
Schema; prefer `required` plus `additionalProperties: false`, and validate any
semantic constraints again inside `execute()`. `strict` asks compatible model
providers to enforce the Schema strictly.

The file name independently determines the stable Extension ID persisted with
the Tool:

```text
tools/read-project-file.ts
→ plugin:@example/team-tools:tool:read-project-file
```

Changing the package name, file name, or model-facing `name` can break saved
Threads or prompts. Disabling or removing a Plugin does not delete its Tools
from saved Threads; calls fail as unavailable until the Plugin returns.

### 9.1 Tool context and resolved variables

`execute(context, args)` receives the Thread that owns the Tool Call, not the
currently selected tab. The important fields are:

```ts
context.settings; // read-only Plugin Settings snapshot
context.signal; // optional AbortSignal
context.thread; // detached, deeply frozen owning Thread
context.variables; // resolved Prompt Variables
context.notify(message);
context.openLink(url);
context.pickFile(options);
context.readWorkspaceFile(path);
context.writeWorkspaceFile(path, content);
context.executeHostCommand(type, args);
context.createResult(content);
```

The Thread snapshot has no filename, tab API, or write method. Do not mutate it.
Parallel Tool Calls in one model batch share the same Thread and resolved
variable snapshot.

`context.variables` resolves configured variables at invocation time:

| Variable type | Resolved value |
| --- | --- |
| Custom, working directory, current date | String |
| Skills | Formatted string using the configured format |
| File | UTF-8 file contents |
| JSON | Parsed JSON value |

Empty or unresolvable variables are omitted. Original definitions remain at
`context.thread.context.variables`; custom variants remain at
`context.thread.context.variableVariants`.

For example, a Tool can combine Settings, resolved variables, and call
arguments without relying on the UI's active tab:

```ts
async execute(context: PluginToolContext, args: Record<string, unknown>) {
  return {
    project: context.settings.project ?? null,
    cwd: context.variables.current_working_directory ?? null,
    query: typeof args.query === "string" ? args.query : null,
    owningThreadTitle: context.thread.title,
  };
}
```

### 9.2 Return values, rich content, and errors

Return JSON-compatible values for ordinary results. LLM Space serializes them
as Tool output for the model. Use `createResult()` when the result needs
explicit text and image parts:

```ts
return context.createResult([
  { type: "text", text: "Rendered architecture diagram." },
  {
    type: "image",
    data: pngBytesAsBase64,
    mimeType: "image/png",
  },
]);
```

Throw an `Error` for an invalid call or an operation that failed. Keep messages
actionable and do not include secrets. A Tool class is instantiated once per
Plugin load, so multiple calls may reach the same instance. Keep invocation
state local to `execute()` and make shared caches concurrency-safe. If the
instance owns a process, timer, or connection, clean it up in `dispose()`:

```ts
async dispose() {
  await this.client?.close();
}
```

Plugin Tools are local-runtime only. They are not listed for remote Threads,
cannot execute remotely, and cannot currently be exported to LangGraph. MCP
Tools follow the MCP server's transport and schema instead of the class API
above; use `mcp.json` when the Tool already lives in a separate or shared MCP
server.

## 10. Commands

Commands are user-triggered actions shown in the Command Palette. Every direct
`commands/*.{ts,js,mjs}` file must default-export a zero-argument class:

```ts
import type {
  PluginCommandContext,
  PluginCommandExtension,
} from "@llm-space/core";

export default class OpenDocumentationCommand
  implements PluginCommandExtension
{
  displayName = "Open example documentation";
  description = "Open the public documentation in the default browser.";

  async execute(context: PluginCommandContext) {
    await context.openLink("https://example.com/docs");
    return context.createResult({
      level: "success",
      message: "Documentation opened.",
    });
  }
}
```

The file name determines the stable ID and file-stem alias:

```text
commands/open-documentation.ts
→ plugin:@example/team-tools:command:open-documentation
→ palette alias: open-documentation
```

The class is instantiated once per Plugin load. It may hold short-lived,
concurrency-safe state and implement `dispose()` for resources that must be
released when the Plugin is disabled, reloaded, or the app exits.

The progress and terminal-result APIs documented below require LLM Space 4.9.0
or later. Declare that compatibility when using them:

```json
{
  "engines": {
    "llm-space": ">=4.9.0"
  }
}
```

### 10.1 Command context

`execute(context, arguments)` receives common host capabilities plus the
invocation-specific arguments, active tab snapshot, and feedback APIs:

```ts
context.settings;
context.signal;
context.notify(message);
context.openLink(url);
context.pickFile(options);
context.readWorkspaceFile(path);
context.writeWorkspaceFile(path, content);
context.executeHostCommand(type, args);
context.arguments;
context.activeTab?.filename;
context.activeTab?.thread;
await context.activeTab?.writeThread(thread);
await context.report({ phase: "loading", message: "Loading records…" });
return context.createResult({ level: "success", message: "Import complete." });
```

Workspace file paths are resolved relative to the LLM Space workspace. The
currently allowed host Commands are `openSettings` and `refreshTree`; other
types are rejected.

### 10.2 Palette arguments

Users may append shell-style arguments to either the full display name or the
file-stem alias. Both of these invoke `commands/sync-active-thread.ts`:

```text
Sync active thread production "Release 4.9" --dry-run
sync-active-thread production 'Release 4.9' --dry-run
```

The Command receives:

```ts
["production", "Release 4.9", "--dry-run"]
```

The same frozen array is available as `context.arguments` and as the optional
second `execute()` parameter. Single and double quotes group whitespace;
backslashes escape the next character except inside single quotes. An unclosed
quote or trailing escape is reported in the palette and does not execute a
partial command.

Validate arguments and return a controlled message for expected user mistakes:

```ts
async execute(context: PluginCommandContext, args: readonly string[]) {
  const [environment, ...flags] = args;
  if (!environment) {
    return context.createResult({
      level: "warning",
      message: "Usage: sync-active-thread <environment> [--dry-run]",
    });
  }

  const dryRun = flags.includes("--dry-run");
  await context.report({
    phase: "validated",
    message: dryRun ? "Validated dry-run arguments." : "Arguments validated.",
  });
  // Continue with validated values…
}
```

### 10.3 Reading and transactionally updating the active Thread

`context.activeTab` is the Thread tab that was active when execution started,
or `null` when the active tab is not a Thread. Its `thread` is a detached
snapshot of the complete `Thread`, including model, Prompt Variables, messages,
Tools, Run History, and Evaluations.

`activeTab.writeThread(nextThread)` stages a complete Thread replacement; it
does not mutate the UI immediately. LLM Space validates and commits the staged
value only after the Command succeeds, the same tab is still active, and the
pane has no Run or persistence operation in progress. Always clone the snapshot
before editing it:

```ts
import type { PluginCommandContext, Thread } from "@llm-space/core";

async function prefixActiveTitle(
  context: PluginCommandContext,
  prefix: string
) {
  if (!context.activeTab) {
    return context.createResult({
      level: "warning",
      message: "Open a Thread before running this command.",
    });
  }

  const nextThread = structuredClone(context.activeTab.thread) as Thread;
  nextThread.title = `${prefix}: ${nextThread.title}`;
  await context.activeTab.writeThread(nextThread);
  return context.createResult({
    level: "success",
    message: `Updated ${context.activeTab.filename}.`,
  });
}
```

Only the final staged replacement is committed. A controlled `error` result,
an exception, or a host-side commit conflict discards it.

### 10.4 Progress and terminal feedback

LLM Space creates one persistent feedback item when a Command starts. Update
that same item during longer work with `report()`:

```ts
await context.report({ phase: "reading", message: "Reading local metadata…" });
await context.report({ phase: "uploading", message: "Uploading 3 records…" });
await context.report({ phase: "refreshing" });
```

`phase` must be a non-empty, stable Command-defined identifier. `message` is
optional user-facing copy. Reports are scoped to the current invocation and
reach the UI before `execute()` finishes.

Ordinary JSON return values are available to the host but are not displayed.
Return the opaque value created by `createResult()` for explicit terminal copy:

```ts
return context.createResult({
  level: "success", // "success" | "warning" | "error"
  message: "Synced 6 records.",
});
```

| Outcome | User feedback | Staged Thread write |
| --- | --- | --- |
| Return `success` | success styling and custom message | committed if still safe |
| Return `warning` | warning styling and custom message | committed if still safe |
| Return `error` | controlled failure and custom message | discarded |
| Return JSON or `void` | default completion message | committed if still safe |
| Throw `Error` | unexpected failure message | discarded |

Use `warning` or `error` for expected, actionable outcomes. Throw for unexpected
failures such as a broken network contract. Never include credentials in a
report, result, or thrown error.

### 10.5 Complete example: synchronize and update a Thread

This example combines Settings, arguments, progress, network access, a staged
Thread update, and a terminal result:

```ts
import type {
  PluginCommandContext,
  PluginCommandExtension,
  Thread,
} from "@llm-space/core";

export default class SyncActiveThreadCommand
  implements PluginCommandExtension
{
  displayName = "Sync active thread";
  description = "Fetch the canonical title and apply it to the active Thread.";

  async execute(context: PluginCommandContext, args: readonly string[]) {
    const [environment = "production"] = args;
    const endpoint = String(context.settings.endpoint ?? "").replace(/\/$/, "");

    if (!endpoint) {
      return context.createResult({
        level: "warning",
        message: "Configure endpoint in Plugin Settings first.",
      });
    }
    if (!context.activeTab) {
      return context.createResult({
        level: "warning",
        message: "Open a Thread before running this command.",
      });
    }

    await context.report({
      phase: "fetching",
      message: `Fetching ${environment} metadata…`,
    });

    const response = await fetch(
      `${endpoint}/threads/${encodeURIComponent(context.activeTab.filename)}`
    );
    if (!response.ok) {
      throw new Error(`Metadata request failed (${response.status}).`);
    }

    const payload = (await response.json()) as { title?: unknown };
    if (typeof payload.title !== "string" || !payload.title.trim()) {
      return context.createResult({
        level: "error",
        message: "The server response did not contain a valid title.",
      });
    }

    await context.report({ phase: "updating", message: "Updating the Thread…" });
    const nextThread = structuredClone(context.activeTab.thread) as Thread;
    nextThread.title = payload.title.trim();
    await context.activeTab.writeThread(nextThread);

    return context.createResult({
      level: "success",
      message: `Updated ${context.activeTab.filename}.`,
    });
  }
}
```

For workspace changes, write the file and refresh the tree explicitly:

```ts
await context.writeWorkspaceFile(
  "examples/README.md",
  "# Example\n\nCreated by a Plugin Command.\n"
);
await context.executeHostCommand("refreshTree");
return context.createResult({ level: "success", message: "README created." });
```

Only one invocation of a given Plugin Command may run at a time; distinct
Commands may run concurrently. Plugin Commands currently appear only in the
Command Palette and do not automatically receive native menu entries,
shortcuts, or context-menu entries.

## 11. Thread Storages

A Thread Storage reads a Thread from an external backend or writes a Thread to one. It does not replace the workspace: imported Threads are saved under the local `workspace/imported/` directory.

Each file must default-export a zero-argument class implementing `PluginThreadStorage`:

```ts
import type {
  PluginThreadStorage,
  Thread,
  ThreadLocator,
  ThreadStorageContext,
} from "@llm-space/core";

export default class TeamLibraryStorage implements PluginThreadStorage {
  displayName = "Example Team Library";
  description = "Read and write Threads in an example service.";
  deepLinkId = "team-library";
  capabilities = { read: true, write: true };

  async resolveLatest(
    id: string,
    context: ThreadStorageContext
  ): Promise<ThreadLocator> {
    const endpoint = String(context.settings.endpoint ?? "");
    const response = await fetch(
      `${endpoint}/threads/${encodeURIComponent(id)}`
    );
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    const data = await response.json();
    return { id, version: data.version, filename: data.filename };
  }

  async read(
    locator: ThreadLocator,
    context: ThreadStorageContext
  ): Promise<Thread> {
    const endpoint = String(context.settings.endpoint ?? "");
    const response = await fetch(
      `${endpoint}/threads/${encodeURIComponent(locator.id)}/content`
    );
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return (await response.json()) as Thread;
  }

  async write(
    thread: Thread,
    id: string | undefined,
    context: ThreadStorageContext
  ): Promise<ThreadLocator> {
    const endpoint = String(context.settings.endpoint ?? "");
    const response = await fetch(
      id
        ? `${endpoint}/threads/${encodeURIComponent(id)}`
        : `${endpoint}/threads`,
      {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thread),
      }
    );
    if (!response.ok) throw new Error(`Request failed (${response.status}).`);
    return (await response.json()) as ThreadLocator;
  }
}
```

The response format in this example is illustrative. A real Storage must validate remote data before converting it to a valid LLM Space `Thread` or `ThreadLocator`.

### 11.1 Capabilities

| Capabilities                   | Required methods            | Product entry point |
| ------------------------------ | --------------------------- | ------------------- |
| `{ read: true, write: false }` | `resolveLatest()`, `read()` | Import from…        |
| `{ read: false, write: true }` | `write()`                   | Save to…            |
| `{ read: true, write: true }`  | all three methods           | both                |

`resolveLatest()` converts an opaque backend resource ID into a `ThreadLocator`. Both `filename` and `version` are optional. Callers should treat locators as opaque addresses rather than reconstructing them.

### 11.2 Deep links

A readable Storage may register:

```ts
deepLinkId = "team-library";
```

Production deep link:

```text
llm-space://threads/team-library/project/alpha?revision=latest
```

Development deep link:

```text
llm-space-dev://threads/team-library/project/alpha?revision=latest
```

LLM Space uses `threads` and `deepLinkId` to select the Storage. Everything after `team-library/`, including multiple path segments and the query string, is passed to that Storage as the resource identifier. A `deepLinkId` must be unique across enabled Storages and may contain lowercase letters, digits, dots, underscores, and hyphens.

A Plugin Storage deep link imports into the local workspace. It does not automatically add Web Viewer, public sharing, or `shared` route support.

## 12. Runtime and lifecycle

| Extension       | Runtime behavior                                   |
| --------------- | -------------------------------------------------- |
| Skills          | merged into the effective Skills list              |
| MCP             | connections managed from `mcp.json`                |
| Models          | merged into the effective provider and model lists |
| Commands        | loaded and executed in a Bun runtime               |
| Plugin Tools    | loaded in Bun and invoked by the local Agent runtime |
| Thread Storages | loaded and executed in a Bun runtime               |

LLM Space imports code files one at a time, invokes their zero-argument constructors, and validates their contracts. An import, constructor, or contract error disables only that Extension. It does not crash the application or disable unrelated Plugins.

Lifecycle events:

- **Discovery:** validate paths, metadata, compatibility, and Extension files.
- **Enable:** register Extensions and start required MCP or code runtimes.
- **Settings change:** save Settings and reload the Plugin.
- **Reload:** stop existing connections and instances, then rediscover and activate.
- **Disable:** reject new calls, remove Extensions, and close Plugin resources.
- **Shutdown:** best-effort `dispose()` calls and resource cleanup.

## 13. IDs, read-only sources, and conflicts

Stable Extension IDs are derived from the Plugin ID and a file name or local ID:

```text
plugin:@example/team-tools:mcp:knowledge-base
plugin:@example/team-tools:model-provider:example-cloud
plugin:@example/team-tools:command:open-documentation
plugin:@example/team-tools:tool:read-project-file
plugin:@example/team-tools:thread-storage:team-library
```

Display names may repeat; canonical IDs may not. When IDs or canonical Skill names conflict, LLM Space does not choose a winner. Conflicting contributions remain inactive and the Plugin details show an Extension error with the files involved.

Plugin contributions and user configuration remain separate:

- Overall Plugin enablement does not rewrite user MCP or model configuration.
- Per-Skill visibility overrides are stored in `skills.json`, but Plugin Skill files are not modified.
- Plugin MCP and model definitions cannot be edited or removed from their respective Settings pages.
- To change a Plugin definition, edit its files or Settings and then reload it.

## 14. Trust and security

LLM Space currently has no Plugin trust prompt or permission manifest. Installing and enabling a local Plugin means fully trusting it.

- Runtime process isolation contains failures; it is not an operating-system sandbox.
- Plugin code can use Bun and Node APIs and can access files, processes, environment variables, and networks available to the current user.
- Plugins may ship and load dependencies. LLM Space does not audit their supply chain.
- Context APIs do not restrict a Plugin from calling system APIs directly.
- Do not install a Plugin from an untrusted source merely because it can later be disabled.

Plugin authors should:

- keep secrets in environment variables, not source, logs, or example files;
- validate remote JSON, file contents, and deep-link resource IDs at runtime;
- use reasonable network timeouts and respond to cancellation signals;
- exclude credentials, headers, full prompts, and tool payloads from errors;
- close connections, timers, and temporary resources in `dispose()`;
- avoid symlinks and dependencies on paths outside the Plugin directory.

## 15. Status, errors, and logs

| Status         | Meaning                                                |
| -------------- | ------------------------------------------------------ |
| `active`       | enabled and all Extensions activated normally          |
| `degraded`     | usable, but at least one Extension failed              |
| `error`        | unable to activate normally                            |
| `incompatible` | `engines["llm-space"]` does not match this app version |
| `disabled`     | disabled by the user                                   |

The UI shows a safe summary, an `error-id`, and the log path. The complete error chain, stack, and sanitized, truncated process output are written to:

```text
LLM_SPACE_HOME/logs/plugins/<encoded-plugin-name>/<timestamp>-<stage>-<error-id>.log
```

Discovery failures without a valid Plugin ID are written to:

```text
LLM_SPACE_HOME/logs/plugins/_invalid/<timestamp>-discovery-<error-id>.log
```

Use **Reveal log** or **Copy path** from Settings → Plugins.

To troubleshoot startup while skipping all third-party Plugins for one run:

```sh
LLM_SPACE_DISABLE_PLUGINS=1 mise run dev
```

## 16. Minimal Plugin example

This example contributes one Command:

```text
plugins/hello-space/
├── package.json
└── commands/
    └── hello.ts
```

`package.json`:

```json
{
  "name": "hello-space",
  "version": "1.0.0",
  "displayName": "Hello Space",
  "description": "A minimal LLM Space Plugin example.",
  "engines": {
    "llm-space": ">=4.9.0"
  }
}
```

`commands/hello.ts`:

```ts
export default class HelloCommand {
  displayName = "Say hello";
  description = "Show a local notification.";

  async execute(context) {
    const audience = String(context.settings.audience ?? "LLM Space");
    return context.createResult({
      level: "success",
      message: `Hello, ${audience}!`,
    });
  }
}
```

Select **Refresh plugins** after copying the directory. The General tab should show one Command Extension, and **Say hello** should appear in the Command Palette.

Optionally add `config.schema.json`:

```json
{
  "type": "object",
  "properties": {
    "audience": {
      "type": "string",
      "title": "Audience",
      "default": "LLM Space"
    }
  }
}
```

The Settings tab now displays an Audience field. Editing it saves automatically and reloads the Plugin.

### 16.1 Complete Plugin example: Atlas

For a copyable example that combines every supported Extension point, see the
[Atlas Plugin](../examples/atlas-plugin/README.md). It contributes two Skills,
two MCP servers with four MCP Tools, two model providers with four models, two
local Plugin Tools, two Commands, and two Thread Storages. Settings is the only
singleton Extension point, so Atlas demonstrates it with one schema containing
seven fields.

The example also includes two runnable stdio MCP servers, typed TypeScript
contracts, bilingual documentation, and installation instructions. Copy it as
a real directory rather than a symlink, install its bundled server dependencies
with Bun, and set its absolute MCP server directory before testing it.

## 17. Development checklist

Before distributing a Plugin, verify that:

- `package.json.name` exactly matches the installation directory;
- `version` is valid SemVer and `engines["llm-space"]` covers tested versions;
- `icon.png` satisfies the format and size limits;
- Extension files are direct children of their discovery directories;
- all runtime dependencies ship with the Plugin;
- the Settings schema accepts defaults and previously saved values;
- secrets come from environment variables;
- MCP commands, working directories, and remote URLs work in a clean environment;
- models use supported adapters and include all required fields;
- Command, Plugin Tool, and Thread Storage constructors require no arguments;
- every Plugin Tool has a stable snake_case `name`, an accurate description,
  a restrictive parameter Schema, and JSON-compatible or rich-content output;
- Commands validate palette arguments, use `report()` for meaningful long-run
  phases, and return an explicit terminal result when custom copy is useful;
- controlled Command failures and exceptions do not commit staged Thread writes;
- parallel Tool calls and distinct concurrent Commands do not corrupt shared
  instance state;
- readable Storages return valid Threads and writable Storages return valid locators;
- deep links use a unique, stable `deepLinkId` and validate arbitrary suffixes;
- one failed Extension does not prevent other Extensions from working;
- reload, disable, enable, and shutdown clean up resources correctly;
- logs contain no secrets, full prompts, or sensitive tool payloads.

## 18. Currently unsupported

The current Plugin system does not include:

- before/after agent, turn, or model hooks;
- a Plugin marketplace;
- automatic installation, update, dependency installation, or rollback;
- project-scoped Plugins;
- Remote Runtime Plugins;
- permission manifests or trust review;
- per-Extension enablement except for Plugin Skills;
- custom Plugin Settings pages or other custom UI;
- automatic Web Viewer or public-sharing integration for Plugin Thread Storages.

These boundaries keep discovery predictable, failures diagnosable, and startup resilient while leaving room for compatible additions in future versions.
